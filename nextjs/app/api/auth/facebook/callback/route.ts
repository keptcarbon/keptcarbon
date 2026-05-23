import { NextResponse, NextRequest } from "next/server";
import { FACEBOOK_CONFIG } from "@/lib/facebook-config";
import { pool } from "@/lib/db";
import { signToken, AUTH_COOKIE } from "@/lib/jwt";

/**
 * GET /api/auth/facebook/callback
 * Handles OAuth callback for Facebook.
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
    return NextResponse.redirect(new URL("/?facebook_error=cancelled", baseUrl));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/?facebook_error=missing_params", baseUrl));
  }

  const savedState = request.cookies.get("facebook_oauth_state")?.value;
  if (state !== savedState) {
    return NextResponse.redirect(new URL("/?facebook_error=state_mismatch", baseUrl));
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch(FACEBOOK_CONFIG.tokenUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      // Facebook expects query parameters
      // Build using URLSearchParams for clarity
    });
    // Build token request with proper params
    const tokenUrl = `${FACEBOOK_CONFIG.tokenUrl}?` + new URLSearchParams({
      client_id: FACEBOOK_CONFIG.clientId,
      redirect_uri: FACEBOOK_CONFIG.redirectUri,
      client_secret: FACEBOOK_CONFIG.clientSecret,
      code,
    }).toString();
    const tokenResponse = await fetch(tokenUrl, { method: "GET" });
    if (!tokenResponse.ok) {
      return NextResponse.redirect(new URL("/?facebook_error=token_failed", baseUrl));
    }
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token as string;

    // Fetch user profile
    const profileRes = await fetch(`${FACEBOOK_CONFIG.profileUrl}&access_token=${accessToken}`);
    if (!profileRes.ok) {
      return NextResponse.redirect(new URL("/?facebook_error=profile_failed", baseUrl));
    }
    const profile = await profileRes.json();
    const email = profile.email as string;
    const fullname = profile.name as string;
    const pictureUrl = profile.picture?.data?.url || "";
    const facebookId = profile.id as string;

    // Upsert user in DB
    const result = await pool.query(
      `INSERT INTO users (email, username, fullname, picture_url, provider, facebook_user_id, role)
       VALUES ($1, $2, $3, $4, 'facebook', $5, 'user')
       ON CONFLICT (facebook_user_id) DO UPDATE SET picture_url = EXCLUDED.picture_url, fullname = EXCLUDED.fullname, email = EXCLUDED.email
       RETURNING id, email, role, provider`,
      [email, `facebook_${facebookId?.slice(0, 8) || email}`, fullname, pictureUrl, facebookId]
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
    // Clean up state cookie
    response.cookies.delete("facebook_oauth_state");
    return response;
  } catch (err) {
    console.error("Facebook callback error:", err);
    return NextResponse.redirect(new URL("/?facebook_error=server_error", baseUrl));
  }
}
