import { describe, expect, it } from "vitest";
import { analyzeChemEModel } from "@workspace/cheme-brain";
import type { ChemEBrainInput } from "@workspace/cheme-brain";

import { decideChemEBrainSimulationReadiness } from "../cheme-brain-readiness";

describe("ChemE Brain simulation readiness gate", () => {
  it("allows complete Monod when ChemE Brain and runtime binding agree", () => {
    const input = completeMonodInput();
    const report = analyzeChemEModel(input);
    const extraction = input.extraction as any;

    const decision = decideChemEBrainSimulationReadiness({
      featureEnabled: true,
      report,
      legacySupportedModelType: "monod_chemostat",
      parameters: extraction.parameters,
      equations: extraction.equations,
      raw: extraction,
    });

    expect(decision.canRunSimulation).toBe(true);
    expect(decision.runtimeModelType).toBe("monod_chemostat");
    expect(decision.verdict).toBe("runnable");
    expect(decision.blockers).toEqual([]);
  });

  it("blocks Monod missing X0/S0 while preserving scaffold export", () => {
    const input = completeMonodInput();
    const extraction = input.extraction as any;
    extraction.initial_conditions = [];
    extraction.parameters = extraction.parameters.filter((parameter: { symbol: string }) => !["X0", "S0"].includes(parameter.symbol));
    const report = analyzeChemEModel(input);

    const decision = decideChemEBrainSimulationReadiness({
      featureEnabled: true,
      report,
      legacySupportedModelType: "monod_chemostat",
      parameters: extraction.parameters,
      equations: extraction.equations,
      raw: extraction,
    });

    expect(decision.canRunSimulation).toBe(false);
    expect(decision.canExportScaffold).toBe(true);
    expect(decision.verdict).toBe("supported_not_ready");
    expect(decision.message).toMatch(/X0|S0|initial/i);
    expect(decision.message).toContain("You can still export the scaffold/model package.");
  });

  it("blocks gas-liquid missing Henry convention and initial condition", () => {
    const input = gasLiquidInput();
    const report = analyzeChemEModel(input);
    const extraction = input.extraction as any;

    const decision = decideChemEBrainSimulationReadiness({
      featureEnabled: true,
      report,
      legacySupportedModelType: null,
      parameters: extraction.parameters,
      equations: extraction.equations,
      raw: extraction,
    });

    expect(decision.canRunSimulation).toBe(false);
    expect(decision.canExportScaffold).toBe(true);
    expect(decision.verdict).toBe("scaffold_only");
    expect(decision.message).toMatch(/Henry|Initial/i);
  });

  it("blocks incomplete oxygen-balanced mixotrophy but allows scaffold export", () => {
    const input: ChemEBrainInput = {
      extraction: {
        process_description:
          "Oxygen-balanced mixotrophic microalgae photobioreactor with acetate feed, PFD light, dissolved oxygen control, productivity calculations, and carbon balance reporting.",
        variables: [
          { symbol: "X", role: "state" },
          { symbol: "DO", role: "control" },
          { symbol: "PFD", role: "input" },
        ],
        equations: [
          { equation_plaintext: "productivity = (X2 - X1)/(t2 - t1)" },
          { equation_plaintext: "Yxs = biomass produced / acetate consumed" },
        ],
      },
    };
    const report = analyzeChemEModel(input);

    const decision = decideChemEBrainSimulationReadiness({
      featureEnabled: true,
      report,
      legacySupportedModelType: null,
      parameters: [],
      equations: [],
      raw: null,
    });

    expect(decision.canRunSimulation).toBe(false);
    expect(decision.canExportScaffold).toBe(true);
    expect(decision.verdict).toBe("scaffold_only");
  });

  it("blocks unknown models", () => {
    const report = analyzeChemEModel({
      extraction: {
        process_description: "A generic source discusses operations without equations or parameters.",
      },
    });

    const decision = decideChemEBrainSimulationReadiness({
      featureEnabled: true,
      report,
      legacySupportedModelType: null,
      parameters: [],
      equations: [],
      raw: null,
    });

    expect(decision.canRunSimulation).toBe(false);
    expect(decision.canExportScaffold).toBe(false);
    expect(decision.verdict).toBe("unsupported");
  });

  it("preserves previous behavior when the feature flag is off", () => {
    const report = analyzeChemEModel(gasLiquidInput());

    const decision = decideChemEBrainSimulationReadiness({
      featureEnabled: false,
      report,
      legacySupportedModelType: "monod_chemostat",
      parameters: [],
      equations: [],
      raw: null,
    });

    expect(decision.authorityEnabled).toBe(false);
    expect(decision.canRunSimulation).toBe(true);
    expect(decision.runtimeModelType).toBe("monod_chemostat");
  });

  it("keeps demo-mode behavior available by letting callers skip ChemE Brain project gating", () => {
    const decision = decideChemEBrainSimulationReadiness({
      featureEnabled: false,
      report: null,
      legacySupportedModelType: "monod_chemostat",
      parameters: [],
      equations: [],
      raw: null,
    });

    expect(decision.canRunSimulation).toBe(true);
    expect(decision.message).toMatch(/previous simulation-support behavior/i);
  });
});

function completeMonodInput(): ChemEBrainInput {
  return {
    extraction: {
      model_type: "monod_chemostat",
      process_description:
        "A continuous chemostat is modeled with biomass X and substrate S. The specific growth rate is mu = mumax*S/(Ks + S). The biomass balance is dX/dt = (mu - D)*X. The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X. Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS. Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L. The reactor is assumed well mixed and volume is constant.",
      variables: [
        { symbol: "X", name: "biomass concentration", role: "state", unit: "g/L" },
        { symbol: "S", name: "substrate concentration", role: "state", unit: "g/L" },
      ],
      parameters: [
        { symbol: "mumax", value_numeric: 0.8, unit: "1/h" },
        { symbol: "Ks", value_numeric: 0.05, unit: "g/L" },
        { symbol: "D", value_numeric: 0.1, unit: "1/h" },
        { symbol: "Sin", value_numeric: 10, unit: "g/L" },
        { symbol: "Yxs", value_numeric: 0.5, unit: "gX/gS" },
        { symbol: "X0", name: "Initial condition for X", value_numeric: 0.1, unit: "g/L", originalValue: { kind: "initial_condition" } },
        { symbol: "S0", name: "Initial condition for S", value_numeric: 5, unit: "g/L", originalValue: { kind: "initial_condition" } },
      ],
      equations: [
        { equation_plaintext: "mu = mumax*S/(Ks + S)" },
        { equation_plaintext: "dX/dt = (mu - D)*X" },
        { equation_plaintext: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X" },
      ],
      initial_conditions: [
        { symbol: "X0", state_symbol: "X", value_numeric: 0.1, unit: "g/L" },
        { symbol: "S0", state_symbol: "S", value_numeric: 5, unit: "g/L" },
      ],
    },
  };
}

function gasLiquidInput(): ChemEBrainInput {
  return {
    extraction: {
      model_type: "gas_liquid",
      process_description:
        "An aerobic bioreactor is described by dissolved oxygen concentration C_O2 and biomass concentration X. The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X. Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h. The liquid phase is assumed well mixed and temperature is constant. The Henry-law convention is not specified.",
      variables: [
        { symbol: "C_O2", name: "dissolved oxygen concentration", role: "state", unit: "g/L" },
        { symbol: "X", name: "biomass concentration", role: "input", unit: "g/L" },
      ],
      parameters: [
        { symbol: "kLa", value_numeric: 80, unit: "1/h" },
        { symbol: "Cstar_O2", value_numeric: 0.008, unit: "g/L" },
        { symbol: "qO2", value_numeric: 0.02, unit: "gO2/gX/h" },
      ],
      equations: [{ equation_plaintext: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X" }],
      limitations: ["The Henry-law convention is not specified."],
    },
  };
}

