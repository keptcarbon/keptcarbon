import { NextResponse } from "next/server";
import type { Pool, PoolClient } from "pg";
import type { JwtPayload } from "@/lib/jwt";

/**
 * Per-role project / plot limits (tbl_role_quota, postgis/migrations/038).
 *
 *  - NULL limit = unlimited.
 *  - No row for the role (e.g. 'admin') = may not create projects/plots.
 *  - Only active projects that still hold at least one active plot count --
 *    the same projects the my-plots list shows, so the user can always see
 *    (and delete) whatever is using up their quota.
 *  - Lowering a limit never touches existing data: a save is refused only
 *    when it would ADD a project, or grow a project's plot count past the
 *    limit. Projects/plots already over a lowered limit stay as they are.
 *
 * The caller's own role always applies -- including a logged-in user's
 * "ประมวลผล" draft, which is saved as a guest_uuid row (forceGuest) but is
 * still that user's work. 'guest' is only for visitors with no login.
 */

type Db = Pool | PoolClient;

export const GUEST_ROLE = "guest";

export interface Quota {
  role: string;
  maxProjects: number | null;
  maxPlotsPerProject: number | null;
}

export type QuotaErrorCode = "no_quota" | "project_limit" | "plot_limit";

export class QuotaError extends Error {
  constructor(
    public code: QuotaErrorCode,
    public limit: number | null = null,
    public current: number | null = null
  ) {
    super(code);
    this.name = "QuotaError";
  }
}

/** 403 body every quota-enforcing route returns: { error, limit, current }. */
export function quotaErrorResponse(err: QuotaError): NextResponse {
  return NextResponse.json(
    { error: err.code, limit: err.limit, current: err.current },
    { status: 403 }
  );
}

/** The caller's role, read fresh from tbl_users (the JWT copy can be stale); 'guest' when logged out. */
export async function getCallerRole(db: Db, payload: JwtPayload | null): Promise<string> {
  if (!payload) return GUEST_ROLE;
  const res = await db.query(`SELECT role FROM tbl_users WHERE id = $1`, [payload.userId]);
  return res.rows[0]?.role ?? GUEST_ROLE;
}

/** The role's quota row, or null when the role has none (= not allowed). */
export async function getQuota(db: Db, role: string): Promise<Quota | null> {
  const res = await db.query(
    `SELECT max_projects, max_plots_per_project FROM tbl_role_quota WHERE role = $1`,
    [role]
  );
  if (res.rowCount === 0) return null;
  return {
    role,
    maxProjects: res.rows[0].max_projects,
    maxPlotsPerProject: res.rows[0].max_plots_per_project,
  };
}

/** getCallerRole + getQuota; throws QuotaError('no_quota') when the role has no row. */
export async function requireCallerQuota(db: Db, payload: JwtPayload | null): Promise<Quota> {
  const quota = await getQuota(db, await getCallerRole(db, payload));
  if (!quota) throw new QuotaError("no_quota");
  return quota;
}

export type ProjectOwner = { userUuid: string } | { guestUuid: string };

function ownerColumn(owner: ProjectOwner): [string, string] {
  return "userUuid" in owner ? ["user_uuid", owner.userUuid] : ["guest_uuid", owner.guestUuid];
}

/** Active projects of an owner that hold at least one active plot. */
export async function countActiveProjects(db: Db, owner: ProjectOwner): Promise<number> {
  const [column, value] = ownerColumn(owner);
  const res = await db.query(
    `SELECT COUNT(*)::int AS n FROM tbl_projects pr
     WHERE pr.${column} = $1 AND pr.status = 'active'
       AND EXISTS (SELECT 1 FROM tbl_plots p WHERE p.project_id = pr.id AND p.deleted_at IS NULL)`,
    [value]
  );
  return res.rows[0].n;
}

/**
 * Throws QuotaError('project_limit') when `owner` has no free project slot
 * for `adding` more projects. Call it BEFORE the save writes anything.
 *
 * `projectId`: the save targets this existing project -- if it already
 * counts toward the owner's quota (theirs, active, has plots) the save
 * takes no new slot and always passes, even when the owner is over a
 * lowered limit.
 *
 * For a user owner, locks their tbl_users row first (caller must be inside
 * a transaction) so two concurrent saves can't both take the last slot.
 */
export async function assertProjectSlots(
  client: PoolClient,
  quota: Quota,
  owner: ProjectOwner,
  opts: { projectId?: number; adding?: number } = {}
): Promise<void> {
  const adding = opts.adding ?? 1;
  if (quota.maxProjects === null || adding <= 0) return;
  const [column, value] = ownerColumn(owner);

  if (opts.projectId !== undefined) {
    const counted = await client.query(
      `SELECT 1 FROM tbl_projects pr
       WHERE pr.id = $1 AND pr.${column} = $2 AND pr.status = 'active'
         AND EXISTS (SELECT 1 FROM tbl_plots p WHERE p.project_id = pr.id AND p.deleted_at IS NULL)`,
      [opts.projectId, value]
    );
    if ((counted.rowCount ?? 0) > 0) return;
  }

  if ("userUuid" in owner) {
    await client.query(`SELECT 1 FROM tbl_users WHERE uuid = $1 FOR UPDATE`, [owner.userUuid]);
  }
  const current = await countActiveProjects(client, owner);
  if (current + adding > quota.maxProjects) {
    throw new QuotaError("project_limit", quota.maxProjects, current);
  }
}

/**
 * Throws QuotaError('plot_limit') when a save would leave project
 * `projectId` (null = not created yet) with more plots than allowed AND
 * more than it holds now. `frontendPlots` is the save's full plot list --
 * upsertProjectAndPlots soft-deletes every plot missing from it -- so its
 * distinct ids are the project's plot count after the save. Not an array =
 * the save doesn't touch plots.
 */
export async function assertPlotCount(
  db: Db,
  quota: Quota,
  projectId: number | null,
  frontendPlots: unknown
): Promise<void> {
  if (quota.maxPlotsPerProject === null || !Array.isArray(frontendPlots)) return;
  const ids = new Set(
    frontendPlots.map((p) => (p as { id?: unknown })?.id).filter((id) => id != null && id !== "")
  );
  if (ids.size <= quota.maxPlotsPerProject) return;

  let current = 0;
  if (projectId !== null) {
    const res = await db.query(
      `SELECT COUNT(*)::int AS n FROM tbl_plots WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId]
    );
    current = res.rows[0].n;
  }
  if (ids.size > current) {
    throw new QuotaError("plot_limit", quota.maxPlotsPerProject, current);
  }
}
