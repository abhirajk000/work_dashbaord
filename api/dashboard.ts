import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import type { DashboardState } from "../lib/dashboard-types";

const ROW_ID = "default";

function getSql() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set");
  return neon(url);
}

async function getDashboardState(): Promise<DashboardState | null> {
  const sql = getSql();
  const rows = await sql`SELECT data FROM dashboard_state WHERE id = ${ROW_ID}`;
  if (!rows.length) return null;
  return rows[0].data as DashboardState;
}

async function saveDashboardState(data: DashboardState): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO dashboard_state (id, data, updated_at)
    VALUES (${ROW_ID}, ${data}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data,
      updated_at = NOW()
  `;
}

function isAuthorized(req: VercelRequest): boolean {
  const key = process.env.DASHBOARD_API_KEY;
  if (!key) return true;
  return req.headers.authorization === `Bearer ${key}`;
}

function isValidState(body: unknown): body is DashboardState {
  if (!body || typeof body !== "object") return false;
  const state = body as DashboardState;
  return (
    Array.isArray(state.habits) &&
    typeof state.weeklyFocus === "string" &&
    typeof state.reward === "string" &&
    typeof state.affirmation === "string" &&
    typeof state.weekStart === "string"
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (req.method === "GET") {
      const state = await getDashboardState();
      if (!state) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(state);
    }

    if (req.method === "PUT") {
      if (!isValidState(req.body)) {
        return res.status(400).json({ error: "Invalid dashboard state" });
      }
      await saveDashboardState(req.body);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Dashboard API error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
