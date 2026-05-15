import { NextRequest, NextResponse } from "next/server";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";
import { pool } from "@/lib/db";

type BFASTFeature = {
    plot_id: string;
    geometry: GeoJSON.Geometry;
};

type BFASTBody = {
    features?: BFASTFeature[];
    startDate?: string;
    endDate?: string;
    startYear?: number;
    endYear?: number;
    currentYear?: number;
    maxPlots?: number;
    useAnnual?: boolean;
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

    let body: BFASTBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.features || !Array.isArray(body.features) || body.features.length === 0) {
        return NextResponse.json({ error: "features is required" }, { status: 400 });
    }

    const geeUrl = process.env.GEE_SERVICE_URL ?? "http://localhost:8001";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

    try {
        const upstream = await fetch(`${geeUrl}/rubber-age/bfast`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                features: body.features,
                start_date: body.startDate ?? "2017-01-01",
                end_date: body.endDate ?? null,
                start_year: body.startYear ?? 2000,
                end_year: body.endYear ?? null,
                current_year: body.currentYear ?? new Date().getFullYear(),
                max_plots: body.maxPlots ?? 50,
                use_annual: body.useAnnual ?? true,
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
            { error: isTimeout ? "BFAST request timed out" : msg },
            { status: 503 },
        );
    } finally {
        clearTimeout(timeout);
    }
}
