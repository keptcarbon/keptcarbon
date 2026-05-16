import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import { signToken, AUTH_COOKIE } from "@/lib/jwt";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, fullname, phone } = body as {
      email?: string;
      password?: string;
      fullname?: string;
      phone?: string;
    };

    if (!email || !password || !fullname) {
      return NextResponse.json(
        { error: "กรุณากรอกข้อมูลให้ครบถ้วน (ชื่อ, อีเมล, รหัสผ่าน)" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existing = await pool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [
      email.trim(),
    ]);

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "อีเมลนี้มีผู้ใช้งานแล้ว" },
        { status: 409 }
      );
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    // Generate a default username from email prefix
    const baseUsername = email.split("@")[0];
    const username = `${baseUsername}_${Date.now().toString().slice(-4)}`;

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash, fullname, phone, provider, role)
       VALUES ($1, $2, $3, $4, $5, 'local', 'user')
       RETURNING id, email, username, fullname, phone, picture_url, provider, role`,
      [email.trim(), username, hash, fullname.trim(), phone?.trim() || ""]
    );

    const user = result.rows[0];

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
    console.error("Register error:", err);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการสมัครสมาชิก" },
      { status: 500 }
    );
  }
}
