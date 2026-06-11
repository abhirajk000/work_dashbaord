import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkPin } from "../lib/pin-db.js";
import { isValidPin } from "../lib/pin.js";
import {
  createSessionToken,
  isSessionAuthorized,
  sessionCookieHeader,
} from "../lib/pin-session.js";

type PinBody = {
  action?: string;
  pin?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({ unlocked: isSessionAuthorized(req) });
    }

    if (req.method === "POST") {
      const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as PinBody;
      const action = body.action?.trim();
      const pin = body.pin?.trim() ?? "";

      if (action !== "verify") {
        return res.status(400).json({ error: "Invalid request" });
      }

      if (!isValidPin(pin)) {
        return res.status(400).json({ error: "Invalid request" });
      }

      const ok = await checkPin(pin);
      if (!ok) {
        return res.status(401).json({ error: "Invalid request" });
      }

      const token = createSessionToken();
      res.setHeader("Set-Cookie", sessionCookieHeader(token));
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("PIN API error");
    return res.status(500).json({ error: "Internal server error" });
  }
}
