import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import localforage from "localforage";
import { fetchDashboardState, saveDashboardStateRemote } from "./src/lib/dashboard-api";
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
};

type LegacyHabit = {
  id: string;
  name: string;
  completions: Record<string, boolean>;
  createdAt?: DateStr;
  deletedAt?: DateStr;
};

const HABIT_EPOCH: DateStr = "2000-01-01";

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
  return {
    ...light,
    pageBg: rgbToHex(mixRgb(hexToRgb(accent), { r: 248, g: 250, b: 252 }, 0.04)),
    pageGlow1: rgba(light.shades[500], 0.22),
    pageGlow2: rgba(light.shades[400], 0.16),
    pageGrid: rgba(light.shades[500], 0.04),
    panelShadow: rgba(light.shades[700], 0.1),
    surface: "rgba(255, 255, 255, 0.38)",
    surfaceMuted: "rgba(255, 255, 255, 0.24)",
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

function buildThemePalette(themeId: ThemeId, customAccent: string): ThemePalette {
  const accent = resolveThemeAccent(themeId, customAccent);
  const mode = resolveThemeMode(themeId);
  if (mode === "dark") return buildDarkPaletteFromAccent(accent);
  if (mode === "glass") return buildGlassPaletteFromAccent(accent);
  return buildPaletteFromAccent(accent);
}

function applyTheme(themeId: ThemeId, customAccent: string) {
  const palette = buildThemePalette(themeId, customAccent);
  const mode = resolveThemeMode(themeId);
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

  root.dataset.themeMode = mode;
  root.classList.toggle("theme-dark", mode === "dark");
  root.classList.toggle("theme-glass", mode === "glass");
}

const DEFAULT_HABITS: Habit[] = [
  "Wake up at 6:30",
  "Gym / Weight Training",
  "Grammar & English Drill",
  "Deep Work",
  "Check SIPs & Budget",
  "No sugar",
].map((name, i) => ({ id: `habit-${i}`, name, completions: {}, createdAt: HABIT_EPOCH }));

function getDefaultWeekStart(): DateStr {
  return getWeekStartForDate(getTodayStr());
}

const DEFAULT_STATE: DashboardState = {
  habits: DEFAULT_HABITS,
  weeklyFocus: "Finish frontend UI and review components.",
  reward: "Movie night, no guilt.",
  affirmation: "Progress over perfection.",
  weekStart: getDefaultWeekStart(),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const APP_TIMEZONE = "Asia/Kolkata";

const istDisplayFormat = { timeZone: APP_TIMEZONE } as const;

const IST_WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

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

function getWeekdayIndexIST(dateStr: DateStr): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
  }).format(parseDateStr(dateStr));
  return IST_WEEKDAY_INDEX[weekday] ?? 0;
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

function isEditableDate(date: DateStr): boolean {
  return date === getTodayStr();
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
  const dayOfWeek = getWeekdayIndexIST(date);
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDays(date, diffToMonday);
}

function dateFromMonthDay(year: number, month: number, dayIndex: number): DateStr {
  return dateStrFromParts(year, month + 1, dayIndex + 1);
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

function isHabitActiveOnDate(habit: Habit, date: DateStr): boolean {
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
    if (d < createdAt) delete completions[d];
    if (h.deletedAt && d >= h.deletedAt) delete completions[d];
  }
  return { ...h, createdAt, completions };
}

function migrateHabits(habits: LegacyHabit[], weekStart: DateStr): Habit[] {
  const weekDays = getWeekDays(weekStart);
  const keyToDate = Object.fromEntries(
    LEGACY_DAY_KEYS.map((k, i) => [k, weekDays[i].date])
  ) as Record<LegacyDayKey, DateStr>;

  return habits.map((h) => {
    const createdAt = inferCreatedAt(h);
    if (!isLegacyHabit(h)) {
      return normalizeHabit({
        id: h.id,
        name: h.name,
        completions: { ...h.completions },
        createdAt,
        deletedAt: h.deletedAt,
      });
    }
    const completions: Record<DateStr, boolean> = {};
    for (const [key, val] of Object.entries(h.completions)) {
      if (val && key in keyToDate) completions[keyToDate[key as LegacyDayKey]] = true;
    }
    return normalizeHabit({ id: h.id, name: h.name, completions, createdAt, deletedAt: h.deletedAt });
  });
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
    if (dateStr > today) break;
    if (isPerfectDay(habits, dateStr)) count++;
  }
  return count;
}

function countPerfectDaysInWeek(habits: Habit[], weekDays: WeekDay[]): number {
  const today = getTodayStr();
  return weekDays.filter((d) => d.date <= today && isPerfectDay(habits, d.date)).length;
}

function getWeeklyAverage(habits: Habit[], weekDays: WeekDay[]): number {
  if (habits.length === 0) return 0;
  const total = weekDays.reduce((sum, d) => sum + getDayCompletionPercent(habits, d.date), 0);
  return Math.round(total / weekDays.length);
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
    if (dateStr <= today) {
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
  const startOffset = getWeekdayIndexIST(dateStrFromParts(year, month, 1));

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
    if (isDayQualified(habits, d)) qualified.add(d);
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
                const tip = parseDateStr(cell.date).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  ...istDisplayFormat,
                });

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

function DayCardHeader({
  day,
  pct,
  perfect,
  isToday,
  isFocused,
  isPast,
  isFuture,
  compact = false,
}: {
  day: WeekDay;
  pct: number;
  perfect: boolean;
  isToday: boolean;
  isFocused: boolean;
  isPast: boolean;
  isFuture: boolean;
  compact?: boolean;
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

      <div className="relative z-10 flex shrink-0 flex-col items-center gap-1">
        {perfect && <PerfectDayCrown size={13} />}
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
  onBarClick?: (dayIndex: number) => void;
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
              onBarClick?.(i);
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

function ProgressEmptyState({ isMonth }: { isMonth: boolean }) {
  const bars = isMonth ? [0.3, 0.5, 0.2, 0.6, 0.4, 0.7, 0.35] : [0.4, 0.65, 0.3, 0.55, 0.45, 0.7, 0.5];

  return (
    <div className="flex h-full min-h-[72px] flex-1 flex-col items-center justify-center gap-3 px-2 py-2">
      <div className="flex h-16 w-full max-w-[200px] items-end justify-center gap-2">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-md bg-th-100"
            style={{ height: `${h * 100}%` }}
          />
        ))}
      </div>
      <div className="text-center">
        <p className="text-xs font-bold text-th-700">No data yet</p>
        <p className="mt-0.5 max-w-[220px] text-[11px] leading-snug text-th-500">
          Log today&apos;s habits to see your {isMonth ? "monthly" : "weekly"} trend
        </p>
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
}: {
  weeklyAvg: number;
  weekTotal: number;
  weekMaxPossible: number;
  streakCurrent: number;
  perfectDaysThisMonth: number;
  compact?: boolean;
}) {
  const donutSize = compact ? 92 : 108;
  const onTrack = weeklyAvg >= GREEN_PERCENT;

  return (
    <div
      className={`week-score-panel flex h-full w-full flex-col items-center justify-center text-center ${
        compact ? "px-3 py-3" : "px-4 py-4"
      }`}
    >
      <div className="mb-2 flex items-center justify-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-th-100 text-th-600">
          <BarChart3 size={12} strokeWidth={2.5} />
        </span>
        <p className="text-xs font-bold uppercase tracking-widest text-th-600">Week Score</p>
      </div>

      <div className="relative mx-auto mb-3 flex items-center justify-center">
        <div className="week-score-glow pointer-events-none absolute inset-0 rounded-full" aria-hidden />
        <DonutChart percent={weeklyAvg} size={donutSize} id={`week-score-panel${compact ? "-m" : ""}`} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-extrabold leading-none tabular-nums text-th-800 ${compact ? "text-2xl" : "text-3xl"}`}
          >
            {weeklyAvg}%
          </span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-th-500">weekly avg</span>
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

      <p className="mt-2 text-[11px] font-semibold text-th-700">
        {weekTotal}
        <span className="font-medium text-th-500"> / {weekMaxPossible} check-ins</span>
      </p>
      <p className="mt-0.5 text-[10px] font-medium text-th-500">{getWeekScoreMessage(weeklyAvg)}</p>

      {(streakCurrent > 0 || perfectDaysThisMonth > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
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
}: {
  view: ProgressView;
  onToggleView: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onMonthBarClick: (dayIndex: number) => void;
  weekCounts: number[];
  weekTotals: number[];
  weekLabels: string[];
  weekTodayIndex: number;
  monthStats: MonthBarStats;
  maxHabits: number;
  weekTotal: number;
  weekPerfectDays: number;
  weeklyAvg: number;
}) {
  const isMonth = view === "month";
  const hasData = isMonth
    ? monthStats.totalChecks > 0
    : weekTotal > 0 || weekCounts.some((c) => c > 0);
  const avg = isMonth ? monthStats.avgPercent : weeklyAvg;
  const perfectDays = isMonth ? monthStats.perfectDays : weekPerfectDays;

  return (
    <div className="progress-panel flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <PanelLabel icon={<BarChart3 size={10} />}>Progress</PanelLabel>
        <div className="flex rounded-lg bg-th-100 p-0.5">
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
        <div className="mb-3 flex items-center justify-between rounded-lg border border-th-100-80 bg-th-50-40 px-1 py-0.5">
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

      <ProgressHero
        avg={avg}
        isMonth={isMonth}
        weekTotal={weekTotal}
        greenDays={monthStats.greenDays}
        perfectDays={perfectDays}
      />

      <div className="mb-2 flex items-center justify-between px-0.5">
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
        {!hasData ? (
          <ProgressEmptyState isMonth={isMonth} />
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

// ─── Habit master editor (collapsible) ───────────────────────────────────────

function HabitMasterEditor({
  habits,
  activeCount,
  open,
  onToggle,
  onAdd,
  canAdd,
  onUpdateName,
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
  onRemove: (id: string) => void;
  embedded?: boolean;
  tabbed?: boolean;
}) {
  const habitsOpen = tabbed || open;

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
            Add, rename, or remove habits here. Check them off in the day columns below.
          </p>
          <div className="mb-1 flex justify-end">
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
          <div className="habit-slots-stack flex flex-col gap-px">
            {getActiveHabits(habits).map((h, i) => (
                <div
                  key={h.id}
                  className="group habit-slot-h flex items-center gap-2 rounded-md border border-th-100-60 bg-white/60 px-1.5 transition hover:border-th-200 hover:bg-white"
                >
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
            ))}
            {activeCount === 0 && (
              <p className="py-3 text-center text-xs text-th-400">No habits yet. Tap Add to get started.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type ManagePanelView = "habits" | "activity";
type MobileInsightsTab = "score" | "progress" | "manage";

function MobileInsightsTabs({
  active,
  onChange,
}: {
  active: MobileInsightsTab;
  onChange: (tab: MobileInsightsTab) => void;
}) {
  const tabs: { id: MobileInsightsTab; label: string; icon: React.ReactNode }[] = [
    { id: "score", label: "Score", icon: <BarChart3 size={14} /> },
    { id: "progress", label: "Progress", icon: <CalendarDays size={14} /> },
    { id: "manage", label: "Habits", icon: <Pencil size={14} /> },
  ];

  return (
    <div className="mobile-insights-tabs mb-2 grid grid-cols-3 gap-1 rounded-xl border border-th-100-80 bg-[var(--surface-muted)] p-1">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-bold transition active:scale-[0.98] ${
              isActive
                ? "bg-[var(--surface-color)] text-th-700 shadow-sm ring-1 ring-th-200"
                : "text-th-500"
            }`}
            aria-pressed={isActive}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
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
  onRemove,
  onDayClick,
  selectedDate,
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
  onRemove: (id: string) => void;
  onDayClick: (date: DateStr) => void;
  selectedDate: DateStr | null;
}) {
  const tabClass = (active: boolean) =>
    `flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-md px-2 py-2 text-[10px] font-bold uppercase tracking-wide transition md:min-h-0 md:py-1.5 ${
      active ? "bg-th-600 text-white shadow-sm" : "bg-th-100 text-th-600 hover:bg-th-200/80"
    }`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 gap-1 border-b border-th-100 px-2 py-2">
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

function ThemePicker({
  themeId,
  customAccent,
  onSelectPreset,
  onCustomAccent,
}: {
  themeId: ThemeId;
  customAccent: string;
  onSelectPreset: (id: ThemePresetId) => void;
  onCustomAccent: (hex: string) => void;
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

  const accent = resolveThemeAccent(themeId, customAccent);
  const activeName =
    themeId === "custom" ? "Custom" : (resolveThemePreset(themeId)?.name ?? "Theme");
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
      <p className="text-xs font-semibold text-th-700">Loading dashboard…</p>
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
  const [mobileInsightsTab, setMobileInsightsTab] = useState<MobileInsightsTab>("score");
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [customAccent, setCustomAccent] = useState(DEFAULT_CUSTOM_ACCENT);
  const dayColumnsScrollRef = useRef<HTMLDivElement>(null);
  const isHydrated = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "offline">("idle");
  const isMobile = useIsMobile();
  const todayStr = getTodayStr();
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

  const focusDay = useCallback((date: DateStr) => {
    setWeekStart(getWeekStartForDate(date));
    setFocusedDate(date);
    const [y, m] = date.split("-").map(Number);
    setProgressMonth({ year: y, month: m - 1 });
    window.setTimeout(() => {
      dayColumnsScrollRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
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
      let ws = saved.weekStart ?? getDefaultWeekStart();
      if (!weekContainsDate(ws, getTodayStr())) {
        ws = getDefaultWeekStart();
      }
      const loadedThemeId = normalizeThemeId(saved.themeId);
      const loadedAccent = saved.customAccent ?? DEFAULT_CUSTOM_ACCENT;
      setWeekStart(ws);
      setHabits(saved.habits?.length ? migrateHabits(saved.habits as LegacyHabit[], ws) : DEFAULT_HABITS);
      setWeeklyFocus(saved.weeklyFocus ?? DEFAULT_STATE.weeklyFocus);
      setReward(saved.reward ?? DEFAULT_STATE.reward);
      setAffirmation(saved.affirmation ?? DEFAULT_STATE.affirmation);
      setThemeId(loadedThemeId);
      setCustomAccent(loadedAccent);
    }
    applyTheme(
      normalizeThemeId(saved?.themeId),
      saved?.customAccent ?? DEFAULT_CUSTOM_ACCENT
    );
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
    };

    localforage.setItem(STORAGE_KEY, snapshot).catch((err) => console.error("Failed to save locally:", err));

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      setSyncStatus("syncing");
      saveDashboardStateRemote(snapshot)
        .then(() => setSyncStatus("idle"))
        .catch((err) => {
          console.warn("Remote save failed:", err);
          setSyncStatus("offline");
        });
    }, 600);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [habits, weeklyFocus, reward, affirmation, weekStart, themeId, customAccent]);

  useEffect(() => {
    applyTheme(themeId, customAccent);
  }, [themeId, customAccent]);

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

  const addHabit = useCallback(() => {
    const today = getTodayStr();
    setHabits((prev) => {
      if (getActiveHabits(prev).length >= MAX_HABITS) return prev;
      return [...prev, { id: `habit-${Date.now()}`, name: "New habit", completions: {}, createdAt: today }];
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
      onMonthBarClick={(dayIndex) =>
        focusDay(dateFromMonthDay(progressMonth.year, progressMonth.month, dayIndex))
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
      onRemove={removeHabit}
      onDayClick={focusDay}
      selectedDate={focusedDate}
    />
  );

  const scorePanel = (
    <WeekScorePanel
      weeklyAvg={weeklyAvg}
      weekTotal={totalDone}
      weekMaxPossible={weekMaxPossible}
      streakCurrent={streakStats.current}
      perfectDaysThisMonth={perfectDaysThisMonth}
      compact={isMobile}
    />
  );

  return (
    <div className="dashboard-root bg-dashboard safe-pt safe-px safe-pb flex min-h-dvh flex-col font-sans text-th-900 md:h-full md:overflow-hidden">
      {/* Title bar */}
      <header className="dashboard-header sticky top-0 z-30 mb-2 flex shrink-0 flex-col gap-1.5 animate-fade-up md:static md:mb-1.5 md:flex-row md:items-center md:justify-between md:gap-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-grad-th-icon shadow-md md:h-7 md:w-7">
              <ListChecks size={15} className="text-white md:h-[14px] md:w-[14px]" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-extrabold tracking-tight text-th-800 sm:text-base">Weekly Planner</h1>
              {syncStatus === "offline" && (
                <p className="text-[10px] font-medium text-amber-600">Offline — saved locally</p>
              )}
              {syncStatus === "syncing" && (
                <p className="text-[10px] font-medium text-th-500">Syncing…</p>
              )}
            </div>
          </div>
          <ThemePicker
            themeId={themeId}
            customAccent={customAccent}
            onSelectPreset={setThemeId}
            onCustomAccent={(hex) => {
              setCustomAccent(hex);
              setThemeId("custom");
            }}
          />
        </div>
        <div className="flex w-full min-w-0 items-center gap-1.5 md:w-auto md:justify-end">
          <button
            type="button"
            onClick={() => setWeekStart(shiftWeekStart(weekStart, -1))}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-th-200 bg-[var(--surface-color)] text-th-600 shadow-sm transition active:scale-95 md:h-9 md:w-9 md:hover:border-th-300 md:hover:bg-th-50"
            aria-label="Previous week"
          >
            <ChevronLeft size={20} strokeWidth={2.5} className="md:h-[18px] md:w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isCurrentWeek) setWeekStart(getDefaultWeekStart());
            }}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border px-2.5 py-2.5 text-[11px] font-bold shadow-sm transition md:flex-none md:px-3 md:py-2 ${
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-th-200 bg-[var(--surface-color)] text-th-600 shadow-sm transition active:scale-95 md:h-9 md:w-9 md:hover:border-th-300 md:hover:bg-th-50"
            aria-label="Next week"
          >
            <ChevronRight size={20} strokeWidth={2.5} className="md:h-[18px] md:w-[18px]" />
          </button>
        </div>
      </header>

      {/* Day columns — primary on mobile, snap scroll */}
      <div
        ref={dayColumnsScrollRef}
        className="day-columns-scroll scroll-thin snap-x-mandatory order-1 mb-2 flex shrink-0 gap-2 overflow-x-auto pb-1 animate-fade-up md:order-3 md:mb-0 md:snap-none md:gap-1 md:pb-0.5"
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
              className={`flex min-w-[var(--day-col-min-w)] flex-none flex-col gap-1 scroll-mx-2 snap-center rounded-xl transition-all duration-300 md:min-w-[132px] md:flex-1 ${
                isFocused ? "scale-[1.01]" : isToday ? "scale-[1.02] md:scale-[1.01]" : ""
              } ${perfect ? "perfect-day-col perfect-day-glow p-0.5" : ""}`}
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
              />

              <div
                className={`flex shrink-0 flex-col overflow-hidden rounded-lg border transition-all duration-300 ${
                  perfect
                    ? "panel border-2 border-amber-400 bg-amber-50/30 shadow-lg shadow-amber-200/50"
                    : isToday
                      ? "panel day-panel-accent border-2 shadow-lg ring-1 ring-[color-mix(in_srgb,var(--day-accent)_35%,transparent)]"
                      : isFocused
                        ? "panel border-th-300 shadow-lg shadow-th-200-60"
                        : "panel border-th-100-60 bg-white/80"
                }`}
              >
                <div className="habit-slots-stack flex flex-col gap-px p-1">
                  {dayHabits.length === 0 ? (
                    <p className="habit-slot-h flex items-center justify-center text-[11px] text-th-400">No habits</p>
                  ) : (
                    dayHabits.map((habit) => (
                      <TaskCheck
                        key={habit.id}
                        checked={isHabitDone(habit, day.date)}
                        locked={locked}
                        onToggle={() => toggleHabit(habit.id, day.date)}
                        label={habit.name}
                      />
                    ))
                  )}
                </div>
                <div className="shrink-0 border-t border-th-100 bg-grad-th-footer px-1.5 py-2 md:py-1.5">
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
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile insights — tabbed to reduce scroll */}
      <div className="order-2 mb-2 shrink-0 md:hidden">
        <MobileInsightsTabs active={mobileInsightsTab} onChange={setMobileInsightsTab} />
        <div
          className={`panel mobile-insights-panel flex flex-col overflow-hidden rounded-xl border border-th-100-80 ${
            mobileInsightsTab === "progress"
              ? "h-auto max-h-none"
              : "h-[min(48vh,320px)] max-h-[min(48vh,320px)]"
          }`}
        >
          <div
            className={`flex flex-col overflow-hidden ${
              mobileInsightsTab === "progress" ? "h-auto" : "min-h-0 flex-1"
            }`}
          >
            {mobileInsightsTab === "score" && scorePanel}
            {mobileInsightsTab === "progress" && (
              <div className="overflow-y-auto p-3">{progressPanel}</div>
            )}
            {mobileInsightsTab === "manage" && managePanel}
          </div>
        </div>
      </div>

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
