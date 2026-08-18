import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// Load root .env so a single file drives both Next.js and Docker Compose
const rootEnv = path.resolve(process.cwd(), "../.env");
if (fs.existsSync(rootEnv)) {
  for (const line of fs.readFileSync(rootEnv, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

const isNoindex = process.env.ENABLE_NOINDEX === "true";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg"],
  images: { unoptimized: true },
  trailingSlash: true,
  // Dev server is reverse-proxied under dev.keptcarbon.net (not localhost),
  // so it must be explicitly allowlisted or Next.js blocks HMR/RSC requests.
  allowedDevOrigins: ["dev.keptcarbon.net"],
  async headers() {
    const securityHeaders = [
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (isNoindex) {
      securityHeaders.push({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    }
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
