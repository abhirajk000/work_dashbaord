import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDashboardState, saveDashboardState } from "../lib/db";
import type { DashboardState } from "../lib/dashboard-types";

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
