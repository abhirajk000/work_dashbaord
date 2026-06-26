/** @deprecated Legacy global topic — use getNtfyTopicForUser(username) */
export const NTFY_TOPIC = "Tracker";

export function getNtfyBaseUrl(): string {
  return (process.env.NTFY_SERVER ?? "https://ntfy.sh").replace(/\/$/, "");
}

export function getNtfyTopicUrl(topic: string): string {
  return `${getNtfyBaseUrl()}/${topic}`;
}

export async function sendNtfyNotification(
  topic: string,
  title: string,
  body: string,
  options?: { click?: string; tags?: string; priority?: string; delay?: string; sequenceId?: string }
): Promise<void> {
  const click =
    options?.click ??
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://trackk.k12hunar.com");

  const tags = (options?.tags ?? "bell")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const payload: Record<string, unknown> = {
    topic,
    title,
    message: body,
    tags,
    click,
    priority: Number(options?.priority ?? "3") || 3,
  };

  if (options?.delay) payload.delay = options.delay;
  if (options?.sequenceId) payload.sequence_id = options.sequenceId;

  const res = await fetch(getNtfyBaseUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ntfy request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
}
