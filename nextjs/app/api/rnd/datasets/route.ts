import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { isAdminOrRnd } from "@/lib/auth-server";

/**
 * GET /api/rnd/datasets
 * The "รายการข้อมูล" list on /rnd/data-management: every dataset version in
 * tbl_dataset_version with its status, province, totals across its imported
 * files, and the import history (newest first).
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { rows } = await pool.query(
      `SELECT v.id, v.category, v.p_code, v.version, v.status,
              v.created_at, v.activated_at, v.archived_at,
              g.prov_name_th, g.region,
              au.display_name AS activated_by_name,
              COALESCE(i.imports, '[]'::json) AS imports
       FROM tbl_dataset_version v
       LEFT JOIN geo_thailand g ON g.p_code = v.p_code
       LEFT JOIN tbl_users au ON au.id = v.activated_by
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
                  'id', di.id,
                  'fileName', di.file_name,
                  'rowCount', di.row_count,
                  'detail', di.detail,
                  'importedAt', di.imported_at,
                  'importedBy', NULLIF(u.display_name, '')
                ) ORDER BY di.imported_at DESC) AS imports
         FROM tbl_dataset_import di
         LEFT JOIN tbl_users u ON u.id = di.imported_by
         WHERE di.dataset_version_id = v.id
       ) i ON TRUE
       ORDER BY v.p_code, v.category,
                CASE v.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
                v.created_at DESC`
    );

    return NextResponse.json({
      datasets: rows.map((r) => ({
        id: r.id,
        category: r.category,
        pCode: r.p_code,
        provinceName: r.prov_name_th ?? r.p_code,
        region: r.region ?? null, // geo_thailand region code, e.g. 'E'
        version: r.version,
        status: r.status,
        createdAt: r.created_at,
        activatedAt: r.activated_at,
        activatedBy: r.activated_by_name || null,
        archivedAt: r.archived_at,
        imports: r.imports,
      })),
    });
  } catch (err) {
    console.error("datasets list error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
