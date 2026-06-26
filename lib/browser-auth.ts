import type { VercelRequest } from "@vercel/node";
import { getSessionUsername } from "./pin-session.js";

/** Browser session cookie or server bearer key (cron, scripts). */
export function isBrowserOrServerAuthorized(req: VercelRequest): boolean {
  if (getSessionUsername(req)) return true;
  const key = process.env.DASHBOARD_API_KEY;
  if (!key) return true;
  return req.headers.authorization === `Bearer ${key}`;
}

/** Session must match the requested username, unless server bearer key is used. */
export function isAuthorizedForUser(req: VercelRequest, username: string): boolean {
  const key = process.env.DASHBOARD_API_KEY;
  if (key && req.headers.authorization === `Bearer ${key}`) return true;

  const sessionUser = getSessionUsername(req);
  return sessionUser === username;
}
