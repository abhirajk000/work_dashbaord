import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { buildHabitReminderSchedule } from "../lib/habit-reminders.js";
import { NTFY_TOPIC, GREEN_PERCENT, normalizeNotificationSettings } from "../lib/notification-types.js";
import { sendNtfyNotification } from "../lib/ntfy.js";
import { getDateInTimezone, shouldFireReminderInWindow } from "../lib/reminder-window.js";

const ROW_ID = "default";
const CRON_ROW_ID = "__cron__";
const DATA_START_DATE = "2026-01-12";
const MAX_CRON_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CRON_LOOKBACK_MS = 60 * 60 * 1000;

type Habit = {
  id: string;
  name: string;
  completions: Record<string, boolean>;
  createdAt: string;
  deletedAt?: string;
  reminderTimes?: string[];
};

function getSql() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set");
  return neon(url);
}

function isCronAuthorized(req: VercelRequest): boolean {
  const auth = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && (auth === `Bearer ${cronSecret}` || auth === cronSecret)) {
    return true;
  }

  const apiKey = process.env.DASHBOARD_API_KEY;
  if (apiKey && auth === `Bearer ${apiKey}`) {
    return true;
  }

  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return false;
}

async function sendNtfy(title: string, body: string, tags = "bell"): Promise<void> {
  await sendNtfyNotification(title, body, { tags });
}

function isTrackingDate(date: string): boolean {
  return date >= DATA_START_DATE;
}

function isHabitActiveOnDate(habit: Habit, date: string): boolean {
  if (!isTrackingDate(date)) return false;
  if (habit.createdAt > date) return false;
  if (habit.deletedAt && date >= habit.deletedAt) return false;
  return true;
}

function getHabitsForDate(habits: Habit[], date: string): Habit[] {
  return habits.filter((h) => isHabitActiveOnDate(h, date));
}

function getDayDoneCount(habits: Habit[], date: string): number {
  return getHabitsForDate(habits, date).filter((h) => h.completions[date] === true).length;
}

function getActiveHabitCount(habits: Habit[], date: string): number {
  return getHabitsForDate(habits, date).length;
}

function getDayCompletionPercent(habits: Habit[], date: string): number {
  const active = getHabitsForDate(habits, date);
  if (active.length === 0) return 0;
  return Math.round((active.filter((h) => h.completions[date] === true).length / active.length) * 100);
}

async function getLastCronRun(): Promise<Date> {
  const sql = getSql();
  const rows = await sql`SELECT data, updated_at FROM dashboard_state WHERE id = ${CRON_ROW_ID}`;
  if (!rows.length) {
    return new Date(Date.now() - DEFAULT_CRON_LOOKBACK_MS);
  }

  const data = rows[0].data as { lastRunAt?: string } | null | undefined;
  if (data?.lastRunAt) {
    const parsed = new Date(data.lastRunAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const updatedAt = rows[0].updated_at;
  if (updatedAt) {
    const parsed = new Date(updatedAt as string);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date(Date.now() - DEFAULT_CRON_LOOKBACK_MS);
}

async function setLastCronRun(now: Date): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO dashboard_state (id, data, updated_at)
    VALUES (${CRON_ROW_ID}, ${{ lastRunAt: now.toISOString() }}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data,
      updated_at = NOW()
  `;
}

async function alreadySent(kind: string, date: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT 1 FROM notification_log
    WHERE topic = ${NTFY_TOPIC} AND kind = ${kind} AND reminder_date = ${date}
    LIMIT 1
  `;
  return (rows as unknown[]).length > 0;
}

async function markSent(kind: string, date: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO notification_log (topic, kind, reminder_date)
    VALUES (${NTFY_TOPIC}, ${kind}, ${date})
    ON CONFLICT (topic, kind, reminder_date) DO NOTHING
  `;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isCronAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const sql = getSql();
    const now = new Date();
    const lastRun = await getLastCronRun();
    const windowStart = new Date(Math.max(lastRun.getTime(), now.getTime() - MAX_CRON_WINDOW_MS));

    const stateRows = await sql`SELECT data FROM dashboard_state WHERE id = ${ROW_ID}`;
    const state =
      (stateRows[0]?.data as { habits?: Habit[]; notifications?: Record<string, unknown> } | undefined) ?? null;
    const settings = normalizeNotificationSettings(state?.notifications);
    const habits = state?.habits ?? [];

    if (!settings.enabled) {
      await setLastCronRun(now);
      return res.status(200).json({ ok: true, sent: 0, reason: "notifications disabled" });
    }

    const timezone = settings.timezone;
    const today = getDateInTimezone(now, timezone);
    let sent = 0;
    const errors: string[] = [];

    const trySend = async (kind: string, time: string, title: string, body: string, tags: string) => {
      if (!shouldFireReminderInWindow(time, timezone, windowStart, now)) return;
      if (await alreadySent(kind, today)) return;
      await sendNtfy(title, body, tags);
      await markSent(kind, today);
      sent += 1;
    };

    if (settings.morningEnabled) {
      const total = getActiveHabitCount(habits, today);
      const done = getDayDoneCount(habits, today);
      if (total > 0 && done < total) {
        const remaining = total - done;
        const body =
          done > 0
            ? `${done}/${total} done today — ${remaining} habit${remaining === 1 ? "" : "s"} left.`
            : `You have ${total} habit${total === 1 ? "" : "s"} to track today. Let's go!`;
        try {
          await trySend("morning", settings.morningTime, "☀️ Start your habits", body, "sunny");
        } catch (err) {
          errors.push(String(err));
        }
      }
    }

    if (settings.eveningEnabled) {
      const pct = getDayCompletionPercent(habits, today);
      const total = getActiveHabitCount(habits, today);
      const remaining = total - getDayDoneCount(habits, today);
      if (total > 0 && pct < GREEN_PERCENT && remaining > 0) {
        try {
          await trySend(
            "evening",
            settings.eveningTime,
            "🌙 Complete today's habits",
            `You're at ${pct}% — finish ${remaining} more to hit your ${GREEN_PERCENT}% goal.`,
            "bell"
          );
        } catch (err) {
          errors.push(String(err));
        }
      }
    }

    for (const habit of habits) {
      if (!habit.reminderTimes?.length) continue;
      if (!isHabitActiveOnDate(habit, today)) continue;
      if (habit.completions[today]) continue;

      for (const reminder of buildHabitReminderSchedule(habit.id, habit.name, habit.reminderTimes)) {
        try {
          await trySend(reminder.kind, reminder.time, reminder.title, reminder.body, reminder.tags);
        } catch (err) {
          errors.push(`${habit.name}@${reminder.time}: ${String(err)}`);
        }
      }
    }

    await setLastCronRun(now);

    return res.status(200).json({
      ok: true,
      sent,
      topic: NTFY_TOPIC,
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error("Cron reminders error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
