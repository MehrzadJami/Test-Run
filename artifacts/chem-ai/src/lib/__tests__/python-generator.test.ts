import { describe, it, expect } from "vitest";
import { generatePythonOdeTemplate, type PythonGeneratorInput } from "../python-generator";
import type { ReproducibilityReport } from "../reproducibility";
import type { UnitCheckReport } from "../unit-checker";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function baseReport(): ReproducibilityReport {
  return {
    overall_score: 72,
    equations_completeness: 80,
    parameters_completeness: 70,
    units_completeness: 60,
    initial_conditions_completeness: 50,
    source_traceability: 75,
    simulation_readiness: "partial",
    main_blockers: [],
    recommended_next_steps: [],
    missing_items: [],
  };
}

function baseUnitReport(): UnitCheckReport {
  return {
    unit_check_status: "pass",
    warnings: [],
  };
}

function baseInput(overrides: Partial<PythonGeneratorInput> = {}): PythonGeneratorInput {
  return {
    title: "Test Chemostat Model",
    projectName: "Test Project",
    providerUsed: "mock",
    systemType: "CSTR",
    systemDescription: "Continuous stirred tank reactor.",
    equations: [
      {
        id: 1,
        latex: "\\frac{dX}{dt} = (\\mu - D) X",
        description: "Biomass balance",
        sourceQuote: "Eq. 1",
      },
    ],
    variables: [
      { id: 1, symbol: "X", name: "Biomass", unit: "g/L", role: "state", sourceQuote: "" },
      { id: 2, symbol: "S", name: "Substrate", unit: "g/L", role: "state", sourceQuote: "" },
    ],
    parameters: [
      { id: 1, symbol: "mu_max", value: 0.53, unit: "1/h", confidence: "high", sourceQuote: "" },
      { id: 2, symbol: "Ks", value: 0.12, unit: "g/L", confidence: "high", sourceQuote: "" },
      { id: 3, symbol: "D", value: 0.3, unit: "1/h", confidence: "medium", sourceQuote: "" },
    ],
    assumptions: [
      { id: 1, text: "Perfectly mixed.", kind: "assumption" },
    ],
    raw: null,
    report: baseReport(),
    unitReport: baseUnitReport(),
    ...overrides,
  };
}

// ─── Basic generation ─────────────────────────────────────────────────────────

describe("generatePythonOdeTemplate — basic generation", () => {
  it("returns a non-empty string", () => {
    const code = generatePythonOdeTemplate(baseInput());
    expect(typeof code).toBe("string");
    expect(code.length).toBeGreaterThan(0);
  });

  it("includes scipy.integrate import", () => {
    const code = generatePythonOdeTemplate(baseInput());
    expect(code).toContain("scipy.integrate");
  });

  it("includes numpy import", () => {
    const code = generatePythonOdeTemplate(baseInput());
    expect(code).toContain("numpy");
  });

  it("includes the model title", () => {
    const code = generatePythonOdeTemplate(baseInput());
    expect(code).toContain("Test Chemostat Model");
  });
});

// ─── Parameters ───────────────────────────────────────────────────────────────

describe("generatePythonOdeTemplate — parameters", () => {
  it("includes known parameter symbols", () => {
    const code = generatePythonOdeTemplate(baseInput());
    expect(code).toContain("mu_max");
    expect(code).toContain("Ks");
    expect(code).toContain("D");
  });

  it("includes numeric parameter values", () => {
    const code = generatePythonOdeTemplate(baseInput());
    expect(code).toContain("0.53");
    expect(code).toContain("0.12");
    expect(code).toContain("0.3");
  });

  it("generates TODO placeholder for null-value parameter", () => {
    const input = baseInput({
      parameters: [
        { id: 1, symbol: "k", value: null, unit: "1/s", confidence: "low", sourceQuote: "" },
      ],
    });
    const code = generatePythonOdeTemplate(input);
    expect(code.toUpperCase()).toContain("TODO");
  });
});

// ─── State variables ──────────────────────────────────────────────────────────

describe("generatePythonOdeTemplate — state variables", () => {
  it("includes state variable symbols", () => {
    const code = generatePythonOdeTemplate(baseInput());
    expect(code).toContain("X");
    expect(code).toContain("S");
  });

  it("generates valid Python for empty variables list", () => {
    const input = baseInput({ variables: [] });
    const code = generatePythonOdeTemplate(input);
    expect(typeof code).toBe("string");
    expect(code.length).toBeGreaterThan(0);
  });
});

// ─── Reproducibility score embedding ──────────────────────────────────────────

describe("generatePythonOdeTemplate — score embedding", () => {
  it("embeds the reproducibility score", () => {
    const code = generatePythonOdeTemplate(baseInput());
    expect(code).toContain("72");
  });

  it("embeds simulation_readiness status", () => {
    const code = generatePythonOdeTemplate(baseInput());
    expect(code.toLowerCase()).toContain("partial");
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe("generatePythonOdeTemplate — determinism", () => {
  it("two identical calls produce identical output", () => {
    const input = baseInput();
    expect(generatePythonOdeTemplate(input)).toBe(generatePythonOdeTemplate(input));
  });
});
