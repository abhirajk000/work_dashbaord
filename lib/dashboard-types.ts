import type { NotificationSettings } from "./notification-types.js";

export type DashboardState = {
  habits: Array<{
    id: string;
    name: string;
    completions: Record<string, boolean>;
    createdAt: string;
    deletedAt?: string;
    /** 24h HH:mm reminder times for this habit (ntfy) */
    reminderTimes?: string[];
  }>;
  weeklyFocus: string;
  reward: string;
  affirmation: string;
  weekStart: string;
  themeId?: string;
  customAccent?: string;
  themeManualDate?: string;
  notifications?: NotificationSettings;
  /** Effective study hours logged per date (YYYY-MM-DD → hours). */
  studyHours?: Record<string, number>;
};
