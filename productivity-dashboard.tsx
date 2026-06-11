import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import localforage from "localforage";
import { fetchDashboardState, saveDashboardStateKeepalive, saveDashboardStateRemote } from "./src/lib/dashboard-api";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings,
  type NotificationSettings,
} from "./lib/notification-types";
import { formatTimeDisplay, normalizeReminderTimes, normalizeTimeValue, sortReminderTimes } from "./lib/time-utils";
import {
  getDeviceTimezone,
  NTFY_SUBSCRIBE_URL,
  sendHabitReminderPreview,
  scheduleHabitReminders,
  sendTestNtfyNotification,
} from "./src/lib/ntfy-notifications";
import {
  Check,
  Plus,
  Trash2,
  Lock,
  CalendarDays,
  BarChart3,
  ListChecks,
  Crown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Flame,
  Palette,
  Pencil,
  X,
  Bell,
  BellRing,
  Clock,
} from "lucide-react";

const GREEN_PERCENT = 70;
const MAX_HABITS = 7;

const MONTH_CAL_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

const DAY_HEADER_PALETTES = [
  { from: "#6366f1", via: "#4f46e5", to: "#3730a3", accent: "#6366f1" },
  { from: "#10b981", via: "#059669", to: "#047857", accent: "#10b981" },
  { from: "#f59e0b", via: "#d97706", to: "#b45309", accent: "#f59e0b" },
  { from: "#f43f5e", via: "#e11d48", to: "#be123c", accent: "#f43f5e" },
  { from: "#3b82f6", via: "#2563eb", to: "#1d4ed8", accent: "#3b82f6" },
  { from: "#8b5cf6", via: "#7c3aed", to: "#6d28d9", accent: "#8b5cf6" },
  { from: "#f97316", via: "#ea580c", to: "#c2410c", accent: "#f97316" },
] as const;

function getDayPalette(dayIndex: number) {
  return DAY_HEADER_PALETTES[((dayIndex % 7) + 7) % 7];
}

// ─── Types ───────────────────────────────────────────────────────────────────

type DateStr = string;
type LegacyDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type Habit = {
  id: string;
  name: string;
  completions: Record<DateStr, boolean>;
  createdAt: DateStr;
  deletedAt?: DateStr;
  /** 24h HH:mm — ntfy pings at each time until the habit is done today */
  reminderTimes?: string[];
};

type WeekDay = {
  date: DateStr;
  label: string;
  short: string;
  dayNum: number;
  monthShort: string;
  dayIndex: number;
};

type ThemeMode = "light" | "dark" | "glass";

type ThemePresetId =
  | "green"
  | "emerald"
  | "teal"
  | "blue"
  | "indigo"
  | "purple"
  | "violet"
  | "rose"
  | "crimson"
  | "orange"
  | "amber"
  | "peach"
  | "lime"
  | "cyan"
  | "silver"
  | "golden"
  | "graphite"
  | "black"
  | "midnight"
  | "glass"
  | "frost";
type ThemeId = ThemePresetId | "custom";

type ThemePresetDef = {
  id: ThemePresetId;
  name: string;
  accent: string;
  mode: ThemeMode;
};

type DashboardState = {
  habits: Habit[];
  weeklyFocus: string;
  reward: string;
  affirmation: string;
  weekStart: DateStr;
  themeId?: ThemeId;
  customAccent?: string;
  /** When set to today, user-picked theme overrides the daily auto theme. */
  themeManualDate?: DateStr;
  notifications?: NotificationSettings;
  /** Effective study hours logged per date. */
  studyHours?: Record<DateStr, number>;
};

type LegacyHabit = {
  id: string;
  name: string;
  completions: Record<string, boolean>;
  createdAt?: DateStr;
  deletedAt?: DateStr;
  reminderTimes?: string[];
};

/** First day habit tracking counts — dates before this show "No data yet". */
const DATA_START_DATE: DateStr = "2026-01-12";
const HABIT_EPOCH: DateStr = DATA_START_DATE;

const LEGACY_DUMMY_HABIT_IDS = new Set(["habit-0", "habit-1", "habit-2", "habit-3", "habit-4", "habit-5"]);
const LEGACY_DUMMY_HABIT_NAMES = new Set([
  "Wake up at 6:30",
  "Gym / Weight Training",
  "Grammar & English Drill",
  "Deep Work",
  "Check SIPs & Budget",
  "No sugar",
]);

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "productivity-dashboard-v2";
const LEGACY_STORAGE_KEY = "productivity-dashboard-v1";

const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_SHORTS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEGACY_DAY_KEYS: LegacyDayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const THEME_PRESETS: ThemePresetDef[] = [
  { id: "green", name: "Forest", accent: "#22c55e", mode: "light" },
  { id: "emerald", name: "Emerald", accent: "#10b981", mode: "light" },
  { id: "teal", name: "Teal", accent: "#14b8a6", mode: "light" },
  { id: "lime", name: "Lime", accent: "#84cc16", mode: "light" },
  { id: "cyan", name: "Cyan", accent: "#06b6d4", mode: "light" },
  { id: "blue", name: "Ocean", accent: "#3b82f6", mode: "light" },
  { id: "indigo", name: "Indigo", accent: "#6366f1", mode: "light" },
  { id: "purple", name: "Purple", accent: "#8b5cf6", mode: "light" },
  { id: "violet", name: "Violet", accent: "#7c3aed", mode: "light" },
  { id: "rose", name: "Rose", accent: "#f43f5e", mode: "light" },
  { id: "crimson", name: "Crimson", accent: "#dc2626", mode: "light" },
  { id: "orange", name: "Sunset", accent: "#f97316", mode: "light" },
  { id: "amber", name: "Amber", accent: "#f59e0b", mode: "light" },
  { id: "peach", name: "Peach", accent: "#fb7185", mode: "light" },
  { id: "golden", name: "Golden", accent: "#d4a017", mode: "light" },
  { id: "silver", name: "Silver", accent: "#94a3b8", mode: "light" },
  { id: "graphite", name: "Graphite", accent: "#64748b", mode: "light" },
  { id: "glass", name: "Glass", accent: "#60a5fa", mode: "glass" },
  { id: "frost", name: "Frost", accent: "#38bdf8", mode: "glass" },
  { id: "black", name: "Black", accent: "#a3a3a3", mode: "dark" },
  { id: "midnight", name: "Midnight", accent: "#818cf8", mode: "dark" },
];

const DEFAULT_THEME_ID: ThemeId = "green";
const DEFAULT_CUSTOM_ACCENT = "#22c55e";

/** Rotating glass accents — one per calendar day (IST). */
const DAILY_GLASS_ACCENTS = [
  "#6366f1",
  "#8b5cf6",
  "#3b82f6",
  "#0ea5e9",
  "#06b6d4",
  "#14b8a6",
  "#10b981",
  "#22c55e",
  "#84cc16",
  "#eab308",
  "#f97316",
  "#f43f5e",
  "#ec4899",
  "#d946ef",
] as const;

type ResolvedTheme = {
  themeId: ThemeId;
  customAccent: string;
  mode: ThemeMode;
  isDaily: boolean;
};

function getDaysSinceEpoch(date: DateStr): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function getDailyTheme(date: DateStr = getTodayStr()): ResolvedTheme {
  const accent = DAILY_GLASS_ACCENTS[getDaysSinceEpoch(date) % DAILY_GLASS_ACCENTS.length];
  return { themeId: "custom", customAccent: accent, mode: "glass", isDaily: true };
}

function resolveActiveTheme(
  today: DateStr,
  themeId: ThemeId,
  customAccent: string,
  themeManualDate?: DateStr | null
): ResolvedTheme {
  if (themeManualDate === today) {
    return {
      themeId,
      customAccent,
      mode: resolveThemeMode(themeId),
      isDaily: false,
    };
  }
  return getDailyTheme(today);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number
): { r: number; g: number; b: number } {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type ThemePalette = {
  shades: Record<"50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900", string>;
  pageBg: string;
  pageGlow1: string;
  pageGlow2: string;
  pageGrid: string;
  panelShadow: string;
  dots: string[];
  habitLabel: string;
  habitDone: string;
  surface: string;
  surfaceMuted: string;
};

function buildPaletteFromAccent(accent: string): ThemePalette {
  const base = hexToRgb(accent);
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const shades = {
    50: rgbToHex(mixRgb(base, white, 0.92)),
    100: rgbToHex(mixRgb(base, white, 0.85)),
    200: rgbToHex(mixRgb(base, white, 0.7)),
    300: rgbToHex(mixRgb(base, white, 0.55)),
    400: rgbToHex(mixRgb(base, white, 0.3)),
    500: rgbToHex(base),
    600: rgbToHex(mixRgb(base, black, 0.12)),
    700: rgbToHex(mixRgb(base, black, 0.25)),
    800: rgbToHex(mixRgb(base, black, 0.4)),
    900: rgbToHex(mixRgb(base, black, 0.55)),
  };
  return {
    shades,
    pageBg: rgbToHex(mixRgb(base, white, 0.96)),
    pageGlow1: rgba(shades[500], 0.14),
    pageGlow2: rgba(shades[600], 0.1),
    pageGrid: rgba(shades[500], 0.025),
    panelShadow: rgba(shades[800], 0.06),
    dots: [shades[400], shades[500], shades[300], shades[600], shades[500], shades[700]],
    habitLabel: "#1e293b",
    habitDone: "#475569",
    surface: "rgba(255, 255, 255, 0.88)",
    surfaceMuted: "rgba(255, 255, 255, 0.6)",
  };
}

function buildDarkPaletteFromAccent(accent: string): ThemePalette {
  const base = hexToRgb(accent);
  const white = { r: 255, g: 255, b: 255 };
  const canvas = { r: 10, g: 12, b: 16 };
  const shades = {
    50: rgbToHex(mixRgb(canvas, base, 0.1)),
    100: rgbToHex(mixRgb(canvas, base, 0.18)),
    200: rgbToHex(mixRgb(canvas, base, 0.28)),
    300: rgbToHex(mixRgb(canvas, base, 0.4)),
    400: rgbToHex(mixRgb(base, white, 0.12)),
    500: rgbToHex(base),
    600: rgbToHex(mixRgb(base, white, 0.28)),
    700: rgbToHex(mixRgb(base, white, 0.45)),
    800: rgbToHex(mixRgb(white, base, 0.06)),
    900: rgbToHex(mixRgb(white, base, 0.02)),
  };
  return {
    shades,
    pageBg: rgbToHex(canvas),
    pageGlow1: rgba(shades[500], 0.22),
    pageGlow2: rgba(shades[600], 0.14),
    pageGrid: rgba(shades[500], 0.07),
    panelShadow: rgba(shades[500], 0.18),
    dots: [shades[600], shades[500], shades[700], shades[400], shades[600], shades[500]],
    habitLabel: shades[800],
    habitDone: shades[600],
    surface: "rgba(22, 26, 34, 0.9)",
    surfaceMuted: "rgba(30, 34, 42, 0.72)",
  };
}

function buildGlassPaletteFromAccent(accent: string): ThemePalette {
  const light = buildPaletteFromAccent(accent);
  const white = { r: 255, g: 255, b: 255 };
  const base = hexToRgb(accent);
  const shades = {
    ...light.shades,
    50: rgbToHex(mixRgb(white, base, 0.04)),
    100: rgbToHex(mixRgb(white, base, 0.07)),
    200: rgbToHex(mixRgb(white, base, 0.12)),
  };
  return {
    ...light,
    shades,
    pageBg: "#ffffff",
    pageGlow1: rgba(accent, 0.09),
    pageGlow2: rgba(accent, 0.05),
    pageGrid: "transparent",
    panelShadow: "rgba(0, 0, 0, 0.06)",
    surface: "rgba(255, 255, 255, 0.78)",
    surfaceMuted: "rgba(255, 255, 255, 0.58)",
    habitLabel: "#1c1c1e",
    habitDone: "#8e8e93",
  };
}

function normalizeThemeId(id: unknown): ThemeId {
  if (id === "custom") return "custom";
  if (typeof id === "string" && THEME_PRESETS.some((p) => p.id === id)) return id as ThemePresetId;
  return DEFAULT_THEME_ID;
}

function resolveThemePreset(themeId: ThemeId): ThemePresetDef | null {
  if (themeId === "custom") return null;
  return THEME_PRESETS.find((p) => p.id === themeId) ?? null;
}

function resolveThemeAccent(themeId: ThemeId, customAccent: string): string {
  return resolveThemePreset(themeId)?.accent ?? customAccent;
}

function resolveThemeMode(themeId: ThemeId): ThemeMode {
  return resolveThemePreset(themeId)?.mode ?? "light";
}

function resolveThemeAccentForMode(themeId: ThemeId, customAccent: string, mode: ThemeMode): string {
  if (themeId === "custom" || mode === "glass") return customAccent;
  return resolveThemeAccent(themeId, customAccent);
}

function buildThemePalette(themeId: ThemeId, customAccent: string, mode: ThemeMode): ThemePalette {
  const accent = resolveThemeAccentForMode(themeId, customAccent, mode);
  if (mode === "dark") return buildDarkPaletteFromAccent(accent);
  if (mode === "glass") return buildGlassPaletteFromAccent(accent);
  return buildPaletteFromAccent(accent);
}

function applyTheme(themeId: ThemeId, customAccent: string, modeOverride?: ThemeMode) {
  const mode = modeOverride ?? resolveThemeMode(themeId);
  const accent = resolveThemeAccentForMode(themeId, customAccent, mode);
  const palette = buildThemePalette(themeId, customAccent, mode);
  const root = document.documentElement;

  for (const [shade, color] of Object.entries(palette.shades)) {
    root.style.setProperty(`--th-${shade}`, color);
  }
  root.style.setProperty("--th-page-bg", palette.pageBg);
  root.style.setProperty("--th-page-glow-1", palette.pageGlow1);
  root.style.setProperty("--th-page-glow-2", palette.pageGlow2);
  root.style.setProperty("--th-page-grid", palette.pageGrid);
  root.style.setProperty("--th-panel-shadow", palette.panelShadow);
  root.style.setProperty("--habit-label-color", palette.habitLabel);
  root.style.setProperty("--habit-done-color", palette.habitDone);
  root.style.setProperty("--surface-color", palette.surface);
  root.style.setProperty("--surface-muted", palette.surfaceMuted);
  palette.dots.forEach((color, i) => root.style.setProperty(`--th-dot-${i}`, color));

  root.style.setProperty("--glass-accent-tint", rgba(accent, mode === "glass" ? 0.07 : 0.14));
  root.style.setProperty("--glass-accent-glow", rgba(accent, mode === "glass" ? 0.11 : 0.32));
  root.style.setProperty("--glass-accent-edge", rgba(accent, mode === "glass" ? 0.14 : 0.2));

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", mode === "glass" ? "#ffffff" : palette.pageBg);
  }

  root.dataset.themeMode = mode;
  root.classList.toggle("theme-dark", mode === "dark");
  root.classList.toggle("theme-glass", mode === "glass");
}

const DEFAULT_HABITS: Habit[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const APP_TIMEZONE = "Asia/Kolkata";

const istDisplayFormat = { timeZone: APP_TIMEZONE } as const;

function getIstDateParts(date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value ?? 0),
    month: Number(parts.find((p) => p.type === "month")?.value ?? 1),
    day: Number(parts.find((p) => p.type === "day")?.value ?? 1),
  };
}

function dateStrFromParts(year: number, month: number, day: number): DateStr {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getCurrentMonthYear(): { year: number; month: number } {
  const { year, month } = getIstDateParts();
  return { year, month: month - 1 };
}

function toDateStr(d: Date): DateStr {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateStr(s: DateStr): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function getTodayStr(): DateStr {
  const { year, month, day } = getIstDateParts();
  return dateStrFromParts(year, month, day);
}

/** Sunday = 0 … Saturday = 6 — pure calendar math, no timezone drift */
function getWeekdayIndex(dateStr: DateStr): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + day) % 7;
}

function addDays(dateStr: DateStr, delta: number): DateStr {
  const d = parseDateStr(dateStr);
  d.setUTCDate(d.getUTCDate() + delta);
  return toDateStr(d);
}

function weekContainsDate(weekStart: DateStr, date: DateStr): boolean {
  return date >= weekStart && date <= addDays(weekStart, 6);
}

function formatMonthShortIST(dateStr: DateStr): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: APP_TIMEZONE,
  });
}

function isTrackingDate(date: DateStr): boolean {
  return date >= DATA_START_DATE;
}

function isEditableDate(date: DateStr): boolean {
  return date === getTodayStr();
}

function isStudyHoursEditable(date: DateStr): boolean {
  return isTrackingDate(date) && !isFutureDate(date);
}

function normalizeStudyHoursValue(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.round(Math.max(0, Math.min(24, raw)) * 4) / 4;
}

function sanitizeStudyHours(map: Record<DateStr, number> | undefined): Record<DateStr, number> {
  if (!map) return {};
  const next: Record<DateStr, number> = {};
  for (const [date, hours] of Object.entries(map)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isTrackingDate(date)) continue;
    const normalized = normalizeStudyHoursValue(hours);
    if (normalized > 0) next[date] = normalized;
  }
  return next;
}

function formatStudyHoursLabel(hours: number): string {
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${hours}h`;
}

function isPastDate(date: DateStr): boolean {
  return date < getTodayStr();
}

function isFutureDate(date: DateStr): boolean {
  return date > getTodayStr();
}

function shiftWeekStart(weekStart: DateStr, delta: number): DateStr {
  return addDays(weekStart, delta * 7);
}

function getWeekStartForDate(date: DateStr): DateStr {
  const dayOfWeek = getWeekdayIndex(date);
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDays(date, diffToMonday);
}

function getDefaultWeekStart(): DateStr {
  return getWeekStartForDate(getTodayStr());
}

const DEFAULT_STATE: DashboardState = {
  habits: DEFAULT_HABITS,
  weeklyFocus: "",
  reward: "",
  affirmation: "",
  weekStart: getDefaultWeekStart(),
};

function dateFromMonthDay(year: number, month: number, dayOfMonth: number): DateStr {
  return dateStrFromParts(year, month + 1, dayOfMonth);
}

function formatDateTip(dateStr: DateStr): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...istDisplayFormat,
  });
}

function formatWeekRange(weekDays: WeekDay[]): string {
  const f = weekDays[0];
  const l = weekDays[6];
  if (f.monthShort === l.monthShort) return `${f.monthShort} ${f.dayNum} – ${l.dayNum}`;
  return `${f.monthShort} ${f.dayNum} – ${l.monthShort} ${l.dayNum}`;
}

function getWeekDays(weekStart: DateStr): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dayNum = Number(date.slice(8, 10));
    return {
      date,
      label: WEEKDAY_LABELS[i],
      short: WEEKDAY_SHORTS[i],
      dayNum,
      monthShort: formatMonthShortIST(date),
      dayIndex: i,
    };
  });
}

function isLegacyHabit(habit: LegacyHabit): boolean {
  return LEGACY_DAY_KEYS.some((k) => k in habit.completions);
}

function inferCreatedAt(h: LegacyHabit): DateStr {
  if (h.createdAt) return h.createdAt;
  const doneDates = Object.keys(h.completions)
    .filter((d) => h.completions[d])
    .sort();
  if (doneDates.length > 0) return doneDates[0];
  return HABIT_EPOCH;
}

function isLegacyDummyHabit(habit: Habit): boolean {
  return (
    LEGACY_DUMMY_HABIT_IDS.has(habit.id) &&
    LEGACY_DUMMY_HABIT_NAMES.has(habit.name) &&
    !Object.keys(habit.completions).some((d) => isTrackingDate(d) && habit.completions[d])
  );
}

function isHabitActiveOnDate(habit: Habit, date: DateStr): boolean {
  if (!isTrackingDate(date)) return false;
  if (habit.createdAt > date) return false;
  if (habit.deletedAt && date >= habit.deletedAt) return false;
  return true;
}

function getActiveHabits(habits: Habit[]): Habit[] {
  return habits.filter((h) => !h.deletedAt);
}

function normalizeHabit(h: Habit): Habit {
  const createdAt = h.createdAt ?? HABIT_EPOCH;
  const completions = { ...h.completions };
  for (const d of Object.keys(completions)) {
    if (d < createdAt || !isTrackingDate(d)) delete completions[d];
    if (h.deletedAt && d >= h.deletedAt) delete completions[d];
  }
  const reminderTimes = normalizeReminderTimes(h.reminderTimes);
  return { ...h, createdAt, completions, reminderTimes: reminderTimes.length ? reminderTimes : undefined };
}

function defaultReminderTimesForIndex(_index: number): string[] {
  return ["08:00"];
}

function sanitizeLoadedHabits(habits: Habit[]): Habit[] {
  return habits
    .filter((h) => !isLegacyDummyHabit(h))
    .map((h) => {
      const createdAt =
        h.createdAt && h.createdAt < DATA_START_DATE ? DATA_START_DATE : (h.createdAt ?? DATA_START_DATE);
      return normalizeHabit({ ...h, createdAt });
    });
}

function migrateHabits(habits: LegacyHabit[], weekStart: DateStr): Habit[] {
  const weekDays = getWeekDays(weekStart);
  const keyToDate = Object.fromEntries(
    LEGACY_DAY_KEYS.map((k, i) => [k, weekDays[i].date])
  ) as Record<LegacyDayKey, DateStr>;

  return sanitizeLoadedHabits(
    habits.map((h) => {
      const createdAt = inferCreatedAt(h);
      if (!isLegacyHabit(h)) {
        return normalizeHabit({
          ...(h as Habit),
          completions: { ...h.completions },
          createdAt,
        });
      }
      const completions: Record<DateStr, boolean> = {};
      for (const [key, val] of Object.entries(h.completions)) {
        if (val && key in keyToDate) completions[keyToDate[key as LegacyDayKey]] = true;
      }
      return normalizeHabit({
        ...(h as Habit),
        completions,
        createdAt,
      });
    })
  );
}

function getHabitsForDate(habits: Habit[], date: DateStr): Habit[] {
  return habits.filter((h) => isHabitActiveOnDate(h, date));
}

function getActiveHabitCount(habits: Habit[], date: DateStr): number {
  return getHabitsForDate(habits, date).length;
}

function isHabitDone(habit: Habit, date: DateStr): boolean {
  return habit.completions[date] === true;
}

function getDayCompletionPercent(habits: Habit[], date: DateStr): number {
  const active = getHabitsForDate(habits, date);
  if (active.length === 0) return 0;
  return Math.round((active.filter((h) => isHabitDone(h, date)).length / active.length) * 100);
}

function getDayDoneCount(habits: Habit[], date: DateStr): number {
  return getHabitsForDate(habits, date).filter((h) => isHabitDone(h, date)).length;
}

function getCompletionPercent(done: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

function isDayQualified(habits: Habit[], date: DateStr): boolean {
  return getDayCompletionPercent(habits, date) >= GREEN_PERCENT;
}

function isPerfectDay(habits: Habit[], date: DateStr): boolean {
  const active = getHabitsForDate(habits, date);
  if (active.length === 0) return false;
  return active.every((h) => isHabitDone(h, date));
}

function countPerfectDaysInMonth(habits: Habit[], year: number, month: number): number {
  const today = getTodayStr();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = dateStrFromParts(year, month + 1, day);
    if (dateStr > today || !isTrackingDate(dateStr)) continue;
    if (isPerfectDay(habits, dateStr)) count++;
  }
  return count;
}

function countPerfectDaysInWeek(habits: Habit[], weekDays: WeekDay[]): number {
  const today = getTodayStr();
  return weekDays.filter((d) => d.date <= today && isTrackingDate(d.date) && isPerfectDay(habits, d.date)).length;
}

function getWeeklyAverage(habits: Habit[], weekDays: WeekDay[]): number {
  const tracked = weekDays.filter((d) => isTrackingDate(d.date));
  if (tracked.length === 0 || habits.length === 0) return 0;
  const total = tracked.reduce((sum, d) => sum + getDayCompletionPercent(habits, d.date), 0);
  return Math.round(total / tracked.length);
}

function getTotalCompletions(habits: Habit[], weekDays: WeekDay[]): number {
  return habits.reduce(
    (sum, h) =>
      sum + weekDays.filter((d) => isHabitActiveOnDate(h, d.date) && isHabitDone(h, d.date)).length,
    0
  );
}

function getWeekMaxPossible(habits: Habit[], weekDays: WeekDay[]): number {
  return weekDays.reduce((sum, d) => sum + getActiveHabitCount(habits, d.date), 0);
}

type MonthBarStats = {
  counts: number[];
  totals: number[];
  labels: string[];
  todayIndex: number;
  totalChecks: number;
  greenDays: number;
  perfectDays: number;
  avgPercent: number;
  daysElapsed: number;
  monthLabel: string;
};

function getMonthBarStats(habits: Habit[], year: number, month: number): MonthBarStats {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const today = getTodayStr();
  const counts: number[] = [];
  const totals: number[] = [];
  const labels: string[] = [];
  let todayIndex = -1;
  let totalChecks = 0;
  let greenDays = 0;
  let perfectDays = 0;
  let percentSum = 0;
  let daysElapsed = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = dateStrFromParts(year, month + 1, day);
    const done = getDayDoneCount(habits, dateStr);
    const active = getActiveHabitCount(habits, dateStr);
    counts.push(done);
    totals.push(active);
    labels.push(String(day));
    totalChecks += done;
    if (dateStr <= today && isTrackingDate(dateStr)) {
      daysElapsed++;
      if (active > 0) percentSum += getDayCompletionPercent(habits, dateStr);
      if (isDayQualified(habits, dateStr)) greenDays++;
      if (isPerfectDay(habits, dateStr)) perfectDays++;
    }
    if (dateStr === today) todayIndex = day - 1;
  }

  const ref = parseDateStr(dateStrFromParts(year, month + 1, 1));
  return {
    counts,
    totals,
    labels,
    todayIndex,
    totalChecks,
    greenDays,
    perfectDays,
    avgPercent: daysElapsed > 0 ? Math.round(percentSum / daysElapsed) : 0,
    daysElapsed,
    monthLabel: ref.toLocaleDateString("en-US", { month: "long", year: "numeric", ...istDisplayFormat }),
  };
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = parseDateStr(dateStrFromParts(year, month + 1, 1));
  d.setUTCMonth(d.getUTCMonth() + delta);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

type HeatmapCell = {
  date: DateStr;
  percent: number;
  done: number;
  total: number;
};

type MonthGrid = {
  year: number;
  month: number;
  label: string;
  isCurrent: boolean;
  rows: (HeatmapCell | null)[][];
};

function buildCurrentMonthGrid(habits: Habit[]): MonthGrid {
  const todayStr = getTodayStr();
  const [year, month] = todayStr.split("-").map(Number);
  const monthIndex = month - 1;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const startOffset = getWeekdayIndex(dateStrFromParts(year, month, 1));

  const flat: (HeatmapCell | null)[] = [];
  for (let i = 0; i < startOffset; i++) flat.push(null);

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = dateStrFromParts(year, month, day);
    const done = getDayDoneCount(habits, dateStr);
    flat.push({
      date: dateStr,
      percent: getDayCompletionPercent(habits, dateStr),
      done,
      total: getActiveHabitCount(habits, dateStr),
    });
  }
  while (flat.length % 7 !== 0) flat.push(null);

  const rows: (HeatmapCell | null)[][] = [];
  for (let i = 0; i < flat.length; i += 7) {
    rows.push(flat.slice(i, i + 7));
  }

  return {
    year,
    month: monthIndex,
    label: parseDateStr(dateStrFromParts(year, month, 1)).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      ...istDisplayFormat,
    }),
    isCurrent: true,
    rows,
  };
}

function collectQualifiedDates(habits: Habit[]): Set<DateStr> {
  const dates = new Set<DateStr>();
  for (const h of habits) {
    for (const d of Object.keys(h.completions)) {
      if (h.completions[d]) dates.add(d);
    }
  }
  const qualified = new Set<DateStr>();
  for (const d of dates) {
    if (isTrackingDate(d) && isDayQualified(habits, d)) qualified.add(d);
  }
  return qualified;
}

function computeCurrentStreak(qualifying: Set<DateStr>): number {
  if (qualifying.size === 0) return 0;
  const today = getTodayStr();
  const yesterday = addDays(today, -1);

  let start = today;
  if (!qualifying.has(today)) {
    if (!qualifying.has(yesterday)) return 0;
    start = yesterday;
  }

  let streak = 0;
  let cursor = start;
  while (qualifying.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function computeLongestStreak(qualifying: Set<DateStr>): number {
  if (qualifying.size === 0) return 0;
  const sorted = [...qualifying].sort();
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseDateStr(sorted[i - 1]);
    const curr = parseDateStr(sorted[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    if (diffDays === 1) {
      current++;
      longest = Math.max(longest, current);
    } else if (diffDays > 1) {
      current = 1;
    }
  }
  return longest;
}

type StreakStats = {
  current: number;
  longest: number;
  qualifiedDays: number;
};

function getStreakStats(habits: Habit[]): StreakStats {
  const qualified = collectQualifiedDates(habits);
  return {
    current: computeCurrentStreak(qualified),
    longest: computeLongestStreak(qualified),
    qualifiedDays: qualified.size,
  };
}

// ─── UI Primitives ───────────────────────────────────────────────────────────

function useIsMobile(breakpoint = 767) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(`(max-width: ${breakpoint}px)`).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isMobile;
}

function PerfectDayCrown({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <Crown size={size} className={`perfect-crown text-amber-300 ${className}`} fill="currentColor" />;
}

function PanelLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="flex h-4 w-4 items-center justify-center rounded bg-th-100 text-th-600">{icon}</span>
      <span className="text-xs font-bold uppercase tracking-widest text-th-700">{children}</span>
    </div>
  );
}

type MonthCalDayStatus = "future" | "today" | "perfect" | "qualified" | "partial" | "missed" | "neutral";

function getMonthCalDayStatus(
  habits: Habit[],
  cell: HeatmapCell,
  todayStr: DateStr
): MonthCalDayStatus {
  if (isFutureDate(cell.date)) return "future";
  if (!isTrackingDate(cell.date)) return "neutral";
  if (cell.date === todayStr) return "today";
  if (isPerfectDay(habits, cell.date)) return "perfect";
  if (isDayQualified(habits, cell.date)) return "qualified";
  if (cell.done > 0) return "partial";
  if (cell.total > 0) return "missed";
  return "neutral";
}

function MonthlyActivityGrid({
  habits,
  onDayClick,
  selectedDate,
}: {
  habits: Habit[];
  onDayClick: (date: DateStr) => void;
  selectedDate?: DateStr | null;
}) {
  const todayStr = getTodayStr();
  const grid = useMemo(() => buildCurrentMonthGrid(habits), [habits]);

  const monthStats = useMemo(() => {
    let goalDays = 0;
    let perfectDays = 0;
    let elapsed = 0;
    for (const row of grid.rows) {
      for (const cell of row) {
        if (!cell || isFutureDate(cell.date)) continue;
        elapsed++;
        if (isDayQualified(habits, cell.date)) goalDays++;
        if (isPerfectDay(habits, cell.date)) perfectDays++;
      }
    }
    return { goalDays, perfectDays, elapsed };
  }, [grid, habits]);

  return (
    <div className="month-cal flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex shrink-0 items-end justify-between gap-1.5 px-0.5">
        <PanelLabel icon={<CalendarDays size={10} />}>
          <span className="truncate">{grid.label}</span>
        </PanelLabel>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          <span className="whitespace-nowrap text-[10px] font-bold text-th-700 sm:text-[11px]">
            {monthStats.goalDays}/{monthStats.elapsed} goal days
          </span>
          {monthStats.perfectDays > 0 && (
            <span className="text-[10px] font-semibold text-amber-700">
              {monthStats.perfectDays} perfect
            </span>
          )}
        </div>
      </div>

      <div className="month-cal-panel flex min-h-0 flex-1 flex-col">
        <div className="month-cal-weekdays">
          {MONTH_CAL_WEEKDAYS.map((label, i) => (
            <span key={`${label}-${i}`} className="month-cal-weekday">
              {label}
            </span>
          ))}
        </div>
        <div className="month-cal-body">
          {grid.rows.map((row, ri) => (
            <div key={ri} className="month-cal-row">
              {row.map((cell, ci) => {
                if (!cell) {
                  return <div key={ci} className="month-cal-cell month-cal-cell--empty" aria-hidden />;
                }

                const dayNum = Number(cell.date.slice(8, 10));
                const status = getMonthCalDayStatus(habits, cell, todayStr);
                const isSelected = cell.date === selectedDate;
                const tip = formatDateTip(cell.date);

                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => onDayClick(cell.date)}
                    title={`${tip}: ${cell.percent}% — jump to day`}
                    className="month-cal-cell"
                  >
                    <span
                      className={`month-cal-marker month-cal-marker--${status}${isSelected ? " month-cal-marker--selected" : ""}`}
                    >
                      {dayNum}
                      {status === "qualified" && (
                        <Check size={9} strokeWidth={3} className="month-cal-marker-badge" aria-hidden />
                      )}
                      {status === "perfect" && (
                        <PerfectDayCrown size={9} className="month-cal-marker-badge" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="month-cal-legend mt-1 shrink-0">
        <span className="month-cal-legend-item">
          <span className="month-cal-legend-swatch month-cal-legend-swatch--today" />
          Today
        </span>
        <span className="month-cal-legend-item">
          <span className="month-cal-legend-swatch month-cal-legend-swatch--qualified" />
          {GREEN_PERCENT}%+
        </span>
        <span className="month-cal-legend-item">
          <span className="month-cal-legend-swatch month-cal-legend-swatch--partial" />
          Partial
        </span>
        <span className="month-cal-legend-item">
          <span className="month-cal-legend-swatch month-cal-legend-swatch--missed" />
          Missed
        </span>
      </div>
    </div>
  );
}

// ─── SVG Charts ──────────────────────────────────────────────────────────────

function DonutChart({ percent, size = 96, id = "donut" }: { percent: number; size?: number; id?: string }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;

  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0 drop-shadow-sm">
      <defs>
        <linearGradient id={`${id}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--th-400)" />
          <stop offset="100%" stopColor="var(--th-700)" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--th-50)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`url(#${id}-grad)`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        className="transition-all duration-700 ease-out"
      />
    </svg>
  );
}

function DayRing({
  percent,
  size = 46,
  perfect = false,
  onDark = false,
}: {
  percent: number;
  size?: number;
  perfect?: boolean;
  onDark?: boolean;
}) {
  const stroke = size <= 48 ? 5 : size <= 56 ? 5.5 : 6;
  const labelClass =
    size <= 48 ? "text-xs" : size <= 56 ? "text-sm" : "text-base";
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  const ringId = `day-ring-${size}-${onDark ? "dark" : "light"}`;

  const trackStroke = onDark ? "rgba(255,255,255,0.28)" : "var(--th-100)";
  const progressStroke = perfect ? "#fbbf24" : onDark ? "#ffffff" : "var(--th-500)";
  const textClass = perfect
    ? onDark
      ? "text-amber-200"
      : "text-amber-600"
    : onDark
      ? "text-white"
      : "text-th-700";

  return (
    <div className="relative shrink-0 drop-shadow-sm" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {onDark && (
          <defs>
            <linearGradient id={`${ringId}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.75)" />
            </linearGradient>
          </defs>
        )}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackStroke} strokeWidth={stroke} />
        {percent > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={perfect ? progressStroke : onDark ? `url(#${ringId}-grad)` : progressStroke}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className="transition-all duration-500"
          />
        )}
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-extrabold tabular-nums ${labelClass} ${textClass}`}>
        {percent}%
      </span>
    </div>
  );
}

function StudyHoursPopup({
  date,
  initialHours,
  onSave,
  onClose,
}: {
  date: DateStr;
  initialHours?: number;
  onSave: (hours: number | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initialHours !== undefined ? String(initialHours) : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      onSave(null);
      onClose();
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) return;
    onSave(normalizeStudyHoursValue(parsed));
    onClose();
  };

  return createPortal(
    <div className="study-hours-overlay fixed inset-0 z-[10070] flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className="study-hours-popup panel relative z-10 w-full max-w-[280px] rounded-2xl border border-th-100-80 p-4 shadow-2xl"
        role="dialog"
        aria-labelledby="study-hours-title"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 id="study-hours-title" className="text-sm font-extrabold text-th-800">
              Effective study
            </h3>
            <p className="mt-0.5 text-[11px] font-medium text-th-500">{formatDateTip(date)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-th-500 hover:bg-th-50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-th-500">
            Hours studied
          </span>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="number"
              min={0}
              max={24}
              step={0.25}
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              className="w-full rounded-xl border border-th-200 bg-white px-3 py-2.5 text-lg font-bold tabular-nums text-th-800 outline-none ring-th-300 focus:ring-2"
              placeholder="0"
            />
            <span className="shrink-0 text-sm font-bold text-th-500">hr</span>
          </div>
        </label>

        <div className="flex gap-2">
          {initialHours !== undefined && initialHours > 0 && (
            <button
              type="button"
              onClick={() => {
                onSave(null);
                onClose();
              }}
              className="rounded-xl border border-th-200 px-3 py-2 text-xs font-semibold text-th-600 hover:bg-th-50"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-th-200 px-3 py-2 text-xs font-semibold text-th-600 hover:bg-th-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-xl bg-grad-th-btn px-3 py-2 text-xs font-bold text-white shadow-sm"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function StudyHoursChip({
  date,
  hours,
  locked,
  onDark,
  compact = false,
  onSave,
}: {
  date: DateStr;
  hours?: number;
  locked: boolean;
  onDark: boolean;
  compact?: boolean;
  onSave: (hours: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasHours = hours !== undefined && hours > 0;
  const size = compact ? 26 : 28;

  const openPopup = () => {
    if (!locked) setOpen(true);
  };

  return (
    <>
      <div
        className={`shrink-0 rounded-full p-px ${
          onDark ? "bg-white/15 ring-1 ring-white/30" : "bg-white/95 ring-1 ring-th-200"
        }`}
      >
        <button
          type="button"
          onClick={openPopup}
          disabled={locked}
          className={`study-hours-ring relative flex shrink-0 items-center justify-center rounded-full border transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
            onDark
              ? hasHours
                ? "border-white/70 bg-white/20 text-white"
                : "border-white/60 bg-white/15 text-white hover:bg-white/25"
              : hasHours
                ? "border-th-400 bg-white text-th-800"
                : "border-th-300 bg-white text-th-500 hover:border-th-400"
          }`}
          style={{ width: size, height: size }}
          title={locked ? "Study hours not editable" : hasHours ? `${formatStudyHoursLabel(hours!)} effective study` : "Log effective study hours"}
          aria-label={hasHours ? `${formatStudyHoursLabel(hours!)} effective study` : "Log effective study hours"}
        >
          {hasHours ? (
            <span className="text-[8px] font-extrabold leading-none tabular-nums">{formatStudyHoursLabel(hours!)}</span>
          ) : (
            <span className="text-[11px] font-extrabold leading-none">+</span>
          )}
        </button>
      </div>
      {open && (
        <StudyHoursPopup
          date={date}
          initialHours={hours}
          onSave={(value) => onSave(value)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DayCardHeader({
  day,
  pct,
  perfect,
  isToday,
  isFocused,
  isPast,
  isFuture,
  compact = false,
  studyHours,
  studyHoursLocked,
  onStudyHoursSave,
}: {
  day: WeekDay;
  pct: number;
  perfect: boolean;
  isToday: boolean;
  isFocused: boolean;
  isPast: boolean;
  isFuture: boolean;
  compact?: boolean;
  studyHours?: number;
  studyHoursLocked: boolean;
  onStudyHoursSave: (hours: number | null) => void;
}) {
  const ringSize = compact ? 50 : 48;
  const palette = getDayPalette(day.dayIndex);

  const shellClass = perfect
    ? "day-card-header-perfect"
    : isToday
      ? [
          "day-card-header-tinted",
          "day-card-header-today",
          isFocused ? "day-card-header-focused ring-2 ring-white/70 ring-offset-2 ring-offset-th-page" : "",
        ]
          .filter(Boolean)
          .join(" ")
      : [
          "day-card-header-muted",
          isPast ? "day-card-header-past" : "",
          isFuture ? "day-card-header-future" : "",
        ]
          .filter(Boolean)
          .join(" ");

  return (
    <div
      className={`day-card-header relative flex shrink-0 flex-row items-center justify-between gap-2 rounded-xl px-3 py-2.5 ${shellClass}`}
      style={{
        minHeight: "var(--day-header-h)",
        ...(perfect
          ? {}
          : {
              "--day-from": palette.from,
              "--day-via": palette.via,
              "--day-to": palette.to,
              "--day-accent": palette.accent,
            }),
      }}
    >
      <div
        className={`pointer-events-none absolute inset-0 overflow-hidden rounded-xl ${
          isToday || perfect
            ? "bg-gradient-to-b from-white/20 via-white/5 to-black/10"
            : "bg-gradient-to-b from-white/50 via-white/25 to-white/5"
        }`}
      />
      {(isToday || perfect) && (
        <div className="pointer-events-none absolute -right-3 top-0 h-14 w-14 rounded-full bg-white/10 blur-xl" />
      )}

      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        {isToday && !perfect && (
          <span
            className="mb-0.5 w-fit rounded-full bg-white/95 px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider shadow-sm"
            style={{ color: palette.accent }}
          >
            Today
          </span>
        )}
        <p
          className={`day-card-header-day text-[10px] font-bold uppercase tracking-[0.14em] ${
            isToday || perfect ? "text-white/80" : ""
          }`}
        >
          {day.short}
        </p>
        <p
          className={`day-card-header-date text-base font-extrabold leading-tight tracking-tight ${
            isToday || perfect ? "text-white drop-shadow-sm" : ""
          }`}
        >
          {day.monthShort} {day.dayNum}
        </p>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-1">
        {perfect && <PerfectDayCrown size={13} className="absolute -top-1 right-0" aria-hidden />}
        <StudyHoursChip
          date={day.date}
          hours={studyHours}
          locked={studyHoursLocked}
          onDark={isToday || perfect}
          compact={compact}
          onSave={onStudyHoursSave}
        />
        <div
          className={`rounded-full p-0.5 ${
            isToday || perfect
              ? "bg-white/10 ring-1 ring-white/20 backdrop-blur-[2px]"
              : "bg-white/80 ring-1 ring-th-100"
          }`}
        >
          <DayRing percent={pct} size={ringSize} perfect={perfect} onDark={isToday || perfect} />
        </div>
      </div>
    </div>
  );
}

type ProgressView = "week" | "month";

function WeekBarChart({
  counts,
  totals,
  labels,
  todayIndex,
  maxHabits,
}: {
  counts: number[];
  totals: number[];
  labels: string[];
  todayIndex: number;
  maxHabits: number;
}) {
  const max = Math.max(...counts, maxHabits, 1);
  const barMaxH = 100;

  return (
    <div className="week-bar-chart flex h-full w-full items-end gap-1 px-0.5 md:gap-1.5">
      {counts.map((c, i) => {
        const barH = Math.max((c / max) * barMaxH, c > 0 ? 10 : 6);
        const dayTotal = totals[i] ?? maxHabits;
        const isToday = i === todayIndex;
        const isPerfect = dayTotal > 0 && c === dayTotal;
        const qualified = dayTotal > 0 && getCompletionPercent(c, dayTotal) >= GREEN_PERCENT;

        let barClass = "bg-th-100";
        if (isPerfect) barClass = "bg-gradient-to-t from-amber-500 to-amber-300";
        else if (qualified) barClass = "bg-grad-th-bar";
        else if (c > 0) barClass = "bg-th-300";

        return (
          <div key={`${labels[i]}-${i}`} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="week-bar-chart-col flex w-full flex-col items-center justify-end">
              {c > 0 && (
                <span className="mb-0.5 text-[9px] font-bold tabular-nums text-th-600 md:text-[10px]">{c}</span>
              )}
              <div
                className={`week-bar-chart-bar w-[78%] max-w-[36px] rounded-t-md shadow-sm transition-all duration-500 md:max-w-[44px] ${barClass} ${
                  isToday ? "ring-2 ring-th-600 ring-offset-1 ring-offset-[var(--surface-color)]" : ""
                }`}
                style={{ height: barH }}
              />
            </div>
            <span
              className={`mt-1.5 text-[10px] font-bold leading-none md:text-[11px] ${
                isToday ? "text-th-800" : "text-th-500"
              }`}
            >
              {labels[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MonthBarChart({
  counts,
  totals,
  labels,
  todayIndex,
  maxHabits,
  onBarClick,
}: {
  counts: number[];
  totals: number[];
  labels: string[];
  todayIndex: number;
  maxHabits: number;
  onBarClick?: (dayOfMonth: number) => void;
}) {
  const max = Math.max(...counts, maxHabits, 1);
  const barMaxH = 88;
  const dayCount = counts.length;

  return (
    <div className="month-bar-chart flex h-full w-full items-end gap-px">
      {counts.map((c, i) => {
        const barH = Math.max((c / max) * barMaxH, c > 0 ? 5 : 2);
        const dayTotal = totals[i] ?? maxHabits;
        const isToday = i === todayIndex;
        const isPerfect = dayTotal > 0 && c === dayTotal;
        const qualified = dayTotal > 0 && getCompletionPercent(c, dayTotal) >= GREEN_PERCENT;
        const pct = getCompletionPercent(c, dayTotal);
        const showLabel = i === 0 || i === dayCount - 1 || i % 5 === 0 || isToday;

        let barClass = "bg-th-100";
        if (isPerfect) barClass = "bg-gradient-to-t from-amber-500 to-amber-300";
        else if (isToday) barClass = "bg-grad-th-bar";
        else if (qualified) barClass = "bg-grad-th-bar";
        else if (c > 0) barClass = "bg-th-300";

        return (
          <button
            key={`${labels[i]}-${i}`}
            type="button"
            title={`Day ${labels[i]}: ${pct}% (${c}/${dayTotal})`}
            onClick={(e) => {
              e.stopPropagation();
              onBarClick?.(Number(labels[i]));
            }}
            className="month-bar-chart-col group flex min-w-0 flex-1 flex-col items-center border-none bg-transparent p-0"
          >
            <div className="flex w-full flex-col items-center justify-end">
              <div
                className={`month-bar-chart-bar w-[72%] max-w-[8px] rounded-t-[3px] transition-all duration-500 group-hover:opacity-80 md:max-w-[9px] ${barClass} ${
                  isToday ? "ring-1 ring-th-600 ring-offset-1 ring-offset-[var(--surface-color)]" : ""
                }`}
                style={{ height: barH }}
              />
            </div>
            {showLabel ? (
              <span
                className={`mt-1 text-[7px] font-bold leading-none md:text-[8px] ${
                  isToday ? "text-th-800" : "text-th-400"
                }`}
              >
                {labels[i]}
              </span>
            ) : (
              <span className="mt-1 h-[7px] md:h-[8px]" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}

function ProgressHero({
  avg,
  isMonth,
  weekTotal,
  greenDays,
  perfectDays,
}: {
  avg: number;
  isMonth: boolean;
  weekTotal: number;
  greenDays: number;
  perfectDays: number;
}) {
  return (
    <div className="progress-hero mb-3 rounded-xl border border-th-100-80 bg-grad-th-footer px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-th-500">
            {isMonth ? "Month average" : "Week average"}
          </p>
          <p className="mt-0.5 text-3xl font-extrabold tabular-nums leading-none text-th-800 md:text-4xl">{avg}%</p>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
          <div className="rounded-lg bg-white/60 px-2 py-1.5 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-th-500">
              {isMonth ? "Green" : "Done"}
            </p>
            <p className="text-sm font-extrabold tabular-nums text-th-800">
              {isMonth ? greenDays : weekTotal}
            </p>
          </div>
          <div className="rounded-lg bg-white/60 px-2 py-1.5 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-600">Perfect</p>
            <p className="text-sm font-extrabold tabular-nums text-amber-700">{perfectDays}</p>
          </div>
        </div>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-th-100">
        <div
          className="h-full rounded-full bg-grad-th-progress transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, avg))}%` }}
        />
      </div>
    </div>
  );
}

function ProgressEmptyState({
  isMonth,
  beforeTracking = false,
}: {
  isMonth: boolean;
  beforeTracking?: boolean;
}) {
  const bars = isMonth ? [0.3, 0.5, 0.2, 0.6, 0.4, 0.7, 0.35] : [0.4, 0.65, 0.3, 0.55, 0.45, 0.7, 0.5];

  return (
    <div className="flex h-full min-h-[72px] flex-1 flex-col items-center justify-center gap-3 px-2 py-2">
      {!beforeTracking && (
        <div className="flex h-16 w-full max-w-[200px] items-end justify-center gap-2">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-md bg-th-100"
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>
      )}
      <div className="text-center">
        <p className="text-xs font-bold text-th-700">No data yet</p>
        {!beforeTracking && (
          <p className="mt-0.5 max-w-[220px] text-[11px] leading-snug text-th-500">
            Log today&apos;s habits to see your {isMonth ? "monthly" : "weekly"} trend
          </p>
        )}
      </div>
    </div>
  );
}

function getWeekScoreMessage(avg: number): string {
  if (avg >= 100) return "Perfect week so far!";
  if (avg >= GREEN_PERCENT) return "You're on track this week";
  if (avg >= 40) return "Keep building momentum";
  if (avg > 0) return "Every check-in counts";
  return "Start with today's habits";
}

function WeekScorePanel({
  weeklyAvg,
  weekTotal,
  weekMaxPossible,
  streakCurrent,
  perfectDaysThisMonth,
  compact = false,
  inSheet = false,
}: {
  weeklyAvg: number;
  weekTotal: number;
  weekMaxPossible: number;
  streakCurrent: number;
  perfectDaysThisMonth: number;
  compact?: boolean;
  inSheet?: boolean;
}) {
  const donutSize = inSheet ? 132 : compact ? 92 : 108;
  const onTrack = weeklyAvg >= GREEN_PERCENT;

  return (
    <div
      className={`week-score-panel flex w-full flex-col items-center justify-center text-center ${
        inSheet ? "px-1 py-1" : compact ? "h-full px-3 py-3" : "h-full px-4 py-4"
      }`}
    >
      {!inSheet && (
        <div className="mb-2 flex items-center justify-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-th-100 text-th-600">
            <BarChart3 size={12} strokeWidth={2.5} />
          </span>
          <p className="text-xs font-bold uppercase tracking-widest text-th-600">Week Score</p>
        </div>
      )}

      <div className={`relative mx-auto flex items-center justify-center ${inSheet ? "mb-2" : "mb-3"}`}>
        <div className="week-score-glow pointer-events-none absolute inset-0 rounded-full" aria-hidden />
        <DonutChart percent={weeklyAvg} size={donutSize} id={`week-score-panel${compact ? "-m" : ""}`} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-extrabold leading-none tabular-nums text-th-800 ${
              inSheet ? "text-4xl" : compact ? "text-2xl" : "text-3xl"
            }`}
          >
            {weeklyAvg}%
          </span>
          <span
            className={`mt-0.5 font-semibold uppercase tracking-wider text-th-500 ${
              inSheet ? "text-xs" : "text-[10px]"
            }`}
          >
            weekly avg
          </span>
        </div>
      </div>

      <div className={`w-full ${compact ? "max-w-[220px]" : "max-w-[200px]"}`}>
        <div className="mb-1 flex items-center justify-between px-0.5 text-[10px] font-semibold text-th-500">
          <span>Weekly completion</span>
          <span className={onTrack ? "text-th-700" : "text-th-600"}>{weeklyAvg}%</span>
        </div>
        <div className="rounded-full bg-th-100 p-0.5 shadow-inner">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${
              onTrack ? "bg-grad-th-progress-alt" : "bg-grad-th-progress"
            }`}
            style={{ width: `${weeklyAvg}%` }}
          />
        </div>
        <p className="mt-1.5 text-[10px] font-medium text-th-500">
          Goal: <span className="font-bold text-th-700">{GREEN_PERCENT}%</span> to count as green
        </p>
      </div>

      <p className={`text-[11px] font-semibold text-th-700 ${inSheet ? "mt-1" : "mt-2"}`}>
        {weekTotal}
        <span className="font-medium text-th-500"> / {weekMaxPossible} check-ins</span>
      </p>
      <p className="mt-0.5 text-[10px] font-medium text-th-500">{getWeekScoreMessage(weeklyAvg)}</p>

      {(streakCurrent > 0 || perfectDaysThisMonth > 0) && (
        <div className={`flex flex-wrap items-center justify-center gap-1.5 ${inSheet ? "mt-1.5" : "mt-2.5"}`}>
          {streakCurrent > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-600">
              <Flame size={11} className="text-orange-500" />
              {streakCurrent}d streak
            </span>
          )}
          {perfectDaysThisMonth > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
              <PerfectDayCrown size={11} className="text-amber-500 !animate-none" />
              {perfectDaysThisMonth} perfect
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function OverallProgressPanel({
  view,
  onToggleView, 
  onPrevMonth,
  onNextMonth,
  onMonthBarClick,
  weekCounts,
  weekTotals,
  weekLabels,
  weekTodayIndex,
  monthStats,
  maxHabits,
  weekTotal,
  weekPerfectDays,
  weeklyAvg,
  trackingDaysInView,
  inSheet = false,
}: {
  view: ProgressView;
  onToggleView: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onMonthBarClick: (dayOfMonth: number) => void;
  weekCounts: number[];
  weekTotals: number[];
  weekLabels: string[];
  weekTodayIndex: number;
  monthStats: MonthBarStats;
  maxHabits: number;
  weekTotal: number;
  weekPerfectDays: number;
  weeklyAvg: number;
  trackingDaysInView: boolean;
  inSheet?: boolean;
}) {
  const isMonth = view === "month";
  const hasLoggedData = isMonth
    ? monthStats.totalChecks > 0
    : weekTotal > 0 || weekCounts.some((c) => c > 0);
  const hasData = trackingDaysInView && hasLoggedData;
  const avg = isMonth ? monthStats.avgPercent : weeklyAvg;
  const perfectDays = isMonth ? monthStats.perfectDays : weekPerfectDays;

  return (
    <div className={`progress-panel flex min-h-0 flex-col ${inSheet ? "gap-2" : "flex-1"}`}>
      <div className={`flex items-center justify-between gap-2 ${inSheet ? "mb-0" : "mb-3"}`}>
        {!inSheet && <PanelLabel icon={<BarChart3 size={10} />}>Progress</PanelLabel>}
        {inSheet && <span className="text-[10px] font-bold uppercase tracking-wider text-th-500">View</span>}
        <div className={`flex rounded-lg bg-th-100 p-0.5 ${inSheet ? "ml-auto" : ""}`}>
          <button
            type="button"
            onClick={() => !isMonth || onToggleView()}
            className={`rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition md:px-3.5 md:py-1 ${
              !isMonth ? "bg-white text-th-700 shadow-sm" : "text-th-500 hover:text-th-700"
            }`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => isMonth || onToggleView()}
            className={`rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition md:px-3.5 md:py-1 ${
              isMonth ? "bg-white text-th-700 shadow-sm" : "text-th-500 hover:text-th-700"
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {isMonth && (
        <div className={`flex items-center justify-between rounded-lg border border-th-100-80 bg-th-50-40 px-1 py-0.5 ${inSheet ? "mb-0" : "mb-3"}`}>
          <button
            type="button"
            onClick={onPrevMonth}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-th-600 transition hover:bg-th-100 active:bg-th-100 md:h-8 md:w-8"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} className="md:h-4 md:w-4" />
          </button>
          <span className="text-xs font-bold text-th-700">{monthStats.monthLabel}</span>
          <button
            type="button"
            onClick={onNextMonth}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-th-600 transition hover:bg-th-100 active:bg-th-100 md:h-8 md:w-8"
            aria-label="Next month"
          >
            <ChevronRight size={18} className="md:h-4 md:w-4" />
          </button>
        </div>
      )}

      {hasData && (
        <ProgressHero
          avg={avg}
          isMonth={isMonth}
          weekTotal={weekTotal}
          greenDays={monthStats.greenDays}
          perfectDays={perfectDays}
        />
      )}

      <div className={`flex items-center justify-between px-0.5 ${inSheet ? "mb-1" : "mb-2"}`}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-th-500">
          {isMonth ? "Daily trend" : "This week"}
        </p>
        {hasData && (
          <p className="text-[10px] font-semibold text-th-400">
            <span className="md:hidden">Tap chart to switch</span>
          </p>
        )}
      </div>

      <div
        className={`progress-chart-area progress-chart-card rounded-xl border border-th-100-80 bg-th-50-30 px-1.5 py-2 md:min-h-[124px] ${
          hasData ? "cursor-pointer transition hover:bg-th-50-60 active:bg-th-50-60" : ""
        }`}
        onClick={hasData ? onToggleView : undefined}
        role={hasData ? "button" : undefined}
        tabIndex={hasData ? 0 : undefined}
        onKeyDown={hasData ? (e) => e.key === "Enter" && onToggleView() : undefined}
        title={hasData ? "Click chart to toggle week / month" : undefined}
      >
        {!trackingDaysInView || !hasData ? (
          <ProgressEmptyState isMonth={isMonth} beforeTracking={!trackingDaysInView} />
        ) : isMonth ? (
          <MonthBarChart
            counts={monthStats.counts}
            totals={monthStats.totals}
            labels={monthStats.labels}
            todayIndex={monthStats.todayIndex}
            maxHabits={maxHabits}
            onBarClick={onMonthBarClick}
          />
        ) : (
          <WeekBarChart
            counts={weekCounts}
            totals={weekTotals}
            labels={weekLabels}
            todayIndex={weekTodayIndex}
            maxHabits={maxHabits}
          />
        )}
      </div>

      {isMonth && hasData && (
        <p className="mt-2 text-center text-[10px] font-medium text-th-500">
          {monthStats.totalChecks} check-ins · tap a bar to jump to that day
        </p>
      )}
    </div>
  );
}

// ─── Habit slots (fixed 7 rows) ────────────────────────────────────────────────

function HabitCheckbox({
  checked,
  disabled = false,
}: {
  checked: boolean;
  disabled?: boolean;
}) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border-2 md:h-4 md:w-4 ${
        checked
          ? "border-th-600 bg-th-600"
          : disabled
            ? "border-slate-300 bg-slate-50"
            : "border-slate-500 bg-white"
      }`}
      aria-hidden
    >
      {checked && (
        <Check className="animate-check-pop h-3 w-3 text-white md:h-2.5 md:w-2.5" strokeWidth={3} />
      )}
    </span>
  );
}

// ─── Task Checkbox ─────────────────────────────────────────────────────────────

function TaskCheck({
  checked,
  locked,
  onToggle,
  label,
}: {
  checked: boolean;
  locked: boolean;
  onToggle: () => void;
  label: string;
}) {
  if (locked) {
    return (
      <div
        className={`habit-slot-h flex items-center gap-2.5 rounded-md px-1.5 ${
          checked ? "bg-th-100-40" : ""
        }`}
      >
        <HabitCheckbox checked={checked} disabled />
        <span
          className={`min-w-0 flex-1 truncate text-xs font-medium leading-tight md:text-[11px] ${
            checked ? "text-habit-done line-through decoration-slate-400" : "text-habit-label"
          }`}
        >
          {label}
        </span>
        {!checked && <Lock size={10} className="shrink-0 text-slate-400" aria-hidden />}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-checked={checked}
      role="checkbox"
      className={`group habit-slot-h flex w-full items-center gap-2.5 rounded-md px-1.5 text-left transition-all active:scale-[0.98] ${
        checked ? "bg-th-100-60" : "hover:bg-white/70"
      }`}
    >
      <HabitCheckbox checked={checked} />
      <span
        className={`min-w-0 flex-1 truncate text-xs font-medium leading-tight md:text-[11px] ${
          checked ? "text-habit-done line-through decoration-slate-400" : "text-habit-label"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function HabitEmptySlot({ index }: { index: number }) {
  return <div className="habit-slot-h habit-slot-empty shrink-0 rounded-md" aria-hidden data-slot={index} />;
}

function DayHabitSlots({
  date,
  habits,
  locked,
  onToggle,
}: {
  date: DateStr;
  habits: Habit[];
  locked: boolean;
  onToggle: (habitId: string) => void;
}) {
  const tracking = isTrackingDate(date);
  const dayHabits = useMemo(() => getHabitsForDate(habits, date), [habits, date]);
  const overlayMessage = !tracking ? "No data yet" : dayHabits.length === 0 ? "No habits" : null;

  return (
    <div className="habit-slots-wrap shrink-0 p-1.5 md:p-1">
      <div className="habit-slots-stack relative flex flex-col gap-px">
        {Array.from({ length: MAX_HABITS }, (_, index) => {
          const habit = tracking ? dayHabits[index] : undefined;
          if (habit) {
            return (
              <TaskCheck
                key={habit.id}
                checked={isHabitDone(habit, date)}
                locked={locked}
                onToggle={() => onToggle(habit.id)}
                label={habit.name}
              />
            );
          }
          return <HabitEmptySlot key={`empty-${index}`} index={index} />;
        })}
        {overlayMessage && (
          <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-2 text-center text-xs font-bold text-th-500">
            {overlayMessage}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Reminder time picker (visible label + native picker) ────────────────────

function ReminderTimeField({
  value,
  onChange,
  disabled = false,
  size = "sm",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  "aria-label"?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const normalizedDraft = normalizeTimeValue(draft) ?? normalizeTimeValue(value) ?? value;
  const normalizedValue = normalizeTimeValue(value) ?? value;
  const dirty = normalizedDraft !== normalizedValue;
  const display = formatTimeDisplay(dirty ? normalizedDraft : value);

  const openPicker = () => {
    if (disabled) return;
    const input = inputRef.current;
    if (!input) return;
    try {
      input.showPicker?.();
    } catch {
      input.click();
    }
    input.focus();
  };

  const handleDraftChange = (raw: string) => {
    const normalized = normalizeTimeValue(raw);
    if (normalized) setDraft(normalized);
  };

  const handleSave = () => {
    const normalized = normalizeTimeValue(draft);
    if (!normalized) return;
    onChange(normalized);
  };

  return (
    <span className="time-field relative inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className={`time-field-btn rounded-md border border-th-200 bg-white font-semibold tabular-nums text-th-800 shadow-sm transition hover:border-th-300 hover:bg-th-50 disabled:cursor-not-allowed disabled:opacity-50 ${
          dirty ? "border-th-400 ring-1 ring-th-300" : ""
        } ${size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]"}`}
        aria-label={ariaLabel ?? `Reminder at ${display}`}
      >
        {display}
      </button>
      <input
        ref={inputRef}
        type="time"
        step={60}
        value={draft}
        disabled={disabled}
        onChange={(e) => handleDraftChange(e.target.value)}
        onInput={(e) => handleDraftChange(e.currentTarget.value)}
        className="time-field-native pointer-events-none absolute inset-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />
      {dirty && !disabled && (
        <button
          type="button"
          onClick={handleSave}
          className={`inline-flex shrink-0 items-center gap-0.5 rounded-md bg-grad-th-btn font-bold text-white shadow-sm transition hover:opacity-90 active:scale-95 ${
            size === "md" ? "px-2 py-1 text-[11px]" : "px-1.5 py-0.5 text-[9px]"
          }`}
          aria-label={`Save reminder time ${display}`}
        >
          <Check size={size === "md" ? 12 : 9} strokeWidth={3} />
          Save
        </button>
      )}
    </span>
  );
}

// ─── Habit master editor (collapsible) ───────────────────────────────────────

function HabitMasterEditor({
  habits,
  activeCount,
  open,
  onToggle,
  onAdd,
  canAdd,
  onUpdateName,
  onUpdateReminders,
  onRemove,
  embedded = false,
  tabbed = false,
}: {
  habits: Habit[];
  activeCount: number;
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  canAdd: boolean;
  onUpdateName: (id: string, name: string) => void;
  onUpdateReminders: (id: string, reminderTimes: string[]) => void;
  onRemove: (id: string) => void;
  embedded?: boolean;
  tabbed?: boolean;
}) {
  const habitsOpen = tabbed || open;
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const handleTestReminder = async (habitName: string, time: string, key: string) => {
    setTestingKey(key);
    setTestStatus(null);
    try {
      await sendHabitReminderPreview({ habitName, time, variant: "primary" });
      setTestStatus(`It times for "${habitName.trim() || "your habit"}" at ${formatTimeDisplay(time)}`);
    } catch (err) {
      setTestStatus(err instanceof Error ? err.message : "Reminder preview failed.");
    } finally {
      setTestingKey(null);
    }
  };

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${embedded ? "" : "shrink-0 border-t border-th-100"}`}>
      {!tabbed && (
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-2 px-2 py-2.5 text-left transition hover:bg-th-50-60 md:py-2"
          aria-expanded={open}
        >
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-th-100 text-th-600">
              <Pencil size={11} />
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-th-700">
              Manage Habits ({activeCount}/{MAX_HABITS})
            </span>
          </div>
          <ChevronDown
            size={16}
            className={`shrink-0 text-th-500 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}
      {habitsOpen && (
        <div className={`px-2 pb-2 pt-1 ${tabbed ? "flex min-h-0 flex-1 flex-col" : "border-t border-th-50"}`}>
          <p className="mb-2 shrink-0 text-[10px] leading-snug text-th-500">
            Turn on reminders in the bell menu. Set a time, tap Save — ntfy pings at that exact time.
          </p>
          <div className="mb-1 flex shrink-0 justify-end">
            <button
              type="button"
              onClick={onAdd}
              disabled={!canAdd}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold shadow-sm transition active:scale-95 ${
                canAdd
                  ? "bg-grad-th-btn text-white hover:shadow-md"
                  : "cursor-not-allowed bg-th-100 text-th-400"
              }`}
              aria-label="Add habit"
            >
              <Plus size={12} strokeWidth={2.5} />
              Add habit
            </button>
          </div>
          <div className={`habit-editor-list flex flex-col gap-1.5 ${tabbed ? "min-h-0 flex-1 scroll-thin" : ""}`}>
            {getActiveHabits(habits).map((h, i) => {
              const times = h.reminderTimes ?? [];
              return (
                <div
                  key={h.id}
                  className="group rounded-md border border-th-100-60 bg-white/60 px-2 py-1.5 transition hover:border-th-200 hover:bg-white"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: `var(--th-dot-${i % 6})` }}
                      aria-hidden
                    />
                    <input
                      type="text"
                      value={h.name}
                      onChange={(e) => onUpdateName(h.id, e.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-xs font-medium text-habit-label outline-none md:text-[11px]"
                      aria-label={`Edit habit name: ${h.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => onRemove(h.id)}
                      className="touch-target flex shrink-0 items-center justify-center rounded p-1 text-th-400 transition active:bg-red-50 active:text-red-500 hover:bg-red-50 hover:text-red-400"
                      aria-label={`Remove ${h.name}`}
                    >
                      <Trash2 size={12} className="md:h-[10px] md:w-[10px]" />
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-4">
                    <Clock size={10} className="shrink-0 text-th-400" aria-hidden />
                    {times.map((time, ti) => (
                      <span
                        key={`${h.id}-reminder-${ti}`}
                        className="inline-flex items-center gap-0.5 rounded-full border border-th-100 bg-th-50/80 pl-1.5 pr-0.5"
                      >
                        <ReminderTimeField
                          value={time}
                          onChange={(normalized) => {
                            const next = [...times];
                            next[ti] = normalized;
                            onUpdateReminders(h.id, sortReminderTimes(next));
                          }}
                          aria-label={`Reminder time ${ti + 1} for ${h.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => void handleTestReminder(h.name, time, `${h.id}-${ti}`)}
                          disabled={testingKey === `${h.id}-${ti}`}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-th-500 transition hover:bg-th-100 hover:text-th-700 disabled:opacity-50"
                          aria-label={`Preview reminder for ${h.name} at ${formatTimeDisplay(time)}`}
                          title="Preview reminder"
                        >
                          <BellRing size={10} className={testingKey === `${h.id}-${ti}` ? "animate-pulse" : ""} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateReminders(h.id, times.filter((_, idx) => idx !== ti))}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-th-400 hover:bg-th-100 hover:text-th-600"
                          aria-label={`Remove reminder ${time} for ${h.name}`}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const used = new Set(times);
                        const fallback = ["08:00", "12:00", "15:00", "18:00", "21:00"].find((t) => !used.has(t)) ?? "09:00";
                        const nextTimes = sortReminderTimes([...times, fallback]);
                        onUpdateReminders(h.id, nextTimes);
                      }}
                      className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-th-200 px-2 py-0.5 text-[10px] font-semibold text-th-600 hover:border-th-300 hover:bg-th-50"
                    >
                      <Plus size={10} />
                      Reminder
                    </button>
                    {times.length === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextTimes = sortReminderTimes(["08:00"]);
                          onUpdateReminders(h.id, nextTimes);
                        }}
                        className="inline-flex items-center gap-0.5 rounded-full border border-th-300 bg-th-50 px-2 py-0.5 text-[10px] font-semibold text-th-700 hover:bg-th-100"
                      >
                        <BellRing size={10} />
                        Add 8:00 AM
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {activeCount === 0 && (
              <p className="py-3 text-center text-xs text-th-400">No habits yet. Tap Add to get started.</p>
            )}
            {testStatus && (
              <p className="mt-1 shrink-0 rounded-lg border border-th-100 bg-th-50/80 px-2 py-1.5 text-[10px] font-medium leading-snug text-th-600">
                {testStatus}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type ManagePanelView = "habits" | "activity";
type MobileInsightsTab = "score" | "progress" | "manage";

const MOBILE_INSIGHTS_TITLES: Record<MobileInsightsTab, string> = {
  score: "Week Score",
  progress: "Progress",
  manage: "Habits",
};

function MobileInsightsTabs({
  active,
  onChange,
}: {
  active: MobileInsightsTab | null;
  onChange: (tab: MobileInsightsTab) => void;
}) {
  const tabs: { id: MobileInsightsTab; label: string; icon: React.ReactNode }[] = [
    { id: "score", label: "Score", icon: <BarChart3 size={14} /> },
    { id: "progress", label: "Progress", icon: <CalendarDays size={14} /> },
    { id: "manage", label: "Habits", icon: <Pencil size={14} /> },
  ];

  return (
    <div className="mobile-insights-tabs grid grid-cols-3 gap-0.5 p-1" role="tablist" aria-label="Insights">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-expanded={isActive}
            onClick={() => onChange(tab.id)}
            className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-bold transition active:scale-[0.97] ${
              isActive
                ? "bg-[var(--surface-color)] text-th-800 shadow-sm"
                : "text-th-500"
            }`}
          >
            <span className={isActive ? "text-th-600" : "text-th-400"}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MobileInsightsSheet({
  tab,
  onClose,
  children,
}: {
  tab: MobileInsightsTab;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="mobile-insights-overlay fixed inset-x-0 top-0 z-[10050] flex flex-col justify-end"
      style={{ bottom: "var(--mobile-dock-h)" }}
      role="presentation"
    >
      <button
        type="button"
        className="mobile-insights-backdrop absolute inset-0 bg-black/40"
        aria-label="Close panel"
        onClick={onClose}
      />
      <div
        className="mobile-insights-sheet relative z-10 flex flex-col overflow-hidden"
        data-tab={tab}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-insights-sheet-title"
      >
        <div className="mobile-insights-sheet-grabber shrink-0 pt-2" aria-hidden>
          <span className="mobile-insights-sheet-grabber-bar" />
        </div>
        <div className="mobile-insights-sheet-header flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-0.5">
          <h2 id="mobile-insights-sheet-title" className="text-[15px] font-extrabold tracking-tight text-th-800">
            {MOBILE_INSIGHTS_TITLES[tab]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-th-50 text-th-500 transition active:scale-95"
            aria-label="Close"
          >
            <X size={17} strokeWidth={2.5} />
          </button>
        </div>
        <div className="mobile-insights-sheet-body min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-thin px-3 pb-3 pt-1">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ManageHabitsActivityPanel({
  view,
  onViewChange,
  activeCount,
  habits,
  habitsEditorOpen,
  onToggleHabitsEditor,
  onAdd,
  canAdd,
  onUpdateName,
  onUpdateReminders,
  onRemove,
  onDayClick,
  selectedDate,
  inSheet = false,
}: {
  view: ManagePanelView;
  onViewChange: (view: ManagePanelView) => void;
  activeCount: number;
  habits: Habit[];
  habitsEditorOpen: boolean;
  onToggleHabitsEditor: () => void;
  onAdd: () => void;
  canAdd: boolean;
  onUpdateName: (id: string, name: string) => void;
  onUpdateReminders: (id: string, reminderTimes: string[]) => void;
  onRemove: (id: string) => void;
  onDayClick: (date: DateStr) => void;
  selectedDate: DateStr | null;
  inSheet?: boolean;
}) {
  const tabClass = (active: boolean) =>
    `flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-md px-2 py-2 text-[10px] font-bold uppercase tracking-wide transition md:min-h-0 md:py-1.5 ${
      active ? "bg-th-600 text-white shadow-sm" : "bg-th-100 text-th-600 hover:bg-th-200/80"
    }`;

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden ${inSheet ? "" : "flex-1"}`}>
      <div className={`flex shrink-0 gap-1 border-b border-th-100 px-1 py-1.5 ${inSheet ? "" : "px-2 py-2"}`}>
        <button type="button" className={tabClass(view === "habits")} onClick={() => onViewChange("habits")}>
          <Pencil size={11} />
          Habits ({activeCount})
        </button>
        <button type="button" className={tabClass(view === "activity")} onClick={() => onViewChange("activity")}>
          <CalendarDays size={11} />
          Calendar
        </button>
      </div>

      {view === "habits" ? (
        <HabitMasterEditor
          habits={habits}
          activeCount={activeCount}
          open={habitsEditorOpen}
          onToggle={onToggleHabitsEditor}
          onAdd={onAdd}
          canAdd={canAdd}
          onUpdateName={onUpdateName}
          onUpdateReminders={onUpdateReminders}
          onRemove={onRemove}
          embedded
          tabbed
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-1">
          <MonthlyActivityGrid habits={habits} onDayClick={onDayClick} selectedDate={selectedDate} />
        </div>
      )}
    </div>
  );
}

// ─── Theme picker ────────────────────────────────────────────────────────────

const THEME_MENU_WIDTH = 300;

function ThemeSwatch({ preset }: { preset: ThemePresetDef }) {
  if (preset.mode === "glass") {
    return (
      <span className="theme-swatch theme-swatch--glass" style={{ "--swatch-accent": preset.accent } as React.CSSProperties}>
        <span className="theme-swatch-glass-shine" />
      </span>
    );
  }
  if (preset.mode === "dark") {
    return (
      <span className="theme-swatch theme-swatch--dark" style={{ "--swatch-accent": preset.accent } as React.CSSProperties}>
        <span className="theme-swatch-dark-core" />
      </span>
    );
  }
  return (
    <span
      className="theme-swatch"
      style={{ background: `linear-gradient(145deg, ${preset.accent}, color-mix(in srgb, ${preset.accent} 70%, #000))` }}
    />
  );
}

const NOTIFICATION_MENU_WIDTH = 300;

function NotificationPanel({
  settings,
  onChange,
}: {
  settings: NotificationSettings;
  onChange: (next: NotificationSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, bottom: undefined as number | undefined });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const updateMenuPos = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(NOTIFICATION_MENU_WIDTH, window.innerWidth - 16);
    const mobile = window.innerWidth <= 767;
    if (mobile) {
      setMenuPos({
        top: 0,
        left: 8,
        bottom: Math.max(8, parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom") || "0", 10) || 8),
      });
      return;
    }
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setMenuPos({ top: rect.bottom + 8, left, bottom: undefined });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPos();
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onReposition = () => updateMenuPos();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, updateMenuPos]);

  const patchSettings = (patch: Partial<NotificationSettings>) => {
    onChange(
      normalizeNotificationSettings({
        ...settings,
        ...patch,
        timezone: getDeviceTimezone(),
      })
    );
  };

  const handleToggleEnabled = () => {
    const next = !settings.enabled;
    onChange(
      normalizeNotificationSettings({
        ...settings,
        enabled: next,
        timezone: getDeviceTimezone(),
      })
    );
    setStatus(next ? "Reminders enabled." : "Reminders turned off.");
  };

  const handleTest = async () => {
    setStatus(null);
    setBusy(true);
    try {
      await sendTestNtfyNotification();
      setStatus("Notification sent to ntfy.sh/Tracker — check the ntfy app.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Notification failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) updateMenuPos();
          setOpen((v) => !v);
        }}
        className={`notification-trigger flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition ${
          open || settings.enabled
            ? "border-th-400 bg-[var(--surface-color)] text-th-700 ring-2 ring-th-300"
            : "border-th-200 bg-[var(--surface-color)] text-th-600 hover:border-th-300 hover:bg-th-50"
        }`}
        aria-label={settings.enabled ? "Reminders on" : "Reminders off"}
        aria-expanded={open}
        title="Habit reminders"
      >
        {settings.enabled ? <BellRing size={16} /> : <Bell size={16} />}
      </button>

      {open &&
        createPortal(
          <>
            <div
              className="notification-backdrop fixed inset-0 z-[9998] bg-black/30 md:hidden"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              ref={menuRef}
              className="notification-menu fixed z-[9999] max-h-[min(78vh,520px)] overflow-y-auto rounded-2xl border border-th-200 bg-white p-3 shadow-2xl scroll-thin max-md:rounded-b-none max-md:border-b-0"
              style={{
                top: menuPos.bottom !== undefined ? undefined : menuPos.top,
                bottom: menuPos.bottom,
                left: menuPos.left,
                width: Math.min(NOTIFICATION_MENU_WIDTH, window.innerWidth - 16),
              }}
              role="dialog"
              aria-label="Notification settings"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-th-800">Habit reminders</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-th-500 hover:bg-th-50"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <label className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-th-100 bg-th-50/80 px-3 py-2.5">
                <span className="text-xs font-semibold text-th-700">Enable reminders</span>
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  disabled={busy}
                  onChange={handleToggleEnabled}
                  className="h-4 w-4 accent-th-600"
                />
              </label>

              <div className={`space-y-2.5 ${settings.enabled ? "" : "pointer-events-none opacity-50"}`}>
                <label className="flex items-center justify-between gap-2 rounded-xl border border-th-100 px-3 py-2">
                  <span className="text-xs font-medium text-th-700">Morning kickoff</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.morningEnabled}
                      disabled={busy}
                      onChange={(e) => patchSettings({ morningEnabled: e.target.checked })}
                      className="h-4 w-4 accent-th-600"
                    />
                    <ReminderTimeField
                      value={settings.morningTime}
                      disabled={busy || !settings.morningEnabled}
                      size="md"
                      onChange={(normalized) => patchSettings({ morningTime: normalized })}
                    />
                  </div>
                </label>

                <label className="flex items-center justify-between gap-2 rounded-xl border border-th-100 px-3 py-2">
                  <span className="text-xs font-medium text-th-700">Evening nudge</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.eveningEnabled}
                      disabled={busy}
                      onChange={(e) => patchSettings({ eveningEnabled: e.target.checked })}
                      className="h-4 w-4 accent-th-600"
                    />
                    <ReminderTimeField
                      value={settings.eveningTime}
                      disabled={busy || !settings.eveningEnabled}
                      size="md"
                      onChange={(normalized) => patchSettings({ eveningTime: normalized })}
                    />
                  </div>
                </label>

            

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleTest()}
                  className="w-full rounded-xl border border-th-200 bg-white px-3 py-2 text-xs font-semibold text-th-700 transition hover:bg-th-50 disabled:opacity-50"
                >
                  Send test notification
                </button>
                <p className="text-[10px] leading-snug text-th-500">
                  Keep this enabled for scheduled habit pings. Subscribe to <strong>Tracker</strong> in the{" "}
                  <a href={NTFY_SUBSCRIBE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-th-700 underline">
                    ntfy app
                  </a>{" "}
                  first. Use the bell on each habit reminder to preview that ping.
                </p>
              </div>

              {status && <p className="mt-2 text-[11px] font-medium text-th-600">{status}</p>}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

function ThemePicker({
  themeId,
  customAccent,
  isDaily,
  onSelectPreset,
  onCustomAccent,
  onUseDailyTheme,
}: {
  themeId: ThemeId;
  customAccent: string;
  isDaily: boolean;
  onSelectPreset: (id: ThemePresetId) => void;
  onCustomAccent: (hex: string) => void;
  onUseDailyTheme: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, bottom: undefined as number | undefined });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPos = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(THEME_MENU_WIDTH, window.innerWidth - 16);
    const mobile = window.innerWidth <= 767;
    if (mobile) {
      setMenuPos({
        top: 0,
        left: 8,
        bottom: Math.max(8, parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom") || "0", 10) || 8),
      });
      return;
    }
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setMenuPos({ top: rect.bottom + 8, left, bottom: undefined });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPos();
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onReposition = () => updateMenuPos();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, updateMenuPos]);

  const accent = isDaily ? customAccent : resolveThemeAccent(themeId, customAccent);
  const activeName = isDaily
    ? "Daily"
    : themeId === "custom"
      ? "Custom"
      : (resolveThemePreset(themeId)?.name ?? "Theme");
  const presetGroups: { label: string; mode: ThemeMode }[] = [
    { label: "Light", mode: "light" },
    { label: "Glass", mode: "glass" },
    { label: "Dark", mode: "dark" },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) updateMenuPos();
          setOpen((v) => !v);
        }}
        className={`theme-picker-trigger flex items-center gap-1.5 rounded-full border px-2.5 py-1 shadow-sm transition ${
          open
            ? "border-th-400 bg-[var(--surface-color)] text-th-700 ring-2 ring-th-300"
            : "border-th-200 bg-[var(--surface-color)] text-th-600 hover:border-th-300 hover:bg-th-50"
        }`}
        aria-label={`Theme: ${activeName}`}
        aria-expanded={open}
        title={`Theme: ${activeName}`}
      >
        <Palette size={14} className="shrink-0" />
        <span
          className="h-4 w-4 shrink-0 rounded-full border border-black/10 shadow-inner"
          style={{ backgroundColor: accent }}
        />
        <span className="hidden max-w-[72px] truncate text-[10px] font-bold text-th-700 sm:inline">{activeName}</span>
      </button>
      {open &&
        createPortal(
          <>
            <button
              type="button"
              className="theme-picker-backdrop fixed inset-0 z-[9998] bg-black/30 md:hidden"
              aria-label="Close theme menu"
              onClick={() => setOpen(false)}
            />
            <div
              ref={menuRef}
              className="theme-picker-menu fixed z-[9999] max-h-[min(78vh,520px)] overflow-y-auto rounded-2xl border border-th-200 p-3 shadow-2xl scroll-thin max-md:rounded-b-none max-md:border-b-0"
              style={{
                top: menuPos.bottom !== undefined ? undefined : menuPos.top,
                bottom: menuPos.bottom,
                left: menuPos.left,
                right: menuPos.bottom !== undefined ? 8 : undefined,
                width: menuPos.bottom !== undefined ? undefined : Math.min(THEME_MENU_WIDTH, window.innerWidth - 16),
              }}
            >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-th-800">Themes</p>
              <span className="truncate text-[10px] font-semibold text-th-500">{activeName}</span>
            </div>
            {isDaily ? (
              <p className="mb-3 rounded-lg border border-th-100-80 bg-th-50-40 px-2 py-1.5 text-[10px] leading-snug text-th-600">
                A fresh glass palette is picked automatically each day.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onUseDailyTheme();
                  setOpen(false);
                }}
                className="mb-3 w-full rounded-lg border border-th-200 bg-th-50-40 px-2 py-1.5 text-[10px] font-bold text-th-700 transition hover:bg-th-50"
              >
                Use today&apos;s daily theme
              </button>
            )}
            {presetGroups.map((group) => {
              const presets = THEME_PRESETS.filter((p) => p.mode === group.mode);
              if (presets.length === 0) return null;
              return (
                <div key={group.mode} className="mb-3 last:mb-0">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-th-500">{group.label}</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {presets.map((preset) => {
                      const selected = themeId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            onSelectPreset(preset.id);
                            setOpen(false);
                          }}
                          title={preset.name}
                          className={`theme-picker-option relative flex flex-col items-center gap-1 rounded-xl p-1.5 transition ${
                            selected
                              ? "bg-th-50 ring-2 ring-th-600"
                              : "ring-1 ring-th-100 hover:bg-th-50"
                          }`}
                          aria-label={`${preset.name} theme`}
                          aria-pressed={selected}
                        >
                          <ThemeSwatch preset={preset} />
                          <span className="w-full truncate text-center text-[9px] font-semibold leading-none text-th-700">
                            {preset.name}
                          </span>
                          {selected && (
                            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-th-600 text-white shadow-sm">
                              <Check size={10} strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div className="mt-3 border-t border-th-200 pt-3">
              <label
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-2.5 py-2 transition ${
                  themeId === "custom"
                    ? "border-th-400 bg-th-50 ring-2 ring-th-500"
                    : "border-th-100 bg-[var(--surface-muted)] hover:border-th-200"
                }`}
              >
                <span className="text-[11px] font-semibold text-th-800">Custom color</span>
                <input
                  type="color"
                  value={customAccent}
                  onChange={(e) => onCustomAccent(e.target.value)}
                  className="h-8 w-14 cursor-pointer rounded-lg border border-th-200 bg-white p-0.5 shadow-sm"
                  aria-label="Pick custom accent color"
                />
              </label>
              {themeId === "custom" && (
                <p className="mt-1.5 text-[10px] font-medium text-th-600">Using your custom accent</p>
              )}
            </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}

// ─── Loading ─────────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="bg-dashboard flex h-full flex-col items-center justify-center gap-3">
      <div className="relative">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-th-100 border-t-th-600" />
        <div className="absolute inset-0 m-auto h-3 w-3 rounded-full bg-th-500-30" />
      </div>
      <p className="text-xs font-semibold text-th-700">Loading Tracker…</p>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function ProductivityDashboard() {
  const [habits, setHabits] = useState<Habit[]>(DEFAULT_HABITS);
  const [weeklyFocus, setWeeklyFocus] = useState(DEFAULT_STATE.weeklyFocus);
  const [reward, setReward] = useState(DEFAULT_STATE.reward);
  const [affirmation, setAffirmation] = useState(DEFAULT_STATE.affirmation);
  const [weekStart, setWeekStart] = useState(DEFAULT_STATE.weekStart);
  const [isLoading, setIsLoading] = useState(true);
  const [progressView, setProgressView] = useState<ProgressView>("week");
  const [progressMonth, setProgressMonth] = useState(getCurrentMonthYear);
  const [focusedDate, setFocusedDate] = useState<DateStr | null>(null);
  const [habitsEditorOpen, setHabitsEditorOpen] = useState(true);
  const [managePanelView, setManagePanelView] = useState<ManagePanelView>("habits");
  const [mobileInsightsSheet, setMobileInsightsSheet] = useState<MobileInsightsTab | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>(() => getDailyTheme().themeId);
  const [customAccent, setCustomAccent] = useState(() => getDailyTheme().customAccent);
  const [themeManualDate, setThemeManualDate] = useState<DateStr | null>(null);
  const [notifications, setNotifications] = useState<NotificationSettings>(() => ({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    timezone: getDeviceTimezone(),
  }));
  const [studyHours, setStudyHours] = useState<Record<DateStr, number>>({});
  const dayColumnsScrollRef = useRef<HTMLDivElement>(null);
  const isHydrated = useRef(false);
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  const scheduleReminders = useCallback((nextHabits: Habit[]) => {
    if (!notificationsRef.current.enabled) return;
    void scheduleHabitReminders({
      habits: nextHabits,
      notifications: notificationsRef.current,
    }).catch((err) => console.warn("Failed to schedule reminders:", err));
  }, []);
  const latestSnapshotRef = useRef<DashboardState | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "offline">("idle");
  const isMobile = useIsMobile();
  const todayStr = getTodayStr();
  const activeTheme = useMemo(
    () => resolveActiveTheme(todayStr, themeId, customAccent, themeManualDate),
    [todayStr, themeId, customAccent, themeManualDate]
  );
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekRange = useMemo(() => formatWeekRange(weekDays), [weekDays]);
  const todayIndex = useMemo(() => weekDays.findIndex((d) => d.date === todayStr), [weekDays, todayStr]);
  const isCurrentWeek = todayIndex >= 0;

  const weeklyAvg = useMemo(() => getWeeklyAverage(habits, weekDays), [habits, weekDays]);
  const barCounts = useMemo(() => weekDays.map((d) => getDayDoneCount(habits, d.date)), [habits, weekDays]);
  const barTotals = useMemo(() => weekDays.map((d) => getActiveHabitCount(habits, d.date)), [habits, weekDays]);
  const barLabels = useMemo(() => weekDays.map((d) => d.short), [weekDays]);
  const totalDone = useMemo(() => getTotalCompletions(habits, weekDays), [habits, weekDays]);
  const weekMaxPossible = useMemo(() => getWeekMaxPossible(habits, weekDays), [habits, weekDays]);
  const maxActiveHabits = useMemo(
    () => Math.max(...weekDays.map((d) => getActiveHabitCount(habits, d.date)), 1),
    [habits, weekDays]
  );
  const streakStats = useMemo(() => getStreakStats(habits), [habits]);
  const monthBarStats = useMemo(
    () => getMonthBarStats(habits, progressMonth.year, progressMonth.month),
    [habits, progressMonth.year, progressMonth.month]
  );
  const perfectDaysThisMonth = useMemo(() => {
    const { year, month } = getCurrentMonthYear();
    return countPerfectDaysInMonth(habits, year, month);
  }, [habits]);
  const weekPerfectDays = useMemo(() => countPerfectDaysInWeek(habits, weekDays), [habits, weekDays]);
  const weekTrackingDaysInView = useMemo(
    () => weekDays.some((d) => isTrackingDate(d.date)),
    [weekDays]
  );
  const monthTrackingDaysInView = useMemo(() => {
    const daysInMonth = new Date(Date.UTC(progressMonth.year, progressMonth.month + 1, 0)).getUTCDate();
    const monthEnd = dateStrFromParts(progressMonth.year, progressMonth.month + 1, daysInMonth);
    return monthEnd >= DATA_START_DATE;
  }, [progressMonth.year, progressMonth.month]);
  const progressTrackingDaysInView =
    progressView === "month" ? monthTrackingDaysInView : weekTrackingDaysInView;

  const focusDay = useCallback((date: DateStr) => {
    setWeekStart(getWeekStartForDate(date));
    setFocusedDate(date);
    const [y, m] = date.split("-").map(Number);
    setProgressMonth({ year: y, month: m - 1 });
  }, []);

  useEffect(() => {
    if (!focusedDate) return;

    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(`day-col-${focusedDate}`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 80);

    const clearTimer = window.setTimeout(() => setFocusedDate(null), 2500);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [focusedDate, weekStart]);

  useEffect(() => {
    if (!isMobile || isLoading || todayIndex < 0) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`day-col-${todayStr}`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isMobile, isLoading, weekStart, todayStr, todayIndex]);

  const applyLoadedState = useCallback((saved: DashboardState | null | undefined) => {
    if (saved) {
      let ws = getWeekStartForDate(saved.weekStart ?? getDefaultWeekStart());
      if (!weekContainsDate(ws, getTodayStr())) {
        ws = getDefaultWeekStart();
      }
      const loadedThemeId = normalizeThemeId(saved.themeId);
      const loadedAccent = saved.customAccent ?? DEFAULT_CUSTOM_ACCENT;
      setWeekStart(ws);
      setHabits(
        saved.habits?.length ? migrateHabits(saved.habits as LegacyHabit[], ws) : []
      );
      setWeeklyFocus(saved.weeklyFocus ?? "");
      setReward(saved.reward ?? "");
      setAffirmation(saved.affirmation ?? "");
      setThemeId(loadedThemeId);
      setCustomAccent(loadedAccent);
      setThemeManualDate(saved.themeManualDate ?? null);
      if (saved.notifications) {
        setNotifications(normalizeNotificationSettings(saved.notifications));
      }
      setStudyHours(sanitizeStudyHours(saved.studyHours));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLocalState(): Promise<DashboardState | null> {
      let saved = await localforage.getItem<DashboardState>(STORAGE_KEY);
      if (!saved) {
        const legacy = await localforage.getItem<DashboardState>(LEGACY_STORAGE_KEY);
        if (legacy) {
          saved = {
            ...legacy,
            weekStart: getDefaultWeekStart(),
            habits: migrateHabits(legacy.habits as LegacyHabit[], getDefaultWeekStart()),
          };
        }
      }
      return saved;
    }

    async function loadState() {
      try {
        let saved: DashboardState | null = null;

        try {
          const remote = await fetchDashboardState();
          if (remote) {
            saved = remote as DashboardState;
            await localforage.setItem(STORAGE_KEY, saved);
            setSyncStatus("idle");
          } else {
            const local = await loadLocalState();
            if (local) {
              saved = local;
              try {
                await saveDashboardStateRemote(local);
                setSyncStatus("idle");
              } catch (err) {
                console.warn("Failed to migrate local data to server:", err);
                setSyncStatus("offline");
              }
            }
          }
        } catch (err) {
          console.warn("Remote load failed, using local cache:", err);
          saved = await loadLocalState();
          setSyncStatus("offline");
        }

        if (cancelled) return;
        applyLoadedState(saved);
      } catch (err) {
        console.error("Failed to load:", err);
      } finally {
        if (!cancelled) {
          isHydrated.current = true;
          setIsLoading(false);
        }
      }
    }

    loadState();
    return () => { cancelled = true; };
  }, [applyLoadedState]);

  useEffect(() => {
    if (!isHydrated.current) return;

    const snapshot: DashboardState = {
      habits,
      weeklyFocus,
      reward,
      affirmation,
      weekStart,
      themeId,
      customAccent,
      themeManualDate: themeManualDate ?? undefined,
      notifications: normalizeNotificationSettings(notifications),
      studyHours: sanitizeStudyHours(studyHours),
    };

    latestSnapshotRef.current = snapshot;
    void localforage.setItem(STORAGE_KEY, snapshot).catch((err) => console.error("Failed to save locally:", err));

    setSyncStatus("syncing");
    saveChainRef.current = saveChainRef.current
      .catch(() => undefined)
      .then(() => saveDashboardStateRemote(snapshot))
      .then(() => setSyncStatus("idle"))
      .catch((err) => {
        console.warn("Remote save failed:", err);
        setSyncStatus("offline");
      });
  }, [habits, weeklyFocus, reward, affirmation, weekStart, themeId, customAccent, themeManualDate, notifications, studyHours]);

  useEffect(() => {
    if (!isHydrated.current || isLoading || !notifications.enabled) return;
    scheduleReminders(habits);
  }, [isLoading, notifications.enabled, habits, scheduleReminders]);

  useEffect(() => {
    const flushOnExit = () => {
      const snapshot = latestSnapshotRef.current;
      if (snapshot) saveDashboardStateKeepalive(snapshot);
    };
    window.addEventListener("pagehide", flushOnExit);
    return () => window.removeEventListener("pagehide", flushOnExit);
  }, []);

  useEffect(() => {
    applyTheme(activeTheme.themeId, activeTheme.customAccent, activeTheme.mode);
  }, [activeTheme]);

  const toggleHabit = useCallback((habitId: string, date: DateStr) => {
    if (!isEditableDate(date)) return;
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habitId || !isHabitActiveOnDate(h, date)) return h;
        const next = { ...h.completions };
        if (next[date]) delete next[date];
        else next[date] = true;
        return { ...h, completions: next };
      })
    );
  }, []);

  const updateHabitName = useCallback((habitId: string, name: string) => {
    setHabits((prev) => prev.map((h) => (h.id === habitId ? { ...h, name } : h)));
  }, []);

  const updateHabitReminders = useCallback((habitId: string, reminderTimes: string[]) => {
    const sorted = sortReminderTimes(reminderTimes);
    setHabits((prev) => {
      const next = prev.map((h) =>
        h.id === habitId ? { ...h, reminderTimes: sorted.length ? sorted : undefined } : h
      );
      scheduleReminders(next);
      return next;
    });
  }, [scheduleReminders]);

  const updateStudyHours = useCallback((date: DateStr, hours: number | null) => {
    if (!isStudyHoursEditable(date)) return;
    setStudyHours((prev) => {
      const next = { ...prev };
      if (hours === null || hours <= 0) delete next[date];
      else next[date] = normalizeStudyHoursValue(hours);
      return next;
    });
  }, []);

  const addHabit = useCallback(() => {
    const today = getTodayStr();
    setHabits((prev) => {
      if (getActiveHabits(prev).length >= MAX_HABITS) return prev;
      const index = getActiveHabits(prev).length;
      return [
        ...prev,
        {
          id: `habit-${Date.now()}`,
          name: "New habit",
          completions: {},
          createdAt: today,
          reminderTimes: defaultReminderTimesForIndex(index),
        },
      ];
    });
  }, []);

  const activeHabits = useMemo(() => getActiveHabits(habits), [habits]);
  const canAddHabit = activeHabits.length < MAX_HABITS;

  const removeHabit = useCallback((habitId: string) => {
    const today = getTodayStr();
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habitId || h.deletedAt) return h;
        const completions = { ...h.completions };
        for (const d of Object.keys(completions)) {
          if (d >= today) delete completions[d];
        }
        return { ...h, deletedAt: today, completions };
      })
    );
  }, []);

  if (isLoading) return <LoadingScreen />;

  const progressPanel = (
    <OverallProgressPanel
      view={progressView}
      onToggleView={() => setProgressView((v) => (v === "week" ? "month" : "week"))}
      onPrevMonth={() => setProgressMonth((m) => shiftMonth(m.year, m.month, -1))}
      onNextMonth={() => setProgressMonth((m) => shiftMonth(m.year, m.month, 1))}
      onMonthBarClick={(dayOfMonth) =>
        focusDay(dateFromMonthDay(progressMonth.year, progressMonth.month, dayOfMonth))
      }
      weekCounts={barCounts}
      weekTotals={barTotals}
      weekLabels={barLabels}
      weekTodayIndex={todayIndex}
      monthStats={monthBarStats}
      maxHabits={maxActiveHabits}
      weekTotal={totalDone}
      weekPerfectDays={weekPerfectDays}
      weeklyAvg={weeklyAvg}
      trackingDaysInView={progressTrackingDaysInView}
    />
  );

  const managePanel = (
    <ManageHabitsActivityPanel
      view={managePanelView}
      onViewChange={setManagePanelView}
      activeCount={activeHabits.length}
      habits={habits}
      habitsEditorOpen={habitsEditorOpen}
      onToggleHabitsEditor={() => setHabitsEditorOpen((v) => !v)}
      onAdd={addHabit}
      canAdd={canAddHabit}
      onUpdateName={updateHabitName}
      onUpdateReminders={updateHabitReminders}
      onRemove={removeHabit}
      onDayClick={focusDay}
      selectedDate={focusedDate}
    />
  );

  const scoreSheetPanel = (
    <WeekScorePanel
      weeklyAvg={weeklyAvg}
      weekTotal={totalDone}
      weekMaxPossible={weekMaxPossible}
      streakCurrent={streakStats.current}
      perfectDaysThisMonth={perfectDaysThisMonth}
      inSheet
    />
  );

  const progressSheetPanel = (
    <OverallProgressPanel
      view={progressView}
      onToggleView={() => setProgressView((v) => (v === "week" ? "month" : "week"))}
      onPrevMonth={() => setProgressMonth((m) => shiftMonth(m.year, m.month, -1))}
      onNextMonth={() => setProgressMonth((m) => shiftMonth(m.year, m.month, 1))}
      onMonthBarClick={(dayOfMonth) =>
        focusDay(dateFromMonthDay(progressMonth.year, progressMonth.month, dayOfMonth))
      }
      weekCounts={barCounts}
      weekTotals={barTotals}
      weekLabels={barLabels}
      weekTodayIndex={todayIndex}
      monthStats={monthBarStats}
      maxHabits={maxActiveHabits}
      weekTotal={totalDone}
      weekPerfectDays={weekPerfectDays}
      weeklyAvg={weeklyAvg}
      trackingDaysInView={progressTrackingDaysInView}
      inSheet
    />
  );

  const manageSheetPanel = (
    <ManageHabitsActivityPanel
      view={managePanelView}
      onViewChange={setManagePanelView}
      activeCount={activeHabits.length}
      habits={habits}
      habitsEditorOpen={habitsEditorOpen}
      onToggleHabitsEditor={() => setHabitsEditorOpen((v) => !v)}
      onAdd={addHabit}
      canAdd={canAddHabit}
      onUpdateName={updateHabitName}
      onUpdateReminders={updateHabitReminders}
      onRemove={removeHabit}
      onDayClick={focusDay}
      selectedDate={focusedDate}
      inSheet
    />
  );

  return (
    <div className="dashboard-root bg-dashboard safe-pt safe-px max-md:pb-0 safe-pb flex min-h-dvh flex-col font-sans text-th-900 md:h-full md:overflow-hidden">
      {/* Title bar */}
      <header className="dashboard-header home-header sticky top-0 z-30 mb-0 flex shrink-0 flex-col gap-2 animate-fade-up md:static md:mb-1.5 md:flex-row md:items-center md:justify-between md:gap-2">
        <div className="home-header-top flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src="/logo.png"
              alt=""
              className="home-logo h-9 w-9 shrink-0 rounded-[10px] object-cover shadow-sm md:h-7 md:w-7"
              width={36}
              height={36}
            />
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-extrabold tracking-tight text-th-800 md:text-base">Tracker</h1>
              {syncStatus === "offline" && (
                <p className="text-[10px] font-medium text-amber-600">Offline — saved locally</p>
              )}
              {syncStatus === "syncing" && (
                <p className="text-[10px] font-medium text-th-500">Saving…</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <NotificationPanel settings={notifications} onChange={setNotifications} />
            <ThemePicker
              themeId={activeTheme.themeId}
              customAccent={activeTheme.customAccent}
              isDaily={activeTheme.isDaily}
              onSelectPreset={(id) => {
                setThemeId(id);
                setThemeManualDate(getTodayStr());
              }}
              onCustomAccent={(hex) => {
                setCustomAccent(hex);
                setThemeId("custom");
                setThemeManualDate(getTodayStr());
              }}
              onUseDailyTheme={() => setThemeManualDate(null)}
            />
          </div>
        </div>
        <div className="home-week-nav flex w-full min-w-0 items-center gap-1 md:w-auto md:justify-end">
          <button
            type="button"
            onClick={() => setWeekStart(shiftWeekStart(weekStart, -1))}
            className="home-week-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-th-200 bg-[var(--surface-color)] text-th-600 shadow-sm transition active:scale-95 md:h-9 md:w-9 md:hover:border-th-300 md:hover:bg-th-50"
            aria-label="Previous week"
          >
            <ChevronLeft size={18} strokeWidth={2.5} className="md:h-[18px] md:w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isCurrentWeek) setWeekStart(getDefaultWeekStart());
            }}
            className={`home-week-pill flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold shadow-sm transition md:flex-none md:px-3 md:py-2 ${
              isCurrentWeek
                ? "cursor-default border-th-200 bg-[var(--surface-color)] text-th-700"
                : "border-th-300 bg-th-50 text-th-700 active:scale-[0.98] md:hover:border-th-400 md:hover:bg-th-100"
            }`}
            title={isCurrentWeek ? weekRange : `${weekRange} — tap to return to this week`}
            aria-label={isCurrentWeek ? weekRange : `${weekRange}, return to current week`}
          >
            <CalendarDays size={14} className="shrink-0 text-th-500" />
            <span className="truncate">{weekRange}</span>
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(shiftWeekStart(weekStart, 1))}
            className="home-week-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-th-200 bg-[var(--surface-color)] text-th-600 shadow-sm transition active:scale-95 md:h-9 md:w-9 md:hover:border-th-300 md:hover:bg-th-50"
            aria-label="Next week"
          >
            <ChevronRight size={18} strokeWidth={2.5} className="md:h-[18px] md:w-[18px]" />
          </button>
        </div>
      </header>

      <div className="home-mobile-main flex min-h-0 flex-1 flex-col md:contents">
      {/* Day columns — hero carousel on mobile */}
      <div className="home-day-stage order-1 flex min-h-0 flex-1 flex-col md:contents">
      <div
        ref={dayColumnsScrollRef}
        className="day-columns-scroll scroll-thin snap-x-mandatory flex min-h-0 flex-1 gap-2 overflow-x-auto overflow-y-hidden pb-0.5 animate-fade-up md:order-3 md:mb-0 md:flex-none md:snap-none md:gap-1 md:pb-0.5"
        style={{ animationDelay: "100ms" }}
      >
        {weekDays.map((day) => {
          const pct = getDayCompletionPercent(habits, day.date);
          const dayHabits = getHabitsForDate(habits, day.date);
          const isGreen = pct >= GREEN_PERCENT && dayHabits.length > 0;
          const isToday = day.date === todayStr;
          const isPast = isPastDate(day.date);
          const isFuture = isFutureDate(day.date);
          const perfect = isPerfectDay(habits, day.date);
          const locked = !isEditableDate(day.date);
          const isFocused = focusedDate === day.date;
          const dayPalette = getDayPalette(day.dayIndex);

          return (
            <div
              key={day.date}
              id={`day-col-${day.date}`}
              className={`day-col home-day-col flex min-w-[var(--day-col-min-w)] flex-none flex-col gap-1.5 scroll-mx-3 snap-center rounded-2xl transition-all duration-300 md:min-w-[132px] md:flex-1 md:gap-1 md:rounded-xl ${
                isToday ? "day-col--today" : "day-col--side"
              } ${isFocused ? "day-col--focused" : ""} ${perfect ? "perfect-day-col perfect-day-glow p-0.5" : ""}`}
              style={
                isToday && !perfect
                  ? ({ "--day-accent": dayPalette.accent } as React.CSSProperties)
                  : undefined
              }
            >
              <DayCardHeader
                day={day}
                pct={pct}
                perfect={perfect}
                isToday={isToday}
                isFocused={isFocused}
                isPast={isPast}
                isFuture={isFuture}
                compact={isMobile}
                studyHours={studyHours[day.date]}
                studyHoursLocked={!isStudyHoursEditable(day.date)}
                onStudyHoursSave={(hours) => updateStudyHours(day.date, hours)}
              />

              <div
                className={`home-day-body flex shrink-0 flex-col overflow-hidden rounded-2xl border transition-all duration-300 md:rounded-lg ${
                  perfect
                    ? "panel border-2 border-amber-400 bg-amber-50/30 shadow-lg shadow-amber-200/50"
                    : isToday
                      ? "panel day-panel-accent home-day-body--today border-2 shadow-lg ring-1 ring-[color-mix(in_srgb,var(--day-accent)_35%,transparent)]"
                      : isFocused
                        ? "panel border-th-300 shadow-lg shadow-th-200-60"
                        : "panel glass-card border-th-100-60"
                }`}
              >
                <DayHabitSlots
                  date={day.date}
                  habits={habits}
                  locked={locked}
                  onToggle={(habitId) => toggleHabit(habitId, day.date)}
                />
                <div className="home-day-footer shrink-0 border-t border-th-100 bg-grad-th-footer px-2 py-2.5 md:px-1.5 md:py-1.5">
                  {!isTrackingDate(day.date) ? (
                    <p className="text-center text-xs font-bold text-th-400">—</p>
                  ) : (
                    <>
                  <div className="day-progress-bar mb-1.5 overflow-hidden rounded-full bg-th-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        pct === 100
                          ? "bg-gradient-to-r from-amber-400 to-amber-500"
                          : isToday
                            ? ""
                            : "bg-grad-th-progress"
                      }`}
                      style={{
                        width: `${pct}%`,
                        ...(pct !== 100 && isToday
                          ? { background: `linear-gradient(90deg, ${dayPalette.from}, ${dayPalette.via})` }
                          : {}),
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-th-600 md:text-[11px]">
                      <span className={isGreen ? "text-th-700" : "text-th-800"}>{pct}%</span>
                    </span>
                    <span className="text-xs font-bold text-th-600 md:text-[11px]">
                      {dayHabits.length === 0 ? (
                        <span className="text-th-400">—</span>
                      ) : perfect ? (
                        <span className="flex items-center gap-0.5 text-amber-700">
                          <PerfectDayCrown size={11} className="text-amber-500" />
                          Perfect
                        </span>
                      ) : isGreen ? (
                        <span className="text-th-600">Green ✓</span>
                      ) : (
                        <>Goal <span className="text-orange-600">{GREEN_PERCENT}%</span></>
                      )}
                    </span>
                  </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {/* Mobile bottom tab bar — opens popup sheet */}
      <div className="home-bottom-dock order-2 shrink-0 md:hidden">
        <MobileInsightsTabs
          active={mobileInsightsSheet}
          onChange={(tab) => setMobileInsightsSheet((prev) => (prev === tab ? null : tab))}
        />
      </div>

      </div>

      {mobileInsightsSheet && (
        <MobileInsightsSheet tab={mobileInsightsSheet} onClose={() => setMobileInsightsSheet(null)}>
          {mobileInsightsSheet === "score" && scoreSheetPanel}
          {mobileInsightsSheet === "progress" && progressSheetPanel}
          {mobileInsightsSheet === "manage" && manageSheetPanel}
        </MobileInsightsSheet>
      )}

      {/* Stats panels — 3 columns on desktop */}
      <div className="order-3 mb-1 hidden min-h-0 flex-1 grid-cols-12 gap-1.5 animate-fade-up md:order-2 md:grid" style={{ animationDelay: "50ms" }}>
        <div className="panel col-span-4 flex min-h-0 flex-col overflow-hidden rounded-xl border border-th-100-80">
          {managePanel}
        </div>
        <div className="panel col-span-4 flex min-h-0 flex-col overflow-hidden rounded-xl border border-th-100-80 p-2">
          {progressPanel}
        </div>
        <div className="panel col-span-4 flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-xl border border-th-100-80">
          <WeekScorePanel
            weeklyAvg={weeklyAvg}
            weekTotal={totalDone}
            weekMaxPossible={weekMaxPossible}
            streakCurrent={streakStats.current}
            perfectDaysThisMonth={perfectDaysThisMonth}
          />
        </div>
      </div>

    </div>
  );
}
