import { NextResponse } from "next/server";
import { FACEBOOK_CONFIG } from "@/lib/facebook-config";

/**
 * GET /api/auth/facebook
 * Redirects the user to Facebook's OAuth authorization page.
 */
export async function GET() {
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: FACEBOOK_CONFIG.clientId,
    redirect_uri: FACEBOOK_CONFIG.redirectUri,
    state,
    scope: FACEBOOK_CONFIG.scope,
    response_type: "code",
  });

  const url = `${FACEBOOK_CONFIG.authUrl}?${params.toString()}`;

  const response = NextResponse.redirect(url);
  // Store state in a cookie for CSRF protection
  response.cookies.set("facebook_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
