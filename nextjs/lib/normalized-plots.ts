/**
 * Primary write path for the normalized schema (tbl_projects/tbl_plots/
 * tbl_plot_landuse_overlaps/tbl_plot_assessments/tbl_plot_carbon_yearly, see
 * postgis/migrations/009 + 010). carbon_projects has been retired (see
 * postgis/migrations/012_retire_carbon_projects.sql) -- these tables are now
 * the sole source of truth for both reads and writes, so every function here
 * throws on failure and must run inside the caller's transaction.
 */

export interface ProjectHeader {
  id: number;
  userUuid: string | null;
  guestUuid: string | null; // == tbl_projects.guest_uuid
  projectName: string;
  status: string; // 'active' | 'deleted'
  deletedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface RawShadowPayload {
  // Raw request-body fields, possibly undefined (not sent this save) --
  // callers must pass these through as-is, never the already-defaulted
  // (?? {} / ?? []) locals some route handlers build for their own use.
  plantationInfo?: unknown;
  polygonsPayload?: unknown;
  backendResponses?: unknown;
  frontendPlots?: unknown;
}

type AnyRecord = Record<string, any>;

/**
 * plantation_info arrives in two incompatible shapes depending on which
 * save path produced it: an ARRAY (ParcelResultsPanel's main save flow,
 * positionally aligned with polygonsPayload within that same save) or an
 * OBJECT keyed directly by the stable plot id (my-plots/page.tsx's inline
 * re-estimate / edit-modal saves). Normalize both into one id-keyed map.
 */
function normalizePlantationInfo(
  raw: unknown,
  polygonsPayload: AnyRecord[] | undefined
): Map<string, AnyRecord> {
  const map = new Map<string, AnyRecord>();

  if (Array.isArray(raw)) {
    if (polygonsPayload && polygonsPayload.length === raw.length) {
      polygonsPayload.forEach((p, i) => {
        if (p?.id) map.set(p.id, raw[i]);
      });
    } else if (raw.length > 0) {
      console.warn(
        "[normalized-plots] plantationInfo is an array but its length doesn't match polygonsPayload -- skipping (can't safely positionally correlate)"
      );
    }
  } else if (raw !== null && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as AnyRecord)) {
      map.set(key, value);
    }
  }

  return map;
}

function toArray(raw: unknown): AnyRecord[] | undefined {
  return Array.isArray(raw) ? (raw as AnyRecord[]) : undefined;
}

const UPSERT_PROJECT_SQL = `
  INSERT INTO tbl_projects (id, user_uuid, guest_uuid, project_name, status, deleted_at, created_at, updated_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  ON CONFLICT (id) DO UPDATE SET
    user_uuid    = EXCLUDED.user_uuid,
    guest_uuid   = EXCLUDED.guest_uuid,
    project_name = EXCLUDED.project_name,
    status       = EXCLUDED.status,
    deleted_at   = EXCLUDED.deleted_at,
    updated_at   = EXCLUDED.updated_at
`;

const UPSERT_PLOT_SQL = `
  INSERT INTO tbl_plots (
    project_id, polygon_id, geometry, area_m2, province_code,
    status, status_code, message,
    year_of_planting, rubber_clone, tree_count, spacing_system, project_type,
    selected_lu_classes, owner_name, deleted_at
  )
  VALUES (
    $1, $2,
    CASE WHEN $3::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($3::text), 4326) END,
    $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
    COALESCE($14::text[], '{}'), $15, NULL
  )
  ON CONFLICT (project_id, polygon_id) DO UPDATE SET
    geometry            = COALESCE(EXCLUDED.geometry, tbl_plots.geometry),
    area_m2              = COALESCE(EXCLUDED.area_m2, tbl_plots.area_m2),
    province_code        = COALESCE(EXCLUDED.province_code, tbl_plots.province_code),
    status                = COALESCE(EXCLUDED.status, tbl_plots.status),
    status_code           = COALESCE(EXCLUDED.status_code, tbl_plots.status_code),
    message               = COALESCE(EXCLUDED.message, tbl_plots.message),
    year_of_planting      = COALESCE(EXCLUDED.year_of_planting, tbl_plots.year_of_planting),
    rubber_clone          = COALESCE(EXCLUDED.rubber_clone, tbl_plots.rubber_clone),
    tree_count            = COALESCE(EXCLUDED.tree_count, tbl_plots.tree_count),
    spacing_system        = COALESCE(EXCLUDED.spacing_system, tbl_plots.spacing_system),
    project_type          = COALESCE(EXCLUDED.project_type, tbl_plots.project_type),
    selected_lu_classes   = COALESCE($14::text[], tbl_plots.selected_lu_classes),
    owner_name            = COALESCE(EXCLUDED.owner_name, tbl_plots.owner_name),
    deleted_at            = NULL
`;

async function upsertPlots(
  client: any,
  projectId: number,
  frontendPlots: AnyRecord[],
  polygonsPayload: AnyRecord[] | undefined,
  plantationInfoMap: Map<string, AnyRecord>
): Promise<Set<string>> {
  const polygonsById = new Map<string, AnyRecord>();
  (polygonsPayload ?? []).forEach((p) => {
    if (p?.id) polygonsById.set(p.id, p);
  });

  const activeIds = new Set<string>();

  for (const fp of frontendPlots) {
    const polygonId = fp?.id;
    if (!polygonId) {
      console.warn("[normalized-plots] frontendPlots entry missing id for project", projectId);
      continue;
    }
    activeIds.add(polygonId);

    const payload = polygonsById.get(polygonId);
    const pinfo = plantationInfoMap.get(polygonId);

    const geometryObj = pinfo?.geometry ?? payload?.geometry ?? fp?.geojson ?? null;
    const selectedLuClasses = Array.isArray(payload?.selected_lu_classes)
      ? payload.selected_lu_classes
      : null;

    await client.query(UPSERT_PLOT_SQL, [
      projectId,
      polygonId,
      geometryObj ? JSON.stringify(geometryObj) : null,
      pinfo?.area_m2 ?? null,
      pinfo?.province_code ?? fp?.province ?? null,
      pinfo?.status?.status ?? null,
      pinfo?.status?.status_code ?? null,
      pinfo?.status?.message ?? null,
      payload?.year_of_planting ?? null,
      payload?.rubber_clone ?? null,
      payload?.tree_count ?? null,
      payload?.spacing_system ?? null,
      payload?.project_type ?? null,
      selectedLuClasses,
      fp?.ownerName || null,
    ]);
  }

  return activeIds;
}

async function reconcileRemovedPlots(client: any, projectId: number, activeIds: Set<string>): Promise<void> {
  await client.query(
    `UPDATE tbl_plots
     SET deleted_at = NOW()
     WHERE project_id = $1
       AND deleted_at IS NULL
       AND polygon_id <> ALL($2::text[])`,
    [projectId, Array.from(activeIds)]
  );
}

async function recomputeLandUseOverlaps(
  client: any,
  projectId: number,
  frontendPlots: AnyRecord[],
  plantationInfoMap: Map<string, AnyRecord>
): Promise<void> {
  for (const fp of frontendPlots) {
    const polygonId = fp?.id;
    if (!polygonId) continue;

    const entry = plantationInfoMap.get(polygonId);
    if (!entry || !Array.isArray(entry.lu_polygon)) continue;

    const plotRes = await client.query(
      `SELECT id FROM tbl_plots WHERE project_id = $1 AND polygon_id = $2`,
      [projectId, polygonId]
    );
    const plotId = plotRes.rows[0]?.id;
    if (!plotId) continue;

    await client.query(`DELETE FROM tbl_plot_landuse_overlaps WHERE plot_id = $1`, [plotId]);

    for (const lu of entry.lu_polygon) {
      if (!lu?.geometry) continue;
      await client.query(
        `INSERT INTO tbl_plot_landuse_overlaps (plot_id, lu_class, lu_class_desc_th, geometry, area_m2, area_percent)
         VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4::text), 4326), $5, $6)`,
        [
          plotId,
          lu.lu_class ?? null,
          lu.lu_class_desc_th ?? null,
          JSON.stringify(lu.geometry),
          lu.area_m2 ?? null,
          lu.area_percent ?? null,
        ]
      );
    }
  }
}

async function appendAssessments(client: any, projectId: number, backendResponses: AnyRecord[]): Promise<void> {
  for (const br of backendResponses) {
    const polygonId = br?.polygon_id;
    if (!polygonId) continue;

    const plotRes = await client.query(
      `SELECT id FROM tbl_plots WHERE project_id = $1 AND polygon_id = $2`,
      [projectId, polygonId]
    );
    const plotId = plotRes.rows[0]?.id;
    if (!plotId) continue;

    await client.query(`UPDATE tbl_plot_assessments SET is_current = FALSE WHERE plot_id = $1 AND is_current`, [plotId]);

    const assessRes = await client.query(
      `INSERT INTO tbl_plot_assessments (plot_id, status, status_code, message, message_th, ci, assess_parameters, model_version, is_current)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,TRUE) RETURNING id`,
      [
        plotId,
        br?.status?.status ?? null,
        br?.status?.status_code ?? null,
        br?.status?.message ?? null,
        br?.status?.message_th ?? null,
        br?.ci ?? null,
        JSON.stringify(br?.assess_parameters ?? {}),
      ]
    );
    const assessmentId = assessRes.rows[0].id;

    for (const yr of br?.carbon_profile ?? []) {
      await client.query(
        `INSERT INTO tbl_plot_carbon_yearly (
           assessment_id, year, year_at, age,
           stock_value, stock_ci, stock_ci_lower, stock_ci_upper,
           gain_value, gain_ci, gain_ci_lower, gain_ci_upper
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (assessment_id, year) DO NOTHING`,
        [
          assessmentId,
          yr?.year ?? null,
          yr?.year_at ?? null,
          yr?.age ?? null,
          yr?.stocks?.value ?? null,
          yr?.stocks?.ci ?? null,
          yr?.stocks?.ci_lower ?? null,
          yr?.stocks?.ci_upper ?? null,
          yr?.gain?.value ?? null,
          yr?.gain?.ci ?? null,
          yr?.gain?.ci_lower ?? null,
          yr?.gain?.ci_upper ?? null,
        ]
      );
    }
  }
}

/**
 * Upserts a project header + its plots/overlaps/assessments/yearly rows.
 * Must run inside the caller's own transaction (client already BEGIN'd) --
 * this function never opens or commits a transaction itself, so a failure
 * here rolls back alongside whatever else the caller is doing.
 */
export async function upsertProjectAndPlots(client: any, header: ProjectHeader, raw: RawShadowPayload): Promise<void> {
  await upsertProjectHeader(client, header);

  const frontendPlots = toArray(raw.frontendPlots);
  if (!frontendPlots) return; // nothing to anchor plot-processing on

  const polygonsPayload = toArray(raw.polygonsPayload);
  const backendResponses = toArray(raw.backendResponses);
  const plantationInfoMap = normalizePlantationInfo(raw.plantationInfo, polygonsPayload);

  const activeIds = await upsertPlots(client, header.id, frontendPlots, polygonsPayload, plantationInfoMap);
  await reconcileRemovedPlots(client, header.id, activeIds);

  if (plantationInfoMap.size > 0) {
    await recomputeLandUseOverlaps(client, header.id, frontendPlots, plantationInfoMap);
  }

  if (backendResponses) {
    await appendAssessments(client, header.id, backendResponses);
  }
}

async function upsertProjectHeader(client: any, header: ProjectHeader): Promise<void> {
  await client.query(UPSERT_PROJECT_SQL, [
    header.id,
    header.userUuid,
    header.guestUuid,
    header.projectName,
    header.status,
    header.deletedAt,
    header.createdAt,
    header.updatedAt,
  ]);
}

/**
 * Thrown by transferProjectToUser when the user already has a *different*
 * active project with the same name (the partial unique index
 * uq_projects_user_project_active would be violated). The caller decides how to
 * resolve it -- typically by folding the guest copy into the existing project
 * via the clone-based /api/plots/claim path instead.
 */
export class ProjectNameConflictError extends Error {
  constructor(public existingProjectId: number) {
    super("A project with this name already exists for this user");
    this.name = "ProjectNameConflictError";
  }
}

/**
 * Flip a guest-owned project to user ownership *in place* -- no clone, same row
 * id. Used when a logged-in user saves (a real Save, not a Process draft) a
 * project that was written under a guest_key earlier this session: clicking
 * "ประมวลผล" always persists a guest_key draft, and "บันทึกข้อมูล" then needs
 * that exact row to become theirs so dbProjectId stays valid and the
 * plots/assessment history don't have to be copied.
 *
 * Must run inside the caller's own transaction. Throws ProjectNameConflictError
 * if the user already has another active project with the same name.
 */
export async function transferProjectToUser(
  client: any,
  opts: { projectId: number; userUuid: string }
): Promise<void> {
  const { projectId, userUuid } = opts;

  const nameRes = await client.query(
    `SELECT project_name FROM tbl_projects WHERE id = $1`,
    [projectId]
  );
  const projectName: string | undefined = nameRes.rows[0]?.project_name;

  const clash = await client.query(
    `SELECT id FROM tbl_projects
     WHERE user_uuid = $1 AND project_name = $2 AND status = 'active' AND id <> $3`,
    [userUuid, projectName, projectId]
  );
  if ((clash.rowCount ?? 0) > 0) {
    throw new ProjectNameConflictError(clash.rows[0].id);
  }

  await client.query(
    `UPDATE tbl_projects
     SET user_uuid = $1, guest_uuid = NULL, updated_at = NOW()
     WHERE id = $2 AND user_uuid IS NULL`,
    [userUuid, projectId]
  );
}

/**
 * Claim every active project owned by `guestKey` for `userUuid`, in place --
 * flips guest_uuid -> user_uuid on the same rows (no clone, no soft-delete),
 * so plots / land-use overlaps / assessment history / yearly carbon rows all
 * come along for free. Used by POST /api/plots/claim on login.
 *
 * A guest may have started several areas in one session (each "start a new
 * area" writes another guest_uuid row), so this handles N rows. On the rare
 * name collision with the user's own uq_projects_user_project_active index
 * (guest project names are the unguessable generateGuestProjectName() so this
 * is near-impossible), a " (2)", " (3)"… suffix is appended.
 *
 * Must run inside the caller's own transaction. Returns the claimed rows with
 * their final (possibly suffixed) names.
 */
export async function transferGuestProjectsToUser(
  client: any,
  opts: { guestKey: string; userUuid: string }
): Promise<{ id: number; project_name: string }[]> {
  const { guestKey, userUuid } = opts;

  const guestRows = await client.query(
    `SELECT id, project_name FROM tbl_projects
     WHERE guest_uuid = $1 AND status = 'active'
     ORDER BY id`,
    [guestKey]
  );

  const claimed: { id: number; project_name: string }[] = [];

  for (const row of guestRows.rows) {
    let name: string = row.project_name;

    // Resolve a collision with one of the user's own active projects.
    for (let attempt = 2; attempt < 100; attempt++) {
      const clash = await client.query(
        `SELECT 1 FROM tbl_projects
         WHERE user_uuid = $1 AND project_name = $2 AND status = 'active'`,
        [userUuid, name]
      );
      if ((clash.rowCount ?? 0) === 0) break;
      name = `${row.project_name} (${attempt})`;
    }

    await client.query(
      `UPDATE tbl_projects
       SET user_uuid = $1, guest_uuid = NULL, project_name = $2, updated_at = NOW()
       WHERE id = $3 AND user_uuid IS NULL`,
      [userUuid, name, row.id]
    );
    claimed.push({ id: row.id, project_name: name });
  }

  return claimed;
}

/** Must run inside the caller's own transaction -- see upsertProjectAndPlots. */
export async function softDeleteProjectById(client: any, id: number): Promise<void> {
  await client.query(
    `UPDATE tbl_projects SET status = 'deleted', deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

/** Must run inside the caller's own transaction -- see upsertProjectAndPlots. */
export async function softDeleteProjectsByOwner(client: any, owner: {
  userUuid: string | null;
  guestUuid: string | null;
}): Promise<void> {
  await client.query(
    `UPDATE tbl_projects SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
     WHERE status = 'active' AND (
       ($1::uuid IS NOT NULL AND user_uuid = $1) OR
       ($2::text IS NOT NULL AND guest_uuid = $2)
     )`,
    [owner.userUuid, owner.guestUuid]
  );
}
