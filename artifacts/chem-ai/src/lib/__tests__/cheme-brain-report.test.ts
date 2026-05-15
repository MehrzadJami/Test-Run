import { describe, expect, it } from "vitest";

import {
  buildChemEBrainDisplayModel,
  CHEME_BRAIN_SHADOW_NOTICE,
  type ChemEBrainModelCardInput,
} from "../cheme-brain-report";

describe("ChemE Brain model-card display helper", () => {
  it("renders the exact Monod gate as runnable without missing ICs", () => {
    const display = buildChemEBrainDisplayModel(monodFixture());

    expect(display.verdict).toBe("runnable");
    expect(display.assemblyComparison.severity).not.toBe("critical");
    expect(display.canonicalModelType).toBe("monod_chemostat");
    expect(display.extractedModelType).toBe("monod_chemostat");
    expect(display.observedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Biomass state", status: "Observed in source" }),
        expect.objectContaining({ label: "Substrate state", status: "Observed in source" }),
        expect.objectContaining({ label: "Monod growth relation", status: "Observed in source" }),
        expect.objectContaining({ label: "Biomass dynamic balance", status: "Observed in source" }),
        expect.objectContaining({ label: "Substrate dynamic balance", status: "Observed in source" }),
      ]),
    );
    expect(display.missingRows.map((row) => row.label).join("\n")).not.toMatch(/initial/i);
  });

  it("renders gas-liquid Henry and C_O2 initial condition gaps", () => {
    const display = buildChemEBrainDisplayModel(gasLiquidFixture());

    expect(display.canonicalModelType).toBe("gas_liquid");
    expect(display.assemblyComparison.severity).toBe("warning");
    expect(display.assemblyComparison.disagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cheme_brain_says: expect.stringMatching(/Henry/i),
        }),
        expect.objectContaining({
          id: "role-X",
          recommended_action: expect.any(String),
        }),
      ]),
    );
    expect(display.missingRows.map((row) => `${row.label} ${row.detail}`).join("\n")).toMatch(/Henry/i);
    expect(display.missingRows.map((row) => `${row.label} ${row.detail}`).join("\n")).toMatch(/Initial/i);
    expect(display.missingRows.every((row) => row.severity && row.reason)).toBe(true);
    expect(display.roleRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol: "X",
          recommendedRole: "input",
        }),
      ]),
    );
  });

  it("includes shadow-mode labels and no forbidden product claims", () => {
    const display = buildChemEBrainDisplayModel(gasLiquidFixture());
    const copy = display.copyStrings.join("\n");

    expect(copy).toContain(CHEME_BRAIN_SHADOW_NOTICE);
    expect(copy).toContain("This comparison is advisory and does not change current readiness or simulation behavior.");
    expect(copy).toContain("Observed in source");
    expect(copy).toContain("Inferred by ChemE rules");
    expect(copy).toContain("Missing for simulation");
    expect(copy).not.toMatch(/\b(validated|certified|guaranteed|digital twin)\b/i);
  });

  it("does not mutate model card inputs", () => {
    const input = monodFixture();
    const before = JSON.stringify(input);

    buildChemEBrainDisplayModel(input);

    expect(JSON.stringify(input)).toBe(before);
  });
});

function monodFixture(): ChemEBrainModelCardInput {
  const parameterSentence =
    "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS.";
  const icSentence = "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L.";
  return {
    extraction: {
      modelCardTitle: "Monod Final Check",
      providerUsed: "groq",
      domain: "Bioreactor",
      modelType: "monod_chemostat",
      systemDescription:
        "A continuous chemostat is modeled with biomass X and substrate S. The reactor is assumed well mixed and volume is constant.",
      problemStatement:
        "A continuous chemostat is modeled with biomass X and substrate S. The specific growth rate is mu = mumax*S/(Ks + S). The biomass balance is dX/dt = (mu - D)*X. The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X. Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS. Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L. The reactor is assumed well mixed and volume is constant.",
    },
    variables: [
      { symbol: "X", name: "Biomass", role: "state", unit: "g/L", sourceQuote: "X is biomass. Unit inferred from initial condition." },
      { symbol: "S", name: "Substrate", role: "state", unit: "g/L", sourceQuote: "S is substrate. Unit inferred from initial condition." },
      { symbol: "mu", name: "Specific growth rate", role: "output", unit: "1/h", sourceQuote: "The specific growth rate is mu = mumax*S/(Ks + S)." },
    ],
    parameters: [
      { symbol: "mumax", value: 0.8, unit: "1/h", confidence: "high", sourceQuote: parameterSentence },
      { symbol: "Ks", value: 0.05, unit: "g/L", confidence: "high", sourceQuote: parameterSentence },
      { symbol: "D", value: 0.1, unit: "1/h", confidence: "high", sourceQuote: parameterSentence },
      { symbol: "Sin", value: 10, unit: "g/L", confidence: "high", sourceQuote: parameterSentence },
      { symbol: "Yxs", value: 0.5, unit: "gX/gS", confidence: "high", sourceQuote: parameterSentence },
      { symbol: "X0", name: "Initial condition for X", value: 0.1, unit: "g/L", confidence: "high", sourceQuote: `${icSentence} [initial_condition]` },
      { symbol: "S0", name: "Initial condition for S", value: 5, unit: "g/L", confidence: "high", sourceQuote: `${icSentence} [initial_condition]` },
    ],
    equations: [
      { id: 1, latex: "mu = mumax*S/(Ks + S)", description: "Specific growth rate", sourceQuote: "The specific growth rate is mu = mumax*S/(Ks + S).", equationType: "algebraic_calculation" },
      { id: 2, latex: "dX/dt = (mu - D)*X", description: "Biomass balance", sourceQuote: "The biomass balance is dX/dt = (mu - D)*X.", equationType: "dynamic_ode" },
      { id: 3, latex: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X", description: "Substrate balance", sourceQuote: "The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X.", equationType: "dynamic_ode" },
    ],
    assumptionItems: [{ text: "well mixed" }, { text: "volume is constant" }],
    limitationItems: [],
    raw: {
      model_type: "monod_chemostat",
      initial_conditions: [
        { symbol: "X0", state_symbol: "X", value: "0.1", value_numeric: 0.1, unit: "g/L", source_context: icSentence },
        { symbol: "S0", state_symbol: "S", value: "5", value_numeric: 5, unit: "g/L", source_context: icSentence },
      ],
      model_card: {
        model_type: "monod_chemostat",
      },
    },
  };
}

function gasLiquidFixture(): ChemEBrainModelCardInput {
  const parameterSentence =
    "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h.";
  return {
    extraction: {
      modelCardTitle: "Gas Transfer",
      providerUsed: "rule_based",
      domain: "Bioreactor",
      modelType: "gas_liquid",
      systemDescription:
        "An aerobic bioreactor is described by dissolved oxygen concentration C_O2 and biomass concentration X.",
      problemStatement:
        "An aerobic bioreactor is described by dissolved oxygen concentration C_O2 and biomass concentration X. The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X. Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h. The liquid phase is assumed well mixed and temperature is constant. The Henry-law convention is not specified.",
    },
    variables: [
      { symbol: "C_O2", name: "Dissolved oxygen concentration", unit: "g/L", role: "state", sourceQuote: "Dissolved oxygen concentration C_O2." },
      { symbol: "X", name: "Biomass concentration", unit: "g/L", role: "state", sourceQuote: "Biomass concentration X." },
    ],
    parameters: [
      { symbol: "kLa", value: 80, unit: "1/h", confidence: "high", sourceQuote: parameterSentence },
      { symbol: "Cstar_O2", value: 0.008, unit: "g/L", confidence: "high", sourceQuote: parameterSentence },
      { symbol: "qO2", value: 0.02, unit: "gO2/gX/h", confidence: "high", sourceQuote: parameterSentence },
    ],
    equations: [
      {
        id: 1,
        latex: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X",
        description: "Dissolved oxygen balance",
        sourceQuote: "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X.",
        equationType: "dynamic_ode",
      },
    ],
    assumptionItems: [{ text: "well mixed" }, { text: "temperature is constant" }],
    limitationItems: [{ text: "The Henry-law convention is not specified." }],
    raw: {
      model_type: "gas_liquid",
      model_card: {
        model_type: "gas_liquid",
      },
    },
  };
}
