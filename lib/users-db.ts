import { getSql } from "./sql.js";
import { isValidPin } from "./pin.js";
import { isValidUsername, normalizeUsername } from "./username.js";
import type { DashboardState } from "./dashboard-types.js";
import { DEFAULT_NOTIFICATION_SETTINGS } from "./notification-types.js";

export type UserRow = {
  username: string;
  pin: string;
};

export async function userExists(username: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`SELECT 1 FROM users WHERE username = ${username} LIMIT 1`;
  return rows.length > 0;
}

export async function getUser(username: string): Promise<UserRow | null> {
  const sql = getSql();
  const rows = await sql`SELECT username, pin FROM users WHERE username = ${username} LIMIT 1`;
  if (!rows.length) return null;
  return rows[0] as UserRow;
}

export async function checkUserPin(username: string, pin: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const user = await getUser(username);
  if (!user) return false;
  return user.pin === pin;
}

export async function listUsernames(): Promise<string[]> {
  const sql = getSql();
  const rows = await sql`SELECT username FROM users ORDER BY username`;
  return rows.map((row) => (row as { username: string }).username);
}

function emptyDashboardState(): DashboardState {
  return {
    habits: [],
    weeklyFocus: "",
    reward: "",
    affirmation: "",
    weekStart: new Date().toISOString().slice(0, 10),
    notifications: DEFAULT_NOTIFICATION_SETTINGS,
    studyHours: {},
  };
}

export async function createUser(rawUsername: string, pin: string): Promise<{ username: string } | { error: string }> {
  const username = normalizeUsername(rawUsername);
  if (!isValidUsername(username)) {
    return { error: "Username must be 2–30 characters: lowercase letters, numbers, _ or -" };
  }
  if (!isValidPin(pin)) {
    return { error: "PIN must be 4–6 digits" };
  }
  if (await userExists(username)) {
    return { error: "Username is already taken" };
  }

  const sql = getSql();

  await sql`
    INSERT INTO users (username, pin, created_at)
    VALUES (${username}, ${pin}, NOW())
  `;

  await sql`
    INSERT INTO dashboard_state (id, data, updated_at)
    VALUES (${username}, ${sql.json(emptyDashboardState())}, NOW())
    ON CONFLICT (id) DO NOTHING
  `;

  return { username };
}
