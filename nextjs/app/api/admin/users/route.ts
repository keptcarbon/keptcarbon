import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdmin } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, username, first_name AS "firstName", last_name AS "lastName",
              display_name AS "displayName", phone, role, created_at AS "createdAt"
       FROM tbl_users
       ORDER BY created_at DESC`
    );
    return NextResponse.json({ users: result.rows });
  } catch (err) {
    console.error("Admin list users error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id, role, firstName, lastName, phone } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // display_name is derived from first + last when either is provided.
    const result = await pool.query(
      `UPDATE tbl_users
       SET role = COALESCE($1, role),
           first_name = COALESCE($2, first_name),
           last_name = COALESCE($3, last_name),
           display_name = CASE
             WHEN $2::text IS NULL AND $3::text IS NULL THEN display_name
             ELSE btrim(COALESCE($2, first_name) || ' ' || COALESCE($3, last_name))
           END,
           phone = COALESCE($4, phone)
       WHERE id = $5
       RETURNING id, email, role`,
      [role, firstName ?? null, lastName ?? null, phone, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user: result.rows[0] });
  } catch (err) {
    console.error("Admin update user error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = await pool.connect();
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    await client.query("BEGIN");

    // Hard delete: remove the user's projects first (they FK to tbl_users.uuid,
    // so they must go before the user row), then the user. Both are permanent.
    const projects = await client.query(
      `DELETE FROM carbon_projects
       WHERE user_uuid = (SELECT uuid FROM tbl_users WHERE id = $1)
       RETURNING id`,
      [id]
    );

    const result = await client.query(
      "DELETE FROM tbl_users WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, deletedProjects: projects.rowCount ?? 0 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Admin delete user error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  } finally {
    client.release();
  }
}
