import { sendNtfyNotification } from "./ntfy.js";
import {
  alreadyLogged,
  markLogged,
  NTFY_TOPIC,
  WEB_PUSH_LOG_TOPIC,
} from "./notification-log.js";
import { isWebPushConfigured, sendWebPushToAll } from "./web-push.js";

export type DeliverOptions = {
  tags?: string;
  delay?: string;
  sequenceId?: string;
  tag?: string;
  skipLog?: boolean;
  logDate?: string;
  kind?: string;
};

export async function deliverNtfyReminder(
  title: string,
  body: string,
  options?: DeliverOptions
): Promise<boolean> {
  const kind = options?.kind;
  const logDate = options?.logDate;

  if (!options?.skipLog && kind && logDate && (await alreadyLogged(NTFY_TOPIC, kind, logDate))) {
    return false;
  }

  await sendNtfyNotification(title, body, {
    tags: options?.tags,
    delay: options?.delay,
    sequenceId: options?.sequenceId,
  });

  if (!options?.skipLog && kind && logDate) {
    await markLogged(NTFY_TOPIC, kind, logDate);
  }

  return true;
}

export async function deliverWebPushReminder(
  title: string,
  body: string,
  options?: DeliverOptions
): Promise<boolean> {
  if (!isWebPushConfigured()) return false;

  const kind = options?.kind;
  const logDate = options?.logDate;

  if (!options?.skipLog && kind && logDate && (await alreadyLogged(WEB_PUSH_LOG_TOPIC, kind, logDate))) {
    return false;
  }

  const sent = await sendWebPushToAll({
    title,
    body,
    tag: options?.tag ?? options?.kind,
  });

  if (sent <= 0) return false;

  if (!options?.skipLog && kind && logDate) {
    await markLogged(WEB_PUSH_LOG_TOPIC, kind, logDate);
  }

  return true;
}

export async function deliverReminder(
  title: string,
  body: string,
  options?: DeliverOptions
): Promise<{ ntfy: boolean; webPush: boolean }> {
  const [ntfy, webPush] = await Promise.all([
    deliverNtfyReminder(title, body, options).catch(() => false),
    deliverWebPushReminder(title, body, options).catch(() => false),
  ]);

  return { ntfy, webPush };
}
