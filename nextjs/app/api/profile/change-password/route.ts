import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

/**
 * PUT /api/profile/change-password
 * Sets a new password for the authenticated user. Only allowed for local
 * (email/password) accounts — OAuth-only accounts have no password_hash to
 * change from and aren't offered this in the UI.
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
    const { currentPassword, password, confirmPassword } = body as {
      currentPassword?: string;
      password?: string;
      confirmPassword?: string;
    };

    if (!currentPassword) {
      return NextResponse.json(
        { error: "กรุณากรอกรหัสผ่านปัจจุบัน" },
        { status: 400 }
      );
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" },
        { status: 400 }
      );
    }
    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "รหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง" },
        { status: 400 }
      );
    }

    const userRes = await pool.query("SELECT provider, password_hash FROM tbl_users WHERE id = $1", [payload.userId]);
    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: "ไม่พบผู้ใช้งาน" }, { status: 404 });
    }
    if (userRes.rows[0].provider !== "local") {
      return NextResponse.json(
        { error: "บัญชีนี้เข้าสู่ระบบผ่านผู้ให้บริการภายนอก ไม่สามารถเปลี่ยนรหัสผ่านได้" },
        { status: 403 }
      );
    }

    const currentValid = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
    if (!currentValid) {
      return NextResponse.json(
        { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" },
        { status: 401 }
      );
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    await pool.query(`UPDATE tbl_users SET password_hash = $1 WHERE id = $2`, [hash, payload.userId]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Change password error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}