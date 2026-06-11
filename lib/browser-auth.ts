import type { VercelRequest } from "@vercel/node";
import { isSessionAuthorized } from "./pin-session.js";

/** Browser session cookie or server bearer key (cron, scripts). */
export function isBrowserOrServerAuthorized(req: VercelRequest): boolean {
  if (isSessionAuthorized(req)) return true;
  const key = process.env.DASHBOARD_API_KEY;
  if (!key) return true;
  return req.headers.authorization === `Bearer ${key}`;
}
