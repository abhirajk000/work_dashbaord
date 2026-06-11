/** Minutes after a habit reminder to send a follow-up nudge if still unchecked. */
export const HABIT_FOLLOWUP_MINUTES = 30;

export type HabitReminderPayload = {
  kind: string;
  time: string;
  title: string;
  body: string;
  tags: string;
};

function displayHabitName(name: string): string {
  const trimmed = name.trim();
  return trimmed || "your habit";
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [hour, minute] = time.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return time;
  const total = hour * 60 + minute + minutes;
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const nextHour = Math.floor(normalized / 60);
  const nextMinute = normalized % 60;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

export function habitReminderKind(habitId: string, time: string, followUp = false): string {
  const base = `habit-${habitId}-${time.replace(":", "")}`;
  return followUp ? `${base}-followup` : base;
}

export function hasReminderNearTime(times: string[], target: string, toleranceMinutes = 5): boolean {
  const [targetHour, targetMinute] = target.split(":").map(Number);
  if (Number.isNaN(targetHour) || Number.isNaN(targetMinute)) return false;
  const targetMins = targetHour * 60 + targetMinute;

  return times.some((time) => {
    const [hour, minute] = time.split(":").map(Number);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return false;
    return Math.abs(hour * 60 + minute - targetMins) <= toleranceMinutes;
  });
}

export function buildHabitPrimaryReminder(habitName: string): Pick<HabitReminderPayload, "title" | "body" | "tags"> {
  const habit = displayHabitName(habitName);
  return {
    title: `⏰ ${habit}`,
    body: `It's time for "${habit}" 💪`,
    tags: "alarm_clock",
  };
}

export function buildHabitFollowupReminder(habitName: string): Pick<HabitReminderPayload, "title" | "body" | "tags"> {
  const habit = displayHabitName(habitName);
  return {
    title: `👀 Still on ${habit}?`,
    body: `Quick check-in — are you working on "${habit}" right now? Tap to mark it done ✨`,
    tags: "thinking",
  };
}

export function buildHabitReminderSchedule(
  habitId: string,
  habitName: string,
  reminderTimes: string[]
): HabitReminderPayload[] {
  const schedule: HabitReminderPayload[] = [];

  for (const time of reminderTimes) {
    if (!/^\d{2}:\d{2}$/.test(time)) continue;

    const primary = buildHabitPrimaryReminder(habitName);
    schedule.push({
      kind: habitReminderKind(habitId, time),
      time,
      ...primary,
    });

    const followTime = addMinutesToTime(time, HABIT_FOLLOWUP_MINUTES);
    if (hasReminderNearTime(reminderTimes, followTime)) continue;

    const followUp = buildHabitFollowupReminder(habitName);
    schedule.push({
      kind: habitReminderKind(habitId, time, true),
      time: followTime,
      ...followUp,
    });
  }

  return schedule;
}
