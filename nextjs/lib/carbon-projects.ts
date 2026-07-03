import { pool } from "@/lib/db";
import type { JwtPayload } from "@/lib/jwt";

/**
 * Resolve the identifier used as carbon_projects.user_id for a logged-in user
 * (fullname → username → email → numeric id, first non-empty wins).
 */
export async function getUserIdentifier(payload: JwtPayload): Promise<string> {
  const result = await pool.query(
    `SELECT fullname, username, email FROM users WHERE id = $1`,
    [payload.userId]
  );
  if (result.rows.length > 0) {
    return result.rows[0].fullname || result.rows[0].username || result.rows[0].email || String(payload.userId);
  }
  return String(payload.userId);
}

/**
 * Merge raw JSON arrays — new items replace by id/polygon_id, extra old items preserved.
 * Prevents raw data from disappearing when only some parcels are reprocessed and saved.
 */
export function mergeRawArray(oldArr: any[], newArr: any[]): any[] {
  if (!Array.isArray(oldArr) || oldArr.length === 0) return newArr;
  if (!Array.isArray(newArr) || newArr.length === 0) return oldArr;

  // Create a map of new items by ID
  const newItemsMap = new Map();
  let hasIds = false;

  newArr.forEach(item => {
    if (item && typeof item === 'object') {
      const key = item.id || item.polygon_id;
      if (key) {
        newItemsMap.set(key, item);
        hasIds = true;
      }
    }
  });

  // If no items have IDs, fallback to original index-based logic
  if (!hasIds) {
    if (newArr.length >= oldArr.length) return newArr;
    return [...newArr, ...oldArr.slice(newArr.length)];
  }

  // If we have stable IDs, merge properly:
  // Start with all new items
  const result = [...newArr];

  // Append old items that are NOT in the new payload
  oldArr.forEach(oldItem => {
    if (oldItem && typeof oldItem === 'object') {
      const key = oldItem.id || oldItem.polygon_id;
      if (key && !newItemsMap.has(key)) {
        result.push(oldItem);
      }
    } else {
      result.push(oldItem);
    }
  });

  return result;
}

export function mergeRawField(oldValue: any, newValue: any): any {
  if (Array.isArray(newValue) && Array.isArray(oldValue)) {
    return mergeRawArray(oldValue, newValue);
  }
  if (
    newValue !== null && typeof newValue === "object" &&
    oldValue !== null && typeof oldValue === "object" &&
    !Array.isArray(newValue) && !Array.isArray(oldValue)
  ) {
    return { ...oldValue, ...newValue };
  }
  return newValue;
}

/** Convert a carbon_projects DB row into the shape returned by the API. */
export function rowToProject(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    plantationInfo: row.plantation_info ?? {},
    polygonsPayload: row.polygons_payload ?? [],
    backendResponses: row.backend_responses ?? [],
    status: row.status,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}