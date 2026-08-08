// Post-auth redirect handoff.
//
// Set when a guest is prompted to log in from a specific flow (e.g. the
// map-draw guest-limit popup) so that every auth method can return them
// there afterwards. Stored in a cookie (not localStorage) so the OAuth
// server callbacks (LINE/Google/Facebook) can redirect straight to the
// target instead of bouncing through "/".
//
// Consumed exactly once — client-side by AuthModals for email login/register,
// or server-side by the OAuth callback routes. (Only one path runs per login,
// so there is no client fallback that could consume the cookie prematurely.)

export const POST_AUTH_REDIRECT_COOKIE = "post_auth_redirect";
const TTL_SECONDS = 30 * 60; // stale intents from abandoned auth attempts expire

/** Client-side: remember where to return after auth. */
export function setPostAuthRedirect(to: string) {
  try {
    document.cookie = `${POST_AUTH_REDIRECT_COOKIE}=${encodeURIComponent(to)}; path=/; max-age=${TTL_SECONDS}; samesite=lax`;
  } catch {
    /* cookies unavailable — non-fatal, user just lands on "/" */
  }
}

/** Client-side: read-and-clear the pending redirect. Null if absent or invalid. */
export function consumePostAuthRedirect(): string | null {
  try {
    const m = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${POST_AUTH_REDIRECT_COOKIE}=([^;]+)`)
    );
    if (!m) return null;
    document.cookie = `${POST_AUTH_REDIRECT_COOKIE}=; path=/; max-age=0`;
    return sanitizePostAuthRedirect(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}

/**
 * Server-side: validate a raw cookie value into a safe same-site path.
 * Rejects absolute/protocol-relative URLs to prevent open redirects.
 */
export function sanitizePostAuthRedirect(value: string | undefined | null): string | null {
  if (!value) return null;
  // Must be a same-site absolute path.
  if (!value.startsWith("/")) return null;
  // Reject protocol-relative ("//host") and backslash variants ("/\host",
  // "\/host") — browsers treat "\" as "/", so these escape to another origin.
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  // Reject any backslash, control char, or whitespace that could smuggle a
  // second URL or bypass the checks above.
  if (/[\x00-\x1f\x7f\\\s]/.test(value)) return null;
  return value;
}
