import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildHabitFollowupReminder,
  buildHabitPrimaryReminder,
} from "../lib/habit-reminders.js";
import { NTFY_TOPIC } from "../lib/notification-types.js";
import { sendNtfyNotification } from "../lib/ntfy.js";
import { formatTimeDisplay, normalizeTimeValue } from "../lib/time-utils.js";

type TestBody = {
  habitName?: string;
  variant?: "primary" | "followup" | "ping";
  time?: string;
  /** Schedule delivery via ntfy delay, e.g. 2 for two minutes from now. */
  delayMinutes?: number;
};

function parseBody(req: VercelRequest): TestBody {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as TestBody;
    } catch {
      return {};
    }
  }
  return req.body as TestBody;
}

function formatDelay(minutes: number): string {
  if (minutes < 1) return "30s";
  if (Number.isInteger(minutes)) return `${minutes}m`;
  const wholeMinutes = Math.floor(minutes);
  const seconds = Math.round((minutes - wholeMinutes) * 60);
  if (wholeMinutes <= 0) return `${seconds}s`;
  return seconds > 0 ? `${wholeMinutes}m${seconds}s` : `${wholeMinutes}m`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = parseBody(req);
    const habitName = body.habitName?.trim();
    const delayMinutes = typeof body.delayMinutes === "number" ? body.delayMinutes : undefined;
    const delay = delayMinutes !== undefined && delayMinutes > 0 ? formatDelay(delayMinutes) : undefined;

    if (habitName) {
      const variant = body.variant === "followup" ? "followup" : "primary";
      const payload =
        variant === "followup"
          ? buildHabitFollowupReminder(habitName)
          : buildHabitPrimaryReminder(habitName);
      const normalizedTime = normalizeTimeValue(body.time);
      const scheduleNote = delay
        ? `\n\n🧪 Scheduled test — arriving in ${delay}.`
        : normalizedTime
          ? `\n\n🧪 Test ping — scheduled for ${formatTimeDisplay(normalizedTime)}`
          : "\n\n🧪 Test ping — this is what your reminder will look like.";

      await sendNtfyNotification(payload.title, `${payload.body}${scheduleNote}`, {
        tags: payload.tags,
        delay,
      });
      return res.status(200).json({
        ok: true,
        topic: NTFY_TOPIC,
        variant,
        habitName,
        delay: delay ?? null,
      });
    }

    const title = delay ? "⏳ Tracker test scheduled" : "✅ Tracker test";
    const message = delay
      ? `Test notification scheduled in ${delay}. Subscribe to topic Tracker in the ntfy app if you have not already.`
      : "Reminders are working! Subscribe to topic Tracker in the ntfy app if you have not already.";

    await sendNtfyNotification(title, message, {
      tags: delay ? "hourglass" : "white_check_mark",
      delay,
    });
    return res.status(200).json({
      ok: true,
      topic: NTFY_TOPIC,
      url: `https://ntfy.sh/${NTFY_TOPIC}`,
      delay: delay ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send test notification";
    console.error("ntfy test error:", err);
    return res.status(500).json({ error: message });
  }
}
