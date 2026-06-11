import webpush from "web-push";
import { neon } from "@neondatabase/serverless";

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

function getSql() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set");
  return neon(url);
}

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

export async function listPushSubscriptions(): Promise<PushSubscriptionRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, endpoint, p256dh, auth
    FROM push_subscriptions
    ORDER BY updated_at DESC
  `;
  return rows as PushSubscriptionRow[];
}

export async function upsertPushSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
  userAgent?: string
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, updated_at)
    VALUES (${endpoint}, ${p256dh}, ${auth}, ${userAgent ?? null}, NOW())
    ON CONFLICT (endpoint) DO UPDATE SET
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent,
      updated_at = NOW()
  `;
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

export async function sendWebPushToAll(payload: WebPushPayload): Promise<number> {
  if (!configureWebPush()) return 0;

  const subscriptions = await listPushSubscriptions();
  if (!subscriptions.length) return 0;

  const click =
    payload.url ??
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://track-raaz-0.vercel.app");

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
