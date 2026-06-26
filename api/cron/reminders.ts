import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSql } from "../../lib/sql.js";
import { buildHabitReminderSchedule } from "../../lib/habit-reminders.js";
import { deliverReminder } from "../../lib/deliver-notification.js";
import { GREEN_PERCENT, normalizeNotificationSettings } from "../../lib/notification-types.js";
import { getDateInTimezone, shouldFireReminderInWindow } from "../../lib/reminder-window.js";
import { getNtfyTopicForUser } from "../../lib/username.js";
import { listUsernames } from "../../lib/users-db.js";
import type { DashboardState } from "../../lib/dashboard-types.js";

const CRON_ROW_ID = "__cron__";
const DATA_START_DATE = "2026-01-12";
const MAX_CRON_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CRON_LOOKBACK_MS = 60 * 60 * 1000;
const POLL_WINDOW_MS = 20 * 60 * 1000;

type Habit = {
  id: string;
  name: string;
  completions: Record<string, boolean>;
  createdAt: string;
  deletedAt?: string;
  reminderTimes?: string[];
};

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
    VALUES (${CRON_ROW_ID}, ${sql.json({ lastRunAt: now.toISOString() })}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data,
      updated_at = NOW()
  `;
}

async function runRemindersForUser(
  username: string,
  state: DashboardState,
  windowStart: Date,
  now: Date
): Promise<{ sent: number; errors: string[] }> {
  const settings = normalizeNotificationSettings(state.notifications);
  const habits = (state.habits ?? []) as Habit[];
  const topic = getNtfyTopicForUser(username);

  if (!settings.enabled) {
    return { sent: 0, errors: [] };
  }

  const timezone = settings.timezone;
  const today = getDateInTimezone(now, timezone);
  let sent = 0;
  const errors: string[] = [];

  const trySend = async (kind: string, time: string, title: string, body: string, tags: string) => {
    if (!shouldFireReminderInWindow(time, timezone, windowStart, now)) return;
    const delivered = await deliverReminder(title, body, {
      tags,
      kind,
      logDate: today,
      tag: kind,
      topic,
      username,
    });
    if (delivered.ntfy) sent += 1;
    if (delivered.webPush) sent += 1;
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
        errors.push(`${username}/${habit.name}@${reminder.time}: ${String(err)}`);
      }
    }
  }

  return { sent, errors };
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
    const windowStart = new Date(
      Math.max(
        Math.min(lastRun.getTime(), now.getTime() - POLL_WINDOW_MS),
        now.getTime() - MAX_CRON_WINDOW_MS
      )
    );

    const usernames = await listUsernames();
    let totalSent = 0;
    const allErrors: string[] = [];

    for (const username of usernames) {
      const stateRows = await sql`SELECT data FROM dashboard_state WHERE id = ${username}`;
      const state = stateRows[0]?.data as DashboardState | undefined;
      if (!state) continue;

      const result = await runRemindersForUser(username, state, windowStart, now);
      totalSent += result.sent;
      allErrors.push(...result.errors);
    }

    await setLastCronRun(now);

    return res.status(200).json({
      ok: true,
      sent: totalSent,
      users: usernames.length,
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
      errors: allErrors.length ? allErrors : undefined,
    });
  } catch (err) {
    console.error("Cron reminders error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
