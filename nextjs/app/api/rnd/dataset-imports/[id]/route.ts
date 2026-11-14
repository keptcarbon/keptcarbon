import { NextRequest, NextResponse } from "next/server";
import { isAdminOrRnd } from "@/lib/auth-server";
import { withTransaction } from "@/lib/dataset-version";

class DeleteError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * DELETE /api/rnd/dataset-imports/[id]
 * Discards one imported file (tbl_dataset_import row) of a DRAFT version,
 * together with the data it brought in:
 *   - biomass_profile: only that file's clone / growth model / allometry
 *     rows -- the version's other files stay.
 *   - other categories: a version is a single file, so all of its rows.
 * When the version has no files left, its tbl_dataset_version row goes too.
 * Files of active or archived versions can't be deleted.
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
        `SELECT i.detail, v.id AS version_id, v.category, v.p_code, v.version, v.status
         FROM tbl_dataset_import i
         JOIN tbl_dataset_version v ON v.id = i.dataset_version_id
         WHERE i.id = $1
         FOR UPDATE OF v`,
        [id]
      );
      if (found.rows.length === 0) throw new DeleteError("ไม่พบไฟล์ที่นำเข้า", 404);
      const { detail, version_id: versionId, category, p_code: pCode, version, status } = found.rows[0];
      if (status !== "draft") {
        throw new DeleteError("ลบได้เฉพาะไฟล์ของชุดข้อมูลฉบับร่างเท่านั้น", 409);
      }

      let result;
      if (category === "biomass_profile" && detail?.clone && detail?.growthModel && detail?.allometry) {
        result = await client.query(
          `DELETE FROM tbl_biomass_profile
           WHERE p_code = $1 AND version = $2 AND clone = $3 AND growth_model = $4 AND allometry = $5`,
          [pCode, version, detail.clone, detail.growthModel, detail.allometry]
        );
      } else if (category === "biomass_profile") {
        // A file without a recorded combination can't be told apart from its
        // siblings -- drop the whole draft version's profile rows.
        result = await client.query(`DELETE FROM tbl_biomass_profile WHERE p_code = $1 AND version = $2`, [pCode, version]);
        await client.query(`DELETE FROM tbl_dataset_import WHERE dataset_version_id = $1`, [versionId]);
      } else if (category === "planting_year_map") {
        result = await client.query(`DELETE FROM tbl_planting_year WHERE p_code = $1 AND year = $2`, [pCode, Number(version)]);
      } else if (category === "lulc_map") {
        result = await client.query(`DELETE FROM tbl_landuse WHERE p_code = $1 AND lu_year = $2`, [pCode, Number(version)]);
      } else {
        const [luYear, plainingYear] = String(version).split("/").map(Number);
        result = await client.query(
          `DELETE FROM tbl_planting_year_dist WHERE p_code = $1 AND lu_year = $2 AND plaining_year = $3`,
          [pCode, luYear, plainingYear]
        );
      }

      await client.query(`DELETE FROM tbl_dataset_import WHERE id = $1`, [id]);
      await client.query(
        `DELETE FROM tbl_dataset_version v
         WHERE v.id = $1 AND NOT EXISTS (SELECT 1 FROM tbl_dataset_import i WHERE i.dataset_version_id = v.id)`,
        [versionId]
      );
      return result.rowCount;
    });

    return NextResponse.json({ deletedRows });
  } catch (err) {
    if (err instanceof DeleteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("dataset import delete error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
