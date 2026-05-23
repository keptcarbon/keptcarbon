import { NextResponse, NextRequest } from "next/server";
import { GOOGLE_CONFIG } from "@/lib/google-config";
import { pool } from "@/lib/db";
import { signToken, AUTH_COOKIE } from "@/lib/jwt";

/**
 * GET /api/auth/google/callback
 * Handles OAuth callback for Google.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const baseUrl = `${proto}://${host}`;

  if (error) {
    return NextResponse.redirect(new URL("/?google_error=cancelled", baseUrl));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/?google_error=missing_params", baseUrl));
  }

  const savedState = request.cookies.get("google_oauth_state")?.value;
  if (state !== savedState) {
    return NextResponse.redirect(new URL("/?google_error=state_mismatch", baseUrl));
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch(GOOGLE_CONFIG.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CONFIG.clientId,
        client_secret: GOOGLE_CONFIG.clientSecret,
        redirect_uri: GOOGLE_CONFIG.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL("/?google_error=token_failed", baseUrl));
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token as string;

    // Fetch user profile
    const profileRes = await fetch(GOOGLE_CONFIG.profileUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) {
      return NextResponse.redirect(new URL("/?google_error=profile_failed", baseUrl));
    }
    const profile = await profileRes.json();
    const email = profile.email as string;
    const fullname = profile.name as string;
    const pictureUrl = profile.picture || "";

    // Upsert user in DB
    const result = await pool.query(
      `INSERT INTO users (email, username, fullname, picture_url, provider, google_user_id, role)
       VALUES ($1, $2, $3, $4, 'google', $5, 'user')
       ON CONFLICT (google_user_id) DO UPDATE SET picture_url = EXCLUDED.picture_url, fullname = EXCLUDED.fullname
       RETURNING id, email, role, provider`,
      [email, `google_${profile.sub?.slice(0, 8) || email}`, fullname, pictureUrl, profile.sub]
    );
    const dbUser = result.rows[0];

    // Issue JWT
    const token = signToken({
      userId: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      provider: dbUser.provider,
    });

    const response = NextResponse.redirect(new URL("/", baseUrl));
    response.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    response.cookies.delete("google_oauth_state");
    return response;
  } catch (err) {
    console.error("Google callback error:", err);
    return NextResponse.redirect(new URL("/?google_error=server_error", baseUrl));
  }
}
