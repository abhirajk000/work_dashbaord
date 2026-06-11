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
        ? `\n\n🧪 Test ping — scheduled for ${formatTimeDisplay(normalizedTime)}`
        : "\n\n🧪 Test ping — this is what your reminder will look like.";

      await sendNtfyNotification(payload.title, `${payload.body}${scheduleNote}`, { tags: payload.tags });
      return res.status(200).json({ ok: true, topic: NTFY_TOPIC, variant, habitName });
    }

    await sendNtfyNotification(
      "✅ Tracker test",
      "Reminders are working! Subscribe to topic Tracker in the ntfy app if you have not already.",
      { tags: "white_check_mark" }
    );
    return res.status(200).json({ ok: true, topic: NTFY_TOPIC, url: `https://ntfy.sh/${NTFY_TOPIC}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send test notification";
    console.error("ntfy test error:", err);
    return res.status(500).json({ error: message });
  }
}
