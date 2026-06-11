import postgres from "postgres";

const sourceUrl = process.env.NEON_DATABASE_URL ?? process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL ?? process.env.TARGET_DATABASE_URL;

if (!sourceUrl || !targetUrl) {
  console.error("Set NEON_DATABASE_URL (source) and DATABASE_URL (target VPS)");
  process.exit(1);
}

const source = postgres(sourceUrl, { max: 1, prepare: false, ssl: "require" });
const target = postgres(targetUrl, { max: 1, prepare: false });

async function copyDashboardState() {
  const rows = await source`SELECT id, data, updated_at FROM dashboard_state`;
  for (const row of rows) {
    await target`
      INSERT INTO dashboard_state (id, data, updated_at)
      VALUES (${row.id}, ${target.json(row.data)}, ${row.updated_at})
      ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
    `;
  }
  console.log(`dashboard_state: ${rows.length} row(s)`);
}

async function copyPushSubscriptions() {
  const rows = await source`
    SELECT endpoint, p256dh, auth, user_agent, created_at, updated_at
    FROM push_subscriptions
  `;
  for (const row of rows) {
    await target`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, created_at, updated_at)
      VALUES (
        ${row.endpoint},
        ${row.p256dh},
        ${row.auth},
        ${row.user_agent},
        ${row.created_at},
        ${row.updated_at}
      )
      ON CONFLICT (endpoint) DO UPDATE SET
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        updated_at = EXCLUDED.updated_at
    `;
  }
  console.log(`push_subscriptions: ${rows.length} row(s)`);
}

async function copyNotificationLog() {
  const exists = await source`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notification_log'
    LIMIT 1
  `;
  if (!exists.length) {
    console.log("notification_log: skipped (not on source)");
    return;
  }
  const rows = await source`
    SELECT topic, kind, reminder_date, sent_at FROM notification_log
  `;
  for (const row of rows) {
    await target`
      INSERT INTO notification_log (topic, kind, reminder_date, sent_at)
      VALUES (${row.topic}, ${row.kind}, ${row.reminder_date}, ${row.sent_at})
      ON CONFLICT (topic, kind, reminder_date) DO NOTHING
    `;
  }
  console.log(`notification_log: ${rows.length} row(s)`);
}

try {
  await copyDashboardState();
  await copyPushSubscriptions();
  await copyNotificationLog();
  console.log("Migration complete.");
} finally {
  await source.end();
  await target.end();
}
