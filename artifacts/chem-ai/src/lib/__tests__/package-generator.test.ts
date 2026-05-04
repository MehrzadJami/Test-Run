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
  it("returns exactly 17 files", () => {
    const files = generateModelPackage(baseInput());
    expect(Object.keys(files)).toHaveLength(17);
  });

  it("contains all 17 expected filenames", () => {
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
    expect(files["README.md"]).toContain("65");
  });

  it("contains review status section", () => {
    const files = generateModelPackage(baseInput({ review: { status: "needs_review", review_notes: "Check ICs" } }));
    expect(files["README.md"]).toContain("Human review notes");
    expect(files["README.md"]).toContain("needs_review");
    expect(files["README.md"]).toContain("Check ICs");
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
    expect(parsed.overall_score).toBe(65);
  });

  it("unit_check_report.json is valid JSON", () => {
    const files = generateModelPackage(baseInput());
    expect(() => JSON.parse(files["unit_check_report.json"])).not.toThrow();
  });

  it("unit_check_report.json contains unit_check_status", () => {
    const files = generateModelPackage(baseInput());
    const parsed = JSON.parse(files["unit_check_report.json"]);
    expect(parsed.unit_check_status).toBe("warning");
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
  it("contains missing item description from report", () => {
    const files = generateModelPackage(baseInput());
    expect(files["missing_information.md"]).toContain("Y (yield) missing");
  });
});

describe("generateModelPackage — missing_requirements.md", () => {
  it("contains model assembly source requests", () => {
    const files = generateModelPackage(baseInput());
    expect(files["missing_requirements.md"]).toContain("Initial conditions");
    expect(files["missing_requirements.md"]).toContain("Provide initial conditions");
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("generateModelPackage — edge cases", () => {
  it("returns 17 files even with all empty arrays", () => {
    const input = baseInput({
      equations: [],
      variables: [],
      parameters: [],
      assumptionItems: [],
      limitationItems: [],
    });
    const files = generateModelPackage(input);
    expect(Object.keys(files)).toHaveLength(17);
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
