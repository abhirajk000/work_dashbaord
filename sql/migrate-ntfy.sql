-- One-time migration: Web Push tables → ntfy topic log
DROP TABLE IF EXISTS push_subscriptions;

DROP TABLE IF EXISTS notification_log;

CREATE TABLE notification_log (
  id BIGSERIAL PRIMARY KEY,
  topic TEXT NOT NULL DEFAULT 'Tracker',
  kind TEXT NOT NULL,
  reminder_date TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (topic, kind, reminder_date)
);
