import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isBrowserOrServerAuthorized } from "../lib/browser-auth.js";
import { getSql } from "../lib/sql.js";
import {
  buildHabitFollowupReminder,
  buildHabitPrimaryReminder,
} from "../lib/habit-reminders.js";
import { deliverReminder } from "../lib/deliver-notification.js";
import { NTFY_TOPIC, normalizeNotificationSettings } from "../lib/notification-types.js";
import { scheduleUpcomingHabitReminders } from "../lib/schedule-reminders.js";
import { formatTimeDisplay, normalizeTimeValue } from "../lib/time-utils.js";
import {
  isWebPushConfigured,
  removePushSubscription,
  upsertPushSubscription,
} from "../lib/web-push.js";

const ROW_ID = "default";

function parseBody<T>(req: VercelRequest): T {
  if (!req.body) return {} as T;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as T;
    } catch {
      return {} as T;
    }
  }
  return req.body as T;
}

function getOp(req: VercelRequest): string {
  const query = req.query.op;
  if (typeof query === "string") return query;
  const body = parseBody<{ op?: string }>(req);
  return body.op ?? "test";
}

type Habit = {
  id: string;
  name: string;
  completions: Record<string, boolean>;
  createdAt: string;
  deletedAt?: string;
  reminderTimes?: string[];
};

async function handleTest(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseBody<{
    habitName?: string;
    variant?: "primary" | "followup";
    time?: string;
  }>(req);
  const habitName = body.habitName?.trim();

  if (habitName) {
    const variant = body.variant === "followup" ? "followup" : "primary";
    const payload =
      variant === "followup"
        ? buildHabitFollowupReminder(habitName)
        : buildHabitPrimaryReminder(habitName);
    const normalizedTime = normalizeTimeValue(body.time);
    const scheduleNote = normalizedTime
      ? `\n\nScheduled for ${formatTimeDisplay(normalizedTime)}.`
      : "";

    const delivered = await deliverReminder(payload.title, `${payload.body}${scheduleNote}`, {
      tags: payload.tags,
      skipLog: true,
    });

    return res.status(200).json({ ok: true, topic: NTFY_TOPIC, variant, habitName, delivered });
  }

  const delivered = await deliverReminder(
    "✅ Tracker",
    "Reminders are working! Use the ntfy app (Tracker) or browser notifications.",
    { tags: "white_check_mark", skipLog: true }
  );

  return res.status(200).json({
    ok: true,
    topic: NTFY_TOPIC,
    url: `https://ntfy.sh/${NTFY_TOPIC}`,
    delivered,
  });
}

async function handleSchedule(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseBody<{ habits?: Habit[]; notifications?: Record<string, unknown> }>(req);
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
}

async function handleSubscribe(req: VercelRequest, res: VercelResponse) {
  if (!isWebPushConfigured()) {
    return res.status(503).json({ error: "Web push is not configured on the server" });
  }

  if (req.method === "POST") {
    const body = parseBody<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>(req);
    const endpoint = body.endpoint?.trim();
    const p256dh = body.keys?.p256dh?.trim();
    const auth = body.keys?.auth?.trim();
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: "Invalid push subscription" });
    }

    const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
    await upsertPushSubscription(endpoint, p256dh, auth, userAgent);
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const body = parseBody<{ endpoint?: string }>(req);
    const endpoint = body.endpoint?.trim();
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    await removePushSubscription(endpoint);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isBrowserOrServerAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const op = getOp(req);
    if (op === "schedule") return handleSchedule(req, res);
    if (op === "subscribe") return handleSubscribe(req, res);
    return handleTest(req, res);
  } catch (err) {
    console.error("Reminders API error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
