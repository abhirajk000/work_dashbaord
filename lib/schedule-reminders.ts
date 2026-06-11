import { buildHabitReminderSchedule } from "./habit-reminders.js";
import { deliverNtfyReminder } from "./deliver-notification.js";
import { getDateInTimezone, zonedDateTimeToUtc } from "./reminder-window.js";

const DATA_START_DATE = "2026-01-12";
const MIN_SCHEDULE_LEAD_MS = 15_000;
const MAX_SCHEDULE_AHEAD_MS = 3 * 24 * 60 * 60 * 1000;

function addDaysToDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function candidateReminderDates(today: string, time: string, timezone: string, now: Date): string[] {
  const fireToday = zonedDateTimeToUtc(today, time, timezone);
  if (Number.isNaN(fireToday.getTime())) return [today];

  const dates = [today];
  if (fireToday.getTime() - now.getTime() < MIN_SCHEDULE_LEAD_MS) {
    dates.push(addDaysToDate(today, 1));
  }
  return dates;
}

type Habit = {
  id: string;
  name: string;
  completions: Record<string, boolean>;
  createdAt: string;
  deletedAt?: string;
  reminderTimes?: string[];
};

function isTrackingDate(date: string): boolean {
  return date >= DATA_START_DATE;
}

function isHabitActiveOnDate(habit: Habit, date: string): boolean {
  if (!isTrackingDate(date)) return false;
  if (habit.createdAt > date) return false;
  if (habit.deletedAt && date >= habit.deletedAt) return false;
  return true;
}

export async function scheduleUpcomingHabitReminders(
  habits: Habit[],
  timezone: string,
  now = new Date()
): Promise<{ scheduled: number; errors: string[] }> {
  const today = getDateInTimezone(now, timezone);
  let scheduled = 0;
  const errors: string[] = [];

  for (const habit of habits) {
    if (!habit.reminderTimes?.length) continue;
    if (!isHabitActiveOnDate(habit, today)) continue;
    if (habit.completions[today]) continue;

    for (const reminder of buildHabitReminderSchedule(habit.id, habit.name, habit.reminderTimes)) {
      try {
        for (const date of candidateReminderDates(today, reminder.time, timezone, now)) {
          const fireAt = zonedDateTimeToUtc(date, reminder.time, timezone);
          if (Number.isNaN(fireAt.getTime())) continue;

          const leadMs = fireAt.getTime() - now.getTime();
          if (leadMs < MIN_SCHEDULE_LEAD_MS || leadMs > MAX_SCHEDULE_AHEAD_MS) continue;

          const delayUnix = String(Math.floor(fireAt.getTime() / 1000));
          const sent = await deliverNtfyReminder(reminder.title, reminder.body, {
            tags: reminder.tags,
            delay: delayUnix,
            sequenceId: `${reminder.kind}-${date}`,
            kind: reminder.kind,
            logDate: date,
          });

          if (sent) scheduled += 1;
        }
      } catch (err) {
        errors.push(`${habit.name}@${reminder.time}: ${String(err)}`);
      }
    }
  }

  return { scheduled, errors };
}
