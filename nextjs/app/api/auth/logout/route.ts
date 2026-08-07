import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyToken } from "@/lib/jwt";
import { logAuthEvent } from "@/lib/auth-log";
import { getUserUuid } from "@/lib/carbon-projects";

/**
 * POST /api/auth/logout
 * Clears the JWT authentication cookie.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const userUuid = await getUserUuid(payload);
      if (userUuid) {
        await logAuthEvent(request, { userUuid, email: payload.email, eventType: "logout", provider: payload.provider });
      }
    }
  }

  const res = NextResponse.json({ success: true });

  res.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0, // Clear the cookie
    path: "/",
  });

  return res;
}
