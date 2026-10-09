"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
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
  Users,
  History,
  Settings,
  Database,
  ChevronDown,
  Leaf,
  TrendingUp,
  GraduationCap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ── Nav data ────────────────────────────────────────────────────────────── */
type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /* Present = the item is a dropdown group; its href is just a key, and each
     child is matched exactly (/dashboard/carbon-stock vs /dashboard/simulation). */
  children?: { label: string; href: string; icon: LucideIcon }[];
};

/* Shown to every visitor — guest, registered, R&D, and admin — outside the
   admin/R&D management area. */
const navLinks: NavItem[] = [
  { label: "หน้าแรก", href: "/", icon: LayoutGrid },
  { label: "เกี่ยวกับโครงการ", href: "/about-project", icon: FileText },
  {
    label: "แดชบอร์ด",
    href: "/dashboard",
    icon: BarChart3,
    children: [
      { label: "ศักยภาพคาร์บอนสะสม", href: "/dashboard/carbon-stock", icon: Leaf },
      { label: "จำลองคาร์บอนกักเก็บ", href: "/dashboard/simulation", icon: TrendingUp },
    ],
  },
  { label: "ประเมินคาร์บอน", href: "/map-draw", icon: Map },
  { label: "KITTY", href: "/kitty", icon: GraduationCap },
];

/* Shown instead of navLinks while browsing the admin area (/admin).
   No "หน้าแรก" here: admin accounts are confined to this area (see
   proxy.ts), so a link to "/" would just bounce straight back. */
const adminNavLinks: NavItem[] = [
  { label: "จัดการบัญชีผู้ใช้", href: "/admin/users", icon: Users },
  { label: "บันทึกการเข้าสู่ระบบ", href: "/admin/auth-logs", icon: History },
];

/* Shown instead of navLinks while browsing the R&D area (/rnd). */
const rndNavLinks: NavItem[] = [
  { label: "หน้าแรก", href: "/", icon: LayoutGrid },
  { label: "จัดการข้อมูล GeoAI", href: "/rnd/data-management", icon: Database },
  { label: "ตั้งค่าพารามิเตอร์", href: "/rnd/configuration", icon: Settings },
];

/* ── Component ───────────────────────────────────────────────────────────── */
export default function Header() {
  const pathname = usePathname();
  const { ready, user, openLogin, openRegister, logout } = useAuth();

  const [scrolled, setScrolled] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  // pictureUrl that failed to load — fall back to the initial avatar.
  // Tracked by URL so a changed picture recovers on its own.
  const [brokenAvatarUrl, setBrokenAvatarUrl] = useState<string | null>(null);

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
  const onLogout = async () => {
    const wasAdmin = user?.role === "admin";
    await logout();
    closeNav();
    // Admin sessions leave the client router cache full of proxy redirects
    // ("/" → /admin/users), so a client-side replace("/") would just land
    // back on the admin guard's spinner. Hard-load to drop that cache.
    if (wasAdmin) {
      window.location.replace("/");
      return;
    }
    // Don't also router.push("/") here: on guarded routes (admin, profile,
    // my-plots) the route's own guard already redirects reactively once
    // `user` clears, and firing a second navigation to the same href at the
    // same time races it — the transitions interrupt each other and leave
    // the guard's loading spinner stuck until the user clicks a link.
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };
  /* Exact match for dropdown children; trailingSlash (next.config) can leave
     a trailing "/" on pathname. */
  const isExactActive = (href: string) => (pathname.replace(/(.)\/$/, "$1") || "/") === href;
  const isItemActive = (item: NavItem) =>
    item.children ? item.children.some((c) => isExactActive(c.href)) : isActive(item.href);

  const isRnd = user?.role === "rd";
  const isAdmin = user?.role === "admin";
  /* จัดการข้อมูล in the account dropdown points at each role's default page.
     /profile is a carve-out: admins may view it and it should still look
     like the admin area for them (they're confined there) — R&D users
     browse the main site normally, so /profile gets the general navbar. */
  const manageDataHref = isRnd ? "/rnd/configuration" : "/admin/users";
  const isAdminArea = pathname.startsWith("/admin") || (pathname.startsWith("/profile") && isAdmin);
  const isRndArea = pathname.startsWith("/rnd");
  const activeNavLinks = isRndArea ? rndNavLinks : isAdminArea ? adminNavLinks : navLinks;

  /* Shared link classes (desktop center nav) */
  const navLinkClass = (active: boolean) =>
    `rounded-lg px-3 py-2 text-base font-medium no-underline transition-colors hover:text-[var(--kc-green)] ${active ? "text-[var(--kc-green)]" : "text-[var(--kc-ink)]"
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
          {/* Admins are confined to the admin area (see proxy.ts), so their
              logo goes to their own home instead of the general "/" — which
              would just bounce them straight back. */}
          <Link
            href={isAdmin ? "/admin/users" : "/"}
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
            {activeNavLinks.map((item) =>
              item.children ? (
                /* Hover/focus dropdown — no state, so it closes on its own
                   once the pointer or focus leaves. */
                <div key={item.href} className="group relative">
                  <button
                    type="button"
                    aria-haspopup="true"
                    className={`flex cursor-pointer items-center gap-1 border-0 bg-transparent ${navLinkClass(isItemActive(item))}`}
                  >
                    {item.label}
                    <ChevronDown className="size-4 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180" />
                  </button>
                  <div className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 -translate-y-1 pt-2 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
                    <div className="w-60 overflow-hidden rounded-xl border border-[var(--kc-border-input)] bg-white py-1 shadow-[var(--kc-shadow-card)]">
                      {item.children.map(({ label, href, icon: Icon }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={(e) => e.currentTarget.blur()}
                          className={`flex items-center gap-2.5 px-4 py-2.5 text-base no-underline transition-colors hover:bg-[var(--kc-green-50)] ${isExactActive(href) ? "font-semibold text-[var(--kc-green)]" : "text-[var(--kc-ink)]"
                            }`}
                        >
                          <Icon className="size-4 text-[var(--kc-sage)]" />
                          {label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Link key={item.href} href={item.href} className={navLinkClass(isActive(item.href))}>
                  {item.label}
                </Link>
              )
            )}
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
                  {user.pictureUrl && brokenAvatarUrl !== user.pictureUrl ? (
                    <img
                      src={user.pictureUrl}
                      alt={user.displayName}
                      referrerPolicy="no-referrer"
                      onError={() => setBrokenAvatarUrl(user.pictureUrl ?? null)}
                      className="size-9 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex size-9 items-center justify-center rounded-full bg-[var(--kc-green)] text-sm font-bold text-white">
                      {(user.displayName?.[0] || user.email?.[0] || "?").toUpperCase()}
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
                      <p className="m-0 text-base font-semibold text-[var(--kc-ink)]">
                        {user.displayName}
                      </p>
                      <p className="m-0 mt-0.5 truncate text-[13px] text-[var(--kc-sage)]">
                        {user.email}
                      </p>
                    </div>
                    {!isAdmin && (
                      <Link
                        href="/my-plots"
                        className="flex items-center gap-2.5 px-4 py-2.5 text-base text-[var(--kc-ink)] no-underline transition-colors hover:bg-[var(--kc-green-50)]"
                        onClick={() => setAvatarOpen(false)}
                      >
                        <MapPinned className="size-4 text-[var(--kc-sage)]" />
                        แปลงของฉัน
                      </Link>
                    )}
                    {(isAdmin || isRnd) && (
                      <Link
                        href={manageDataHref}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-base text-[var(--kc-ink)] no-underline transition-colors hover:bg-[var(--kc-green-50)]"
                        onClick={() => setAvatarOpen(false)}
                      >
                        <Shield className="size-4 text-[var(--kc-sage)]" />
                        จัดการข้อมูล
                      </Link>
                    )}
                    <Link
                      href="/profile"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-base text-[var(--kc-ink)] no-underline transition-colors hover:bg-[var(--kc-green-50)]"
                      onClick={() => setAvatarOpen(false)}
                    >
                      <User className="size-4 text-[var(--kc-sage)]" />
                      โปรไฟล์
                    </Link>
                    <div className="mx-4 border-t border-[var(--kc-border-input)]" />
                    <button
                      type="button"
                      className="flex w-full items-center gap-2.5 border-0 bg-transparent px-4 py-2.5 text-base text-[var(--kc-error)] transition-colors hover:bg-red-50 cursor-pointer"
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
                  className="border-0 bg-transparent px-3 py-2 text-base font-medium text-[var(--kc-ink)] transition-colors hover:text-[var(--kc-green)] cursor-pointer"
                  onClick={openLogin}
                >
                  เข้าสู่ระบบ
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[var(--kc-green)] bg-[var(--kc-green)] px-5 py-2 text-base font-semibold text-white transition-all hover:bg-[var(--kc-green-dark)] hover:border-[var(--kc-green-dark)] hover:shadow-[var(--kc-shadow-button)]"
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
          {activeNavLinks.map(({ label, href, icon: Icon, children }) =>
            children ? (
              <div key={href}>
                <div className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-[var(--kc-ink)]">
                  <Icon className="size-4 shrink-0 opacity-60" />
                  {label}
                </div>
                {children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={`ml-7 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors ${isExactActive(child.href)
                      ? "bg-[var(--kc-green-50)] text-[var(--kc-green)]"
                      : "text-[var(--kc-ink)] hover:bg-[var(--kc-green-50)]"
                      }`}
                    onClick={closeNav}
                  >
                    <child.icon className="size-4 shrink-0 opacity-60" />
                    {child.label}
                  </Link>
                ))}
              </div>
            ) : (
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
            )
          )}

          {/* Logged-in extras */}
          {ready && user && (
            <>
              <div className="mb-1 mt-4 px-3 text-[11px] font-semibold tracking-wider text-[var(--kc-sage)] uppercase">
                ข้อมูลผู้ใช้
              </div>
              {!isAdmin && (
                <Link
                  href="/my-plots"
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors ${isActive("/my-plots")
                    ? "bg-[var(--kc-green-50)] text-[var(--kc-green)]"
                    : "text-[var(--kc-ink)] hover:bg-[var(--kc-green-50)]"
                    }`}
                  onClick={closeNav}
                >
                  <MapPinned className="size-4 shrink-0 opacity-60" />
                  แปลงของฉัน
                </Link>
              )}
              {(isAdmin || isRnd) && (
                <Link
                  href={manageDataHref}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors ${pathname.startsWith(isRnd ? "/rnd" : "/admin")
                    ? "bg-[var(--kc-green-50)] text-[var(--kc-green)]"
                    : "text-[var(--kc-ink)] hover:bg-[var(--kc-green-50)]"
                    }`}
                  onClick={closeNav}
                >
                  <Shield className="size-4 shrink-0 opacity-60" />
                  จัดการข้อมูล
                </Link>
              )}
              <Link
                href="/profile"
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors ${isActive("/profile")
                  ? "bg-[var(--kc-green-50)] text-[var(--kc-green)]"
                  : "text-[var(--kc-ink)] hover:bg-[var(--kc-green-50)]"
                  }`}
                onClick={closeNav}
              >
                <User className="size-4 shrink-0 opacity-60" />
                โปรไฟล์
              </Link>
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
