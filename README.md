# Productivity Dashboard

Weekly habit planner built with React, Vite, and Tailwind. Data syncs to Neon Postgres via Vercel serverless API.

## Quick start (local)

```bash
npm install
npm run dev
```

## Neon database (via Vercel)

```bash
vercel link
vercel integration add neon
node scripts/migrate-schema.mjs
```

## Deploy on Vercel

```bash
vercel --prod
```

Live app: https://trackk.k12hunar.com

## Push to GitHub

```bash
bash scripts/push-github.sh productivity-dashboard
```

Local API testing: `vercel dev`

## Habit reminders (ntfy — battery friendly)

Reminders use **[ntfy.sh/Tracker](https://ntfy.sh/Tracker)**. The server sends nudges on a schedule via cron — **no service worker, no background polling** in the Tracker app.

### Subscribe (once per device)

1. Install [ntfy](https://ntfy.sh/app) on iPhone, Android, Mac, or Windows
2. Subscribe to topic **`Tracker`**
3. In Tracker, tap the **bell** → enable reminders → send a test

### What gets sent

| Reminder | Default | Condition |
|----------|---------|-----------|
| Per-habit ping | 8:00 AM (new habits) | Habit still unchecked at reminder time |
| Per-habit follow-up | +30 min after each ping | Still unchecked — *"Are you working on …?"* |
| Morning kickoff | 8:00 AM | Habits still left today |
| Evening nudge | 8:00 PM | Below 70% completion |

Set `CRON_SECRET` in Vercel for scheduled sends. Cron runs every 15 minutes to hit habit times and follow-ups.
