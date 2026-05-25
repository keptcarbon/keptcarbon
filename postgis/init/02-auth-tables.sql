-- ==========================================================================
-- Auth tables — supports local (email/password) and LINE OAuth login
-- ==========================================================================

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE,
  username      VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255),           -- bcrypt hash, NULL for LINE-only users
  fullname      VARCHAR(255) NOT NULL,
  phone         VARCHAR(20)  DEFAULT '',
  picture_url   TEXT         DEFAULT '',
  provider      VARCHAR(20)  NOT NULL DEFAULT 'local',  -- 'local' | 'line' | 'google'
  line_user_id  VARCHAR(100) UNIQUE,    -- LINE userId, NULL for non-LINE users
  google_user_id VARCHAR(100) UNIQUE,   -- Google sub, NULL for non-Google users
  role          VARCHAR(20)  NOT NULL DEFAULT 'user',    -- 'user' | 'admin'
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for fast login lookups
CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_line_uid   ON users (line_user_id);
CREATE INDEX IF NOT EXISTS idx_users_google_uid ON users (google_user_id);

-- ==========================================================================
-- Seed: default admin user
-- username: admin / password: kept@carbon
-- bcrypt hash generated with cost factor 10
-- ==========================================================================
INSERT INTO users (email, username, password_hash, fullname, provider, role)
VALUES (
  'admin@keptcarbon.io',
  'admin',
  -- bcrypt hash of 'kept@carbon'
  '$2b$10$mqUQPY6hUd6f1lujnmfZZOwSJT4UNG0JRGowVozp7gG7CEuXou0zW',
  'Administrator',
  'local',
  'admin'
) ON CONFLICT (username) DO NOTHING;
