import type { DashboardState } from "../../lib/dashboard-types";

function dashboardApiUrl(username: string, legacyRoot = false): string {
  return legacyRoot ? "/api/dashboard" : `/api/${encodeURIComponent(username)}/dashboard`;
}

function getHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

export async function fetchDashboardState(
  username: string,
  legacyRoot = false
): Promise<DashboardState | null> {
  const res = await fetch(dashboardApiUrl(username, legacyRoot), {
    headers: getHeaders(),
    credentials: "include",
  });
  if (res.status === 401 || res.status === 403) throw new Error("Unauthorized");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load dashboard (${res.status})`);
  return res.json() as Promise<DashboardState>;
}

export async function saveDashboardStateRemote(
  username: string,
  state: DashboardState,
  legacyRoot = false
): Promise<void> {
  const res = await fetch(dashboardApiUrl(username, legacyRoot), {
    method: "PUT",
    headers: getHeaders(),
    credentials: "include",
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`Failed to save dashboard (${res.status})`);
}

export function saveDashboardStateKeepalive(
  username: string,
  state: DashboardState,
  legacyRoot = false
): void {
  fetch(dashboardApiUrl(username, legacyRoot), {
    method: "PUT",
    headers: getHeaders(),
    credentials: "include",
    body: JSON.stringify(state),
    keepalive: true,
  }).catch(() => {});
}
