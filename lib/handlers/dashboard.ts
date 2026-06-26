import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthorizedForUser } from "../browser-auth.js";
import { getDashboardState, saveDashboardState } from "../db.js";
import type { DashboardState } from "../dashboard-types.js";

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

export async function handleDashboardApi(
  req: VercelRequest,
  res: VercelResponse,
  username: string
): Promise<void> {
  if (!isAuthorizedForUser(req, username)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method === "GET") {
    const state = await getDashboardState(username);
    if (!state) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(200).json(state);
    return;
  }

  if (req.method === "PUT") {
    if (!isValidState(req.body)) {
      res.status(400).json({ error: "Invalid dashboard state" });
      return;
    }
    await saveDashboardState(username, req.body);
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "GET, PUT");
  res.status(405).json({ error: "Method not allowed" });
}
