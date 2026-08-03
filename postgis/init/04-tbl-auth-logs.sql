-- ==========================================================================
-- Auth logs — records every login (and eventually logout) event.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS tbl_auth_logs (
  id            BIGSERIAL PRIMARY KEY,
  uuid          UUID REFERENCES tbl_users(uuid) ON DELETE SET NULL,  -- tbl_users.uuid; null if the account was later deleted
  email         VARCHAR(255) NOT NULL,          -- snapshot at event time, survives user deletion
  event_type    VARCHAR(20)  NOT NULL,          -- 'login' | 'logout'
  provider      VARCHAR(20)  NOT NULL,          -- 'local' | 'line' | 'google' | 'facebook'
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for per-user history lookups and for the admin log listing (newest first)
CREATE INDEX IF NOT EXISTS idx_auth_logs_uuid       ON tbl_auth_logs (uuid);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created_at ON tbl_auth_logs (created_at DESC);
