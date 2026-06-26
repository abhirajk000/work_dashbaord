import type { VercelRequest } from "@vercel/node";
import { isValidUsername, normalizeUsername } from "./username.js";

export function getUsernameFromQuery(req: VercelRequest): string | null {
  const raw = req.query.username;
  const value = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : null;
  if (!value) return null;
  const username = normalizeUsername(value);
  return isValidUsername(username) ? username : null;
}
