"use client";

export type StoredUser = {
  id: string;
  fullname: string;
  username?: string;
  email: string;
  password?: string;
  phone: string;
  role: "farmer" | "editor" | "admin";
  pictureUrl?: string;
  provider?: string;
  createdAt: string;
};

export type SessionUser = Omit<StoredUser, "password">;

export type Result<T = void> =
  | ({ success: true } & (T extends void ? object : { user: T }))
  | { success: false; message: string };

const USERS_KEY = "kc_users";
const SESSION_KEY = "kc_user";

const isBrowser = () => typeof window !== "undefined";

function readUsers(): StoredUser[] {
  if (!isBrowser()) return [];
  const raw = localStorage.getItem(USERS_KEY);
  return raw ? (JSON.parse(raw) as StoredUser[]) : [];
}

function writeUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export const Auth = {
  getUser(): SessionUser | null {
    if (!isBrowser()) return null;
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  },

  isLoggedIn(): boolean {
    return !!this.getUser();
  },

  register(input: {
    fullname: string;
    email: string;
    phone?: string;
    password: string;
  }): Result<SessionUser> {
    const users = readUsers();
    if (users.find((u) => u.email === input.email)) {
      return { success: false, message: "อีเมลนี้ถูกใช้งานแล้ว" };
    }
    const newUser: StoredUser = {
      id: Date.now().toString(),
      fullname: input.fullname,
      email: input.email,
      password: input.password,
      phone: input.phone ?? "",
      role: "farmer",
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    writeUsers(users);
    const { password: _pw, ...session } = newUser;
    void _pw;
    return { success: true, user: session };
  },

  login(email: string, password: string): Result<SessionUser> {
    const users = readUsers();
    const user = users.find((u) => u.email === email && u.password === password);
    if (!user) {
      return { success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
    }
    const { password: _pw, ...session } = user;
    void _pw;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { success: true, user: session };
  },

  logout() {
    if (!isBrowser()) return;
    localStorage.removeItem(SESSION_KEY);
  },

  updateProfile(updates: {
    fullname?: string;
    phone?: string;
    newPassword?: string;
  }): Result<void> {
    const session = this.getUser();
    if (!session) return { success: false, message: "ไม่ได้เข้าสู่ระบบ" };
    const users = readUsers();
    const idx = users.findIndex((u) => u.id === session.id);
    if (idx === -1) return { success: false, message: "ไม่พบผู้ใช้" };

    if (updates.fullname !== undefined) users[idx].fullname = updates.fullname;
    if (updates.phone !== undefined) users[idx].phone = updates.phone;
    if (updates.newPassword) users[idx].password = updates.newPassword;
    writeUsers(users);

    const { password: _pw, ...next } = users[idx];
    void _pw;
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return { success: true };
  },
};

export type Plot = {
  id: string;
  [key: string]: unknown;
};

export const PlotDB = {
  getPlots(userId: string): Plot[] {
    if (!isBrowser()) return [];
    const raw = localStorage.getItem(`kc_plots_${userId}`);
    return raw ? (JSON.parse(raw) as Plot[]) : [];
  },
  savePlot(userId: string, plot: Plot): Plot {
    const plots = this.getPlots(userId);
    const idx = plots.findIndex((p) => p.id === plot.id);
    if (idx >= 0) plots[idx] = plot;
    else plots.push(plot);
    localStorage.setItem(`kc_plots_${userId}`, JSON.stringify(plots));
    return plot;
  },
  deletePlot(userId: string, plotId: string) {
    const plots = this.getPlots(userId).filter((p) => p.id !== plotId);
    localStorage.setItem(`kc_plots_${userId}`, JSON.stringify(plots));
  },
  getPlotById(userId: string, plotId: string): Plot | undefined {
    return this.getPlots(userId).find((p) => p.id === plotId);
  },
};
