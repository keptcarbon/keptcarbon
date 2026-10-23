/* ── Keppy Blog tag rules ── shared by the tag chip input on
   /rnd/kitty-content/blog/new and POST /api/rnd/blog, so both accept the
   same tags. Tags are compared ignoring case ("Carbon" = "carbon"). */

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/** Trimmed, inner spaces collapsed; commas aren't allowed (they split tags). */
export function normalizeTag(raw: string) {
  return raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

export const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Why this tag can't be added to `current`, or null if it can. */
export function tagProblem(tag: string, current: string[]): string | null {
  if (!tag) return "Tag ว่างอยู่";
  if (tag.length > MAX_TAG_LENGTH) return `Tag ยาวได้ไม่เกิน ${MAX_TAG_LENGTH} ตัวอักษร`;
  if (current.some((t) => sameTag(t, tag))) return `มีTag "${tag}" แล้ว`;
  if (current.length >= MAX_TAGS) return `ใส่ Tag ได้ไม่เกิน ${MAX_TAGS} Tag`;
  return null;
}
