import Link from "next/link";
import Image from "next/image";
import { Mail, MapPin } from "lucide-react";

type IconProps = { className?: string };

function FacebookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z" />
    </svg>
  );
}

function XIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.9 1.5h3.68l-8.04 9.19L24 22.5h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.5h7.6l5.24 6.93L18.9 1.5Zm-1.29 18.8h2.04L6.48 3.6H4.29l13.32 16.7Z" />
    </svg>
  );
}

function LineIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M24 10.3C24 4.9 18.6.5 12 .5S0 4.9 0 10.3c0 4.8 4.3 8.9 10 9.7.4.1.9.3 1.1.6.1.3.1.7.1 1l-.2 1.1c0 .3-.3 1.3 1.1.7 1.4-.6 7.5-4.4 10.2-7.6 1.9-2 2.6-4.1 2.6-5.5ZM7.7 13.2H5.3c-.3 0-.6-.3-.6-.6V8.2c0-.3.3-.6.6-.6s.6.3.6.6v3.8h1.8c.3 0 .6.3.6.6s-.3.6-.6.6Zm2.3-.6c0 .3-.3.6-.6.6s-.6-.3-.6-.6V8.2c0-.3.3-.6.6-.6s.6.3.6.6v4.4Zm5.4 0c0 .3-.2.5-.4.6h-.2c-.2 0-.4-.1-.5-.2l-2.3-3.1v2.7c0 .3-.3.6-.6.6s-.6-.3-.6-.6V8.2c0-.3.2-.5.4-.6h.2c.2 0 .4.1.5.2l2.3 3.1V8.2c0-.3.3-.6.6-.6s.6.3.6.6v4.4Zm3.6-2.8c.3 0 .6.3.6.6s-.3.6-.6.6h-1.8v1.2h1.8c.3 0 .6.3.6.6s-.3.6-.6.6h-2.4c-.3 0-.6-.3-.6-.6V8.2c0-.3.3-.6.6-.6h2.4c.3 0 .6.3.6.6s-.3.6-.6.6h-1.8v1.2h1.8Z" />
    </svg>
  );
}

const navLinks = [
  { label: "หน้าแรก", href: "/" },
  { label: "เกี่ยวกับโครงการ", href: "/about-project" },
  { label: "ประเมินคาร์บอน", href: "/map-draw" },
  { label: "แดชบอร์ด", href: "/dashboard" },
] as const;

const socialLinks = [
  { label: "Facebook", href: "#", icon: FacebookIcon },
  { label: "X", href: "#", icon: XIcon },
  { label: "LINE", href: "#", icon: LineIcon },
] as const;

const year = new Date().getFullYear();

export default function Footer() {
  return (
    <footer id="footer" className="border-t border-border bg-white">
      <div className="mx-auto max-w-8xl px-6 py-8 md:py-12">
        {/* Main grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 md:gap-8">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5 no-underline">
              <Image
                src="/assets/img/keptcarbon-logo.png"
                alt="KeptCarbon"
                width={40}
                height={40}
                className="h-9 w-auto"
              />
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
              แพลตฟอร์มภูมิสารสนเทศและปัญญาประดิษฐ์
              เพื่อการจัดการสวนยางพาราอย่างยืดหยุ่นต่อการเปลี่ยนแปลงสภาพภูมิอากาศ
            </p>

            {/* Social */}
            <div className="mt-6 flex items-center gap-2">
              {socialLinks.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex size-9 items-center justify-center rounded-lg border border-border text-slate-500 transition-colors hover:border-emerald-600/40 hover:text-emerald-600"
                >
                  <Icon className="size-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <nav aria-label="Footer">
            <h3 className="m-0 text-sm font-semibold tracking-wider text-slate-900 uppercase">
              เมนู
            </h3>
            <ul className="mt-4 flex list-none flex-col gap-3 p-0">
              {navLinks.map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-slate-500 no-underline transition-colors hover:text-emerald-600"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div>
            <h3 className="m-0 text-sm font-semibold tracking-wider text-slate-900 uppercase">
              ติดต่อ
            </h3>
            <ul className="mt-4 flex list-none flex-col gap-3 p-0">
              <li>
                <a
                  href="mailto:keptcarbon@gmail.com"
                  className="flex items-center gap-2.5 text-sm text-slate-500 no-underline transition-colors hover:text-emerald-600"
                >
                  <Mail className="size-4 shrink-0" aria-hidden="true" />
                  keptcarbon@gmail.com
                </a>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-slate-500">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  คณะสังคมศาสตร์ มหาวิทยาลัยเชียงใหม่
                  <br />
                  อ.เมือง จ.เชียงใหม่ 50200
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-sm text-slate-500">
            © {year} KeptCarbon. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm">
            <Link
              href="/about-project"
              className="text-slate-500 no-underline transition-colors hover:text-emerald-600"
            >
              เกี่ยวกับโครงการ
            </Link>
            <span className="text-slate-500">
              Designed by{" "}
              <a
                href="https://engrids.soc.cmu.ac.th/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-slate-500 no-underline transition-colors hover:text-emerald-600"
              >
                EnGRIDs
              </a>{" "}
              and{" "}
              <a
                href="https://turnpro.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-slate-500 no-underline transition-colors hover:text-emerald-600"
              >
                turnPROx
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
