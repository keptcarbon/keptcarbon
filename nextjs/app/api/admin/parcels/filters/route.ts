import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdmin } from "@/lib/auth-server";

/**
 * GET /api/admin/parcels/filters
 *   → { provinces: string[] }   — distinct province names from geo_district
 *
 * GET /api/admin/parcels/filters?province=ระยอง
 *   → { amphoe_ts: string[] }   — districts for that province
 */
export async function GET(request: NextRequest) {
    if (!(await isAdmin(request))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const province = request.nextUrl.searchParams.get("province")?.trim() || null;

    try {
        if (province) {
            const result = await pool.query(
                `SELECT DISTINCT name_th AS amphoe_t
                 FROM geo_district
                 WHERE province_th = $1
                 ORDER BY name_th`,
                [province],
            );
            return NextResponse.json({ amphoe_ts: result.rows.map((r: { amphoe_t: string }) => r.amphoe_t) });
        }

        const result = await pool.query(
            `SELECT DISTINCT province_th AS province
             FROM geo_district
             ORDER BY province`,
        );
        return NextResponse.json({ provinces: result.rows.map((r: { province: string }) => r.province) });
    } catch (err) {
        console.error("Parcel filters error:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
