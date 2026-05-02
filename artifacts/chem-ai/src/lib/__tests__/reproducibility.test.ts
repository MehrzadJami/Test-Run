import { describe, it, expect } from "vitest";
import {
  analyzeReproducibility,
  type AnalysisEquation,
  type AnalysisVariable,
  type AnalysisParameter,
  type AnalysisAssumption,
} from "../reproducibility";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEquation(overrides: Partial<AnalysisEquation> = {}): AnalysisEquation {
  return {
    id: 1,
    latex: "\\frac{dX}{dt} = (\\mu - D) X",
    description: "Biomass balance",
    sourceQuote: "Equation 1 from Andrews (1968).",
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
    sourceQuote: "X is the biomass concentration.",
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
    sourceQuote: "mu_max = 0.53 1/h from Table 1.",
    ...overrides,
  };
}

function makeAssumption(overrides: Partial<AnalysisAssumption> = {}): AnalysisAssumption {
  return {
    id: 1,
    text: "Perfectly mixed reactor.",
    kind: "assumption",
    ...overrides,
  };
}

// ─── Return shape ─────────────────────────────────────────────────────────────

describe("analyzeReproducibility — return shape", () => {
  it("returns an object with all required fields", () => {
    const report = analyzeReproducibility([], [], [], [], null, "", "", "");
    expect(report).toHaveProperty("overall_score");
    expect(report).toHaveProperty("equations_completeness");
    expect(report).toHaveProperty("parameters_completeness");
    expect(report).toHaveProperty("units_completeness");
    expect(report).toHaveProperty("initial_conditions_completeness");
    expect(report).toHaveProperty("source_traceability");
    expect(report).toHaveProperty("simulation_readiness");
    expect(report).toHaveProperty("main_blockers");
    expect(report).toHaveProperty("recommended_next_steps");
    expect(report).toHaveProperty("missing_items");
  });

  it("overall_score is between 0 and 100", () => {
    const report = analyzeReproducibility([], [], [], [], null, "", "", "");
    expect(report.overall_score).toBeGreaterThanOrEqual(0);
    expect(report.overall_score).toBeLessThanOrEqual(100);
  });

  it("simulation_readiness is one of the three enum values", () => {
    const report = analyzeReproducibility([], [], [], [], null, "", "", "");
    expect(["ready", "partial", "not_ready"]).toContain(report.simulation_readiness);
  });

  it("main_blockers and recommended_next_steps are arrays", () => {
    const report = analyzeReproducibility([], [], [], [], null, "", "", "");
    expect(Array.isArray(report.main_blockers)).toBe(true);
    expect(Array.isArray(report.recommended_next_steps)).toBe(true);
  });

  it("missing_items is an array", () => {
    const report = analyzeReproducibility([], [], [], [], null, "", "", "");
    expect(Array.isArray(report.missing_items)).toBe(true);
  });
});

// ─── Empty inputs → low score ─────────────────────────────────────────────────

describe("analyzeReproducibility — empty inputs", () => {
  it("produces overall_score = 0 for completely empty inputs", () => {
    const report = analyzeReproducibility([], [], [], [], null, "", "", "");
    expect(report.overall_score).toBe(0);
  });

  it("simulation_readiness is not_ready for empty inputs", () => {
    const report = analyzeReproducibility([], [], [], [], null, "", "", "");
    expect(report.simulation_readiness).toBe("not_ready");
  });
});

// ─── Well-populated inputs → high score ──────────────────────────────────────

describe("analyzeReproducibility — well-populated inputs", () => {
  const equations = [makeEquation()];
  const variables = [
    makeVariable({ role: "state", unit: "g/L" }),
    makeVariable({ id: 2, symbol: "S", name: "Substrate", unit: "g/L", role: "state" }),
  ];
  const parameters = [
    makeParameter({ symbol: "mu_max", value: 0.53, unit: "1/h" }),
    makeParameter({ id: 2, symbol: "Ks", value: 0.12, unit: "g/L" }),
    makeParameter({ id: 3, symbol: "D", value: 0.3, unit: "1/h" }),
  ];
  const assumptions = [makeAssumption()];
  const raw = {
    equations: [{ label: "(1)", equation_latex: "eq", source_context: "Eq 1" }],
    state_variables: [{ symbol: "X", source_context: "sec 2" }],
    parameters: [{ symbol: "mu_max", value: "0.53", source_context: "Table 1" }],
  };
  const systemDesc = "Chemostat model.";
  const problemStatement = "Predict X and S.";
  const odeTemplate = "def rhs(t, y): pass";

  it("produces a higher score than empty inputs", () => {
    const rich = analyzeReproducibility(
      equations, variables, parameters, assumptions,
      raw, systemDesc, problemStatement, odeTemplate,
    );
    const empty = analyzeReproducibility([], [], [], [], null, "", "", "");
    expect(rich.overall_score).toBeGreaterThan(empty.overall_score);
  });

  it("equations_completeness > 0 when equations are present with source quotes", () => {
    const report = analyzeReproducibility(
      equations, variables, parameters, assumptions,
      raw, systemDesc, problemStatement, odeTemplate,
    );
    expect(report.equations_completeness).toBeGreaterThan(0);
  });

  it("parameters_completeness > 0 when parameters have values and units", () => {
    const report = analyzeReproducibility(
      equations, variables, parameters, assumptions,
      raw, systemDesc, problemStatement, odeTemplate,
    );
    expect(report.parameters_completeness).toBeGreaterThan(0);
  });
});

// ─── missing_items severity ────────────────────────────────────────────────────

describe("analyzeReproducibility — missing_items", () => {
  it("flags critical missing items for empty inputs", () => {
    const report = analyzeReproducibility([], [], [], [], null, "", "", "");
    const severities = report.missing_items.map((m) => m.severity);
    expect(severities).toContain("critical");
  });

  it("each missing_item has severity, category, and description", () => {
    const report = analyzeReproducibility([], [], [], [], null, "", "", "");
    for (const item of report.missing_items) {
      expect(item).toHaveProperty("severity");
      expect(item).toHaveProperty("category");
      expect(item).toHaveProperty("description");
      expect(["critical", "warning", "info"]).toContain(item.severity);
    }
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────────

describe("analyzeReproducibility — edge cases", () => {
  it("handles parameter with null value without throwing", () => {
    const param = makeParameter({ value: null });
    expect(() =>
      analyzeReproducibility([], [], [param], [], null, "", "", ""),
    ).not.toThrow();
  });

  it("handles variable with null unit without throwing", () => {
    const variable = makeVariable({ unit: null });
    expect(() =>
      analyzeReproducibility([], [variable], [], [], null, "", "", ""),
    ).not.toThrow();
  });

  it("is deterministic — two identical calls return identical scores", () => {
    const args: Parameters<typeof analyzeReproducibility> = [
      [makeEquation()], [makeVariable()], [makeParameter()], [makeAssumption()],
      null, "desc", "problem", "ode",
    ];
    const r1 = analyzeReproducibility(...args);
    const r2 = analyzeReproducibility(...args);
    expect(r1.overall_score).toBe(r2.overall_score);
    expect(r1.simulation_readiness).toBe(r2.simulation_readiness);
  });
});
