"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

/** Shape returned by /api/auth/me, /api/auth/login, /api/auth/register. */
export type SessionUser = {
  id: number | string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone?: string;
  pictureUrl?: string;
  role: string;
  provider?: string;
};

type ModalKind = null | "login" | "register";

type AuthContextValue = {
  user: SessionUser | null;
  ready: boolean;
  modal: ModalKind;
  openLogin: () => void;
  openRegister: () => void;
  closeModal: () => void;
  /** Resolves true if a claimed guest project already redirected the user. */
  refresh: () => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    let claimRedirected = false;
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        // If a guest built projects before signing in, claim them into the
        // account so their drawn plots follow them. Covers every login path
        // (local + OAuth redirect) since it runs whenever a user is present.
        if (data.user && typeof window !== "undefined") {
          const guestKey = localStorage.getItem("guest_user_id");
          if (guestKey) {
            try {
              const claimRes = await fetch("/api/plots/claim", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ guestKey }),
              });
              if (claimRes.ok) {
                localStorage.removeItem("guest_user_id");
                const claimData = await claimRes.json();
                const claimedProjects: { projectName: string }[] = claimData.projects ?? [];
                // Land the user back on map-draw with the claimed project
                // loaded, same as the >5-plot popup's post-login flow, so a
                // guest project claimed from a login that had nothing to do
                // with drawing isn't left invisible under its auto-generated
                // "Guest-<hex>" name.
                if (claimedProjects[0]?.projectName) {
                  router.push(
                    `/map-draw?project=${encodeURIComponent(claimedProjects[0].projectName)}&action=calc`
                  );
                  claimRedirected = true;
                }
              }
            } catch {
              /* non-fatal: retried on next load */
            }
          }
        }
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
    return claimRedirected;
  }, [router]);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      modal,
      openLogin: () => setModal("login"),
      openRegister: () => setModal("register"),
      closeModal: () => setModal(null),
      refresh,
      logout: async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        setUser(null);
      },
    }),
    [user, ready, modal, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
