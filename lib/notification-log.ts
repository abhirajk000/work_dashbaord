import { NTFY_TOPIC } from "./notification-types.js";
import { getSql } from "./sql.js";

export const WEB_PUSH_LOG_TOPIC = "webpush";

export async function alreadyLogged(topic: string, kind: string, date: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT 1 FROM notification_log
    WHERE topic = ${topic} AND kind = ${kind} AND reminder_date = ${date}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function markLogged(topic: string, kind: string, date: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO notification_log (topic, kind, reminder_date)
    VALUES (${topic}, ${kind}, ${date})
    ON CONFLICT (topic, kind, reminder_date) DO NOTHING
  `;
}

export { NTFY_TOPIC };
