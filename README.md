# Productivity Dashboard

Weekly habit planner built with React, Vite, and Tailwind. Data syncs to Neon Postgres via Vercel serverless API.

## Quick start (local)

```bash
npm install
npm run dev
```

## Neon database

```bash
export NEON_API_KEY=your_neon_api_key
bash scripts/setup-neon.sh
```

This creates a Neon project, applies `sql/schema.sql`, and writes `.env.local`.

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import the repo in [Vercel](https://vercel.com/new).
3. Set environment variables from `.env.local`:
   - `DATABASE_URL`
   - `DASHBOARD_API_KEY`
   - `VITE_DASHBOARD_API_KEY`
4. Deploy.

Local API testing: `npx vercel dev`
