import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

/**
 * PUT /api/profile/update
 * Updates the authenticated user's profile information.
 */
export async function PUT(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { firstName, lastName, phone } = body;

    if (!firstName) {
      return NextResponse.json(
        { error: "First name is required" },
        { status: 400 }
      );
    }

    const first = String(firstName).trim();
    const last = String(lastName ?? "").trim();
    const displayName = `${first} ${last}`.trim();
    const phoneVal = phone || "";

    // updated_at handled by the trg_users_updated_at trigger
    await pool.query(
      `UPDATE users SET first_name = $1, last_name = $2, display_name = $3, phone = $4 WHERE id = $5`,
      [first, last, displayName, phoneVal, payload.userId]
    );

    return NextResponse.json({ success: true, firstName: first, lastName: last, displayName, phone: phoneVal });
  } catch (err) {
    console.error("Profile update error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
