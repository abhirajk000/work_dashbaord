import { checkUserPin } from "./users-db.js";

/** @deprecated Use checkUserPin(username, pin) */
export async function checkPin(username: string, pin: string): Promise<boolean> {
  return checkUserPin(username, pin);
}
