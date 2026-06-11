import { NTFY_TOPIC, type NotificationSettings } from "../../lib/notification-types";

export const NTFY_SUBSCRIBE_URL = `https://ntfy.sh/${NTFY_TOPIC}`;

function getHeaders(): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const key = import.meta.env.VITE_DASHBOARD_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

export async function scheduleHabitReminders(options?: {
  habits?: Array<{
    id: string;
    name: string;
    completions: Record<string, boolean>;
    createdAt: string;
    deletedAt?: string;
    reminderTimes?: string[];
  }>;
  notifications?: NotificationSettings;
}): Promise<void> {
  const res = await fetch("/api/reminders/schedule", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Schedule failed (${res.status})`);
  }
}

export async function sendTestNtfyNotification(): Promise<void> {
  const res = await fetch("/api/ntfy/test", {
    method: "POST",
    headers: getHeaders(),
    body: "{}",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Notification failed (${res.status})`);
  }
}

export async function sendHabitReminderPreview(options: {
  habitName: string;
  time?: string;
  variant?: "primary" | "followup";
}): Promise<void> {
  const res = await fetch("/api/ntfy/test", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      habitName: options.habitName,
      time: options.time,
      variant: options.variant ?? "primary",
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Reminder preview failed (${res.status})`);
  }
}
