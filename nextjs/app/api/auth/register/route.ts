import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import { signToken, AUTH_COOKIE } from "@/lib/jwt";
import { logAuthEvent } from "@/lib/auth-log";

// Name rule (First & Last): 1–50 chars; letters (incl. Thai/Unicode), spaces, hyphens, apostrophes.
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s'-]{0,49}$/u;

// Returns an error message for an invalid (already-trimmed) name, or null when valid.
function nameError(v: string, label: string): string | null {
  if (!v) return `กรุณากรอก${label}`;
  if (v.length > 50) return `${label}ต้องมีความยาวไม่เกิน 50 ตัวอักษร`;
  if (!NAME_RE.test(v)) return `${label}ใช้ได้เฉพาะตัวอักษร เว้นวรรค ขีดกลาง (-) และเครื่องหมาย '`;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, firstName, lastName, phone } = body as {
      email?: string;
      password?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "กรุณากรอกข้อมูลให้ครบถ้วน (อีเมล, รหัสผ่าน)" },
        { status: 400 }
      );
    }

    // Trim (normalize) before validating and saving.
    const first = (firstName ?? "").trim();
    const last = (lastName ?? "").trim();

    // Validate both names: length 1–50 + allowed-character whitelist (mirrors the frontend).
    const firstErr = nameError(first, "ชื่อ");
    if (firstErr) {
      return NextResponse.json({ error: firstErr }, { status: 400 });
    }
    // Last name is optional — only validate the format when something was provided.
    const lastErr = last ? nameError(last, "นามสกุล") : null;
    if (lastErr) {
      return NextResponse.json({ error: lastErr }, { status: 400 });
    }

    const displayName = `${first} ${last}`.trim();

    if (password.length < 6) {
      return NextResponse.json(
        { error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existing = await pool.query("SELECT id FROM tbl_users WHERE LOWER(email) = LOWER($1)", [
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
      `INSERT INTO tbl_users (email, username, password_hash, first_name, last_name, display_name, phone, provider, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'local', 'user')
       RETURNING id, uuid, email, username, first_name, last_name, display_name, phone, picture_url, provider, role`,
      [email.trim(), username, hash, first, last, displayName, phone?.trim() || ""]
    );

    const user = result.rows[0];

    // Issue JWT
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      provider: user.provider,
    });

    // Registration auto-logs the user in — record it as a login event.
    await logAuthEvent(request, { userUuid: user.uuid, email: user.email, eventType: "login", provider: "local" });

    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        displayName: user.display_name,
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
