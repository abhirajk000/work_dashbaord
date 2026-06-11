import { NTFY_TOPIC } from "../../lib/notification-types";

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

export async function sendTestNtfyNotification(options?: { delayMinutes?: number }): Promise<void> {
  const res = await fetch("/api/ntfy/test", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(options?.delayMinutes ? { delayMinutes: options.delayMinutes } : {}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Test failed (${res.status})`);
  }
}

export async function sendScheduledTestNtfyNotification(delayMinutes = 2): Promise<void> {
  await sendTestNtfyNotification({ delayMinutes });
}

export async function sendHabitReminderTest(options: {
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
    throw new Error(data.error ?? `Reminder test failed (${res.status})`);
  }
}
