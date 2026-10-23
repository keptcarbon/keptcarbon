import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

// Serves Keppy Blog images uploaded after the build — reached through the
// /assets/img/blog/:name rewrite in next.config.ts. Public, like the rest
// of /assets.
const IMAGE_DIR = path.join(process.cwd(), "public", "assets", "img", "blog");

// Only the names POST /api/rnd/blog writes: <slug>-cover.<ext> and
// <slug>-blog-img-NN.<ext>. Anything else (incl. "../") is a 404.
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*-(?:cover|blog-img-\d{2})\.(jpg|png|webp)$/;
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const match = NAME_PATTERN.exec(name);
  if (!match) return new NextResponse(null, { status: 404 });
  try {
    const bytes = await readFile(path.join(IMAGE_DIR, name));
    return new NextResponse(bytes, {
      headers: { "Content-Type": TYPES[match[1]], "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
