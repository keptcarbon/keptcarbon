import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

/**
 * GET /api/auth/me
 * Returns the currently authenticated user based on the JWT cookie.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const result = await pool.query(
      `SELECT id, email, username, fullname, phone, picture_url, provider, role
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [payload.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = result.rows[0];

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullname: user.fullname,
        phone: user.phone,
        pictureUrl: user.picture_url,
        role: user.role,
        provider: user.provider,
      },
    });
  } catch (err) {
    console.error("Auth me error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
