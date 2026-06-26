-- Multi-user migration: run once in Neon SQL editor or via `npm run db:migrate:users`

CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS username TEXT;

CREATE INDEX IF NOT EXISTS push_subscriptions_username_idx ON push_subscriptions (username);

-- Migrate legacy single-user PIN (id = 'default') into users table
INSERT INTO users (username, pin_hash, salt, created_at)
SELECT 'default', pin_hash, salt, updated_at
FROM app_pin
WHERE id = 'default'
ON CONFLICT (username) DO NOTHING;

-- Optional: rename legacy dashboard owner (set MIGRATE_USERNAME env when running script)
-- UPDATE dashboard_state SET id = 'abhiraj' WHERE id = 'default';
