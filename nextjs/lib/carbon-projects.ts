import { randomUUID } from "crypto";
import { pool } from "@/lib/db";
import type { JwtPayload } from "@/lib/jwt";

/**
 * Resolve the stable UUID used as carbon_projects.user_uuid for a logged-in
 * user. This is immutable — unlike the old fullname-based identifier it never
 * changes when the user edits their profile, so projects stay linked.
 */
export async function getUserUuid(payload: JwtPayload): Promise<string | null> {
  const result = await pool.query(
    `SELECT uuid FROM users WHERE id = $1`,
    [payload.userId]
  );
  return result.rows[0]?.uuid ?? null;
}

/**
 * Generate a guest key using Node's built-in crypto.randomUUID() — a
 * cryptographically secure RFC 4122 v4 UUID (~122 bits of entropy).
 * Unguessable, so guest projects can't be enumerated (prevents IDOR) — unlike
 * the old timestamp+Math.random() scheme. Collisions are astronomically
 * unlikely, so no DB round-trip to check uniqueness is needed.
 */
export function generateGuestKey(): string {
  return `Guest-${randomUUID()}`;
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
    userUuid: row.user_uuid ?? null,
    guestKey: row.guest_key ?? null,
    // Backward-compatible: the frontend stores `project.userId` as its guest
    // key (guests) and ignores it for logged-in users.
    userId: row.guest_key ?? row.user_uuid ?? null,
    projectName: row.project_name,
    projectId: row.project_name,
    plantationInfo: row.plantation_info ?? {},
    polygonsPayload: row.polygons_payload ?? [],
    backendResponses: row.backend_responses ?? [],
    status: row.status,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}