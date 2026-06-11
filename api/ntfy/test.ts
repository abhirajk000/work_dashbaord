import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildHabitFollowupReminder,
  buildHabitPrimaryReminder,
} from "../lib/habit-reminders.js";
import { deliverReminder } from "../lib/deliver-notification.js";
import { NTFY_TOPIC } from "../lib/notification-types.js";
import { formatTimeDisplay, normalizeTimeValue } from "../lib/time-utils.js";

type TestBody = {
  habitName?: string;
  variant?: "primary" | "followup" | "ping";
  time?: string;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = parseBody(req);
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

      return res.status(200).json({
        ok: true,
        topic: NTFY_TOPIC,
        variant,
        habitName,
        delivered,
      });
    }

    const delivered = await deliverReminder(
      "✅ Tracker",
      "Reminders are working! Subscribe to topic Tracker in the ntfy app or enable browser notifications.",
      { tags: "white_check_mark", skipLog: true }
    );

    return res.status(200).json({
      ok: true,
      topic: NTFY_TOPIC,
      url: `https://ntfy.sh/${NTFY_TOPIC}`,
      delivered,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send notification";
    console.error("ntfy test error:", err);
    return res.status(500).json({ error: message });
  }
}
