import type { NotificationSettings } from "./notification-types";

export type DashboardState = {
  habits: Array<{
    id: string;
    name: string;
    completions: Record<string, boolean>;
    createdAt: string;
    deletedAt?: string;
  }>;
  weeklyFocus: string;
  reward: string;
  affirmation: string;
  weekStart: string;
  themeId?: string;
  customAccent?: string;
  themeManualDate?: string;
  notifications?: NotificationSettings;
  studyHours?: Record<string, number>;
};
