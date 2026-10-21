import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { getUserUuid } from "@/lib/carbon-projects";
import { countActiveProjects, getCallerRole, getQuota } from "@/lib/quota";

// ---------------------------------------------------------------------------
// GET /api/quota[?guest_user_id=...] — the caller's project / plot limits
// (tbl_role_quota) and how many projects they already hold, so map-draw can
// stop the user before drawing instead of only failing on save. The server
// still enforces every limit on save (lib/quota.ts); this is just for the UI.
//   200 { role, allowed, maxProjects, maxPlotsPerProject, projectCount }
//   allowed = false: the role has no quota row (e.g. admin) -- may not
//   create projects/plots. Limits null = unlimited.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;
  const guestUserId = new URL(request.url).searchParams.get("guest_user_id");

  try {
    const role = await getCallerRole(pool, payload);
    const quota = await getQuota(pool, role);

    let projectCount = 0;
    if (payload) {
      const userUuid = await getUserUuid(payload);
      if (userUuid) projectCount = await countActiveProjects(pool, { userUuid });
    } else if (guestUserId) {
      projectCount = await countActiveProjects(pool, { guestUuid: guestUserId });
    }

    return NextResponse.json({
      role,
      allowed: quota !== null,
      maxProjects: quota?.maxProjects ?? null,
      maxPlotsPerProject: quota?.maxPlotsPerProject ?? null,
      projectCount,
    });
  } catch (err) {
    console.error("GET /api/quota error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
