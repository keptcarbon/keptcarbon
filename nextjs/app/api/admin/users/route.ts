import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyToken, AUTH_COOKIE } from "@/lib/jwt";

/**
 * Helper to check if the requester is an admin.
 */
async function isAdmin(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return false;

  const payload = verifyToken(token);
  if (!payload) return false;

  const result = await pool.query("SELECT role FROM users WHERE id = $1", [
    payload.userId,
  ]);
  return result.rows[0]?.role === "admin";
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, username, fullname, phone, role, created_at AS "createdAt"
       FROM users
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
    const { id, role, fullname, phone } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE users
       SET role = COALESCE($1, role),
           fullname = COALESCE($2, fullname),
           phone = COALESCE($3, phone)
       WHERE id = $4
       RETURNING id, email, role`,
      [role, fullname, phone, id]
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

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [
      id,
    ]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin delete user error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
