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

Live app: https://work-raaz-0.vercel.app

## Push to GitHub

```bash
bash scripts/push-github.sh productivity-dashboard
```

Local API testing: `vercel dev`
