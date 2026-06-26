import { getNtfyTopicForUser } from "../../lib/username";
import type { NotificationSettings } from "../../lib/notification-types";

export const NTFY_APP_DOWNLOAD_URL = "https://ntfy.sh/app";

export function getNtfyTopicName(username: string): string {
  return getNtfyTopicForUser(username);
}

export function getNtfySubscribeUrl(username: string): string {
  return `https://ntfy.sh/${getNtfyTopicForUser(username)}`;
}

function remindersApiUrl(username: string, op: string, legacyRoot = false): string {
  const base = legacyRoot ? "/api/reminders" : `/api/${encodeURIComponent(username)}/reminders`;
  return `${base}?op=${op}`;
}

function getHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

export async function scheduleHabitReminders(
  username: string,
  options?: {
    habits?: Array<{
      id: string;
      name: string;
      completions: Record<string, boolean>;
      createdAt: string;
      deletedAt?: string;
      reminderTimes?: string[];
    }>;
    notifications?: NotificationSettings;
  },
  legacyRoot = false
): Promise<void> {
  const res = await fetch(remindersApiUrl(username, "schedule", legacyRoot), {
    method: "POST",
    headers: getHeaders(),
    credentials: "include",
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Schedule failed (${res.status})`);
  }
}

export async function sendTestNtfyNotification(username: string, legacyRoot = false): Promise<void> {
  const res = await fetch(remindersApiUrl(username, "test", legacyRoot), {
    method: "POST",
    headers: getHeaders(),
    credentials: "include",
    body: "{}",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Notification failed (${res.status})`);
  }
}

export async function sendHabitReminderPreview(
  username: string,
  options: {
    habitName: string;
    time?: string;
    variant?: "primary" | "followup";
  },
  legacyRoot = false
): Promise<void> {
  const res = await fetch(remindersApiUrl(username, "test", legacyRoot), {
    method: "POST",
    headers: getHeaders(),
    credentials: "include",
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
