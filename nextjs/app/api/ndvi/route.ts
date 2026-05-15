import { NextRequest, NextResponse } from "next/server";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

export async function POST(request: NextRequest) {
    // Require auth — same pattern as all other API routes
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (!token || !verifyToken(token)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { geometry?: unknown; startDate?: string; endDate?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.geometry || typeof body.geometry !== "object") {
        return NextResponse.json({ error: "geometry is required" }, { status: 400 });
    }

    const geeUrl = process.env.GEE_SERVICE_URL ?? "http://localhost:8001";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
        const upstream = await fetch(`${geeUrl}/ndvi`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                geometry: body.geometry,
                start_date: body.startDate ?? null,
                end_date: body.endDate ?? null,
            }),
            signal: controller.signal,
        });

        const data = await upstream.json().catch(() => ({})) as Record<string, unknown>;

        if (!upstream.ok) {
            return NextResponse.json(
                { error: (data.detail as string) ?? `GEE service error (HTTP ${upstream.status})` },
                { status: upstream.status === 503 ? 503 : 502 },
            );
        }

        return NextResponse.json(data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to reach GEE service";
        const isTimeout = msg.includes("abort") || msg.includes("timeout");
        return NextResponse.json(
            { error: isTimeout ? "GEE request timed out (> 90 s)" : msg },
            { status: 503 },
        );
    } finally {
        clearTimeout(timeout);
    }
}
