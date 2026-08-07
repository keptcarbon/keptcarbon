import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import { isPasswordResetEnabled } from "@/lib/feature-flags";
import { hashResetToken } from "@/lib/reset-token";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

/**
 * Password-reset completion endpoint (paired with /api/auth/forgot-password).
 *
 * GET  /api/auth/reset-password?token=...  → validate a token (for the page UI)
 * POST /api/auth/reset-password            → commit a new password (single-use)
 *
 * Tokens are stored hashed, so the incoming raw token is hashed before every
 * lookup. Purely additive: only writes password_hash + clears the reset_token
 * columns. Does not touch login/session/OAuth code paths.
 */

// Mirrors the register route's password policy.
const MIN_PASSWORD_LEN = 6;

// Rate limit: max 10 submit attempts per IP per 15 minutes.
const RL = { limit: 10, windowMs: 15 * 60 * 1000 };

/**
 * GET — is this token currently valid (exists + not expired)?
 * Returns { valid: boolean }. The token itself is the secret, so revealing
 * validity is expected here (unlike the enumeration-safe forgot endpoint).
 */
export async function GET(request: NextRequest) {
  if (!isPasswordResetEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  try {
    const result = await pool.query(
      `SELECT 1 FROM tbl_users
        WHERE reset_token = $1 AND reset_token_expires > NOW()
        LIMIT 1`,
      [hashResetToken(token)]
    );
    return NextResponse.json({ valid: result.rows.length > 0 }, { status: 200 });
  } catch (err) {
    console.error("Reset-password validate error:", err);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}

/**
 * POST — commit the new password.
 * Body: { token: string, password: string }
 */
export async function POST(request: NextRequest) {
  if (!isPasswordResetEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Rate limit by IP (throttles token-guessing attempts).
  const rl = checkRateLimit(`reset:${clientIp(request)}`, RL);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "มีคำขอมากเกินไป กรุณาลองใหม่ในภายหลัง" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!token) {
      return NextResponse.json(
        { error: "ลิงก์รีเซ็ตไม่ถูกต้อง" },
        { status: 400 }
      );
    }
    if (!password || password.length < MIN_PASSWORD_LEN) {
      return NextResponse.json(
        { error: `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LEN} ตัวอักษร` },
        { status: 400 }
      );
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    // Atomic validate-and-consume: the WHERE clause re-checks existence AND
    // expiry, and clearing the token in the same statement makes the link
    // strictly single-use (no race between a separate SELECT and UPDATE).
    const upd = await pool.query(
      `UPDATE tbl_users
          SET password_hash = $1,
              reset_token = NULL,
              reset_token_expires = NULL
        WHERE reset_token = $2
          AND reset_token_expires > NOW()
        RETURNING id`,
      [hash, hashResetToken(token)]
    );

    if (upd.rowCount === 0) {
      return NextResponse.json(
        { error: "ลิงก์รีเซ็ตไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว",
    });
  } catch (err) {
    console.error("Reset-password error:", err);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
