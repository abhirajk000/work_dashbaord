import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUsernameFromQuery } from "../lib/api-user.js";
import { handlePinApi } from "../lib/handlers/pin.js";

import { resolveLegacyUsername } from "../lib/legacy-user.js";

const LEGACY_USERNAME = resolveLegacyUsername();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const fromQuery = getUsernameFromQuery(req);
    const body =
      typeof req.body === "string"
        ? (JSON.parse(req.body) as { username?: string })
        : (req.body as { username?: string } | undefined);
    const username = fromQuery ?? body?.username?.trim().toLowerCase() ?? LEGACY_USERNAME;
    await handlePinApi(req, res, username);
  } catch (err) {
    console.error("PIN API error");
    return res.status(500).json({ error: "Internal server error" });
  }
}
