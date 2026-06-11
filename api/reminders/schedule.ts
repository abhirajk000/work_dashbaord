import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { normalizeNotificationSettings } from "../lib/notification-types.js";
import { scheduleUpcomingHabitReminders } from "../lib/schedule-reminders.js";

const ROW_ID = "default";

function getSql() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set");
  return neon(url);
}

function isAuthorized(req: VercelRequest): boolean {
  const key = process.env.DASHBOARD_API_KEY;
  if (!key) return true;
  return req.headers.authorization === `Bearer ${key}`;
}

type Habit = {
  id: string;
  name: string;
  completions: Record<string, boolean>;
  createdAt: string;
  deletedAt?: string;
  reminderTimes?: string[];
};

type ScheduleBody = {
  habits?: Habit[];
  notifications?: Record<string, unknown>;
};

function parseBody(req: VercelRequest): ScheduleBody {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as ScheduleBody;
    } catch {
      return {};
    }
  }
  return req.body as ScheduleBody;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = parseBody(req);
    const sql = getSql();
    const rows = await sql`SELECT data FROM dashboard_state WHERE id = ${ROW_ID}`;
    const state =
      (rows[0]?.data as { habits?: Habit[]; notifications?: Record<string, unknown> } | undefined) ?? null;
    const settings = normalizeNotificationSettings(body.notifications ?? state?.notifications);
    const habits = body.habits ?? state?.habits ?? [];

    if (!settings.enabled) {
      return res.status(200).json({ ok: true, scheduled: 0, reason: "notifications disabled" });
    }

    const result = await scheduleUpcomingHabitReminders(habits, settings.timezone);

    return res.status(200).json({
      ok: true,
      scheduled: result.scheduled,
      errors: result.errors.length ? result.errors : undefined,
    });
  } catch (err) {
    console.error("Schedule reminders error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
