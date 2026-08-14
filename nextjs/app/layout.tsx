import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { AuthModals, Header, CondolenceLightbox } from "@/app/components/organisms";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  weight: ["300", "400", "500", "600", "700", "800"],
  subsets: ["thai", "latin"],
  display: "swap",
  variable: "--font-noto-sans-thai",
});

export const metadata: Metadata = {
  title: "KeptCarbon",
  description: "แพลตฟอร์มจัดการและประเมินคาร์บอนเครดิตสำหรับสวนยางพารา",
  keywords: ["สวนยางพารา", "คาร์บอนเครดิต", "ยางพารา", "KeptCarbon"],
  icons: {
    icon: [
      { url: "/assets/img/keptcarbon-logo.png", type: "image/png" },
    ],
    apple: [
      { url: "/assets/img/keptcarbon-logo.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/assets/img/keptcarbon-logo.png",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={notoSansThai.variable} data-scroll-behavior="smooth">
      <head>
        {/* Noto Sans Thai is self-hosted via next/font/google (see notoSansThai
            above) with the thai+latin subsets and all weights already used
            across the app — no external Google Fonts request needed. */}
        <link rel="stylesheet" href="/assets/vendor/bootstrap/css/bootstrap.min.css" />
        <link rel="stylesheet" href="/assets/vendor/bootstrap-icons/bootstrap-icons.css" />
        <link rel="stylesheet" href="/assets/vendor/aos/aos.css" />
        <link rel="stylesheet" href="/assets/css/main.css" />
        <link rel="stylesheet" href="/assets/css/keptcarbon.css" />
        <link rel="stylesheet" href="/assets/css/index-page.css" />
        <link rel="stylesheet" href="/assets/css/kc-design.css" />
        <link rel="stylesheet" href="/assets/css/dashboard.css?v=12" />
        <link rel="stylesheet" href="/assets/css/map-draw.css?v=4" />
        <link rel="stylesheet" href="/assets/css/map-draw-redesign.css?v=10" />
        <link rel="stylesheet" href="/assets/css/map-split.css?v=38" />
        <link rel="stylesheet" href="/assets/css/modal-auth.css?v=3" />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          <Header />
          {children}
          <AuthModals />
          <CondolenceLightbox />
        </AuthProvider>
      </body>
    </html>
  );
}
