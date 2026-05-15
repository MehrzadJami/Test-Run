import { describe, it, expect } from "vitest";
import { runUnitCheck, type UnitCheckReport } from "../unit-checker";
import type { AnalysisEquation, AnalysisVariable, AnalysisParameter } from "../reproducibility";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEquation(overrides: Partial<AnalysisEquation> = {}): AnalysisEquation {
  return {
    id: 1,
    latex: "\\frac{dX}{dt} = (\\mu - D) X",
    description: "Biomass balance",
    sourceQuote: "Andrews (1968) Eq. 1",
    ...overrides,
  };
}

function makeVariable(overrides: Partial<AnalysisVariable> = {}): AnalysisVariable {
  return {
    id: 1,
    symbol: "X",
    name: "Biomass",
    unit: "g/L",
    role: "state",
    sourceQuote: "X is biomass.",
    ...overrides,
  };
}

function makeParameter(overrides: Partial<AnalysisParameter> = {}): AnalysisParameter {
  return {
    id: 1,
    symbol: "mu_max",
    value: 0.53,
    unit: "1/h",
    confidence: "high",
    sourceQuote: "mu_max = 0.53 1/h",
    ...overrides,
  };
}

// ─── Return shape ─────────────────────────────────────────────────────────────

describe("runUnitCheck — return shape", () => {
  it("returns object with unit_check_status and warnings array", () => {
    const report: UnitCheckReport = runUnitCheck([], [], [], null);
    expect(report).toHaveProperty("unit_check_status");
    expect(report).toHaveProperty("warnings");
    expect(Array.isArray(report.warnings)).toBe(true);
  });

  it("unit_check_status is one of: pass | warning | fail", () => {
    const report = runUnitCheck([], [], [], null);
    expect(["pass", "warning", "fail"]).toContain(report.unit_check_status);
  });

  it("each warning has severity, message, equation_or_symbol, suggestion", () => {
    const eqs = [makeEquation({ latex: "dX/dt = mu * X" })];
    const vars = [makeVariable({ unit: "" })];
    const report = runUnitCheck(eqs, vars, [], null);
    for (const w of report.warnings) {
      expect(w).toHaveProperty("severity");
      expect(w).toHaveProperty("message");
      expect(w).toHaveProperty("equation_or_symbol");
      expect(w).toHaveProperty("suggestion");
      expect(["low", "medium", "high"]).toContain(w.severity);
    }
  });
});

// ─── Clean inputs ─────────────────────────────────────────────────────────────

describe("runUnitCheck — clean inputs", () => {
  it("returns pass status for empty inputs", () => {
    const report = runUnitCheck([], [], [], null);
    expect(report.unit_check_status).toBe("pass");
    expect(report.warnings).toHaveLength(0);
  });

  it("returns pass for fully annotated variables and parameters with correct kinetic units", () => {
    const variables = [
      makeVariable({ symbol: "X", unit: "g/L", role: "state" }),
      makeVariable({ id: 2, symbol: "S", unit: "g/L", role: "state" }),
    ];
    const parameters = [
      makeParameter({ symbol: "mu_max", unit: "1/h" }),
      makeParameter({ id: 2, symbol: "D", unit: "1/h" }),
    ];
    const report = runUnitCheck([], variables, parameters, null);
    expect(report.unit_check_status).toBe("pass");
  });
});

// ─── Missing units → warnings ──────────────────────────────────────────────────

describe("runUnitCheck — missing units", () => {
  it("flags state variable with empty unit as a warning", () => {
    const variables = [makeVariable({ unit: "" })];
    const report = runUnitCheck([], variables, [], null);
    expect(report.unit_check_status).not.toBe("pass");
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it("flags parameter with no unit as a warning", () => {
    const parameters = [makeParameter({ unit: "" })];
    const report = runUnitCheck([], [], parameters, null);
    const msgs = report.warnings.map((w) => w.equation_or_symbol);
    expect(msgs.some((s) => s.includes("mu_max"))).toBe(true);
  });

  it("unit_check_status is warning or fail when warnings exist", () => {
    const variables = [makeVariable({ unit: "" })];
    const report = runUnitCheck([], variables, [], null);
    expect(["warning", "fail"]).toContain(report.unit_check_status);
  });
});

// ─── Mixed time-scale detection ───────────────────────────────────────────────

describe("runUnitCheck — mixed time scales", () => {
  it("flags mixed hours and minutes as a warning", () => {
    const variables = [
      makeVariable({ symbol: "X", unit: "g/L/h", role: "state" }),
      makeVariable({ id: 2, symbol: "S", unit: "g/L/min", role: "state" }),
    ];
    const report = runUnitCheck([], variables, [], null);
    const hasMixed = report.warnings.some((w) =>
      w.message.toLowerCase().includes("time") ||
      w.message.toLowerCase().includes("scale") ||
      w.message.toLowerCase().includes("mix"),
    );
    expect(hasMixed).toBe(true);
  });
});

// ─── Undefined symbols ────────────────────────────────────────────────────────

describe("runUnitCheck — undefined symbols in equations", () => {
  it("flags symbol listed in variables_involved but not in tables", () => {
    const equation = makeEquation({ latex: "dX/dt = mu * X - D * X" });
    const variables = [makeVariable({ symbol: "X", unit: "g/L" })];
    const raw = {
      equations: [
        {
          label: "(1)",
          equation_latex: "dX/dt = mu * X - D * X",
          variables_involved: ["X", "mu", "D"],
          source_context: "Eq. 1",
        },
      ],
    };
    const report = runUnitCheck([equation], variables, [], raw);
    const symbols = report.warnings.map((w) => w.equation_or_symbol);
    const hasUndefined = symbols.some(
      (s) => s === "mu" || s === "D",
    );
    expect(hasUndefined).toBe(true);
  });
});


  it("ignores derivative notation and placeholder states in exact Monod equations", () => {
    const equations = [
      makeEquation({ id: 1, latex: "mu = mumax*S/(Ks + S)", description: "Monod growth" }),
      makeEquation({ id: 2, latex: "dX/dt = (mu - D)*X", description: "Biomass balance" }),
      makeEquation({ id: 3, latex: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X", description: "Substrate balance" }),
    ];
    const variables = [
      makeVariable({ id: 0, symbol: "unknown", name: "unknown", unit: "", role: "state" }),
      makeVariable({ id: 1, symbol: "X", unit: "g/L", role: "state" }),
      makeVariable({ id: 2, symbol: "S", unit: "g/L", role: "state" }),
      makeVariable({ id: 3, symbol: "mu", unit: "1/h", role: "output" }),
    ];
    const parameters = [
      makeParameter({ id: 1, symbol: "mumax", unit: "1/h" }),
      makeParameter({ id: 2, symbol: "Ks", unit: "g/L" }),
      makeParameter({ id: 3, symbol: "D", unit: "1/h" }),
      makeParameter({ id: 4, symbol: "Sin", unit: "g/L" }),
      makeParameter({ id: 5, symbol: "Yxs", unit: "gX/gS" }),
    ];
    const report = runUnitCheck(equations, variables, parameters, {
      equations: [
        { label: "(1)", equation_latex: "mu = mumax*S/(Ks + S)", variables_involved: ["mu", "mumax", "S", "Ks"] },
        { label: "(2)", equation_latex: "dX/dt = (mu - D)*X", variables_involved: ["X", "mu", "D"] },
        { label: "(3)", equation_latex: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X", variables_involved: ["S", "D", "Sin", "Yxs", "mu", "X"] },
      ],
    });
    const symbols = report.warnings.map((warning) => warning.equation_or_symbol);
    const messages = report.warnings.map((warning) => warning.message).join("\n");

    expect(symbols).not.toContain("unknown");
    expect(symbols).not.toContain("dX");
    expect(symbols).not.toContain("dS");
    expect(messages).not.toMatch(/Ks.*first-order rate/i);
  });

  it("does not treat initial-condition rows as unused ODE parameters", () => {
    const equations = [
      makeEquation({ latex: "dX/dt = (mu - D)*X", description: "Biomass balance" }),
    ];
    const variables = [
      makeVariable({ symbol: "X", unit: "g/L", role: "state" }),
    ];
    const parameters = [
      makeParameter({ symbol: "D", unit: "1/h" }),
      makeParameter({
        symbol: "X0",
        name: "Initial condition for X",
        value: 0.1,
        unit: "g/L",
        sourceQuote: "Initial conditions are X0 = 0.1 g/L.",
      }),
    ];
    const report = runUnitCheck(equations, variables, parameters, null);
    const messages = report.warnings.map((warning) => warning.message).join("\n");

    expect(messages).not.toMatch(/Parameter "X0" does not appear/);
  });

// ─── Determinism ──────────────────────────────────────────────────────────────

describe("runUnitCheck — determinism", () => {
  it("two identical calls return identical results", () => {
    const vars = [makeVariable({ unit: "" })];
    const r1 = runUnitCheck([], vars, [], null);
    const r2 = runUnitCheck([], vars, [], null);
    expect(r1.unit_check_status).toBe(r2.unit_check_status);
    expect(r1.warnings.length).toBe(r2.warnings.length);
  });
});
