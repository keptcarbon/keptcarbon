"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ready, user, openLogin } = useAuth();

  useEffect(() => {
    if (ready && !user) {
      router.replace("/");
      // Optionally open the login modal automatically
      setTimeout(() => openLogin(), 100);
    }
  }, [ready, user, router, openLogin]);

  if (!ready || !user) return null;
  return <>{children}</>;
}
