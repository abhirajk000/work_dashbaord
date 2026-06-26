import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { VercelRequest } from "@vercel/node";
import { isValidUsername, normalizeUsername } from "./username.js";

export const SESSION_COOKIE_NAME = "tracker_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function getSessionSecret(): string {
  const secret = process.env.PIN_SESSION_SECRET ?? process.env.DASHBOARD_API_KEY;
  if (!secret) throw new Error("PIN_SESSION_SECRET or DASHBOARD_API_KEY is required");
  return secret;
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(
      Uint8Array.from(Buffer.from(a, "hex")),
      Uint8Array.from(Buffer.from(b, "hex"))
    );
  } catch {
    return false;
  }
}

export function createSessionToken(username: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const nonce = randomBytes(16).toString("hex");
  const payload = `${username}.${exp}.${nonce}`;
  return `${payload}.${signPayload(payload)}`;
}

export function verifySessionToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [username, expStr, nonce, sig] = parts;
  if (!isValidUsername(username)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  const payload = `${username}.${expStr}.${nonce}`;
  if (!safeEqualHex(sig, signPayload(payload))) return null;
  return username;
}

export function parseSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  const token = match?.[1]?.trim() ?? null;
  return token ? verifySessionToken(token) : null;
}

export function getSessionUsername(req: Pick<VercelRequest, "headers">): string | null {
  if (!req.headers.cookie) return null;
  const match = req.headers.cookie.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`)
  );
  const token = match?.[1]?.trim();
  return token ? verifySessionToken(token) : null;
}

/** @deprecated Use getSessionUsername */
export function isSessionAuthorized(req: Pick<VercelRequest, "headers">): boolean {
  return getSessionUsername(req) !== null;
}

function isSecureCookie(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

export function sessionCookieHeader(token: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = isSecureCookie() ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = isSecureCookie() ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function normalizeRequestedUsername(raw: string): string | null {
  const username = normalizeUsername(raw);
  return isValidUsername(username) ? username : null;
}
