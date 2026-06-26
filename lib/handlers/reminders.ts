import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthorizedForUser } from "../browser-auth.js";
import {
  buildHabitFollowupReminder,
  buildHabitPrimaryReminder,
} from "../habit-reminders.js";
import { deliverReminder } from "../deliver-notification.js";
import { normalizeNotificationSettings } from "../notification-types.js";
import { scheduleUpcomingHabitReminders } from "../schedule-reminders.js";
import { formatTimeDisplay, normalizeTimeValue } from "../time-utils.js";
import { getNtfyTopicForUser } from "../username.js";
import {
  isWebPushConfigured,
  removePushSubscription,
  upsertPushSubscription,
} from "../web-push.js";
import { getDashboardState } from "../db.js";

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

async function handleTest(req: VercelRequest, res: VercelResponse, username: string) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const topic = getNtfyTopicForUser(username);
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
      topic,
      username,
    });

    res.status(200).json({ ok: true, topic, variant, habitName, delivered });
    return;
  }

  const delivered = await deliverReminder(
    "✅ Tracker",
    `Reminders are working! Subscribe to ${topic} in the ntfy app if you have not already.`,
    { tags: "white_check_mark", skipLog: true, topic, username }
  );

  res.status(200).json({
    ok: true,
    topic,
    url: `https://ntfy.sh/${topic}`,
    delivered,
  });
}

async function handleSchedule(req: VercelRequest, res: VercelResponse, username: string) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = parseBody<{ habits?: Habit[]; notifications?: Record<string, unknown> }>(req);
  const state = await getDashboardState(username);
  const settings = normalizeNotificationSettings(body.notifications ?? state?.notifications);
  const habits = body.habits ?? state?.habits ?? [];

  if (!settings.enabled) {
    res.status(200).json({ ok: true, scheduled: 0, reason: "notifications disabled" });
    return;
  }

  const result = await scheduleUpcomingHabitReminders(habits, settings.timezone, getNtfyTopicForUser(username));
  res.status(200).json({
    ok: true,
    scheduled: result.scheduled,
    errors: result.errors.length ? result.errors : undefined,
  });
}

async function handleSubscribe(req: VercelRequest, res: VercelResponse, username: string) {
  if (!isWebPushConfigured()) {
    res.status(503).json({ error: "Web push is not configured on the server" });
    return;
  }

  if (req.method === "POST") {
    const body = parseBody<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>(req);
    const endpoint = body.endpoint?.trim();
    const p256dh = body.keys?.p256dh?.trim();
    const auth = body.keys?.auth?.trim();
    if (!endpoint || !p256dh || !auth) {
      res.status(400).json({ error: "Invalid push subscription" });
      return;
    }

    const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
    await upsertPushSubscription(endpoint, p256dh, auth, username, userAgent);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    const body = parseBody<{ endpoint?: string }>(req);
    const endpoint = body.endpoint?.trim();
    if (!endpoint) {
      res.status(400).json({ error: "endpoint required" });
      return;
    }
    await removePushSubscription(endpoint);
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "POST, DELETE");
  res.status(405).json({ error: "Method not allowed" });
}

export async function handleRemindersApi(
  req: VercelRequest,
  res: VercelResponse,
  username: string
): Promise<void> {
  if (!isAuthorizedForUser(req, username)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const op = getOp(req);
  if (op === "schedule") {
    await handleSchedule(req, res, username);
    return;
  }
  if (op === "subscribe") {
    await handleSubscribe(req, res, username);
    return;
  }
  await handleTest(req, res, username);
}
