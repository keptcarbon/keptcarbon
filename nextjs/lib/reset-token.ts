import { randomBytes, createHash } from "crypto";

/**
 * Password-reset token helpers.
 *
 * The raw token is emailed to the user; only its SHA-256 hash is stored in the
 * DB. A DB read therefore can't be turned into a working reset link (defends
 * against account takeover via leaked backups / SQL injection). SHA-256 (fast,
 * deterministic) is appropriate here — the token itself carries 256 bits of
 * entropy, so brute-forcing the hash is infeasible and a slow hash isn't needed.
 */

/** Generate a reset token: the raw value to email, plus the hash to store. */
export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashResetToken(token) };
}

/** Hash an incoming raw token for comparison against the stored hash. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
