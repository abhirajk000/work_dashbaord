import { normalizeTimeValue } from "./time-utils.js";

export function getDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getZonedClock(date: Date, timezone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  if (hour === 24) hour = 0;
  return { hour, minute };
}

function getZonedDateTimeParts(date: Date, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  if (hour === 24) hour = 0;

  return {
    date: `${year}-${month}-${day}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

export function zonedDateTimeToUtc(dateStr: string, time: string, timezone: string): Date {
  const normalized = normalizeTimeValue(time);
  if (!normalized) return new Date(NaN);

  let utcMs = Date.parse(`${dateStr}T${normalized}:00.000Z`);
  if (Number.isNaN(utcMs)) return new Date(NaN);

  for (let i = 0; i < 6; i++) {
    const zoned = getZonedDateTimeParts(new Date(utcMs), timezone);
    if (zoned.date === dateStr && zoned.time === normalized) {
      return new Date(utcMs);
    }

    const [targetHour, targetMinute] = normalized.split(":").map(Number);
    const targetMins = targetHour * 60 + targetMinute;
    const [actualHour, actualMinute] = zoned.time.split(":").map(Number);
    const actualMins = actualHour * 60 + actualMinute;
    utcMs += (targetMins - actualMins) * 60_000;
  }

  return new Date(utcMs);
}

export function shouldFireReminderInWindow(
  time: string,
  timezone: string,
  windowStart: Date,
  windowEnd: Date
): boolean {
  const normalized = normalizeTimeValue(time);
  if (!normalized) return false;

  const dates = new Set<string>([
    getDateInTimezone(windowStart, timezone),
    getDateInTimezone(windowEnd, timezone),
  ]);

  for (const dateStr of dates) {
    const fireAt = zonedDateTimeToUtc(dateStr, normalized, timezone);
    if (!Number.isNaN(fireAt.getTime()) && fireAt > windowStart && fireAt <= windowEnd) {
      return true;
    }
  }

  return false;
}

/** Fallback when no cron heartbeat exists — current 15-minute slot. */
export function matchesReminderTime(time: string, timezone: string): boolean {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 15 * 60 * 1000);
  return shouldFireReminderInWindow(time, timezone, windowStart, now);
}
