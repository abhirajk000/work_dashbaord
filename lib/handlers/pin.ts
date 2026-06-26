import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkUserPin } from "../users-db.js";
import { isValidPin } from "../pin.js";
import {
  createSessionToken,
  getSessionUsername,
  sessionCookieHeader,
} from "../pin-session.js";

type PinBody = {
  action?: string;
  pin?: string;
};

export async function handlePinApi(
  req: VercelRequest,
  res: VercelResponse,
  username: string
): Promise<void> {
  if (req.method === "GET") {
    const sessionUser = getSessionUsername(req);
    return void res.status(200).json({ unlocked: sessionUser === username });
  }

  if (req.method === "POST") {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as PinBody;
    const action = body.action?.trim();
    const pin = body.pin?.trim() ?? "";

    if (action !== "verify") {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    if (!isValidPin(pin)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const ok = await checkUserPin(username, pin);
    if (!ok) {
      res.status(401).json({ error: "Invalid request" });
      return;
    }

    const token = createSessionToken(username);
    res.setHeader("Set-Cookie", sessionCookieHeader(token));
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed" });
}
