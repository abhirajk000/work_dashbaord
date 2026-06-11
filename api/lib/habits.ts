import { GREEN_PERCENT } from "./notification-types.js";

export type Habit = {
  id: string;
  name: string;
  completions: Record<string, boolean>;
  createdAt: string;
  deletedAt?: string;
};

const DATA_START_DATE = "2026-01-12";

function isTrackingDate(date: string): boolean {
  return date >= DATA_START_DATE;
}

export function isHabitActiveOnDate(habit: Habit, date: string): boolean {
  if (!isTrackingDate(date)) return false;
  if (habit.createdAt > date) return false;
  if (habit.deletedAt && date >= habit.deletedAt) return false;
  return true;
}

export function getHabitsForDate(habits: Habit[], date: string): Habit[] {
  return habits.filter((h) => isHabitActiveOnDate(h, date));
}

export function getActiveHabitCount(habits: Habit[], date: string): number {
  return getHabitsForDate(habits, date).length;
}

export function getDayDoneCount(habits: Habit[], date: string): number {
  return getHabitsForDate(habits, date).filter((h) => h.completions[date] === true).length;
}

export function getDayCompletionPercent(habits: Habit[], date: string): number {
  const active = getHabitsForDate(habits, date);
  if (active.length === 0) return 0;
  return Math.round((active.filter((h) => h.completions[date] === true).length / active.length) * 100);
}

export function getTodayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function getClockInTimezone(timezone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hour, minute };
}

export function matchesReminderTime(time: string, timezone: string): boolean {
  const [targetHour, targetMinute] = time.split(":").map(Number);
  if (Number.isNaN(targetHour) || Number.isNaN(targetMinute)) return false;
  const { hour, minute } = getClockInTimezone(timezone);
  const nowMins = hour * 60 + minute;
  const targetMins = targetHour * 60 + targetMinute;
  return nowMins >= targetMins && nowMins < targetMins + 15;
}

export function buildMorningReminder(habits: Habit[], today: string): { title: string; body: string } | null {
  const total = getActiveHabitCount(habits, today);
  if (total === 0) return null;

  const done = getDayDoneCount(habits, today);
  if (done >= total) return null;

  const remaining = total - done;
  return {
    title: "Start your habits",
    body:
      done > 0
        ? `${done}/${total} done today — ${remaining} habit${remaining === 1 ? "" : "s"} left.`
        : `You have ${total} habit${total === 1 ? "" : "s"} to track today. Let's go!`,
  };
}

export function buildEveningReminder(habits: Habit[], today: string): { title: string; body: string } | null {
  const total = getActiveHabitCount(habits, today);
  if (total === 0) return null;

  const pct = getDayCompletionPercent(habits, today);
  if (pct >= GREEN_PERCENT) return null;

  const remaining = total - getDayDoneCount(habits, today);
  if (remaining <= 0) return null;

  return {
    title: "Complete today's habits",
    body: `You're at ${pct}% — finish ${remaining} more to hit your ${GREEN_PERCENT}% goal.`,
  };
}
