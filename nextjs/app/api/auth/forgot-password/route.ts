import { NextRequest, NextResponse, after } from "next/server";
import { pool } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { isPasswordResetEnabled } from "@/lib/feature-flags";
import { generateResetToken } from "@/lib/reset-token";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 *
 * Generates a one-time reset token (15 min TTL), stores only its HASH on the
 * user row, and emails a reset link. Purely additive — does not touch
 * login/session.
 *
 * Enumeration-safe on two axes:
 *  - Response body/status is identical whether or not the email exists.
 *  - The email is sent AFTER the response (via `after()`), so a real account
 *    doesn't respond measurably slower than an unknown one (no timing leak).
 */

// Token lifetime: 15 minutes.
const TOKEN_TTL_MS = 15 * 60 * 1000;

// Rate limit: max 5 requests per IP per 15 minutes.
const RL = { limit: 5, windowMs: 15 * 60 * 1000 };

// Basic shape check — real validation is that a matching user exists.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Uniform response so callers can't distinguish "sent" from "no such account".
const GENERIC_OK = {
  success: true,
  message: "หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์รีเซ็ตรหัสผ่านไปให้แล้ว",
};

export async function POST(request: NextRequest) {
  // 1) Feature flag — behave as if the endpoint does not exist when disabled.
  if (!isPasswordResetEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 2) Rate limit by IP (applied uniformly, before any DB work).
  const rl = checkRateLimit(`forgot:${clientIp(request)}`, RL);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "มีคำขอมากเกินไป กรุณาลองใหม่ในภายหลัง" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    // 3) Validate input shape. A malformed request is a client error and does
    //    not leak account existence.
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "กรุณากรอกอีเมลให้ถูกต้อง" },
        { status: 400 }
      );
    }

    // Look up the account (case-insensitive), same convention as login.
    const result = await pool.query(
      `SELECT id, email FROM tbl_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0] as { id: number; email: string };

      // 4) Secure random token; store only its hash, with a 15-minute expiry.
      const { token, tokenHash } = generateResetToken();
      const expires = new Date(Date.now() + TOKEN_TTL_MS);

      await pool.query(
        `UPDATE tbl_users
            SET reset_token = $1,
                reset_token_expires = $2
          WHERE id = $3`,
        [tokenHash, expires, user.id]
      );

      // 5) Send the email AFTER the response is returned. Keeps response timing
      //    uniform (no enumeration via latency) and, on standalone, still runs
      //    to completion. Errors are logged, never surfaced.
      const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
      const resetUrl = `${origin}/reset-password?token=${token}`;
      const recipient = user.email;
      after(async () => {
        try {
          await sendPasswordResetEmail(recipient, resetUrl);
        } catch (mailErr) {
          console.error("Password reset email failed:", mailErr);
        }
      });
    }

    // 6) Uniform success — no enumeration.
    return NextResponse.json(GENERIC_OK, { status: 200 });
  } catch (err) {
    console.error("Forgot-password error:", err);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
