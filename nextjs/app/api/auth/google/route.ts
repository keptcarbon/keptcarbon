import { NextResponse } from "next/server";
import { GOOGLE_CONFIG } from "@/lib/google-config";

export async function GET() {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: GOOGLE_CONFIG.clientId,
    redirect_uri: GOOGLE_CONFIG.redirectUri,
    response_type: "code",
    scope: GOOGLE_CONFIG.scope,
    state,
    access_type: "offline",
    prompt: "consent",
  });
  const response = NextResponse.redirect(`${GOOGLE_CONFIG.authUrl}?${params.toString()}`);
  response.cookies.set("google_oauth_state", state, { httpOnly: true, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600 });
  return response;
}
