"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

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
  /** Re-reads the session (and silently claims a guest's assessed projects off
   *  the map-draw page). Always resolves false -- kept for call-site compat. */
  refresh: () => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        // If a guest drew + assessed projects before signing in (guest_user_id
        // is only set once a guest save writes a row), claim them into the
        // account -- an in-place guest_uuid -> user_uuid flip, no clone, no
        // redirect. The map-draw page owns its own richer reconcile (restoring
        // an un-saved client snapshot, filling the project-name box), so skip
        // here when we're on it to avoid racing that.
        if (
          data.user &&
          typeof window !== "undefined" &&
          !window.location.pathname.startsWith("/map-draw")
        ) {
          const guestKey = localStorage.getItem("guest_user_id");
          if (guestKey) {
            try {
              const claimRes = await fetch("/api/plots/claim", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ guestKey }),
              });
              if (claimRes.ok) localStorage.removeItem("guest_user_id");
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
    return false;
  }, []);

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
