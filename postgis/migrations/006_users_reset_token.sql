-- ============================================================================
-- Migration 006 — tbl_users: password-reset token columns
-- ============================================================================
-- Run against an EXISTING database (the postgis/init/*.sql scripts only run
-- when the Docker volume is created fresh):
--
--   docker compose exec -T postgis \
--     psql -U keptcarbon -d keptcarbon -v ON_ERROR_STOP=1 \
--     < postgis/migrations/006_users_reset_token.sql
--
-- Backs the forgot/reset-password flow (nextjs/app/api/auth/forgot-password,
-- nextjs/app/api/auth/reset-password, nextjs/lib/reset-token.ts). Only the
-- SHA-256 hash of the token is ever stored, never the raw value. Purely
-- additive: adds two nullable columns + a lookup index, touches no existing
-- column or row.
-- ============================================================================

BEGIN;

ALTER TABLE tbl_users
  ADD COLUMN IF NOT EXISTS reset_token         TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

-- Partial index: only rows with an active reset in flight are worth indexing.
-- Speeds up the token lookups in GET/POST /api/auth/reset-password.
CREATE INDEX IF NOT EXISTS idx_tbl_users_reset_token
  ON tbl_users (reset_token) WHERE reset_token IS NOT NULL;

COMMIT;
