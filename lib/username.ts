import { resolveLegacyUsername } from "./legacy-user.js";
import { NTFY_TOPIC } from "./notification-types.js";

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,29}$/;

const RESERVED = new Set([
  "api",
  "assets",
  "signup",
  "sw.js",
  "manifest.webmanifest",
  "favicon.png",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "logo.png",
]);

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username) && !RESERVED.has(username);
}

/** e.g. yashu → Yashu-Tracker */
export function formatTrackerDisplayName(username: string, legacyRoot = false): string {
  if (legacyRoot) return "Tracker";
  const label = username.charAt(0).toUpperCase() + username.slice(1).toLowerCase();
  return `${label}-Tracker`;
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Legacy root user keeps the original shared ntfy topic; others are isolated. */
export function getNtfyTopicForUser(username: string): string {
  if (username === resolveLegacyUsername()) {
    return NTFY_TOPIC;
  }
  return `Tracker-${username}`;
}
