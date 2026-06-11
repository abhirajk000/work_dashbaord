import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const PIN_ROW_ID = "default";

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

export function hashPin(pin: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${pin}`).digest("hex");
}

export function verifyPin(pin: string, salt: string, hash: string): boolean {
  const computed = hashPin(pin, salt);
  if (computed.length !== hash.length) return false;
  try {
    return timingSafeEqual(
      Uint8Array.from(Buffer.from(computed, "hex")),
      Uint8Array.from(Buffer.from(hash, "hex"))
    );
  } catch {
    return false;
  }
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}
