import { NextRequest, NextResponse } from "next/server";
import { LINE_CONFIG } from "@/lib/line-config";
import { pool } from "@/lib/db";
import { signToken, AUTH_COOKIE } from "@/lib/jwt";

/**
 * LINE OAuth profile response shape
 */
interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

/**
 * GET /api/auth/line/callback
 * Handles the OAuth callback from LINE:
 * 1. Verifies state (CSRF)
 * 2. Exchanges code for access_token
 * 3. Fetches user profile
 * 4. Upserts user in PostgreSQL database
 * 5. Issues JWT cookie and redirects to dashboard
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle user-cancelled or LINE error
  if (error) {
    return NextResponse.redirect(new URL("/?line_error=cancelled", request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?line_error=missing_params", request.url));
  }

  // Verify CSRF state
  const savedState = request.cookies.get("line_oauth_state")?.value;
  if (state !== savedState) {
    return NextResponse.redirect(new URL("/?line_error=state_mismatch", request.url));
  }

  try {
    // ── Exchange code for access token ──────────────
    const tokenRes = await fetch(LINE_CONFIG.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: LINE_CONFIG.callbackUrl,
        client_id: LINE_CONFIG.channelId,
        client_secret: LINE_CONFIG.channelSecret,
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("LINE token exchange failed:", errBody);
      return NextResponse.redirect(new URL("/?line_error=token_failed", request.url));
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token as string;

    // ── Fetch user profile ─────────────────────────
    const profileRes = await fetch(LINE_CONFIG.profileUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      return NextResponse.redirect(new URL("/?line_error=profile_failed", request.url));
    }

    const profile: LineProfile = await profileRes.json();

    // ── Database Upsert (Register or Login) ────────
    const email = `${profile.userId}@line.me`;
    const username = `line_${profile.userId.slice(0, 8)}`;
    const fullname = profile.displayName;
    const pictureUrl = profile.pictureUrl || "";

    // Check if user exists by line_user_id
    let dbUserResult = await pool.query(
      `SELECT id, email, role, provider FROM users WHERE line_user_id = $1 LIMIT 1`,
      [profile.userId]
    );

    let dbUser;

    if (dbUserResult.rows.length === 0) {
      // Auto-register LINE user
      const insertResult = await pool.query(
        `INSERT INTO users (email, username, fullname, picture_url, provider, line_user_id, role)
         VALUES ($1, $2, $3, $4, 'line', $5, 'user')
         RETURNING id, email, role, provider`,
        [email, username, fullname, pictureUrl, profile.userId]
      );
      dbUser = insertResult.rows[0];
    } else {
      // User exists, update their profile picture just in case it changed
      await pool.query(
        `UPDATE users SET picture_url = $1, fullname = $2 WHERE id = $3`,
        [pictureUrl, fullname, dbUserResult.rows[0].id]
      );
      dbUser = dbUserResult.rows[0];
    }

    // ── Issue JWT ──────────────────────────────────
    const token = signToken({
      userId: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      provider: dbUser.provider,
    });

    // Redirect to home page
    const response = NextResponse.redirect(new URL("/", request.url));

    response.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    // Clean up state cookie
    response.cookies.delete("line_oauth_state");

    return response;
  } catch (err) {
    console.error("LINE callback error:", err);
    return NextResponse.redirect(new URL("/?line_error=server_error", request.url));
  }
}
