import { describe, it, expect } from "vitest";
import {
  generateJupyterNotebook,
  type NotebookGeneratorInput,
} from "../notebook-generator";
import { generatePythonOdeTemplate } from "../python-generator";
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
    main_blockers: ["Initial conditions not specified"],
    recommended_next_steps: ["Specify initial X and S"],
    missing_items: [
      { severity: "critical", category: "initial_conditions", description: "Missing initial X" },
      { severity: "warning", category: "parameters", description: "Ks confidence is low" },
    ],
  };
}

function baseUnitReport(): UnitCheckReport {
  return {
    unit_check_status: "warning",
    warnings: [
      { severity: "high", message: "Unit mismatch on mu", suggestion: "Check 1/h" },
    ],
  };
}

function baseInput(): NotebookGeneratorInput {
  const pyInput = {
    title: "Chemostat Monod Model",
    projectName: "Test Project",
    providerUsed: "mock",
    systemType: "CSTR",
    systemDescription: "Continuous chemostat with Monod kinetics.",
    equations: [
      { id: 1, latex: "\\frac{dX}{dt} = (\\mu - D)X", description: "Biomass balance", sourceQuote: "Eq. 1" },
      { id: 2, latex: "\\mu = \\frac{\\mu_{max} S}{K_s + S}", description: "Monod growth", sourceQuote: "Eq. 2" },
    ],
    variables: [
      { id: 1, symbol: "X", name: "Biomass", unit: "g/L", role: "state" as const, sourceQuote: "" },
      { id: 2, symbol: "S", name: "Substrate", unit: "g/L", role: "state" as const, sourceQuote: "" },
    ],
    parameters: [
      { id: 1, symbol: "mumax", value: 0.4, unit: "1/h", confidence: "high" as const, sourceQuote: "" },
      { id: 2, symbol: "Ks", value: 0.5, unit: "g/L", confidence: "medium" as const, sourceQuote: "" },
      { id: 3, symbol: "D", value: 0.2, unit: "1/h", confidence: "high" as const, sourceQuote: "" },
      { id: 4, symbol: "Yxs", value: 0.5, unit: "g-X/g-S", confidence: "medium" as const, sourceQuote: "" },
    ],
    assumptions: [
      { id: 1, text: "Perfect mixing assumed.", kind: "assumption" as const },
    ],
    raw: null,
    report: baseReport(),
    unitReport: baseUnitReport(),
  };

  const pythonCode = generatePythonOdeTemplate(pyInput);
  return { ...pyInput, pythonCode };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("generateJupyterNotebook", () => {
  it("returns valid JSON", () => {
    const input = baseInput();
    const result = generateJupyterNotebook(input);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("has nbformat 4", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { nbformat: number };
    expect(nb.nbformat).toBe(4);
  });

  it("has nbformat_minor 5", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { nbformat_minor: number };
    expect(nb.nbformat_minor).toBe(5);
  });

  it("has exactly 14 cells", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: unknown[] };
    expect(nb.cells).toHaveLength(14);
  });

  it("first 7 cells are markdown", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ cell_type: string }> };
    for (let i = 0; i < 7; i++) {
      expect(nb.cells[i].cell_type).toBe("markdown");
    }
  });

  it("cells 8-13 are code", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ cell_type: string }> };
    for (let i = 7; i <= 12; i++) {
      expect(nb.cells[i].cell_type).toBe("code");
    }
  });

  it("last cell (14) is markdown", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ cell_type: string }> };
    expect(nb.cells[13].cell_type).toBe("markdown");
  });

  it("title cell contains model title", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[0].source).toContain("Chemostat Monod Model");
  });

  it("title cell contains provider", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[0].source).toContain("mock");
  });

  it("variables cell contains state variable symbols", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[1].source).toContain("X");
    expect(nb.cells[1].source).toContain("S");
  });

  it("parameters cell contains parameter symbols", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[2].source).toContain("mumax");
    expect(nb.cells[2].source).toContain("Ks");
  });

  it("equations cell contains LaTeX", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[3].source).toContain("$$");
    expect(nb.cells[3].source).toContain("dX");
  });

  it("missing info cell contains critical issue", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[4].source).toContain("Missing initial X");
  });

  it("reproducibility cell contains score", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[5].source).toContain("72/100");
  });

  it("unit check cell contains warning", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[6].source).toContain("Unit mismatch on mu");
  });

  it("imports cell contains numpy and scipy", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[7].source).toContain("import numpy");
    expect(nb.cells[7].source).toContain("solve_ivp");
    expect(nb.cells[7].source).toContain("matplotlib");
  });

  it("params cell contains params dict", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[8].source).toContain("params");
    expect(nb.cells[8].source).toContain("mumax");
  });

  it("initial conditions cell contains y0", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[9].source).toContain("y0");
  });

  it("ODE cell contains ode_model function", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[10].source).toContain("ode_model");
  });

  it("simulation cell contains solve_ivp call", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[11].source).toContain("solve_ivp");
  });

  it("plotting cell contains plt or matplotlib", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[12].source).toContain("plt");
  });

  it("notes cell contains TODO checklist", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ source: string }> };
    expect(nb.cells[13].source).toContain("TODO");
  });

  it("each cell has an id", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as { cells: Array<{ id?: string }> };
    for (const cell of nb.cells) {
      expect(cell.id).toBeDefined();
      expect(typeof cell.id).toBe("string");
      expect((cell.id as string).length).toBeGreaterThan(0);
    }
  });

  it("code cells have outputs array and null execution_count", () => {
    const nb = JSON.parse(generateJupyterNotebook(baseInput())) as {
      cells: Array<{ cell_type: string; outputs?: unknown[]; execution_count?: unknown }>;
    };
    for (const cell of nb.cells) {
      if (cell.cell_type === "code") {
        expect(Array.isArray(cell.outputs)).toBe(true);
        expect(cell.execution_count).toBeNull();
      }
    }
  });

  it("works with empty variables and parameters", () => {
    const input = baseInput();
    const emptyInput: NotebookGeneratorInput = {
      ...input,
      variables: [],
      parameters: [],
      equations: [],
    };
    emptyInput.pythonCode = generatePythonOdeTemplate(emptyInput);
    const result = generateJupyterNotebook(emptyInput);
    expect(() => JSON.parse(result)).not.toThrow();
    const nb = JSON.parse(result) as { cells: unknown[] };
    expect(nb.cells).toHaveLength(14);
  });

  it("includes raw equations when raw extraction is present", () => {
    const input = baseInput();
    const withRaw: NotebookGeneratorInput = {
      ...input,
      raw: {
        paper_title_or_topic: "Test",
        system_type: "CSTR",
        process_description: "desc",
        state_variables: [],
        parameters: [],
        equations: [
          {
            label: "Monod",
            equation_latex: "\\mu = \\frac{\\mu_{max} S}{K_s + S}",
            equation_plaintext: "mu = mumax * S / (Ks + S)",
            meaning: "Monod growth rate",
            variables_involved: ["mu", "mumax", "S", "Ks"],
            source_context: "From the paper...",
            confidence: "high",
          },
        ],
        assumptions: [],
        limitations: [],
        model_card: {
          short_summary: "Test summary",
          model_type: "chemostat",
          inputs: ["S"],
          outputs: ["X"],
          control_variables: ["D"],
          missing_information: ["Initial conditions not specified"],
          can_generate_ode_template: true,
        },
      },
    };
    const result = generateJupyterNotebook(withRaw);
    const nb = JSON.parse(result) as { cells: Array<{ source: string }> };
    expect(nb.cells[3].source).toContain("Monod");
    expect(nb.cells[3].source).toContain("mu = \\frac");
  });
});
