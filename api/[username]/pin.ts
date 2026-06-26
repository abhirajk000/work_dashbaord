import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUsernameFromQuery } from "../../lib/api-user.js";
import { handlePinApi } from "../../lib/handlers/pin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const username = getUsernameFromQuery(req);
    if (!username) {
      return res.status(400).json({ error: "Invalid username" });
    }
    await handlePinApi(req, res, username);
  } catch (err) {
    console.error("PIN API error");
    return res.status(500).json({ error: "Internal server error" });
  }
}
