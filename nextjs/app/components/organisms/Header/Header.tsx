"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Menu,
  X,
  Map,
  BarChart3,
  User,
  MapPinned,
  LogOut,
  LogIn,
  UserPlus,
  FileText,
  LayoutGrid,
  Shield,
} from "lucide-react";

/* ── Nav data ────────────────────────────────────────────────────────────── */
const navLinks = [
  { label: "หน้าแรก", href: "/", icon: LayoutGrid },
  { label: "เกี่ยวกับโครงการ", href: "/about-project", icon: FileText },
  { label: "แดชบอร์ด", href: "/dashboard", icon: BarChart3 },
  { label: "ประเมินคาร์บอน", href: "/map-draw", icon: Map },
] as const;

/* ── Component ───────────────────────────────────────────────────────────── */
export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, user, openLogin, openRegister, logout } = useAuth();

  const [scrolled, setScrolled] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  const avatarRef = useRef<HTMLDivElement>(null);

  /* Close dropdowns on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node))
        setAvatarOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Scroll shadow */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Lock body scroll when mobile nav is open */
  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [navOpen]);

  const closeNav = () => setNavOpen(false);
  const onLogout = () => {
    logout();
    closeNav();
    router.push("/");
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  /* Shared link classes (desktop center nav) */
  const navLinkClass = (active: boolean) =>
    `rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors hover:text-[var(--kc-green)] ${active ? "text-[var(--kc-green)]" : "text-[var(--kc-ink)]"
    }`;

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <>
      {/* ───── Desktop + Mobile Top Bar ───────────────────────────────── */}
      <header
        className={`kc-tw fixed inset-x-0 top-0 z-[997] border-b border-[var(--kc-border-input)] bg-white/95 backdrop-blur-md transition-shadow duration-300 ${scrolled ? "shadow-[0_4px_16px_rgba(0,0,0,0.05)]" : ""
          }`}
      >
        <div className="mx-auto flex h-16 max-w-9xl items-center justify-between px-4 lg:px-8">
          {/* ── Logo ─────────────────────────────────────────────────── */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 no-underline"
          >
            <Image
              src="/assets/img/keptcarbon-logo.png"
              alt="KeptCarbon"
              width={40}
              height={40}
              className="h-9 w-9 rounded-lg object-cover shadow-[var(--kc-shadow-xs)]"
              priority
            />
          </Link>

          {/* ── Desktop Center Nav (hidden below xl) ─────────────────── */}
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 xl:flex">
            {navLinks.map(({ label, href }) => (
              <Link key={href} href={href} className={navLinkClass(isActive(href))}>
                {label}
              </Link>
            ))}
          </nav>

          {/* ── Desktop Right: Auth (hidden below xl) ────────────────── */}
          <div className="hidden items-center gap-3 xl:flex">
            {ready && user ? (
              /* ── Logged-in avatar dropdown ── */
              <div className="relative" ref={avatarRef}>
                <button
                  type="button"
                  className="flex items-center gap-2 border-0 bg-transparent rounded-full p-0.5 transition-shadow hover:ring-2 hover:ring-[var(--kc-green)]/20 cursor-pointer"
                  onClick={() => setAvatarOpen((v) => !v)}
                >
                  {user.pictureUrl ? (
                    <img
                      src={user.pictureUrl}
                      alt={user.fullname}
                      referrerPolicy="no-referrer"
                      className="size-9 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex size-9 items-center justify-center rounded-full bg-[var(--kc-green)] text-white">
                      <User className="size-4" />
                    </span>
                  )}
                </button>

                {/* Avatar dropdown */}
                <div
                  className={`absolute right-0 top-full pt-2 transition-all duration-200 ${avatarOpen
                    ? "pointer-events-auto translate-y-0 opacity-100"
                    : "pointer-events-none -translate-y-1 opacity-0"
                    }`}
                >
                  <div className="w-52 overflow-hidden rounded-xl border border-[var(--kc-border-input)] bg-white shadow-[var(--kc-shadow-card)]">
                    {/* User info */}
                    <div className="border-b border-[var(--kc-border-input)] px-4 py-3">
                      <p className="m-0 text-sm font-semibold text-[var(--kc-ink)]">
                        {user.fullname}
                      </p>
                      <p className="m-0 mt-0.5 truncate text-xs text-[var(--kc-sage)]">
                        {user.email}
                      </p>
                    </div>
                    <Link
                      href="/my-plots"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--kc-ink)] no-underline transition-colors hover:bg-[var(--kc-green-50)]"
                      onClick={() => setAvatarOpen(false)}
                    >
                      <MapPinned className="size-4 text-[var(--kc-sage)]" />
                      แปลงของฉัน
                    </Link>
                    <Link
                      href="/profile"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--kc-ink)] no-underline transition-colors hover:bg-[var(--kc-green-50)]"
                      onClick={() => setAvatarOpen(false)}
                    >
                      <User className="size-4 text-[var(--kc-sage)]" />
                      โปรไฟล์
                    </Link>
                    {user.role === "admin" && (
                      <>
                        <div className="mx-4 border-t border-[var(--kc-border-input)]" />
                        <Link
                          href="/admin/users"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--kc-ink)] no-underline transition-colors hover:bg-[var(--kc-green-50)]"
                          onClick={() => setAvatarOpen(false)}
                        >
                          <Shield className="size-4 text-[var(--kc-sage)]" />
                          จัดการผู้ใช้
                        </Link>
                      </>
                    )}
                    <div className="mx-4 border-t border-[var(--kc-border-input)]" />
                    <button
                      type="button"
                      className="flex w-full items-center gap-2.5 border-0 bg-transparent px-4 py-2.5 text-sm text-[var(--kc-error)] transition-colors hover:bg-red-50 cursor-pointer"
                      onClick={() => {
                        setAvatarOpen(false);
                        onLogout();
                      }}
                    >
                      <LogOut className="size-4" />
                      ออกจากระบบ
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Guest: Login (text) + Sign up (solid pill) ── */
              <>
                <button
                  type="button"
                  className="border-0 bg-transparent px-3 py-2 text-sm font-medium text-[var(--kc-ink)] transition-colors hover:text-[var(--kc-green)] cursor-pointer"
                  onClick={openLogin}
                >
                  เข้าสู่ระบบ
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[var(--kc-green)] bg-[var(--kc-green)] px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--kc-green-dark)] hover:border-[var(--kc-green-dark)] hover:shadow-[var(--kc-shadow-button)]"
                  onClick={openRegister}
                >
                  สมัครสมาชิก
                </button>
              </>
            )}
          </div>

          {/* ── Mobile Hamburger (visible below xl) ──────────────────── */}
          <button
            type="button"
            className="flex size-10 items-center justify-center border-0 bg-transparent rounded-full text-[var(--kc-ink)] transition-colors hover:bg-[var(--kc-green-50)] xl:hidden cursor-pointer"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      {/* ───── Mobile Drawer ──────────────────────────────────────────── */}
      {/* Overlay */}
      <div
        className={`kc-tw fixed inset-0 z-[998] bg-black/40 backdrop-blur-sm transition-opacity duration-300 xl:hidden ${navOpen
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
          }`}
        onClick={closeNav}
      />

      {/* Panel */}
      <aside
        className={`kc-tw fixed inset-y-0 right-0 z-[999] flex w-[300px] max-w-[85vw] flex-col bg-white shadow-[var(--kc-shadow-modal)] transition-transform duration-300 ease-[var(--kc-ease)] xl:hidden ${navOpen ? "translate-x-0" : "translate-x-full"
          }`}
      >
        {/* Drawer header */}
        <div className="flex h-16 items-center justify-between border-b border-[var(--kc-border-input)] px-5">
          <div className="flex items-center gap-2.5">
            <Image
              src="/assets/img/keptcarbon-logo.png"
              alt="KeptCarbon"
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg object-cover"
            />
          </div>
          <button
            type="button"
            className="flex size-9 items-center justify-center border-0 bg-transparent rounded-full text-[var(--kc-sage)] transition-colors hover:bg-[var(--kc-green-50)] hover:text-[var(--kc-ink)] cursor-pointer"
            onClick={closeNav}
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Drawer body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {navLinks.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors ${isActive(href)
                ? "bg-[var(--kc-green-50)] text-[var(--kc-green)]"
                : "text-[var(--kc-ink)] hover:bg-[var(--kc-green-50)]"
                }`}
              onClick={closeNav}
            >
              <Icon className="size-4 shrink-0 opacity-60" />
              {label}
            </Link>
          ))}

          {/* Logged-in extras */}
          {ready && user && (
            <>
              <div className="mb-1 mt-4 px-3 text-[11px] font-semibold tracking-wider text-[var(--kc-sage)] uppercase">
                ข้อมูลผู้ใช้
              </div>
              <Link
                href="/profile"
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors ${pathname === "/profile"
                  ? "bg-[var(--kc-green-50)] text-[var(--kc-green)]"
                  : "text-[var(--kc-ink)] hover:bg-[var(--kc-green-50)]"
                  }`}
                onClick={closeNav}
              >
                <User className="size-4 shrink-0 opacity-60" />
                โปรไฟล์
              </Link>
              <Link
                href="/my-plots"
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors ${pathname === "/my-plots"
                  ? "bg-[var(--kc-green-50)] text-[var(--kc-green)]"
                  : "text-[var(--kc-ink)] hover:bg-[var(--kc-green-50)]"
                  }`}
                onClick={closeNav}
              >
                <MapPinned className="size-4 shrink-0 opacity-60" />
                แปลงของฉัน
              </Link>

              {user.role === "admin" && (
                <>
                  <div className="mb-1 mt-4 px-3 text-[11px] font-semibold tracking-wider text-[var(--kc-sage)] uppercase">
                    สำหรับผู้ดูแลระบบ
                  </div>
                  <Link
                    href="/admin/users"
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors ${pathname === "/admin/users"
                      ? "bg-[var(--kc-green-50)] text-[var(--kc-green)]"
                      : "text-[var(--kc-ink)] hover:bg-[var(--kc-green-50)]"
                      }`}
                    onClick={closeNav}
                  >
                    <Shield className="size-4 shrink-0 opacity-60" />
                    จัดการผู้ใช้
                  </Link>
                </>
              )}
            </>
          )}
        </div>

        {/* Drawer footer: Auth actions */}
        <div className="border-t border-[var(--kc-border-input)] px-5 py-4">
          {ready && user ? (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 border-0 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-[var(--kc-error)] transition-colors hover:bg-red-100 cursor-pointer"
              onClick={onLogout}
            >
              <LogOut className="size-4" />
              ออกจากระบบ
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 border-0 rounded-lg bg-[var(--kc-green)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--kc-green-dark)] cursor-pointer"
                onClick={() => {
                  closeNav();
                  openRegister();
                }}
              >
                <UserPlus className="size-4" />
                สมัครสมาชิก
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--kc-border-input)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--kc-ink)] transition-colors hover:bg-[var(--kc-green-50)] cursor-pointer"
                onClick={() => {
                  closeNav();
                  openLogin();
                }}
              >
                <LogIn className="size-4" />
                เข้าสู่ระบบ
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
