function getHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

function getVapidPublicKey(): string | null {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    Boolean(getVapidPublicKey())
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.warn("Service worker registration failed:", err);
    return null;
  }
}

export async function getWebPushPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isWebPushSupported()) return "unsupported";
  return Notification.permission;
}

export async function subscribeWebPush(): Promise<"subscribed" | "denied" | "unsupported"> {
  if (!isWebPushSupported()) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const registration = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
  if (!registration) return "unsupported";

  await navigator.serviceWorker.ready;

  const vapidKey = getVapidPublicKey();
  if (!vapidKey) return "unsupported";

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  const res = await fetch("/api/reminders?op=subscribe", {
    method: "POST",
    headers: getHeaders(),
    credentials: "include",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Subscribe failed (${res.status})`);
  }

  return "subscribed";
}

export async function unsubscribeWebPush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: getHeaders(),
    credentials: "include",
    body: JSON.stringify({ endpoint }),
  });
}

export async function syncWebPushSubscription(): Promise<"subscribed" | "not-subscribed" | "unsupported"> {
  if (!isWebPushSupported()) return "unsupported";
  if (Notification.permission !== "granted") return "not-subscribed";

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "not-subscribed";

  const json = subscription.toJSON();
  const res = await fetch("/api/reminders?op=subscribe", {
    method: "POST",
    headers: getHeaders(),
    credentials: "include",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });

  if (!res.ok) return "not-subscribed";
  return "subscribed";
}
