import { describe, it, expect } from "vitest";
import { analyzeChemEModel } from "@workspace/cheme-brain";
import { generatePythonOdeTemplate, type PythonGeneratorInput } from "../python-generator";
import { matchTemplates } from "../template-matcher";
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

  it("does not turn explicit algebraic equations into ODE calculations", () => {
    const code = generatePythonOdeTemplate(
      baseInput({
        equations: [
          {
            id: 1,
            latex: "P = (X2 - X1)/(t2 - t1)",
            description: "Productivity calculation",
            sourceQuote: "",
            equationType: "algebraic_calculation",
          },
        ],
      }),
    );
    expect(code).not.toContain("P = 0.0");
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


describe("generatePythonOdeTemplate — exact Monod runnable output", () => {
  it("uses X0/S0, computes mu before derivatives, and never emits unknown state math", () => {
    const equations = [
      {
        id: 1,
        latex: "mu = mumax*S/(Ks + S)",
        description: "Monod growth relation",
        sourceQuote: "The specific growth rate is mu = mumax*S/(Ks + S).",
        equationType: "algebraic_calculation",
      },
      {
        id: 2,
        latex: "dX/dt = (mu - D)*X",
        description: "Biomass balance",
        sourceQuote: "The biomass balance is dX/dt = (mu - D)*X.",
        equationType: "dynamic_ode",
      },
      {
        id: 3,
        latex: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X",
        description: "Substrate balance",
        sourceQuote: "The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X.",
        equationType: "dynamic_ode",
      },
    ];
    const variables = [
      { id: 0, symbol: "unknown", name: "unknown", unit: "", role: "state", sourceQuote: "placeholder" },
      { id: 1, symbol: "X", name: "Biomass", unit: "g/L", role: "state", sourceQuote: "X is biomass." },
      { id: 2, symbol: "S", name: "Substrate", unit: "g/L", role: "state", sourceQuote: "S is substrate." },
      { id: 3, symbol: "mu", name: "Specific growth rate", unit: "1/h", role: "output", sourceQuote: "mu = mumax*S/(Ks + S)." },
    ];
    const parameters = [
      { id: 1, symbol: "mumax", value: 0.8, unit: "1/h", confidence: "high", sourceQuote: "mumax = 0.8 1/h" },
      { id: 2, symbol: "Ks", value: 0.05, unit: "g/L", confidence: "high", sourceQuote: "Ks = 0.05 g/L" },
      { id: 3, symbol: "D", value: 0.1, unit: "1/h", confidence: "high", sourceQuote: "D = 0.1 1/h" },
      { id: 4, symbol: "Sin", value: 10, unit: "g/L", confidence: "high", sourceQuote: "Sin = 10 g/L" },
      { id: 5, symbol: "Yxs", value: 0.5, unit: "gX/gS", confidence: "high", sourceQuote: "Yxs = 0.5 gX/gS" },
      { id: 6, symbol: "X0", name: "Initial condition for X", value: 0.1, unit: "g/L", confidence: "high", sourceQuote: "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L.", originalValue: { kind: "initial_condition" } },
      { id: 7, symbol: "S0", name: "Initial condition for S", value: 5, unit: "g/L", confidence: "high", sourceQuote: "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L.", originalValue: { kind: "initial_condition" } },
    ];
    const code = generatePythonOdeTemplate(baseInput({
      equations,
      variables,
      parameters,
      raw: {
        state_variables: [
          { symbol: "X", name: "Biomass", unit: "g/L", role: "state", source_context: "X", initial_condition: { symbol: "X0", value: "0.1", value_numeric: 0.1, unit: "g/L", source_context: "Initial conditions", confidence: "high" } },
          { symbol: "S", name: "Substrate", unit: "g/L", role: "state", source_context: "S", initial_condition: { symbol: "S0", value: "5", value_numeric: 5, unit: "g/L", source_context: "Initial conditions", confidence: "high" } },
        ],
        initial_conditions: [
          { symbol: "X0", state_symbol: "X", value: "0.1", value_numeric: 0.1, unit: "g/L" },
          { symbol: "S0", state_symbol: "S", value: "5", value_numeric: 5, unit: "g/L" },
        ],
        equations: [
          { label: "(1)", equation_latex: "mu = mumax*S/(Ks + S)", equation_plaintext: "mu = mumax*S/(Ks + S)", equation_type: "algebraic_calculation" },
          { label: "(2)", equation_latex: "dX/dt = (mu - D)*X", equation_plaintext: "dX/dt = (mu - D)*X", equation_type: "dynamic_ode" },
          { label: "(3)", equation_latex: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X", equation_plaintext: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X", equation_type: "dynamic_ode" },
        ],
      },
      report: { ...baseReport(), simulation_readiness: "ready" },
      templateResult: matchTemplates(equations, variables, parameters),
    }));

    expect(code).not.toMatch(/unknown\s*=\s*y\[/i);
    expect(code).not.toMatch(/dunknowndt/i);
    expect(code).not.toMatch(/mu \* unknown/i);
    expect(code).toContain("0.1,  # X [g/L]");
    expect(code).toContain("5  # S [g/L]");
    expect(code).toContain("mu = mumax * S / (Ks + S)");
    expect(code).toContain("dXdt = (mu - D) * X");
    expect(code).toContain("dSdt = D * (Sin - S) - (1.0 / Yxs) * mu * X");
    expect(code.indexOf("mu = mumax * S / (Ks + S)")).toBeLessThan(code.indexOf("dXdt = (mu - D) * X"));
  });
});

describe("generatePythonOdeTemplate — ChemE Brain advisory comments", () => {
  it("adds honest scaffold warnings when ChemE Brain blocks runtime simulation", () => {
    const chemEBrainReport = analyzeChemEModel({
      extraction: {
        model_type: "gas_liquid",
        process_description:
          "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X. The Henry-law convention is not specified.",
        variables: [{ symbol: "C_O2", role: "state" }],
        parameters: [
          { symbol: "kLa", value_numeric: 80, unit: "1/h" },
          { symbol: "Cstar_O2", value_numeric: 0.008, unit: "g/L" },
          { symbol: "qO2", value_numeric: 0.02, unit: "gO2/gX/h" },
        ],
        equations: [{ equation_plaintext: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X" }],
        limitations: ["The Henry-law convention is not specified."],
      },
    });

    const code = generatePythonOdeTemplate(baseInput({ chemEBrainReport }));

    expect(code).toContain("CHEME BRAIN ADVISORY");
    expect(code).toMatch(/scaffold/i);
    expect(code).toMatch(/Henry|Initial/i);
  });
});
