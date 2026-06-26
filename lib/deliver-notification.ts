import { sendNtfyNotification } from "./ntfy.js";
import {
  alreadyLogged,
  markLogged,
  WEB_PUSH_LOG_TOPIC,
} from "./notification-log.js";
import { isWebPushConfigured, sendWebPushToUser } from "./web-push.js";
import { NTFY_TOPIC } from "./notification-types.js";

export type DeliverOptions = {
  tags?: string;
  delay?: string;
  sequenceId?: string;
  tag?: string;
  skipLog?: boolean;
  logDate?: string;
  kind?: string;
  topic?: string;
  username?: string;
};

export async function deliverNtfyReminder(
  title: string,
  body: string,
  options?: DeliverOptions
): Promise<boolean> {
  const topic = options?.topic ?? NTFY_TOPIC;
  const kind = options?.kind;
  const logDate = options?.logDate;

  if (!options?.skipLog && kind && logDate && (await alreadyLogged(topic, kind, logDate))) {
    return false;
  }

  await sendNtfyNotification(topic, title, body, {
    tags: options?.tags,
    delay: options?.delay,
    sequenceId: options?.sequenceId,
  });

  if (!options?.skipLog && kind && logDate) {
    await markLogged(topic, kind, logDate);
  }

  return true;
}

export async function deliverWebPushReminder(
  title: string,
  body: string,
  options?: DeliverOptions
): Promise<boolean> {
  if (!isWebPushConfigured()) return false;
  if (!options?.username) return false;

  const kind = options?.kind;
  const logDate = options?.logDate;
  const logTopic = `${WEB_PUSH_LOG_TOPIC}:${options.username}`;

  if (!options?.skipLog && kind && logDate && (await alreadyLogged(logTopic, kind, logDate))) {
    return false;
  }

  const sent = await sendWebPushToUser(options.username, {
    title,
    body,
    tag: options?.tag ?? options?.kind,
  });

  if (sent <= 0) return false;

  if (!options?.skipLog && kind && logDate) {
    await markLogged(logTopic, kind, logDate);
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
