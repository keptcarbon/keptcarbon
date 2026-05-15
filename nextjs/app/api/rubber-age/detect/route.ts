import { NextRequest, NextResponse } from "next/server";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { pool } from "@/lib/db";

type DetectRequestBody = {
    plotsGeojson?: GeoJSON.FeatureCollection;
    plotsPath?: string;
    s2Dir?: string;
    s1Dir?: string;
    plotIdField?: string;
    startMonth?: string;
    endMonth?: string;
    smoothMethod?: "savgol" | "moving";
    smoothWindow?: number;
    smoothPolyorder?: number;
    ruptureModel?: "l1" | "l2" | "rbf";
    rupturePenalty?: number;
    currentYear?: number;
    maxPlots?: number;
    outputTag?: string;
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

    let body: DetectRequestBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if ((!body.plotsPath && !body.plotsGeojson) || !body.s2Dir) {
        return NextResponse.json(
            { error: "plotsGeojson or plotsPath is required, and s2Dir is required" },
            { status: 400 },
        );
    }

    const geeUrl = process.env.GEE_SERVICE_URL ?? "http://localhost:8001";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60 * 60 * 1000);

    try {
        const upstream = await fetch(`${geeUrl}/rubber-age/detect`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                plots_path: body.plotsPath,
                plots_geojson: body.plotsGeojson ?? null,
                s2_dir: body.s2Dir,
                s1_dir: body.s1Dir ?? null,
                plot_id_field: body.plotIdField ?? "plot_id",
                start_month: body.startMonth ?? "2017-01",
                end_month: body.endMonth ?? null,
                smooth_method: body.smoothMethod ?? "savgol",
                smooth_window: body.smoothWindow ?? 7,
                smooth_polyorder: body.smoothPolyorder ?? 2,
                rupture_model: body.ruptureModel ?? "rbf",
                rupture_penalty: body.rupturePenalty ?? 6,
                current_year: body.currentYear ?? 2026,
                max_plots: body.maxPlots ?? null,
                output_tag: body.outputTag ?? null,
            }),
            signal: controller.signal,
        });

        const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;

        if (!upstream.ok) {
            const detail = data.detail;
            const msg = typeof detail === "string"
                ? detail
                : (detail && typeof detail === "object" ? JSON.stringify(detail) : `GEE service error (HTTP ${upstream.status})`);
            return NextResponse.json({ error: msg }, { status: upstream.status === 400 ? 400 : 502 });
        }

        return NextResponse.json(data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to reach GEE service";
        const isTimeout = msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout");
        return NextResponse.json(
            { error: isTimeout ? "Age detection request timed out" : msg },
            { status: 503 },
        );
    } finally {
        clearTimeout(timeout);
    }
}
