import { NextRequest, NextResponse } from "next/server";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

/**
 * Optimistic, cookie-only check (no DB call — see Next.js Proxy guidance) so
 * the redirect fires before any HTML is sent, instead of flashing the wrong
 * page client-side first. Three directions:
 *  - admin accounts never land on a general-user page (except /profile)
 *  - non-admins never land on the admin-only area (/admin)
 *  - accounts that are neither admin nor R&D never land on the R&D area (/rnd)
 * R&D accounts are NOT confined to /rnd — they browse the main site like a
 * regular user, with /rnd layered on top.
 * The client-side guards in app/(main)/layout.tsx and app/(admin)/layout.tsx,
 * plus the role checks in the admin API routes, remain the real
 * authorization boundary.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminOnlyRoute = pathname.startsWith("/admin");
  const isRndRoute = pathname.startsWith("/rnd");

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? verifyToken(token) : null;
  const isAdmin = payload?.role === "admin";
  const isRnd = payload?.role === "rd";

  if (isAdminOnlyRoute && !isAdmin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isRndRoute && !isAdmin && !isRnd) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isAdmin && !isAdminOnlyRoute && !isRndRoute && !pathname.startsWith("/profile")) {
    return NextResponse.redirect(new URL("/admin/users/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|assets|favicon.ico|site.webmanifest).*)"],
};
