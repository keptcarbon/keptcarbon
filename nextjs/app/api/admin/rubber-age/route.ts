import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

async function isAdmin(request: NextRequest) {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (!token) return false;
    const payload = verifyToken(token);
    if (!payload) return false;
    const result = await pool.query("SELECT role FROM users WHERE id = $1", [payload.userId]);
    return result.rows[0]?.role === "admin";
}

type UpdateEntry = {
    id: number;
    rubber_age: number;
    gee_plant_year?: number | null;
    gee_age?: number | null;
    gee_confidence?: number | null;
};

/**
 * PATCH /api/admin/rubber-age
 * Body: { updates: UpdateEntry[] }
 * Saves rubber_age, gee_plant_year, gee_age, gee_confidence for each plot.
 * grow_year (original DB planting year) is never overwritten.
 */
export async function PATCH(request: NextRequest) {
    if (!(await isAdmin(request))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { updates?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!Array.isArray(body.updates) || body.updates.length === 0) {
        return NextResponse.json({ error: "updates must be a non-empty array" }, { status: 400 });
    }

    const updates = body.updates as UpdateEntry[];

    // Validate entries
    for (const u of updates) {
        if (typeof u.id !== "number" || typeof u.rubber_age !== "number") {
            return NextResponse.json({ error: "Each entry must have numeric id and rubber_age" }, { status: 400 });
        }
        if (u.rubber_age < 0 || u.rubber_age > 100) {
            return NextResponse.json({ error: `Invalid rubber_age value: ${u.rubber_age}` }, { status: 400 });
        }
    }

    const client = await pool.connect();
    let updatedCount = 0;
    try {
        await client.query("BEGIN");
        for (const u of updates) {
            const age = Math.round(u.rubber_age);
            const geePlantYear = u.gee_plant_year != null ? Math.round(u.gee_plant_year) : null;
            const geeAge = u.gee_age != null ? Math.round(u.gee_age) : null;
            const geeConf = u.gee_confidence != null ? Math.min(1, Math.max(0, u.gee_confidence)) : null;
            await client.query(
                `UPDATE rubber_plots
                    SET rubber_age = $1, gee_plant_year = $2, gee_age = $3, gee_confidence = $4
                  WHERE id = $5`,
                [age, geePlantYear, geeAge, geeConf, u.id],
            );
            updatedCount++;
        }
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Admin rubber-age update error:", err);
        return NextResponse.json({ error: "Database update failed" }, { status: 500 });
    } finally {
        client.release();
    }

    return NextResponse.json({ updated: updatedCount });
}
