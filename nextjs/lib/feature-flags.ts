/**
 * Centralized feature-flag reads. One source of truth so backend routes and
 * (later) frontend pages agree on whether a feature is live.
 *
 * NOTE: these are read at *call time* (not module load) so the value reflects
 * the current server environment. On the server runtime this lets the flag act
 * as a kill-switch per the Zero-Breakage rollback plan.
 */

/** Password-reset ("Forgot Password") flow. Defaults to DISABLED. */
export function isPasswordResetEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET === "true";
}
