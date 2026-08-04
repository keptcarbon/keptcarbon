/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Suited to this app's `output: "standalone"` (single / few instances). It is
 * best-effort: counters live in process memory, so they reset on restart and
 * are not shared across instances. For a multi-instance deployment, swap the
 * store for Redis/Upstash — the checkRateLimit() signature can stay the same.
 */

type Hit = { count: number; resetAt: number };

// Keyed by an arbitrary string (e.g. "forgot:<ip>"). Survives across requests
// via the dev/prod module singleton pattern used elsewhere in the app.
const globalForRl = globalThis as unknown as { rlStore: Map<string, Hit> | undefined };
const store: Map<string, Hit> = globalForRl.rlStore ?? new Map();
if (!globalForRl.rlStore) globalForRl.rlStore = store;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets (for a Retry-After header). */
  retryAfter: number;
}

/**
 * Record a hit for `key` and report whether it is within `limit` per `windowMs`.
 */
export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): RateLimitResult {
  // Skip in development so local testing isn't throttled. Also skippable in any
  // environment via RATE_LIMIT_DISABLED=true (e.g. an isolated staging test).
  // Production enforces the limit normally.
  if (process.env.NODE_ENV !== "production" || process.env.RATE_LIMIT_DISABLED === "true") {
    return { allowed: true, retryAfter: 0 };
  }

  const now = Date.now();
  const existing = store.get(key);

  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers (falls back to "unknown"). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
