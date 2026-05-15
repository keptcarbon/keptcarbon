import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import { signToken, AUTH_COOKIE } from "@/lib/jwt";

/**
 * POST /api/auth/login
 * Body: { login: string, password: string }
 * `login` can be email OR username.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { login, password } = body as { login?: string; password?: string };

    if (!login || !password) {
      return NextResponse.json(
        { error: "กรุณากรอกชื่อผู้ใช้/อีเมล และรหัสผ่าน" },
        { status: 400 }
      );
    }

    // Look up by email or username
    const result = await pool.query(
      `SELECT id, email, username, password_hash, fullname, phone, picture_url, provider, role
       FROM users
       WHERE (LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1))
         AND provider = 'local'
       LIMIT 1`,
      [login.trim()]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง" },
        { status: 401 }
      );
    }

    const user = result.rows[0];

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: "อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง" },
        { status: 401 }
      );
    }

    // Issue JWT
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      provider: user.provider,
    });

    const res = NextResponse.json({
      success: true,
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

    // Set HttpOnly cookie
    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
