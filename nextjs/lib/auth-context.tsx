"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Auth, type SessionUser } from "./auth";

type ModalKind = null | "login" | "register";

type AuthContextValue = {
  user: SessionUser | null;
  ready: boolean;
  modal: ModalKind;
  openLogin: () => void;
  openRegister: () => void;
  closeModal: () => void;
  refresh: () => void;
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
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
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
