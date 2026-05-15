function flagEnabled(value: unknown, fallback: boolean): boolean {
  if (value == null || String(value).trim() === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
}

export const CHEME_BRAIN_READINESS_AUTHORITY_ENABLED = flagEnabled(
  import.meta.env.VITE_CHEME_BRAIN_READINESS_AUTHORITY,
  import.meta.env.DEV,
);

