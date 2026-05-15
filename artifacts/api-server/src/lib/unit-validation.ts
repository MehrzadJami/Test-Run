// AUDIT-6: basic, conservative unit validation.
//
// This is NOT a full UCUM parser. It is a curated allow-list of common
// chemical-engineering units. Known units pass cleanly; unknown or suspicious
// units are flagged so downstream callers can warn the user rather than
// silently accept hallucinated units (e.g. "kJ/zeptosecond").
//
// Out of scope for v1: dimensional analysis, prefix algebra, derived
// composite units beyond the curated list. The follow-up audit item
// (AUDIT-11) covers a real dimensional algebra.

export type UnitKind =
  | "concentration"
  | "rate"
  | "time"
  | "volume"
  | "flow"
  | "pressure"
  | "temperature"
  | "fraction"
  | "dimensionless"
  | "area_per_time"
  | "light"
  | "specific_uptake_rate"
  | "yield"
  | "unknown";

export interface UnitValidationResult {
  /** True if the raw unit matched a known pattern (case-insensitive). */
  ok: boolean;
  /** The cleaned-up raw token (whitespace stripped). */
  raw: string;
  /** A canonical-ish printed form for display, when available. */
  normalized?: string;
  /** A high-level kind label so downstream consumers can sanity-check usage. */
  kind: UnitKind;
}

/** Aliases that mean "no unit reported". Treated as `dimensionless` placeholder. */
const PLACEHOLDER_TOKENS = new Set(["", "-", "—", "n/a", "na", "unknown", "—", "dimensionless", "dim", "unitless"]);

/** Compact regex set. Order matters — first match wins. Anchored. */
const PATTERNS: Array<{
  test: RegExp;
  normalized: string;
  kind: UnitKind;
}> = [
  // Concentration
  { test: /^[mµu]?g\/l$/i, normalized: "g/L", kind: "concentration" },
  { test: /^[mµu]?mol\/l$/i, normalized: "mol/L", kind: "concentration" },
  { test: /^[mµu]?mol\/m[\^]?3$/i, normalized: "mol/m^3", kind: "concentration" },
  { test: /^[mµu]?g\/m[\^]?3$/i, normalized: "g/m^3", kind: "concentration" },
  { test: /^kg\/m[\^]?3$/i, normalized: "kg/m^3", kind: "concentration" },
  { test: /^[mµu]?gx?\/[mµu]?gs?$/i, normalized: "gX/gS", kind: "yield" },
  { test: /^[mµu]?g\/[mµu]?g$/i, normalized: "g/g", kind: "yield" },

  // Rate (inverse time)
  { test: /^1\/(h|hr|hour)$/i, normalized: "1/h", kind: "rate" },
  { test: /^(h|hr|hour)[\^]?-1$/i, normalized: "1/h", kind: "rate" },
  { test: /^1\/(min|minute)$/i, normalized: "1/min", kind: "rate" },
  { test: /^(min|minute)[\^]?-1$/i, normalized: "1/min", kind: "rate" },
  { test: /^1\/(s|sec|second)$/i, normalized: "1/s", kind: "rate" },
  { test: /^(s|sec|second)[\^]?-1$/i, normalized: "1/s", kind: "rate" },
  { test: /^1\/(d|day)$/i, normalized: "1/day", kind: "rate" },
  { test: /^(d|day)[\^]?-1$/i, normalized: "1/day", kind: "rate" },

  // Time
  { test: /^(h|hr|hour)s?$/i, normalized: "h", kind: "time" },
  { test: /^(min|minute)s?$/i, normalized: "min", kind: "time" },
  { test: /^(s|sec|second)s?$/i, normalized: "s", kind: "time" },
  { test: /^(d|day)s?$/i, normalized: "day", kind: "time" },

  // Volume
  { test: /^[mµu]?l$/i, normalized: "L", kind: "volume" },
  { test: /^m[\^]?3$/i, normalized: "m^3", kind: "volume" },

  // Flow
  { test: /^[mµu]?l\/(h|hr|hour)$/i, normalized: "L/h", kind: "flow" },
  { test: /^[mµu]?l\/(min|minute)$/i, normalized: "mL/min", kind: "flow" },
  { test: /^m[\^]?3\/(h|hr|hour|s)$/i, normalized: "m^3/h", kind: "flow" },

  // Pressure
  { test: /^pa$/i, normalized: "Pa", kind: "pressure" },
  { test: /^kpa$/i, normalized: "kPa", kind: "pressure" },
  { test: /^bar$/i, normalized: "bar", kind: "pressure" },
  { test: /^atm$/i, normalized: "atm", kind: "pressure" },
  { test: /^mmhg$/i, normalized: "mmHg", kind: "pressure" },
  { test: /^psi$/i, normalized: "psi", kind: "pressure" },

  // Temperature
  { test: /^k$/i, normalized: "K", kind: "temperature" },
  { test: /^°?c$/i, normalized: "°C", kind: "temperature" },
  { test: /^°?f$/i, normalized: "°F", kind: "temperature" },

  // Fraction / dimensionless
  { test: /^%$/i, normalized: "%", kind: "fraction" },
  { test: /^percent$/i, normalized: "%", kind: "fraction" },
  { test: /^ppm$/i, normalized: "ppm", kind: "fraction" },
  { test: /^v\/v$/i, normalized: "v/v", kind: "fraction" },
  { test: /^w\/w$/i, normalized: "w/w", kind: "fraction" },

  // Area per time (diffusivity)
  { test: /^m[\^]?2\/(s|sec)$/i, normalized: "m^2/s", kind: "area_per_time" },
  { test: /^cm[\^]?2\/(s|sec)$/i, normalized: "cm^2/s", kind: "area_per_time" },

  // Light (photon flux)
  { test: /^[mµu]?mol\/m[\^]?2\/(s|sec)$/i, normalized: "umol/m^2/s", kind: "light" },
  { test: /^[mµu]?e\/m[\^]?2\/(s|sec)$/i, normalized: "uE/m^2/s", kind: "light" },

  // Specific uptake / production rates (g X^-1 h^-1)
  { test: /^[mµu]?g[a-z0-9]*\/[mµu]?g[a-z0-9]*\/(h|hr|hour)$/i, normalized: "gO2/gX/h", kind: "specific_uptake_rate" },
];

/**
 * Validate a free-form unit string against the curated allow-list.
 *
 * Behaviour:
 *  - Whitespace is stripped before matching.
 *  - Empty / "-" / "unknown" / "n/a" → `{ ok: true, kind: "dimensionless" }`
 *    (these are intentional placeholders, not hallucinations).
 *  - A matched pattern → `{ ok: true, normalized, kind }`.
 *  - Anything else → `{ ok: false, kind: "unknown" }` so callers can flag it.
 *
 * No mutation of the input. No throwing.
 */
export function validateUnit(raw: string | null | undefined): UnitValidationResult {
  const trimmed = (raw ?? "").trim();
  const stripped = trimmed.replace(/\s+/g, "");
  const lower = stripped.toLowerCase();

  if (PLACEHOLDER_TOKENS.has(lower)) {
    return { ok: true, raw: trimmed, normalized: "dimensionless", kind: "dimensionless" };
  }

  for (const pattern of PATTERNS) {
    if (pattern.test.test(stripped)) {
      return { ok: true, raw: trimmed, normalized: pattern.normalized, kind: pattern.kind };
    }
  }

  return { ok: false, raw: trimmed, kind: "unknown" };
}

/**
 * Convenience: return only the suspicious units from a list, paired with the
 * row symbol they came from. Suitable for surfacing as audit warnings.
 */
export function findUnitWarnings(
  rows: Array<{ symbol: string; unit: string }>,
): Array<{ symbol: string; unit: string }> {
  const out: Array<{ symbol: string; unit: string }> = [];
  for (const row of rows) {
    if (!validateUnit(row.unit).ok) {
      out.push({ symbol: row.symbol, unit: row.unit });
    }
  }
  return out;
}
