import { describe, it, expect } from "vitest";
import {
  parseUnit,
  buildDimMap,
  normalizeEqText,
  runFormalDimensionalAnalysis,
  dimEq,
  dimLabel,
  isDimensionless,
  type Dim,
} from "../dimensional-analysis";
import type { AnalysisEquation, AnalysisVariable, AnalysisParameter } from "../reproducibility";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function mkVar(sym: string, unit: string, role = "state"): AnalysisVariable {
  return { id: 1, symbol: sym, name: sym, unit, role, sourceQuote: "" };
}
function mkParam(sym: string, unit: string, value?: number): AnalysisParameter {
  return { id: 1, symbol: sym, value: value ?? 0.5, unit, confidence: "high", sourceQuote: "" };
}
function mkEq(latex: string, desc = ""): AnalysisEquation {
  return { id: 1, latex, description: desc, sourceQuote: "" };
}

// ─── parseUnit ────────────────────────────────────────────────────────────────

describe("parseUnit — base cases", () => {
  it("empty string → dimensionless", () => {
    const d = parseUnit("");
    expect(d).not.toBeNull();
    expect(isDimensionless(d!)).toBe(true);
  });

  it('"dimensionless" → zero vector', () => {
    expect(isDimensionless(parseUnit("dimensionless")!)).toBe(true);
  });

  it('"g/L" → M/V', () => {
    const d = parseUnit("g/L")!;
    expect(d.M).toBe(1);
    expect(d.V).toBe(-1);
    expect(d.T).toBe(0);
  });

  it('"g/L" case-insensitive', () => {
    const d = parseUnit("G/L")!;
    expect(d).not.toBeNull();
  });

  it('"1/h" → 1/T', () => {
    const d = parseUnit("1/h")!;
    expect(d.T).toBe(-1);
    expect(d.M).toBe(0);
    expect(d.V).toBe(0);
  });

  it('"h^-1" → 1/T', () => {
    const d = parseUnit("h^-1")!;
    expect(d.T).toBe(-1);
  });

  it('"h-1" (no caret) → 1/T', () => {
    const d = parseUnit("h-1")!;
    expect(d.T).toBe(-1);
  });

  it('"g/L/h" → M/V/T', () => {
    const d = parseUnit("g/L/h")!;
    expect(d.M).toBe(1);
    expect(d.V).toBe(-1);
    expect(d.T).toBe(-1);
  });

  it('"h" → T', () => {
    const d = parseUnit("h")!;
    expect(d.T).toBe(1);
    expect(d.M).toBe(0);
  });

  it('"g/g" → dimensionless', () => {
    expect(isDimensionless(parseUnit("g/g")!)).toBe(true);
  });

  it('"g-X/g-S" → dimensionless (biomass-yield notation)', () => {
    expect(isDimensionless(parseUnit("g-X/g-S")!)).toBe(true);
  });

  it('"mol/L" → N/V', () => {
    const d = parseUnit("mol/L")!;
    expect(d.N).toBe(1);
    expect(d.V).toBe(-1);
  });

  it("returns null for unrecognised units", () => {
    expect(parseUnit("furlongs/fortnight")).toBeNull();
  });
});

// ─── dimLabel ─────────────────────────────────────────────────────────────────

describe("dimLabel", () => {
  it("dimensionless → 'dimensionless'", () => {
    expect(dimLabel({ M: 0, V: 0, T: 0, N: 0 })).toBe("dimensionless");
  });

  it("M/V → 'M/V'", () => {
    expect(dimLabel({ M: 1, V: -1, T: 0, N: 0 })).toBe("M/V");
  });

  it("1/T → '1/T'", () => {
    expect(dimLabel({ M: 0, V: 0, T: -1, N: 0 })).toBe("1/T");
  });

  it("M/V/T → 'M/V·T'", () => {
    const label = dimLabel({ M: 1, V: -1, T: -1, N: 0 });
    expect(label).toContain("M");
    expect(label).toContain("V");
    expect(label).toContain("T");
  });
});

// ─── buildDimMap ──────────────────────────────────────────────────────────────

describe("buildDimMap", () => {
  it("maps known symbols correctly", () => {
    const vars = [mkVar("X", "g/L"), mkVar("S", "g/L")];
    const params = [mkParam("mumax", "1/h"), mkParam("Ks", "g/L")];
    const m = buildDimMap(vars, params);
    expect(m.has("X")).toBe(true);
    expect(m.has("mumax")).toBe(true);
    const muDim = m.get("mumax")!.dim;
    expect(muDim.T).toBe(-1);
  });

  it("excludes symbols with unparseable units", () => {
    const vars = [mkVar("X", "furlongs/fortnight")];
    const m = buildDimMap(vars, []);
    expect(m.has("X")).toBe(false);
  });

  it("does not overwrite variable with parameter of same name", () => {
    const vars = [mkVar("X", "g/L")];
    const params = [mkParam("X", "1/h")]; // wrong unit — should not overwrite
    const m = buildDimMap(vars, params);
    expect(m.get("X")!.source).toBe("variable");
  });
});

// ─── normalizeEqText ──────────────────────────────────────────────────────────

describe("normalizeEqText", () => {
  it("converts LaTeX mu → 'mu'", () => {
    expect(normalizeEqText("\\mu = \\mu_{max} * S")).toContain("mu");
  });

  it("converts Unicode μ → 'mu'", () => {
    expect(normalizeEqText("μ = μmax * S / (Ks + S)")).toContain("mu");
  });

  it("unfolds \\frac{A}{B}", () => {
    const n = normalizeEqText("\\frac{dX}{dt} = mu");
    expect(n).toContain("dx");
    expect(n).toContain("dt");
  });
});

// ─── Monod pattern ───────────────────────────────────────────────────────────

describe("runFormalDimensionalAnalysis — Monod kinetics", () => {
  const vars = [mkVar("S", "g/L"), mkVar("mu", "1/h")];
  const params = [mkParam("mumax", "1/h"), mkParam("Ks", "g/L")];

  it("detects and passes a valid Monod equation", () => {
    const eqs = [mkEq("mu = mumax * S / (Ks + S)")];
    const r = runFormalDimensionalAnalysis(eqs, vars, params);
    const eq = r.equationResults.find((e) => e.patternName === "Monod growth kinetics");
    expect(eq).toBeDefined();
    expect(eq!.parsed).toBe(true);
    expect(eq!.dimensionsMatch).toBe(true);
    expect(eq!.issues).toHaveLength(0);
  });

  it("flags mismatch when mumax has wrong dimension", () => {
    const badParams = [mkParam("mumax", "g/L"), mkParam("Ks", "g/L")]; // mumax as conc — wrong
    const eqs = [mkEq("mu = mumax * S / (Ks + S)")];
    const r = runFormalDimensionalAnalysis(eqs, vars, badParams);
    const eq = r.equationResults.find((e) => e.patternName === "Monod growth kinetics");
    expect(eq!.issues.length).toBeGreaterThan(0);
  });

  it("flags mismatch when Ks has different dimension from S", () => {
    const mismatchParams = [mkParam("mumax", "1/h"), mkParam("Ks", "mol/L")]; // S=g/L, Ks=mol/L
    const eqs = [mkEq("mu = mumax * S / (Ks + S)")];
    const r = runFormalDimensionalAnalysis(eqs, vars, mismatchParams);
    const eq = r.equationResults.find((e) => e.patternName === "Monod growth kinetics");
    expect(eq!.issues.some((i) => i.toLowerCase().includes("ks") || i.toLowerCase().includes("same"))).toBe(true);
  });
});

// ─── ODE LHS check ────────────────────────────────────────────────────────────

describe("runFormalDimensionalAnalysis — ODE LHS", () => {
  it("detects dX/dt and reports M/V/T for g/L state variable", () => {
    const vars = [mkVar("X", "g/L"), mkVar("t", "h")];
    const eqs = [mkEq("dX/dt = (mu - D) * X")];
    const r = runFormalDimensionalAnalysis(eqs, vars, []);
    const eq = r.equationResults[0];
    expect(eq.parsed).toBe(true);
    expect(eq.lhsDimLabel).toBeDefined();
    expect(eq.lhsDimLabel).toContain("M");
  });

  it("reports issue when state variable has no entry in tables", () => {
    const eqs = [mkEq("dZ/dt = something")]; // Z not defined
    const r = runFormalDimensionalAnalysis(eqs, [], []);
    const eq = r.equationResults[0];
    expect(eq.parsed).toBe(true);
    expect(eq.issues.length).toBeGreaterThan(0);
  });
});

// ─── kLa pattern ─────────────────────────────────────────────────────────────

describe("runFormalDimensionalAnalysis — kLa transfer", () => {
  it("detects kLa and passes when kLa is 1/h", () => {
    const params = [mkParam("kLa", "1/h")];
    const eqs = [mkEq("dO/dt = kLa * (Cstar - O) - qO2 * X")];
    const r = runFormalDimensionalAnalysis(eqs, [], params);
    const eq = r.equationResults.find((e) => e.patternName?.includes("kLa"));
    expect(eq).toBeDefined();
    expect(eq!.parsed).toBe(true);
    expect(eq!.issues.length).toBe(0);
  });

  it("flags kLa with wrong dimension (e.g. g/L)", () => {
    const params = [mkParam("kLa", "g/L")]; // wrong
    const eqs = [mkEq("OTR = kLa * (Cstar - C)")];
    const r = runFormalDimensionalAnalysis(eqs, [], params);
    const eq = r.equationResults.find((e) => e.patternName?.includes("kLa"));
    expect(eq!.issues.length).toBeGreaterThan(0);
  });
});

// ─── Fallback for unsupported equations ───────────────────────────────────────

describe("runFormalDimensionalAnalysis — fallback", () => {
  it("marks unsupported equations as parsed=false", () => {
    const eqs = [mkEq("q_P = q_{Pmax} * S^2 / (K_P^2 + S^2) - alpha * P")]; // power-law, not supported
    const r = runFormalDimensionalAnalysis(eqs, [], []);
    const eq = r.equationResults[0];
    expect(eq.parsed).toBe(false);
    expect(eq.patternName).toBeNull();
  });

  it("returns unavailable status when no equations provided", () => {
    const r = runFormalDimensionalAnalysis([], [], []);
    expect(r.status).toBe("unavailable");
    expect(r.formalCheckAvailable).toBe(false);
  });

  it("parsedCount=0 when no patterns match", () => {
    const eqs = [mkEq("completely_arbitrary_expression = foo + bar * baz")];
    const r = runFormalDimensionalAnalysis(eqs, [], []);
    expect(r.parsedCount).toBe(0);
  });
});

// ─── Status aggregation ───────────────────────────────────────────────────────

describe("runFormalDimensionalAnalysis — status rollup", () => {
  it("status=pass when all parsed equations are consistent", () => {
    const vars = [mkVar("S", "g/L"), mkVar("mu", "1/h")];
    const params = [mkParam("mumax", "1/h"), mkParam("Ks", "g/L")];
    const eqs = [mkEq("mu = mumax * S / (Ks + S)")];
    const r = runFormalDimensionalAnalysis(eqs, vars, params);
    expect(r.status).toBe("pass");
  });

  it("status=warning when there are issues but no hard fail", () => {
    const eqs = [mkEq("dZ/dt = something")]; // Z undefined → issue, but not dimensionsMatch=false
    const r = runFormalDimensionalAnalysis(eqs, [], []);
    expect(["warning", "fail"]).toContain(r.status);
  });
});
