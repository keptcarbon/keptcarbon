import { NextRequest, NextResponse } from "next/server";
import { isAdminOrRnd } from "@/lib/auth-server";
import { withTransaction } from "@/lib/dataset-version";

class DeleteError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * DELETE /api/rnd/datasets/[id]
 * Discards a DRAFT version: its rows in the data table plus its log entry
 * (tbl_dataset_import rows cascade). Active and archived versions can never
 * be deleted — archived ones are history and may still be referenced by
 * saved assessments.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminOrRnd(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const deletedRows = await withTransaction(async (client) => {
      const found = await client.query(
        `SELECT category, p_code, version, status FROM tbl_dataset_version WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (found.rows.length === 0) throw new DeleteError("ไม่พบชุดข้อมูล", 404);
      const { category, p_code: pCode, version, status } = found.rows[0];
      if (status !== "draft") {
        throw new DeleteError("ลบได้เฉพาะชุดข้อมูลฉบับร่างเท่านั้น", 409);
      }

      let result;
      if (category === "planting_year_map") {
        result = await client.query(`DELETE FROM tbl_planting_year WHERE p_code = $1 AND year = $2`, [pCode, Number(version)]);
      } else if (category === "lulc_map") {
        result = await client.query(`DELETE FROM tbl_landuse WHERE p_code = $1 AND lu_year = $2`, [pCode, Number(version)]);
      } else if (category === "biomass_profile") {
        result = await client.query(`DELETE FROM tbl_biomass_profile WHERE p_code = $1 AND version = $2`, [pCode, version]);
      } else {
        const [luYear, plainingYear] = String(version).split("/").map(Number);
        result = await client.query(
          `DELETE FROM tbl_planting_year_dist WHERE p_code = $1 AND lu_year = $2 AND plaining_year = $3`,
          [pCode, luYear, plainingYear]
        );
      }

      await client.query(`DELETE FROM tbl_dataset_version WHERE id = $1`, [id]);
      return result.rowCount;
    });

    return NextResponse.json({ deletedRows });
  } catch (err) {
    if (err instanceof DeleteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("dataset delete error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
