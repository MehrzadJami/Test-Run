import { describe, expect, it } from "vitest";

import { findUnitWarnings, validateUnit } from "../unit-validation";

describe("validateUnit (AUDIT-6 basic unit validation)", () => {
  it("accepts the curated allow-list of common ChemE units", () => {
    const allowed = [
      "g/L", "mg/L", "mol/L", "mmol/L",
      "1/h", "h^-1", "h-1", "1/day", "day^-1", "min-1",
      "L/h", "mL/min", "m3/h",
      "Pa", "bar", "atm", "kPa", "mmHg",
      "K", "°C", "C", "°F",
      "%", "percent", "ppm", "v/v",
      "m^2/s", "m2/s",
      "umol/m^2/s", "umol/m2/s",
      "gO2/gX/h",
    ];
    for (const unit of allowed) {
      const result = validateUnit(unit);
      expect(result.ok).toBe(true);
      expect(result.kind).not.toBe("unknown");
    }
  });

  it("treats placeholder tokens as dimensionless instead of unknown", () => {
    for (const placeholder of ["", "-", "n/a", "N/A", "unknown", "dimensionless", "unitless"]) {
      const result = validateUnit(placeholder);
      expect(result.ok).toBe(true);
      expect(result.kind).toBe("dimensionless");
    }
  });

  it("flags nonsense or hallucinated units", () => {
    const garbage = [
      "kJ/zeptosecond",
      "yotta-mole-per-attosecond",
      "g/L/s/m^4",
      "gibberish-1",
      "ppppm",
    ];
    for (const unit of garbage) {
      const result = validateUnit(unit);
      expect(result.ok).toBe(false);
      expect(result.kind).toBe("unknown");
    }
  });

  it("normalises common rate aliases to a canonical form", () => {
    expect(validateUnit("h^-1").normalized).toBe("1/h");
    expect(validateUnit("h-1").normalized).toBe("1/h");
    expect(validateUnit("1/h").normalized).toBe("1/h");
    expect(validateUnit("day^-1").normalized).toBe("1/day");
  });
});

describe("findUnitWarnings", () => {
  it("returns only the rows whose unit is not on the allow-list", () => {
    const rows = [
      { symbol: "mumax", unit: "1/h" },         // ok
      { symbol: "Ks", unit: "g/L" },             // ok
      { symbol: "weird1", unit: "kJ/zeptosecond" }, // flagged
      { symbol: "weird2", unit: "" },            // ok (placeholder)
      { symbol: "weird3", unit: "ppppm" },       // flagged
    ];
    const flagged = findUnitWarnings(rows);
    expect(flagged.map((row) => row.symbol).sort()).toEqual(["weird1", "weird3"]);
  });
});
