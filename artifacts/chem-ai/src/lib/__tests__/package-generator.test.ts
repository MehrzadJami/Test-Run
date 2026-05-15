import { describe, it, expect } from "vitest";
import { generateModelPackage, type ModelPackageInput } from "../package-generator";
import type { ModelAssemblyReport } from "../model-assembly";
import type { ReproducibilityReport } from "../reproducibility";
import type { UnitCheckReport } from "../unit-checker";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function baseReport(): ReproducibilityReport {
  return {
    overall_score: 65,
    equations_completeness: 75,
    parameters_completeness: 60,
    units_completeness: 55,
    initial_conditions_completeness: 40,
    source_traceability: 70,
    simulation_readiness: "partial",
    main_blockers: ["Missing initial conditions"],
    recommended_next_steps: ["Identify Y value from paper"],
    missing_items: [
      { severity: "warning", category: "Parameters", description: "Y (yield) missing" },
    ],
  };
}

function baseUnitReport(): UnitCheckReport {
  return {
    unit_check_status: "warning",
    warnings: [
      {
        severity: "medium",
        message: "Missing unit for symbol k",
        equation_or_symbol: "k",
        suggestion: "Add unit annotation to parameter k.",
      },
    ],
  };
}

function baseAssemblyReport(): ModelAssemblyReport {
  return {
    assembly_status: "partial",
    target_model_type: "monod_chemostat",
    can_generate_runnable_model: false,
    can_generate_scaffold: true,
    available_from_current_source: [
      {
        item: "D = 0.1 1/h",
        type: "control",
        source_context: "D was reported in the current source.",
        confidence: "high",
      },
    ],
    missing_requirements: [
      {
        item: "Initial conditions",
        category: "initial_condition",
        required_for: "ODE simulation start values",
        why_needed: "ODE solvers need initial values for each state variable.",
        suggested_source: "user_assumption",
        severity: "critical",
      },
    ],
    recommended_next_actions: ["Provide initial conditions for each state variable"],
  };
}

function baseInput(overrides: Partial<ModelPackageInput> = {}): ModelPackageInput {
  return {
    title: "Monod Chemostat",
    projectName: "ChemAI Test",
    providerUsed: "mock",
    domain: "Bioreactor",
    systemType: "Continuous culture",
    systemDescription: "Monod kinetics chemostat.",
    problemStatement: "Predict biomass X and substrate S at steady state.",
    equations: [
      { id: 1, latex: "dX/dt = (mu - D)*X", description: "Biomass ODE", sourceQuote: "Eq. 1" },
    ],
    variables: [
      { id: 1, symbol: "X", name: "Biomass", unit: "g/L", role: "state", sourceQuote: "X is biomass." },
      { id: 2, symbol: "S", name: "Substrate", unit: "g/L", role: "state", sourceQuote: "S is substrate." },
    ],
    parameters: [
      { id: 1, symbol: "mu_max", value: 0.53, unit: "1/h", confidence: "high", sourceQuote: "Table 1" },
    ],
    assumptionItems: [
      { id: 1, text: "Perfectly mixed.", kind: "assumption" },
    ],
    limitationItems: [
      { id: 2, text: "No temperature effects.", kind: "limitation" },
    ],
    raw: {
      paper_title_or_topic: "Monod Chemostat",
      equations: [{ label: "(1)", equation_latex: "dX/dt", source_context: "Eq 1" }],
    },
    report: baseReport(),
    assemblyReport: baseAssemblyReport(),
    unitReport: baseUnitReport(),
    pythonCode: "import numpy as np\n# TODO: implement",
    ...overrides,
  };
}

function monodGateInput(): ModelPackageInput {
  const parameterSentence =
    "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS.";
  const icSentence = "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L.";
  return baseInput({
    title: "Monod Final Check",
    providerUsed: "groq",
    systemType: "Continuous culture",
    systemDescription:
      "A continuous chemostat is modeled with biomass X and substrate S. The reactor is assumed well mixed and volume is constant.",
    problemStatement:
      "A continuous chemostat is modeled with biomass X and substrate S. The specific growth rate is mu = mumax*S/(Ks + S). The biomass balance is dX/dt = (mu - D)*X. The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X. Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS. Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L. The reactor is assumed well mixed and volume is constant.",
    variables: [
      { id: 0, symbol: "unknown", name: "unknown", unit: "", role: "state", sourceQuote: "placeholder" },
      { id: 1, symbol: "X", name: "Biomass", unit: "g/L", role: "state", sourceQuote: "X is biomass. Unit inferred from initial condition." },
      { id: 2, symbol: "S", name: "Substrate", unit: "g/L", role: "state", sourceQuote: "S is substrate. Unit inferred from initial condition." },
      { id: 3, symbol: "mu", name: "Specific growth rate", unit: "1/h", role: "output", sourceQuote: "The specific growth rate is mu = mumax*S/(Ks + S)." },
    ],
    parameters: [
      { id: 0, symbol: "unknown", value: 0.8, unit: "1/h", confidence: "low", sourceQuote: "placeholder" },
      { id: 1, symbol: "mumax", value: 0.8, unit: "1/h", confidence: "high", sourceQuote: parameterSentence },
      { id: 2, symbol: "Ks", value: 0.05, unit: "g/L", confidence: "high", sourceQuote: parameterSentence },
      { id: 3, symbol: "D", value: 0.1, unit: "1/h", confidence: "high", sourceQuote: parameterSentence },
      { id: 4, symbol: "Sin", value: 10, unit: "g/L", confidence: "high", sourceQuote: parameterSentence },
      { id: 5, symbol: "Yxs", value: 0.5, unit: "gX/gS", confidence: "high", sourceQuote: parameterSentence },
      { id: 6, symbol: "X0", name: "Initial condition for X", value: 0.1, unit: "g/L", confidence: "high", sourceQuote: `${icSentence} [initial_condition]` },
      { id: 7, symbol: "S0", name: "Initial condition for S", value: 5, unit: "g/L", confidence: "high", sourceQuote: `${icSentence} [initial_condition]` },
    ],
    equations: [
      { id: 1, latex: "mu = mumax*S/(Ks + S)", description: "Specific growth rate", sourceQuote: "The specific growth rate is mu = mumax*S/(Ks + S).", equationType: "algebraic_calculation" },
      { id: 2, latex: "dX/dt = (mu - D)*X", description: "Biomass balance", sourceQuote: "The biomass balance is dX/dt = (mu - D)*X.", equationType: "dynamic_ode" },
      { id: 3, latex: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X", description: "Substrate balance", sourceQuote: "The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X.", equationType: "dynamic_ode" },
    ],
    raw: {
      paper_title_or_topic: "Monod Chemostat",
      model_type: "monod_chemostat",
      process_description:
        "A continuous chemostat is modeled with biomass X and substrate S. The reactor is assumed well mixed and volume is constant.",
      state_variables: [
        { symbol: "unknown", name: "unknown", unit: "", role: "state", source_context: "placeholder", confidence: "low" },
        { symbol: "X", name: "Biomass", unit: "g/L", role: "state", source_context: "X is biomass. Unit inferred from initial condition." },
        { symbol: "S", name: "Substrate", unit: "g/L", role: "state", source_context: "S is substrate. Unit inferred from initial condition." },
      ],
      parameters: [
        { symbol: "unknown", name: "unknown", value: "0.8", unit: "1/h", source_context: "placeholder", confidence: "low" },
        { symbol: "mumax", name: "Maximum growth rate", value: "0.8", unit: "1/h", source_context: parameterSentence },
        { symbol: "Ks", name: "Half-saturation constant", value: "0.05", unit: "g/L", source_context: parameterSentence },
        { symbol: "D", name: "Dilution rate", value: "0.1", unit: "1/h", source_context: parameterSentence },
        { symbol: "Sin", name: "Feed substrate concentration", value: "10", unit: "g/L", source_context: parameterSentence },
        { symbol: "Yxs", name: "Biomass yield", value: "0.5", unit: "gX/gS", source_context: parameterSentence },
      ],
      initial_conditions: [
        { symbol: "X0", state_symbol: "X", name: "Initial condition for X", value: "0.1", value_numeric: 0.1, unit: "g/L", source_context: icSentence, confidence: "high" },
        { symbol: "S0", state_symbol: "S", name: "Initial condition for S", value: "5", value_numeric: 5, unit: "g/L", source_context: icSentence, confidence: "high" },
      ],
      equations: [
        { label: "(1)", equation_latex: "mu = mumax*S/(Ks + S)", equation_plaintext: "mu = mumax*S/(Ks + S)", equation_type: "algebraic_calculation", source_context: "The specific growth rate is mu = mumax*S/(Ks + S).", variables_involved: ["mu", "mumax", "S", "Ks"] },
        { label: "(2)", equation_latex: "dX/dt = (mu - D)*X", equation_plaintext: "dX/dt = (mu - D)*X", equation_type: "dynamic_ode", source_context: "The biomass balance is dX/dt = (mu - D)*X.", variables_involved: ["X", "mu", "D"] },
        { label: "(3)", equation_latex: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X", equation_plaintext: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X", equation_type: "dynamic_ode", source_context: "The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X.", variables_involved: ["S", "D", "Sin", "Yxs", "mu", "X"] },
      ],
      model_card: {
        short_summary: "Continuous Monod chemostat model.",
        model_type: "monod_chemostat",
        inputs: ["Sin"],
        outputs: ["X", "S", "mu"],
        control_variables: ["D"],
        missing_information: [],
        can_generate_ode_template: true,
      },
    },
    assemblyReport: {
      assembly_status: "complete",
      target_model_type: "monod_chemostat",
      can_generate_runnable_model: true,
      can_generate_scaffold: true,
      available_from_current_source: [],
      missing_requirements: [],
      recommended_next_actions: ["Review extracted equations, parameters, units, and assumptions before simulation"],
    },
    pythonCode: [
      "y0 = [",
      "    0.1,  # X [g/L]",
      "    5,  # S [g/L]",
      "]",
      "mu = mumax * S / (Ks + S)",
      "dXdt = (mu - D) * X",
      "dSdt = D * (Sin - S) - (1.0 / Yxs) * mu * X",
    ].join("\n"),
  });
}

function gasLiquidGateInput(): ModelPackageInput {
  const parameterSentence =
    "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h.";
  return baseInput({
    title: "Gas Transfer",
    providerUsed: "rule_based",
    systemType: "Gas-liquid bioreactor",
    systemDescription:
      "An aerobic bioreactor is described by dissolved oxygen concentration C_O2 and biomass concentration X.",
    problemStatement:
      "An aerobic bioreactor is described by dissolved oxygen concentration C_O2 and biomass concentration X. The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X. Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h. The liquid phase is assumed well mixed and temperature is constant. The Henry-law convention is not specified.",
    equations: [
      {
        id: 1,
        latex: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X",
        description: "Dissolved oxygen balance",
        sourceQuote: "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X.",
        equationType: "dynamic_ode",
      },
    ],
    variables: [
      { id: 1, symbol: "C_O2", name: "Dissolved oxygen concentration", unit: "g/L", role: "state", sourceQuote: "Dissolved oxygen concentration C_O2." },
      { id: 2, symbol: "X", name: "Biomass concentration", unit: "g/L", role: "input", sourceQuote: "Biomass concentration X." },
    ],
    parameters: [
      { id: 1, symbol: "kLa", name: "Volumetric mass-transfer coefficient", value: 80, unit: "1/h", confidence: "high", sourceQuote: parameterSentence },
      { id: 2, symbol: "Cstar_O2", name: "Saturation oxygen concentration", value: 0.008, unit: "g/L", confidence: "high", sourceQuote: parameterSentence },
      { id: 3, symbol: "qO2", name: "Specific oxygen uptake rate", value: 0.02, unit: "gO2/gX/h", confidence: "high", sourceQuote: parameterSentence },
    ],
    raw: {
      paper_title_or_topic: "Gas Transfer",
      model_type: "gas_liquid",
      process_description:
        "An aerobic bioreactor is described by dissolved oxygen concentration C_O2 and biomass concentration X.",
      state_variables: [
        { symbol: "C_O2", name: "Dissolved oxygen concentration", unit: "g/L", role: "state", source_context: "Dissolved oxygen concentration C_O2." },
        { symbol: "X", name: "Biomass concentration", unit: "g/L", role: "input", source_context: "Biomass concentration X." },
      ],
      parameters: [
        { symbol: "kLa", name: "Volumetric mass-transfer coefficient", value: "80", unit: "1/h", source_context: parameterSentence, confidence: "high" },
        { symbol: "Cstar_O2", name: "Saturation oxygen concentration", value: "0.008", unit: "g/L", source_context: parameterSentence, confidence: "high" },
        { symbol: "qO2", name: "Specific oxygen uptake rate", value: "0.02", unit: "gO2/gX/h", source_context: parameterSentence, confidence: "high" },
      ],
      equations: [
        {
          label: "(1)",
          equation_latex: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X",
          equation_plaintext: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X",
          equation_type: "dynamic_ode",
          variables_involved: ["C_O2", "kLa", "Cstar_O2", "qO2", "X"],
          source_context: "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X.",
        },
      ],
      model_card: {
        short_summary: "Aerobic gas-liquid oxygen-transfer model.",
        model_type: "gas_liquid",
        inputs: ["X", "Cstar_O2"],
        outputs: ["C_O2"],
        control_variables: [],
        missing_information: [
          "Henry-law convention was not specified.",
          "Initial conditions for C_O2 were not specified.",
        ],
        can_generate_ode_template: false,
      },
    },
    assemblyReport: {
      assembly_status: "partial",
      target_model_type: "gas_liquid",
      can_generate_runnable_model: false,
      can_generate_scaffold: true,
      available_from_current_source: [],
      missing_requirements: [
        {
          item: "Henry-law convention",
          category: "physical_constant",
          required_for: "Gas-liquid equilibrium calculation",
          why_needed: "The convention determines units and equation direction.",
          suggested_source: "databook",
          severity: "critical",
        },
        {
          item: "Initial conditions",
          category: "initial_condition",
          required_for: "ODE simulation start values",
          why_needed: "ODE solvers need initial values for each state variable.",
          suggested_source: "user_assumption",
          severity: "critical",
        },
      ],
      recommended_next_actions: ["Provide Henry-law convention and initial C_O2"],
    },
  });
}

// ─── File count & names ───────────────────────────────────────────────────────

const EXPECTED_FILES = [
  "README.md",
  "model_card.md",
  "variables.csv",
  "parameters.csv",
  "equations.md",
  "assumptions.md",
  "limitations.md",
  "missing_information.md",
  "cheme_brain_report.json",
  "cheme_brain_report.md",
  "model_assembly_report.json",
  "missing_requirements.md",
  "reproducibility_report.json",
  "unit_check_report.json",
  "raw_extraction.json",
  "simulate.py",
  "model_notebook.ipynb",
  "requirements.txt",
  "source_excerpt.txt",
];

describe("generateModelPackage — file inventory", () => {
  it("returns exactly 19 files", () => {
    const files = generateModelPackage(baseInput());
    expect(Object.keys(files)).toHaveLength(19);
  });

  it("contains all 19 expected filenames", () => {
    const files = generateModelPackage(baseInput());
    for (const name of EXPECTED_FILES) {
      expect(Object.keys(files)).toContain(name);
    }
  });

  it("every file value is a non-empty string", () => {
    const files = generateModelPackage(baseInput());
    for (const [name, content] of Object.entries(files)) {
      expect(typeof content, `File ${name} should be a string`).toBe("string");
      expect(content.length, `File ${name} should not be empty`).toBeGreaterThan(0);
    }
  });
});

// ─── ChemE Brain shadow report ───────────────────────────────────────────────

describe("generateModelPackage — ChemE Brain shadow report", () => {
  it("exports machine-readable and human-readable ChemE Brain reports", () => {
    const files = generateModelPackage(monodGateInput());

    expect(files["cheme_brain_report.json"]).toBeTruthy();
    expect(files["cheme_brain_report.md"]).toBeTruthy();

    const parsed = JSON.parse(files["cheme_brain_report.json"]);
    expect(parsed).toHaveProperty("canonical_model_type");
    expect(parsed).toHaveProperty("confidence");
    expect(parsed).toHaveProperty("evidence_status_summary");
    expect(parsed).toHaveProperty("corrected_roles");
    expect(parsed).toHaveProperty("equation_classification");
    expect(parsed).toHaveProperty("required_information_checklist");
    expect(parsed).toHaveProperty("missing_requirements");
    expect(parsed).toHaveProperty("inferred_units");
    expect(parsed).toHaveProperty("contradictions");
    expect(parsed).toHaveProperty("simulation_support");
    expect(parsed).toHaveProperty("recommended_next_sources");
    expect(parsed).toHaveProperty("warnings");
    expect(parsed).toHaveProperty("audit_trail");
    expect(parsed).toHaveProperty("assembly_comparison");
    expect(parsed.assembly_comparison).toHaveProperty("severity");
    expect(parsed.assembly_comparison).toHaveProperty("recommended_action");
    expect(parsed.assembly_comparison).toHaveProperty("disagreements");

    const markdown = files["cheme_brain_report.md"];
    expect(markdown).toContain(
      "This is an advisory engineering audit generated from extracted evidence. It is not validation, certification, or proof of model correctness.",
    );
    for (const heading of [
      "ChemE Brain verdict",
      "Assembly vs ChemE Brain — Shadow Comparison",
      "Model type and confidence",
      "What was observed",
      "What was inferred",
      "What is missing",
      "Equation classification",
      "Variable/parameter role review",
      "Unit/convention review",
      "Simulation support",
      "Recommended next sources",
      "Safety notes",
    ]) {
      expect(markdown).toContain(heading);
    }
    expect(files["README.md"]).toContain("ChemE Brain readiness advisory");
    expect(files["README.md"]).toContain("Verdict:");
  });

  it("reports the complete Monod gate as runnable without missing ICs", () => {
    const files = generateModelPackage(monodGateInput());
    const report = JSON.parse(files["cheme_brain_report.json"]);

    expect(report.canonical_model_type).toBe("monod_chemostat");
    expect(report.simulation_support.status).toBe("runnable");
    expect(report.assembly_comparison.severity).not.toBe("critical");
    expect(report.required_information_checklist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "monod-state-x", evidenceStatus: "observed" }),
        expect.objectContaining({ id: "monod-state-s", evidenceStatus: "observed" }),
        expect.objectContaining({ id: "monod-eq-mu", evidenceStatus: "observed" }),
        expect.objectContaining({ id: "monod-eq-dxdt", evidenceStatus: "observed" }),
        expect.objectContaining({ id: "monod-eq-dsdt", evidenceStatus: "observed" }),
        expect.objectContaining({ id: "monod-param-mumax", evidenceStatus: "observed" }),
        expect.objectContaining({ id: "monod-param-ks", evidenceStatus: "observed" }),
        expect.objectContaining({ id: "monod-param-d", evidenceStatus: "observed" }),
        expect.objectContaining({ id: "monod-param-sin", evidenceStatus: "observed" }),
        expect.objectContaining({ id: "monod-param-yxs", evidenceStatus: "observed" }),
        expect.objectContaining({ id: "monod-ic-x0", evidenceStatus: "observed" }),
        expect.objectContaining({ id: "monod-ic-s0", evidenceStatus: "observed" }),
      ]),
    );
    expect(report.missing_requirements.map((item: { item: string }) => item.item).join("\n")).not.toMatch(/initial conditions/i);
    expect(files["cheme_brain_report.json"]).not.toMatch(/"symbol": "unknown"/);
    expect(files["cheme_brain_report.md"]).not.toMatch(/unknown\/unknown/i);
  });

  it("reports gas-liquid Henry convention and C_O2 initial condition as missing", () => {
    const files = generateModelPackage(gasLiquidGateInput());
    const report = JSON.parse(files["cheme_brain_report.json"]);

    expect(report.canonical_model_type).toBe("gas_liquid");
    expect(report.assembly_comparison.severity).toMatch(/warning|critical/);
    expect(report.assembly_comparison.disagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cheme_brain_says: expect.stringMatching(/Henry/i),
        }),
      ]),
    );
    expect(report.missing_requirements.map((item: { item: string }) => item.item).join("\n")).toMatch(/Henry-law|Henry/i);
    expect(report.missing_requirements.map((item: { item: string }) => item.item).join("\n")).toMatch(/Initial dissolved gas concentration|Initial/i);
    expect(report.corrected_roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "X", recommendedRole: "input" }),
      ]),
    );
  });

  it("does not mutate existing model assembly report while adding ChemE Brain advisory output", () => {
    const input = gasLiquidGateInput();
    const before = JSON.stringify(input.assemblyReport);

    const files = generateModelPackage(input);

    expect(JSON.stringify(input.assemblyReport)).toBe(before);
    expect(JSON.parse(files["model_assembly_report.json"])).toEqual(input.assemblyReport);
    expect(files["cheme_brain_report.json"]).toContain("assembly_comparison");
  });

  it("does not include forbidden product-safety claims in the ChemE Brain markdown", () => {
    const files = generateModelPackage(monodGateInput());
    expect(files["cheme_brain_report.md"]).not.toMatch(/\b(validated|certified|guaranteed|digital twin)\b/i);
  });
});

// ─── README.md content ────────────────────────────────────────────────────────

describe("generateModelPackage — README.md", () => {
  it("contains the model title", () => {
    const files = generateModelPackage(baseInput());
    expect(files["README.md"]).toContain("Monod Chemostat");
  });

  it("contains the project name", () => {
    const files = generateModelPackage(baseInput());
    expect(files["README.md"]).toContain("ChemAI Test");
  });

  it("contains the reproducibility score", () => {
    const files = generateModelPackage(baseInput());
    expect(files["README.md"]).toMatch(/\*\*Overall score:\*\* \d+\/100/);
  });

  it("contains review status section", () => {
    const files = generateModelPackage(baseInput({ review: { status: "needs_review", review_notes: "Check ICs" } }));
    expect(files["README.md"]).toContain("Human review notes");
    expect(files["README.md"]).toContain("needs_review");
    expect(files["README.md"]).toContain("Check ICs");
  });

  it("exports MockProvider warning evidence", () => {
    const files = generateModelPackage(baseInput({ providerUsed: "mock" }));
    expect(files["README.md"]).toContain("Provider warning");
    expect(files["README.md"]).toContain("fixed demonstration");
    expect(files["model_card.md"]).toContain("does not reflect source text");
  });

  it("exports RuleBased fallback warning evidence", () => {
    const files = generateModelPackage(baseInput({ providerUsed: "rule_based" }));
    expect(files["README.md"]).toContain("deterministic flat/local extraction");
    expect(files["model_card.md"]).toContain("not full-paper semantic AI understanding");
  });
});

// ─── variables.csv content ────────────────────────────────────────────────────

describe("generateModelPackage — variables.csv", () => {
  it("contains header row", () => {
    const files = generateModelPackage(baseInput());
    expect(files["variables.csv"]).toContain("symbol");
  });

  it("contains symbol X", () => {
    const files = generateModelPackage(baseInput());
    expect(files["variables.csv"]).toContain("X");
  });

  it("contains unit g/L", () => {
    const files = generateModelPackage(baseInput());
    expect(files["variables.csv"]).toContain("g/L");
  });
});

// ─── parameters.csv content ───────────────────────────────────────────────────

describe("generateModelPackage — parameters.csv", () => {
  it("contains header row", () => {
    const files = generateModelPackage(baseInput());
    expect(files["parameters.csv"]).toContain("symbol");
  });

  it("contains mu_max value", () => {
    const files = generateModelPackage(baseInput());
    expect(files["parameters.csv"]).toContain("mu_max");
    expect(files["parameters.csv"]).toContain("0.53");
  });

  it("exports unknown parameter values as unknown instead of legacy zero", () => {
    const files = generateModelPackage(
      baseInput({
        parameters: [
          {
            id: 1,
            symbol: "Ks",
            value: 0,
            valueRaw: "unknown",
            valueNumeric: null,
            unit: "g/L",
            confidence: "low",
            sourceQuote: "Ks was not specified.",
          },
        ],
      }),
    );

    expect(files["parameters.csv"]).toContain("Ks,unknown,g/L,low");
    expect(files["model_card.md"]).toContain("| `Ks` | unknown | g/L | low |");
  });
});

// ─── JSON files ───────────────────────────────────────────────────────────────

describe("generateModelPackage — JSON files", () => {
  it("reproducibility_report.json is valid JSON", () => {
    const files = generateModelPackage(baseInput());
    expect(() => JSON.parse(files["reproducibility_report.json"])).not.toThrow();
  });

  it("reproducibility_report.json contains overall_score", () => {
    const files = generateModelPackage(baseInput());
    const parsed = JSON.parse(files["reproducibility_report.json"]);
    expect(typeof parsed.overall_score).toBe("number");
  });

  it("unit_check_report.json is valid JSON", () => {
    const files = generateModelPackage(baseInput());
    expect(() => JSON.parse(files["unit_check_report.json"])).not.toThrow();
  });

  it("unit_check_report.json contains unit_check_status", () => {
    const files = generateModelPackage(baseInput());
    const parsed = JSON.parse(files["unit_check_report.json"]);
    expect(["pass", "warning", "fail"]).toContain(parsed.unit_check_status);
  });

  it("model_assembly_report.json is valid JSON", () => {
    const files = generateModelPackage(baseInput());
    const parsed = JSON.parse(files["model_assembly_report.json"]);
    expect(parsed.assembly_status).toBe("partial");
  });

  it("raw_extraction.json is valid JSON", () => {
    const files = generateModelPackage(baseInput());
    expect(() => JSON.parse(files["raw_extraction.json"])).not.toThrow();
  });

  it("raw_extraction.json has _note when raw is null", () => {
    const files = generateModelPackage(baseInput({ raw: null }));
    const parsed = JSON.parse(files["raw_extraction.json"]);
    expect(parsed).toHaveProperty("_note");
  });
});

// ─── simulate.py ─────────────────────────────────────────────────────────────

describe("generateModelPackage — simulate.py", () => {
  it("equals the pythonCode field passed in", () => {
    const input = baseInput();
    const files = generateModelPackage(input);
    expect(files["simulate.py"]).toBe(input.pythonCode);
  });
});

// ─── requirements.txt ────────────────────────────────────────────────────────

describe("generateModelPackage — requirements.txt", () => {
  it("lists numpy, scipy, and matplotlib", () => {
    const files = generateModelPackage(baseInput());
    expect(files["requirements.txt"]).toContain("numpy");
    expect(files["requirements.txt"]).toContain("scipy");
    expect(files["requirements.txt"]).toContain("matplotlib");
  });
});

// ─── missing_information.md ───────────────────────────────────────────────────

describe("generateModelPackage — missing_information.md", () => {
  it("contains recomputed missing item descriptions", () => {
    const files = generateModelPackage(
      baseInput({
        raw: {
          paper_title_or_topic: "Monod Chemostat",
          equations: [{ label: "(1)", equation_latex: "dX/dt", source_context: "Eq 1" }],
          model_card: {
            missing_information: ["Y (yield) missing"],
          },
        },
      }),
    );
    expect(files["missing_information.md"]).toContain("Y (yield) missing");
  });
});

describe("generateModelPackage — missing_requirements.md", () => {
  it("contains model assembly source requests", () => {
    const files = generateModelPackage(baseInput());
    expect(files["missing_requirements.md"]).toContain("Initial conditions");
    expect(files["missing_requirements.md"]).toContain("Provide initial conditions");
  });

  it("does not export stale tiny-text cleanup artifacts after ICs are present", () => {
    const files = generateModelPackage(
      baseInput({
        variables: [
          { id: 0, symbol: "unknown", name: "unknown", unit: "", role: "state", sourceQuote: "placeholder" },
          { id: 1, symbol: "X", name: "Biomass", unit: "g/L", role: "state", sourceQuote: "X is biomass. Unit inferred from initial condition." },
          { id: 2, symbol: "S", name: "Substrate", unit: "g/L", role: "state", sourceQuote: "S is substrate. Unit inferred from initial condition." },
          { id: 3, symbol: "mu", name: "Specific growth rate", unit: "", role: "output", sourceQuote: "The specific growth rate is mu = mumax*S/(Ks + S)." },
        ],
        parameters: [
          { id: 0, symbol: "unknown", value: 0.8, unit: "1/h", confidence: "low", sourceQuote: "placeholder" },
          { id: 1, symbol: "mumax", value: 0.8, unit: "1/h", confidence: "high", sourceQuote: "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS." },
          { id: 2, symbol: "Ks", value: 0.05, unit: "g/L", confidence: "high", sourceQuote: "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS." },
          { id: 3, symbol: "D", value: 0.1, unit: "1/h", confidence: "high", sourceQuote: "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS." },
          { id: 4, symbol: "Sin", value: 10, unit: "g/L", confidence: "high", sourceQuote: "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS." },
          { id: 5, symbol: "Yxs", value: 0.5, unit: "gX/gS", confidence: "high", sourceQuote: "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS." },
          { id: 6, symbol: "X0", name: "Initial condition for X", value: 0.1, unit: "g/L", confidence: "high", sourceQuote: "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L. [initial_condition]" },
          { id: 7, symbol: "S0", name: "Initial condition for S", value: 5, unit: "g/L", confidence: "high", sourceQuote: "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L. [initial_condition]" },
        ],
        raw: {
          paper_title_or_topic: "Monod Chemostat",
          model_type: "monod_chemostat",
          state_variables: [
            { symbol: "unknown", name: "unknown", unit: "", role: "state", source_context: "placeholder", confidence: "low" },
            { symbol: "X", name: "Biomass", unit: "g/L", role: "state", source_context: "X is biomass. Unit inferred from initial condition." },
            { symbol: "S", name: "Substrate", unit: "g/L", role: "state", source_context: "S is substrate. Unit inferred from initial condition." },
          ],
          parameters: [
            { symbol: "unknown", name: "unknown", value: "0.8", unit: "1/h", source_context: "placeholder", confidence: "low" },
            { symbol: "mumax", name: "Maximum growth rate", value: "0.8", unit: "1/h", source_context: "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS." },
            { symbol: "Ks", name: "Half-saturation constant", value: "0.05", unit: "g/L", source_context: "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS." },
            { symbol: "D", name: "Dilution rate", value: "0.1", unit: "1/h", source_context: "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS." },
            { symbol: "Sin", name: "Feed substrate concentration", value: "10", unit: "g/L", source_context: "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS." },
            { symbol: "Yxs", name: "Biomass yield", value: "0.5", unit: "gX/gS", source_context: "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS." },
            { symbol: "X0", name: "Initial condition for X", value: "0.1", unit: "g/L", status: "initial_condition", source_context: "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L. [initial_condition]" },
            { symbol: "S0", name: "Initial condition for S", value: "5", unit: "g/L", status: "initial_condition", source_context: "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L. [initial_condition]" },
          ],
          initial_conditions: [
            { symbol: "X0", state_symbol: "X", name: "Initial condition for X", value: "0.1", value_numeric: 0.1, unit: "g/L", source_context: "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L.", confidence: "high" },
            { symbol: "S0", state_symbol: "S", name: "Initial condition for S", value: "5", value_numeric: 5, unit: "g/L", source_context: "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L.", confidence: "high" },
          ],
          equations: [
            { label: "(1)", equation_latex: "mu = mumax*S/(Ks + S)", equation_plaintext: "mu = mumax*S/(Ks + S)", source_context: "The specific growth rate is mu = mumax*S/(Ks + S).", variables_involved: ["mu", "mumax", "S", "Ks"] },
            { label: "(1)", equation_latex: "dX/dt = (mu - D)*X", equation_plaintext: "dX/dt = (mu - D)*X", source_context: "The biomass balance is dX/dt = (mu - D)*X." },
            { label: "(2)", equation_latex: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X", equation_plaintext: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X", source_context: "The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X.", variables_involved: ["S", "D", "Sin", "Yxs", "mu", "X"] },
          ],
          model_card: {
            short_summary: "Continuous Monod chemostat model.",
            model_type: "monod_chemostat",
            inputs: ["Sin"],
            outputs: ["X", "S", "mu"],
            control_variables: ["D"],
            missing_information: [],
            can_generate_ode_template: true,
          },
        },
        pythonCode: [
          "y0 = [",
          "    0.1,  # X [g/L]",
          "    5,  # S [g/L]",
          "]",
          "mu = mumax * S / (Ks + S)",
          "dXdt = (mu - D) * X",
          "dSdt = D * (Sin - S) - (1.0 / Yxs) * mu * X",
        ].join("\n"),
        assemblyReport: {
          assembly_status: "complete",
          target_model_type: "monod_chemostat",
          can_generate_runnable_model: true,
          can_generate_scaffold: true,
          available_from_current_source: [],
          missing_requirements: [],
          recommended_next_actions: ["Review extracted equations, parameters, units, and assumptions before simulation"],
        },
      }),
    );

    expect(files["variables.csv"]).not.toMatch(/unknown,unknown/i);
    expect(files["variables.csv"]).toContain("mu,Specific growth rate,1/h,output");
    expect(files["parameters.csv"]).not.toMatch(/^unknown,/im);
    expect(files["raw_extraction.json"]).not.toMatch(/"symbol": "unknown"/);
    expect(files["README.md"]).not.toMatch(/unknown/i);
    expect(files["missing_information.md"]).not.toMatch(/unknown/i);
    expect(files["reproducibility_report.json"]).not.toMatch(/unknown/i);
    expect(files["unit_check_report.json"]).not.toMatch(/unknown/i);
    expect(files["missing_information.md"]).not.toMatch(/variable\(s\) have no unit/i);
    expect(files["reproducibility_report.json"]).not.toMatch(/state variable\(s\) not referenced/i);
    expect(files["missing_requirements.md"]).not.toMatch(/Initial conditions/);
    expect(files["model_assembly_report.json"]).not.toMatch(/Initial conditions/);
    expect(files["simulate.py"]).not.toMatch(/unknown/i);
    expect(files["simulate.py"]).toContain("mu = mumax * S / (Ks + S)");
    expect(files["simulate.py"]).toContain("dXdt = (mu - D) * X");
    expect(files["simulate.py"]).toContain("dSdt = D * (Sin - S) - (1.0 / Yxs) * mu * X");
    expect(files["simulate.py"]).toContain("0.1,  # X [g/L]");
    expect(files["simulate.py"]).toContain("5,  # S [g/L]");
  });

  it("keeps real gas-transfer missing-information warnings after cleanup", () => {
    const files = generateModelPackage(
      baseInput({
        title: "Gas Transfer",
        providerUsed: "rule_based",
        systemType: "Gas-liquid bioreactor",
        systemDescription: "Aerobic gas-liquid oxygen-transfer model.",
        problemStatement: "Track dissolved oxygen C_O2.",
        equations: [
          {
            id: 1,
            latex: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X",
            description: "Dissolved oxygen balance",
            sourceQuote: "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X.",
            equationType: "dynamic_ode",
          },
        ],
        variables: [
          { id: 1, symbol: "C_O2", name: "Dissolved oxygen concentration", unit: "g/L", role: "state", sourceQuote: "Dissolved oxygen concentration C_O2." },
          { id: 2, symbol: "X", name: "Biomass concentration", unit: "g/L", role: "input", sourceQuote: "Biomass concentration X." },
        ],
        parameters: [
          { id: 1, symbol: "kLa", name: "Volumetric mass-transfer coefficient", value: 80, unit: "1/h", confidence: "high", sourceQuote: "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h." },
          { id: 2, symbol: "Cstar_O2", name: "Saturation oxygen concentration", value: 0.008, unit: "g/L", confidence: "high", sourceQuote: "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h." },
          { id: 3, symbol: "qO2", name: "Specific oxygen uptake rate", value: 0.02, unit: "gO2/gX/h", confidence: "high", sourceQuote: "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h." },
        ],
        raw: {
          paper_title_or_topic: "Gas Transfer",
          model_type: "gas_liquid",
          state_variables: [
            { symbol: "C_O2", name: "Dissolved oxygen concentration", unit: "g/L", role: "state", source_context: "Dissolved oxygen concentration C_O2." },
            { symbol: "X", name: "Biomass concentration", unit: "g/L", role: "input", source_context: "Biomass concentration X." },
          ],
          parameters: [
            { symbol: "kLa", name: "Volumetric mass-transfer coefficient", value: "80", unit: "1/h", source_context: "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h.", confidence: "high" },
            { symbol: "Cstar_O2", name: "Saturation oxygen concentration", value: "0.008", unit: "g/L", source_context: "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h.", confidence: "high" },
            { symbol: "qO2", name: "Specific oxygen uptake rate", value: "0.02", unit: "gO2/gX/h", source_context: "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h.", confidence: "high" },
          ],
          equations: [
            {
              label: "(1)",
              equation_latex: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X",
              equation_plaintext: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X",
              equation_type: "dynamic_ode",
              variables_involved: ["C_O2", "kLa", "Cstar_O2", "qO2", "X"],
              source_context: "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X.",
            },
          ],
          model_card: {
            short_summary: "Aerobic gas-liquid oxygen-transfer model.",
            model_type: "gas_liquid",
            inputs: ["X", "Cstar_O2"],
            outputs: ["C_O2"],
            control_variables: [],
            missing_information: [
              "Henry-law convention was not specified.",
              "Initial conditions for C_O2 were not specified.",
            ],
            can_generate_ode_template: false,
          },
        },
        assemblyReport: {
          assembly_status: "partial",
          target_model_type: "gas_liquid",
          can_generate_runnable_model: false,
          can_generate_scaffold: true,
          available_from_current_source: [],
          missing_requirements: [
            {
              item: "Henry-law convention",
              category: "physical_constant",
              required_for: "Gas-liquid equilibrium calculation",
              why_needed: "The convention determines units and equation direction.",
              suggested_source: "databook",
              severity: "critical",
            },
            {
              item: "Initial conditions",
              category: "initial_condition",
              required_for: "ODE simulation start values",
              why_needed: "ODE solvers need initial values for each state variable.",
              suggested_source: "user_assumption",
              severity: "critical",
            },
          ],
          recommended_next_actions: ["Provide Henry-law convention and initial C_O2"],
        },
      }),
    );

    expect(files["variables.csv"]).not.toMatch(/unknown,unknown/i);
    expect(files["parameters.csv"]).not.toMatch(/^unknown,/im);
    expect(files["raw_extraction.json"]).not.toMatch(/"symbol": "unknown"/);
    expect(files["missing_information.md"]).toMatch(/Henry-law convention/i);
    expect(files["missing_information.md"]).toMatch(/Initial conditions/i);
    expect(files["missing_requirements.md"]).toMatch(/Henry-law convention/i);
    expect(files["missing_requirements.md"]).toMatch(/Initial conditions/i);
    const unitReport = JSON.parse(files["unit_check_report.json"]);
    const messages = unitReport.warnings.map((warning: { message: string }) => warning.message).join("\n");
    expect(messages).not.toMatch(/Symbol "dC_O2"/);
  });
});

describe("generateModelPackage — source context", () => {
  it("retains page and section context in equations and source excerpts", () => {
    const files = generateModelPackage(
      baseInput({
        equations: [
          {
            id: 1,
            latex: "dC/dt = kLa(C^* - C)",
            description: "Oxygen transfer ODE",
            equationType: "dynamic_ode",
            sourceQuote: "pp. 2-3, Materials and Methods: dC/dt = kLa(Cstar - C).",
          },
        ],
        raw: {
          paper_title_or_topic: "Gas transfer",
          equations: [
            {
              label: "Eq. 1",
              equation_latex: "dC/dt = kLa(C^* - C)",
              equation_plaintext: "dC/dt = kLa*(Cstar - C)",
              equation_type: "dynamic_ode",
              source_context:
                "pp. 2-3, Materials and Methods: dC/dt = kLa(Cstar - C).",
            },
          ],
        },
      }),
    );

    expect(files["equations.md"]).toContain("pp. 2-3, Materials and Methods");
    expect(files["source_excerpt.txt"]).toContain("pp. 2-3, Materials and Methods");
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("generateModelPackage — edge cases", () => {
  it("returns 19 files even with all empty arrays", () => {
    const input = baseInput({
      equations: [],
      variables: [],
      parameters: [],
      assumptionItems: [],
      limitationItems: [],
    });
    const files = generateModelPackage(input);
    expect(Object.keys(files)).toHaveLength(19);
  });

  it("CSV cells with commas are properly quoted", () => {
    const input = baseInput({
      variables: [
        {
          id: 1,
          symbol: "X",
          name: "Biomass, total",
          unit: "g/L",
          role: "state",
          sourceQuote: "X is the total biomass, measured gravimetrically.",
        },
      ],
    });
    const files = generateModelPackage(input);
    expect(files["variables.csv"]).toContain('"Biomass, total"');
  });

  it("is deterministic", () => {
    const input = baseInput();
    const f1 = generateModelPackage(input);
    const f2 = generateModelPackage(input);
    expect(f1["README.md"]).toBe(f2["README.md"]);
    expect(f1["variables.csv"]).toBe(f2["variables.csv"]);
    expect(f1["reproducibility_report.json"]).toBe(f2["reproducibility_report.json"]);
  });
});
