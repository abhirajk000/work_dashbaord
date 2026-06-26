/** Original single-user account — used for track.abhiraj.xyz/ (no path). */
export const LEGACY_USERNAME = "default";

export function resolveLegacyUsername(): string {
  const fromEnv = process.env.LEGACY_USERNAME ?? process.env.VITE_LEGACY_USERNAME;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().toLowerCase();
  }
  return LEGACY_USERNAME;
}
