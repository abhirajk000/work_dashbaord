import type { DashboardState } from "../../lib/dashboard-types";

const API_URL = "/api/dashboard";

function getHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

export async function fetchDashboardState(): Promise<DashboardState | null> {
  const res = await fetch(API_URL, { headers: getHeaders(), credentials: "include" });
  if (res.status === 401 || res.status === 403) throw new Error("Unauthorized");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load dashboard (${res.status})`);
  return res.json() as Promise<DashboardState>;
}

export async function saveDashboardStateRemote(state: DashboardState): Promise<void> {
  const res = await fetch(API_URL, {
    method: "PUT",
    headers: getHeaders(),
    credentials: "include",
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`Failed to save dashboard (${res.status})`);
}

export function saveDashboardStateKeepalive(state: DashboardState): void {
  fetch(API_URL, {
    method: "PUT",
    headers: getHeaders(),
    credentials: "include",
    body: JSON.stringify(state),
    keepalive: true,
  }).catch(() => {});
}
