import { normalizeTimeValue } from "./time-utils.js";

export const GREEN_PERCENT = 70;

export const NTFY_TOPIC = "Tracker";

export type NotificationSettings = {
  enabled: boolean;
  morningEnabled: boolean;
  eveningEnabled: boolean;
  morningTime: string;
  eveningTime: string;
  timezone: string;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  morningEnabled: true,
  eveningEnabled: true,
  morningTime: "08:00",
  eveningTime: "20:00",
  timezone: "Asia/Kolkata",
};

export type ReminderKind = "morning" | "evening";

export function normalizeNotificationSettings(
  settings: Partial<NotificationSettings> | undefined
): NotificationSettings {
  const merged = { ...DEFAULT_NOTIFICATION_SETTINGS, ...settings };
  return {
    ...merged,
    morningTime: normalizeTimeValue(merged.morningTime) ?? DEFAULT_NOTIFICATION_SETTINGS.morningTime,
    eveningTime: normalizeTimeValue(merged.eveningTime) ?? DEFAULT_NOTIFICATION_SETTINGS.eveningTime,
  };
}
