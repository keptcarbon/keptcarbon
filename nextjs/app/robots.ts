import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const isNoindex = process.env.ENABLE_NOINDEX === "true";

  return {
    rules: {
      userAgent: "*",
      disallow: isNoindex ? "/" : undefined,
      allow: isNoindex ? undefined : "/",
    },
  };
}
