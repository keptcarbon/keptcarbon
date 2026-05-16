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
    const { firstname, lastname, phone } = body;

    if (!firstname || !lastname) {
      return NextResponse.json(
        { error: "Firstname and lastname are required" },
        { status: 400 }
      );
    }

    const fullname = `${firstname} ${lastname}`.trim();
    const phoneVal = phone || "";

    await pool.query(
      `UPDATE users SET fullname = $1, phone = $2, updated_at = NOW() WHERE id = $3`,
      [fullname, phoneVal, payload.userId]
    );

    return NextResponse.json({ success: true, fullname, phone: phoneVal });
  } catch (err) {
    console.error("Profile update error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
