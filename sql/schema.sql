-- Run this once in the Neon SQL editor (or via psql against your Neon database).

CREATE TABLE IF NOT EXISTS dashboard_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
