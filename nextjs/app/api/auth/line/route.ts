import { NextResponse } from "next/server";
import { LINE_CONFIG } from "@/lib/line-config";

/**
 * GET /api/auth/line
 * Redirects the user to LINE's OAuth authorization page.
 */
export async function GET() {
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: LINE_CONFIG.channelId,
    redirect_uri: LINE_CONFIG.callbackUrl,
    state,
    scope: LINE_CONFIG.scope,
  });

  const url = `${LINE_CONFIG.authUrl}?${params.toString()}`;

  const response = NextResponse.redirect(url);
  // Store state in a cookie to verify on callback (CSRF protection)
  response.cookies.set("line_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
