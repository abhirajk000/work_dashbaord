import webpush from "web-push";
import { getSql } from "./sql.js";

type PushSubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WebPushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

function getVapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;

  const subject =
    process.env.VAPID_SUBJECT ??
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "mailto:tracker@example.com");

  return { publicKey, privateKey, subject };
}

function configureWebPush(): boolean {
  const config = getVapidConfig();
  if (!config) return false;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return true;
}

export function isWebPushConfigured(): boolean {
  return Boolean(getVapidConfig());
}

export async function listPushSubscriptionsForUser(username: string): Promise<PushSubscriptionRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, endpoint, p256dh, auth
    FROM push_subscriptions
    WHERE username = ${username}
    ORDER BY updated_at DESC
  `;
  return rows as unknown as PushSubscriptionRow[];
}

export async function upsertPushSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
  username: string,
  userAgent?: string
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, username, user_agent, updated_at)
    VALUES (${endpoint}, ${p256dh}, ${auth}, ${username}, ${userAgent ?? null}, NOW())
    ON CONFLICT (endpoint) DO UPDATE SET
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      username = EXCLUDED.username,
      user_agent = EXCLUDED.user_agent,
      updated_at = NOW()
  `;
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

async function sendWebPushToSubscriptions(
  subscriptions: PushSubscriptionRow[],
  payload: WebPushPayload,
  clickUrl?: string
): Promise<number> {
  if (!configureWebPush()) return 0;
  if (!subscriptions.length) return 0;

  const click =
    clickUrl ??
    payload.url ??
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://trackk.k12hunar.com");

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: click,
    tag: payload.tag,
  });

  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await removePushSubscription(sub.endpoint);
      }
    }
  }

  return sent;
}

export async function sendWebPushToUser(username: string, payload: WebPushPayload): Promise<number> {
  const subscriptions = await listPushSubscriptionsForUser(username);
  const click =
    payload.url ??
    (process.env.APP_URL
      ? `${process.env.APP_URL.replace(/\/$/, "")}/${username}`
      : undefined);
  return sendWebPushToSubscriptions(subscriptions, payload, click);
}

/** @deprecated Use sendWebPushToUser */
export async function sendWebPushToAll(payload: WebPushPayload): Promise<number> {
  if (!configureWebPush()) return 0;
  const sql = getSql();
  const rows = await sql`
    SELECT id, endpoint, p256dh, auth
    FROM push_subscriptions
    ORDER BY updated_at DESC
  `;
  return sendWebPushToSubscriptions(rows as unknown as PushSubscriptionRow[], payload);
}
