-- Run this once in the Neon SQL editor (or via psql against your Neon database).

CREATE TABLE IF NOT EXISTS dashboard_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_log (
  id BIGSERIAL PRIMARY KEY,
  topic TEXT NOT NULL DEFAULT 'Tracker',
  kind TEXT NOT NULL,
  reminder_date TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (topic, kind, reminder_date)
);
