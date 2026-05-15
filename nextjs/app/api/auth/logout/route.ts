import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/jwt";

/**
 * POST /api/auth/logout
 * Clears the JWT authentication cookie.
 */
export async function POST() {
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
