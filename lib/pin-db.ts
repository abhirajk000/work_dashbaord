import { getSql } from "./sql.js";
import { PIN_ROW_ID, isValidPin, verifyPin } from "./pin.js";

export async function checkPin(pin: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const sql = getSql();
  const rows = await sql`
    SELECT pin_hash, salt FROM app_pin WHERE id = ${PIN_ROW_ID} LIMIT 1
  `;
  if (!rows.length) return false;
  const row = rows[0] as { pin_hash: string; salt: string };
  return verifyPin(pin, row.salt, row.pin_hash);
}
