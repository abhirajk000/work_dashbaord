import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { VercelRequest } from "@vercel/node";

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

export function createSessionToken(): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const nonce = randomBytes(16).toString("hex");
  const payload = `${exp}.${nonce}`;
  return `${payload}.${signPayload(payload)}`;
}

export function verifySessionToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const payload = `${expStr}.${nonce}`;
  return safeEqualHex(sig, signPayload(payload));
}

export function parseSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  return match?.[1]?.trim() ?? null;
}

export function isSessionAuthorized(req: Pick<VercelRequest, "headers">): boolean {
  const token = parseSessionCookie(req.headers.cookie);
  return token ? verifySessionToken(token) : false;
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
