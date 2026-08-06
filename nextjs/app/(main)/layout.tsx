"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * Admin accounts are confined to the (admin) area — visiting any general-user
 * page here bounces them to /admin/users, except /profile which admins are
 * still allowed to view (with the admin-style navbar, see Header.tsx).
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = ready && user?.role === "admin";
  const isExempt = pathname.startsWith("/profile");
  const shouldRedirect = isAdmin && !isExempt;

  useEffect(() => {
    if (shouldRedirect) router.replace("/admin/users");
  }, [shouldRedirect, router]);

  if (shouldRedirect) return null;
  return <>{children}</>;
}
