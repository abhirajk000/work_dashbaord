import type { DashboardState } from "./dashboard-types.js";
import { getSql } from "./sql.js";

const ROW_ID = "default";

export async function getDashboardState(): Promise<DashboardState | null> {
  const sql = getSql();
  const rows = await sql`SELECT data FROM dashboard_state WHERE id = ${ROW_ID}`;
  if (!rows.length) return null;
  return rows[0].data as DashboardState;
}

export async function saveDashboardState(data: DashboardState): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO dashboard_state (id, data, updated_at)
    VALUES (${ROW_ID}, ${sql.json(data)}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data,
      updated_at = NOW()
  `;
}
