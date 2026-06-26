import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createUser } from "../lib/users-db.js";
import { isValidPin } from "../lib/pin.js";
import { isValidUsername, normalizeUsername } from "../lib/username.js";

type SignupBody = {
  username?: string;
  pin?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as SignupBody;
    const username = normalizeUsername(body.username ?? "");
    const pin = body.pin?.trim() ?? "";

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: "Invalid username" });
    }
    if (!isValidPin(pin)) {
      return res.status(400).json({ error: "PIN must be 4–6 digits" });
    }

    const result = await createUser(username, pin);
    if ("error" in result) {
      const status = result.error.includes("taken") ? 409 : 400;
      return res.status(status).json({ error: result.error });
    }

    return res.status(201).json({ ok: true, username: result.username });
  } catch (err) {
    console.error("Signup API error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
