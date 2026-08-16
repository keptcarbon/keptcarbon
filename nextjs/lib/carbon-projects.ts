import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import type { JwtPayload } from "@/lib/jwt";

/**
 * Resolve the stable UUID used as tbl_projects.user_uuid for a logged-in
 * user. This is immutable — unlike the old fullname-based identifier it never
 * changes when the user edits their profile, so projects stay linked.
 */
export async function getUserUuid(payload: JwtPayload): Promise<string | null> {
  const result = await pool.query(
    `SELECT uuid FROM tbl_users WHERE id = $1`,
    [payload.userId]
  );
  return result.rows[0]?.uuid ?? null;
}

/**
 * Generate a guest key using Node's built-in crypto.randomUUID() — a
 * cryptographically secure RFC 4122 v4 UUID (~122 bits of entropy).
 * Unguessable, so guest projects can't be enumerated (prevents IDOR) — unlike
 * the old timestamp+Math.random() scheme. Collisions are astronomically
 * unlikely, so no DB round-trip to check uniqueness is needed.
 */
export function generateGuestKey(): string {
  return `Guest-${randomUUID()}`;
}

/**
 * Convert a tbl_projects row into the API project shape. tbl_projects is
 * header-only (no plantation_info/polygons_payload/backend_responses columns
 * -- that data lives in tbl_plots/tbl_plot_assessments), so those three
 * fields are always empty: no caller reads them off this shape today (GET
 * /api/plots is the one callers use for per-plot data).
 */
export function rowToProjectFromNormalized(row: any) {
  return {
    id: row.id,
    userUuid: row.user_uuid ?? null,
    guestKey: row.guest_uuid ?? null,
    userId: row.guest_uuid ?? row.user_uuid ?? null,
    projectName: row.project_name,
    projectId: row.project_name,
    plantationInfo: {},
    polygonsPayload: [],
    backendResponses: [],
    status: row.status,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}