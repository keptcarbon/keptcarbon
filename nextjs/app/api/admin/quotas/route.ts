import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdmin } from "@/lib/auth-server";
import { getRequesterId, withTransaction } from "@/lib/dataset-version";
import { GUEST_ROLE } from "@/lib/quota";

const MAX_LIMIT = 100_000;
const HISTORY_LIMIT = 50;
const ROLE_ORDER_SQL = `CASE role WHEN 'guest' THEN 0 WHEN 'user' THEN 1 WHEN 'officer' THEN 2 WHEN 'rd' THEN 3 ELSE 4 END, role`;

type QuotaInput = { role?: unknown; maxProjects?: unknown; maxPlotsPerProject?: unknown };
type QuotaRow = { role: string; maxProjects: number | null; maxPlotsPerProject: number | null };

/** null = unlimited; otherwise a whole number 1..MAX_LIMIT. undefined = invalid. */
function parseLimit(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_LIMIT) return v;
  return undefined;
}

/** a <= b, where null means unlimited. */
const atMost = (a: number | null, b: number | null) => b === null || (a !== null && a <= b);

/**
 * GET /api/admin/quotas
 * Every tbl_role_quota row + the latest changes from tbl_role_quota_history
 * -- the admin "จำกัดจำนวนโครงการ/แปลง" page.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [quotas, history] = await Promise.all([
      pool.query(
        `SELECT role, max_projects AS "maxProjects", max_plots_per_project AS "maxPlotsPerProject",
                updated_at AS "updatedAt"
         FROM tbl_role_quota ORDER BY ${ROLE_ORDER_SQL}`
      ),
      pool.query(
        `SELECT h.id, h.role, h.max_projects AS "maxProjects", h.max_plots_per_project AS "maxPlotsPerProject",
                h.saved_at AS "savedAt", u.display_name AS "savedByName", u.email AS "savedByEmail"
         FROM tbl_role_quota_history h
         LEFT JOIN tbl_users u ON u.id = h.saved_by
         ORDER BY h.saved_at DESC, h.id DESC
         LIMIT $1`,
        [HISTORY_LIMIT]
      ),
    ]);
    return NextResponse.json({ quotas: quotas.rows, history: history.rows });
  } catch (err) {
    console.error("Admin list quotas error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/quotas
 * Body: { quotas: [{ role, maxProjects, maxPlotsPerProject }] } -- the full
 * set of existing roles (roles can't be added or removed here). Each limit
 * is a whole number 1..100000 or null (= unlimited). Guest limits may not
 * exceed any logged-in role's, so work a guest drew always fits the account
 * it's claimed into. Every row that actually changed is logged in
 * tbl_role_quota_history. Lowering a limit never deletes data (lib/quota.ts).
 */
export async function PUT(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null);
    const input: QuotaInput[] | null = Array.isArray(body?.quotas) ? body.quotas : null;
    if (!input) {
      return NextResponse.json({ error: "ต้องระบุ quotas" }, { status: 400 });
    }

    const existing = await pool.query(`SELECT role FROM tbl_role_quota`);
    const knownRoles = new Set<string>(existing.rows.map((r) => r.role));

    const rows: QuotaRow[] = [];
    for (const q of input) {
      const role = typeof q.role === "string" ? q.role : "";
      if (!knownRoles.has(role) || rows.some((r) => r.role === role)) {
        return NextResponse.json({ error: `บทบาท "${role}" ไม่ถูกต้อง` }, { status: 400 });
      }
      const maxProjects = parseLimit(q.maxProjects);
      const maxPlotsPerProject = parseLimit(q.maxPlotsPerProject);
      if (maxProjects === undefined || maxPlotsPerProject === undefined) {
        return NextResponse.json(
          { error: `ค่าของ "${role}" ต้องเป็นจำนวนเต็ม 1–${MAX_LIMIT.toLocaleString()} หรือไม่จำกัด` },
          { status: 400 }
        );
      }
      rows.push({ role, maxProjects, maxPlotsPerProject });
    }
    if (rows.length !== knownRoles.size) {
      return NextResponse.json({ error: "ต้องส่งค่าของทุกบทบาท" }, { status: 400 });
    }

    const guest = rows.find((r) => r.role === GUEST_ROLE);
    if (guest) {
      const tooLow = rows.find(
        (r) =>
          r.role !== GUEST_ROLE &&
          (!atMost(guest.maxProjects, r.maxProjects) || !atMost(guest.maxPlotsPerProject, r.maxPlotsPerProject))
      );
      if (tooLow) {
        return NextResponse.json(
          { error: `ค่าของผู้ใช้ทั่วไป (guest) ต้องไม่มากกว่าบทบาท "${tooLow.role}"` },
          { status: 400 }
        );
      }
    }

    const userId = getRequesterId(request);

    await withTransaction(async (client) => {
      const current = await client.query(
        `SELECT role, max_projects, max_plots_per_project FROM tbl_role_quota FOR UPDATE`
      );
      const currentByRole = new Map(current.rows.map((r) => [r.role, r]));

      for (const r of rows) {
        const cur = currentByRole.get(r.role);
        if (cur && cur.max_projects === r.maxProjects && cur.max_plots_per_project === r.maxPlotsPerProject) continue;
        await client.query(
          `UPDATE tbl_role_quota
           SET max_projects = $2, max_plots_per_project = $3, updated_at = NOW(), updated_by = $4
           WHERE role = $1`,
          [r.role, r.maxProjects, r.maxPlotsPerProject, userId]
        );
        await client.query(
          `INSERT INTO tbl_role_quota_history (role, max_projects, max_plots_per_project, saved_by)
           VALUES ($1, $2, $3, $4)`,
          [r.role, r.maxProjects, r.maxPlotsPerProject, userId]
        );
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin update quotas error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
