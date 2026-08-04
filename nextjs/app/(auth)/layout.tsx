import Image from "next/image";
import Link from "next/link";

/**
 * Public layout for standalone auth pages (forgot / reset password).
 * Deliberately does NOT use AuthGuard — these pages are reached while logged out.
 *
 * Mirrors ModalShell's card (rounded-2xl, shadow-2xl, border-input) and the
 * login/register modal header (compact 48px logo + bold title) so navigating
 * here from the login modal feels like a continuation, not a different app.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      {/* soft brand backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(50rem 50rem at 50% -10%, rgba(45,158,95,0.10), transparent 60%), linear-gradient(180deg,#f8fdfb 0%,#eef4f0 100%)",
        }}
      />

      <div className="w-full" style={{ maxWidth: 520 }}>
        <div className="relative overflow-hidden rounded-2xl border border-[var(--kc-border-input)] bg-white p-6 shadow-2xl sm:p-[26px]">


          {children}
        </div>
      </div>
    </main>
  );
}
