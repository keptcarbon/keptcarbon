import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";

/**
 * GET /api/rnd/blog-tags?q=… — up to 10 tbl_blog_tag names for the tag
 * chip input's auto-complete. Names containing q (ignoring case); those
 * starting with q first, then the most used, then A–Z. Empty q = the most
 * used tags.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 30);
  // Escape LIKE wildcards so "%" / "_" in q match literally.
  const like = q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
  try {
    const result = await pool.query<{ name: string; uses: number }>(
      `SELECT t.name, COUNT(m.blog_id)::int AS uses
       FROM tbl_blog_tag t
       LEFT JOIN tbl_blog_tag_map m ON m.tag_id = t.id
       WHERE lower(t.name) LIKE '%' || $1 || '%'
       GROUP BY t.id
       ORDER BY (lower(t.name) LIKE $1 || '%') DESC, uses DESC, t.name
       LIMIT 10`,
      [like]
    );
    return NextResponse.json({ tags: result.rows });
  } catch (err) {
    console.error("GET /api/rnd/blog-tags", err);
    return NextResponse.json({ error: "โหลด Tag ไม่สำเร็จ" }, { status: 500 });
  }
}
