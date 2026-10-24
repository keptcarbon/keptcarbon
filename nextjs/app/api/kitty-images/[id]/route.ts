import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

// Serves a handbook / textbook page image from tbl_kitty_page_image — the
// URLs page bodies store as /api/kitty-images/<id>/. Public, like the
// books. An id's bytes never change (replacing an image adds a new row), so
// browsers may cache it for a year and revalidate with the ETag.

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) return new NextResponse(null, { status: 404 });

  const etag = `"kitty-img-${id}"`;
  const cacheHeaders = { ETag: etag, "Cache-Control": "public, max-age=31536000, immutable" };
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: cacheHeaders });
  }

  try {
    const result = await pool.query<{ mime_type: string; data: Buffer }>(
      "SELECT mime_type, data FROM tbl_kitty_page_image WHERE id = $1",
      [Number(id)]
    );
    const row = result.rows[0];
    if (!row) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(row.data), {
      headers: { ...cacheHeaders, "Content-Type": row.mime_type, "Content-Length": String(row.data.length) },
    });
  } catch (err) {
    console.error("GET /api/kitty-images/[id]", err);
    return new NextResponse(null, { status: 500 });
  }
}
