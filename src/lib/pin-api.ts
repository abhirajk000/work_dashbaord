function pinApiUrl(username: string, legacyRoot = false): string {
  return legacyRoot ? "/api/pin" : `/api/${encodeURIComponent(username)}/pin`;
}

export async function fetchPinSession(username: string, legacyRoot = false): Promise<boolean> {
  const res = await fetch(pinApiUrl(username, legacyRoot), { credentials: "include" });
  if (!res.ok) return false;
  const data = (await res.json()) as { unlocked?: boolean };
  return Boolean(data.unlocked);
}

export async function verifyPinRemote(
  username: string,
  pin: string,
  legacyRoot = false
): Promise<boolean> {
  const res = await fetch(pinApiUrl(username, legacyRoot), {
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
