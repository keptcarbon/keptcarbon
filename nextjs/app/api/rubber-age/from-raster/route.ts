import { NextRequest, NextResponse } from "next/server";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { pool } from "@/lib/db";

type FromRasterBody = {
    geometry?: GeoJSON.Geometry;
    rasterFilename?: string;
};

async function isAdmin(request: NextRequest) {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (!token) return false;
    const payload = verifyToken(token);
    if (!payload) return false;
    const result = await pool.query("SELECT role FROM users WHERE id = $1", [payload.userId]);
    return result.rows[0]?.role === "admin";
}

export async function POST(request: NextRequest) {
    if (!(await isAdmin(request))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: FromRasterBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.geometry) {
        return NextResponse.json({ error: "geometry is required" }, { status: 400 });
    }

    const geeUrl = process.env.GEE_SERVICE_URL ?? "http://localhost:8001";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
        const upstream = await fetch(`${geeUrl}/rubber-age/from-raster`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                geometry: body.geometry,
                raster_filename: body.rasterFilename ?? "rayong_rubber_age.tif",
            }),
            signal: controller.signal,
        });

        const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;

        if (!upstream.ok) {
            const detail = data.detail;
            const msg =
                typeof detail === "string"
                    ? detail
                    : detail && typeof detail === "object"
                        ? JSON.stringify(detail)
                        : `GEE service error (HTTP ${upstream.status})`;
            return NextResponse.json({ error: msg }, { status: upstream.status === 404 ? 404 : 502 });
        }

        return NextResponse.json(data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to reach GEE service";
        const isTimeout = msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout");
        return NextResponse.json(
            { error: isTimeout ? "Request timed out" : msg },
            { status: 503 },
        );
    } finally {
        clearTimeout(timeout);
    }
}
