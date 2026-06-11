import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isWebPushConfigured, removePushSubscription, upsertPushSubscription } from "../lib/web-push.js";

function isAuthorized(req: VercelRequest): boolean {
  const key = process.env.DASHBOARD_API_KEY;
  if (!key) return true;
  return req.headers.authorization === `Bearer ${key}`;
}

type SubscribeBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

function parseBody(req: VercelRequest): SubscribeBody {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as SubscribeBody;
    } catch {
      return {};
    }
  }
  return req.body as SubscribeBody;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  if (!isWebPushConfigured()) {
    return res.status(503).json({ error: "Web push is not configured on the server" });
  }

  try {
    if (req.method === "POST") {
      const body = parseBody(req);
      const endpoint = body.endpoint?.trim();
      const p256dh = body.keys?.p256dh?.trim();
      const auth = body.keys?.auth?.trim();
      if (!endpoint || !p256dh || !auth) {
        return res.status(400).json({ error: "Invalid push subscription" });
      }

      const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
      await upsertPushSubscription(endpoint, p256dh, auth, userAgent);
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const body = parseBody(req);
      const endpoint = body.endpoint?.trim();
      if (!endpoint) return res.status(400).json({ error: "endpoint required" });
      await removePushSubscription(endpoint);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Push subscribe error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
