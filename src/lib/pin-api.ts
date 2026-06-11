const API_URL = "/api/pin";

export async function fetchPinSession(): Promise<boolean> {
  const res = await fetch(API_URL, { credentials: "include" });
  if (!res.ok) return false;
  const data = (await res.json()) as { unlocked?: boolean };
  return Boolean(data.unlocked);
}

export async function verifyPinRemote(pin: string): Promise<boolean> {
  const res = await fetch(API_URL, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "verify", pin }),
  });
  if (res.status === 401) return false;
  if (!res.ok) throw new Error("Could not verify");
  const data = (await res.json()) as { ok?: boolean };
  return Boolean(data.ok);
}
