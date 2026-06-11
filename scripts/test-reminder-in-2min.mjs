#!/usr/bin/env node
/**
 * End-to-end cron reminder test:
 * 1. Sets a habit reminder for ~2 minutes from now (Asia/Kolkata)
 * 2. Waits for that time to pass
 * 3. Invokes /api/cron/reminders manually
 * 4. Reports whether a notification was sent
 *
 * Usage: node scripts/test-reminder-in-2min.mjs
 * Requires .env.local with DASHBOARD_API_KEY (or VITE_DASHBOARD_API_KEY)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const APP_URL = process.env.APP_URL ?? "https://work-raaz-0.vercel.app";
const TIMEZONE = "Asia/Kolkata";

function loadEnvLocal() {
  for (const file of [".env.local", ".env.vercel.test", ".env.vercel.prod"]) {
    try {
      const raw = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        process.env[key] = value;
      }
    } catch {
      // optional
    }
  }
}

function getZonedTimeParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  if (hour === 24) hour = 0;

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  return {
    date: `${year}-${month}-${day}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function addMinutesToTime(time, minutes) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function main() {
  loadEnvLocal();

  const apiKey = process.env.DASHBOARD_API_KEY ?? process.env.VITE_DASHBOARD_API_KEY;

  if (!apiKey) {
    console.error("Missing DASHBOARD_API_KEY in .env.local");
    process.exit(1);
  }

  const dashboardHeaders = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  console.log(`Fetching dashboard from ${APP_URL}...`);
  const getRes = await fetch(`${APP_URL}/api/dashboard`, { headers: dashboardHeaders });
  if (!getRes.ok) {
    console.error(`Failed to load dashboard (${getRes.status})`);
    process.exit(1);
  }

  const state = await getRes.json();
  const now = new Date();
  const zoned = getZonedTimeParts(now, TIMEZONE);
  const reminderTime = addMinutesToTime(zoned.time, 2);
  const today = zoned.date;

  console.log(`Current ${TIMEZONE} time: ${zoned.time} on ${today}`);
  console.log(`Scheduling test habit reminder for ${reminderTime}...`);

  const testHabitId = "__reminder_test__";
  const habits = Array.isArray(state.habits) ? state.habits.filter((h) => h.id !== testHabitId) : [];
  habits.push({
    id: testHabitId,
    name: "Cron test habit",
    completions: {},
    createdAt: today,
    reminderTimes: [reminderTime],
  });

  const nextState = {
    ...state,
    habits,
    notifications: {
      enabled: true,
      morningEnabled: false,
      eveningEnabled: false,
      morningTime: "08:00",
      eveningTime: "20:00",
      timezone: TIMEZONE,
      ...(state.notifications ?? {}),
      enabled: true,
      morningEnabled: false,
      eveningEnabled: false,
      timezone: TIMEZONE,
    },
  };

  const putRes = await fetch(`${APP_URL}/api/dashboard`, {
    method: "PUT",
    headers: dashboardHeaders,
    body: JSON.stringify(nextState),
  });
  if (!putRes.ok) {
    console.error(`Failed to save dashboard (${putRes.status})`);
    process.exit(1);
  }
  console.log("Dashboard updated with test reminder.");

  const waitMs = 2 * 60 * 1000 + 15_000;
  console.log(`Waiting ${Math.round(waitMs / 1000)}s for reminder time to pass...`);
  await sleep(waitMs);

  console.log("Invoking cron reminders...");
  const cronRes = await fetch(`${APP_URL}/api/cron/reminders`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const cronBody = await cronRes.json().catch(() => ({}));

  console.log("Cron response:", JSON.stringify(cronBody, null, 2));

  if (!cronRes.ok) {
    console.error("Cron invocation failed.");
    process.exit(1);
  }

  if (cronBody.sent > 0) {
    console.log(`SUCCESS: ${cronBody.sent} notification(s) sent. Check ntfy topic Tracker.`);
    process.exit(0);
  }

  console.error(
    "No notifications sent. On Vercel Hobby, built-in cron only runs twice daily — manual invoke should still work if the reminder time fell in the cron window."
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
