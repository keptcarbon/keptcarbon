-- ==========================================================================
-- Auth tables — supports local (email/password) and OAuth (LINE/Google/Facebook)
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- Shared trigger fn: keep updated_at fresh automatically on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,               -- internal PK (JWT, FKs use uuid)
  uuid          UUID         NOT NULL DEFAULT gen_random_uuid() UNIQUE,  -- relationship / public key
  email         VARCHAR(255) UNIQUE,
  username      VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255),           -- bcrypt hash, NULL for OAuth-only users
  first_name    VARCHAR(100) NOT NULL DEFAULT '',
  last_name     VARCHAR(100) NOT NULL DEFAULT '',
  display_name  VARCHAR(255) NOT NULL DEFAULT '',  -- shown in header/profile
  phone         VARCHAR(20)  DEFAULT '',
  picture_url   TEXT         DEFAULT '',
  provider      VARCHAR(20)  NOT NULL DEFAULT 'local',  -- 'local' | 'line' | 'google' | 'facebook'
  line_user_id     VARCHAR(100) UNIQUE,   -- LINE userId, NULL for non-LINE users
  google_user_id   VARCHAR(100) UNIQUE,   -- Google sub, NULL for non-Google users
  facebook_user_id VARCHAR(100) UNIQUE,   -- Facebook id, NULL for non-Facebook users
  role          VARCHAR(20)  NOT NULL DEFAULT 'user',    -- 'user' | 'admin'
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for fast login lookups
CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_line_uid     ON users (line_user_id);
CREATE INDEX IF NOT EXISTS idx_users_google_uid   ON users (google_user_id);
CREATE INDEX IF NOT EXISTS idx_users_facebook_uid ON users (facebook_user_id);

-- Case-insensitive email uniqueness (Admin@x.com == admin@x.com)
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (LOWER(email));

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- Seed: default admin user
-- username: admin / password: kept@carbon
-- bcrypt hash generated with cost factor 10
-- ==========================================================================
INSERT INTO users (email, username, password_hash, first_name, last_name, display_name, provider, role)
VALUES (
  'admin@keptcarbon.io',
  'admin',
  -- bcrypt hash of 'kept@carbon'
  '$2b$10$mqUQPY6hUd6f1lujnmfZZOwSJT4UNG0JRGowVozp7gG7CEuXou0zW',
  'Administrator',
  '',
  'Administrator',
  'local',
  'admin'
) ON CONFLICT (username) DO NOTHING;
