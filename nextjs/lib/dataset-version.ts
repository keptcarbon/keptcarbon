import { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

/**
 * Server helpers for tbl_dataset_version / tbl_dataset_import — the R&D
 * dataset lifecycle (draft → active → archived). Imports start as drafts on
 * /rnd/data-management; the version in use is chosen on /rnd/configuration
 * and activated when the region config is saved. See
 * postgis/init/19-tbl-dataset-version.sql.
 */

export type DatasetCategory = "planting_year_map" | "lulc_map" | "biomass_profile" | "planting_year_distribution";
export type DatasetStatus = "draft" | "active" | "archived";

/** tbl_users.id of the requester, or null when the cookie is missing/invalid. */
export function getRequesterId(request: NextRequest): number | null {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token)?.userId ?? null;
}

/** Runs fn inside BEGIN/COMMIT on one pooled connection; rolls back on throw. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export function plantingYearDistVersion(luYear: number, plainingYear: number): string {
  return `${luYear}/${plainingYear}`;
}

/**
 * Logs one imported file. Creates the version row as 'draft' on first
 * import. A later import into the same version is only allowed for
 * biomass_profile, which is built from one file per clone/growth
 * model/allometry: a new combination may be added while the version is a
 * draft or active (it doesn't change the combinations already there -- the
 * table's unique key rejects re-importing one). An archived version is
 * frozen. Returns the version's id and status.
 */
export async function recordImport(
  client: PoolClient,
  args: {
    category: DatasetCategory;
    pCode: string;
    version: string;
    fileName: string;
    rowCount: number;
    detail?: Record<string, unknown> | null;
    userId: number | null;
    // planting_year_distribution follows the maps instead of starting as draft.
    initialStatus?: DatasetStatus;
  }
): Promise<{ id: number; status: DatasetStatus }> {
  const existing = await client.query(
    `SELECT id, status FROM tbl_dataset_version
     WHERE category = $1 AND p_code = $2 AND version = $3 FOR UPDATE`,
    [args.category, args.pCode, args.version]
  );

  let id: number;
  let status: DatasetStatus;
  if (existing.rows.length > 0) {
    ({ id, status } = existing.rows[0]);
    const appendable = status === "draft" || (status === "active" && args.category === "biomass_profile");
    if (!appendable) {
      throw new FrozenVersionError(args.version, status);
    }
  } else {
    status = args.initialStatus ?? "draft";
    if (status === "active") {
      await archiveActive(client, args.category, args.pCode);
    }
    const inserted = await client.query(
      `INSERT INTO tbl_dataset_version (category, p_code, version, status, created_by, activated_at, activated_by)
       VALUES ($1, $2, $3, $4::varchar, $5::integer,
               CASE WHEN $4::varchar = 'active' THEN NOW() END,
               CASE WHEN $4::varchar = 'active' THEN $5::integer END)
       RETURNING id`,
      [args.category, args.pCode, args.version, status, args.userId]
    );
    id = inserted.rows[0].id;
  }

  await client.query(
    `INSERT INTO tbl_dataset_import (dataset_version_id, file_name, row_count, detail, imported_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, args.fileName.slice(0, 255), args.rowCount, args.detail ?? null, args.userId]
  );

  return { id, status };
}

/** Thrown by recordImport when a version can't take another file. */
export class FrozenVersionError extends Error {
  constructor(public version: string, public status: DatasetStatus) {
    super(
      `เวอร์ชัน "${version}" ${status === "active" ? "ใช้งานอยู่" : "ถูกเก็บถาวร"}แล้ว ไม่สามารถเพิ่มข้อมูลได้ — กรุณานำเข้าเป็นเวอร์ชันใหม่`
    );
  }
}

/** Moves the current active version (if any) of category+province to archived. */
export async function archiveActive(client: PoolClient, category: DatasetCategory, pCode: string): Promise<void> {
  await client.query(
    `UPDATE tbl_dataset_version SET status = 'archived', archived_at = NOW()
     WHERE category = $1 AND p_code = $2 AND status = 'active'`,
    [category, pCode]
  );
}

/**
 * Makes `version` the active one for category + province: the current active
 * version is archived first. A no-op when it is already active. Throws
 * when the version isn't registered in tbl_dataset_version.
 * Called by the region-config save (POST /api/rnd/region-config).
 */
export async function activateVersion(
  client: PoolClient,
  category: Exclude<DatasetCategory, "planting_year_distribution">,
  pCode: string,
  version: string,
  userId: number | null
): Promise<void> {
  const found = await client.query(
    `SELECT id, status FROM tbl_dataset_version WHERE category = $1 AND p_code = $2 AND version = $3 FOR UPDATE`,
    [category, pCode, version]
  );
  if (found.rows.length === 0) {
    throw new Error(`dataset version not found: ${category} ${pCode} ${version}`);
  }
  if (found.rows[0].status === "active") return;

  await archiveActive(client, category, pCode);
  await client.query(
    `UPDATE tbl_dataset_version
     SET status = 'active', activated_at = NOW(), activated_by = $2, archived_at = NULL
     WHERE id = $1`,
    [found.rows[0].id, userId]
  );
}

/** Active version string per category for a province (absent = none active). */
export async function getActiveVersions(
  client: PoolClient | typeof pool,
  pCode: string
): Promise<Partial<Record<DatasetCategory, string>>> {
  const result = await client.query(
    `SELECT category, version FROM tbl_dataset_version WHERE p_code = $1 AND status = 'active'`,
    [pCode]
  );
  return Object.fromEntries(result.rows.map((r) => [r.category, r.version]));
}

/**
 * Re-points the province's planting_year_distribution at the pair of active
 * maps: the distribution matching (active LULC, active Planting Year) becomes
 * active, a previously active one that no longer matches is archived.
 * Returns whether a matching distribution exists.
 */
export async function syncPlantingYearDist(client: PoolClient, pCode: string, userId: number | null): Promise<boolean> {
  const active = await getActiveVersions(client, pCode);
  const lu = active.lulc_map;
  const py = active.planting_year_map;
  const target = lu && py ? plantingYearDistVersion(Number(lu), Number(py)) : null;

  await client.query(
    `UPDATE tbl_dataset_version SET status = 'archived', archived_at = NOW()
     WHERE category = 'planting_year_distribution' AND p_code = $1 AND status = 'active'
       AND version IS DISTINCT FROM $2`,
    [pCode, target]
  );
  if (!target) return false;

  const updated = await client.query(
    `UPDATE tbl_dataset_version
     SET status = 'active', activated_at = NOW(), activated_by = $3, archived_at = NULL
     WHERE category = 'planting_year_distribution' AND p_code = $1 AND version = $2
     RETURNING id`,
    [pCode, target, userId]
  );
  return updated.rows.length > 0;
}
