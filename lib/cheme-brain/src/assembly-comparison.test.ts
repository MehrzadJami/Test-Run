import { describe, expect, it } from "vitest";

import { analyzeChemEModel } from "./analyzer";
import { compareAssemblyWithChemEBrain } from "./assembly-comparison";
import type { AssemblyReportLike } from "./assembly-comparison";
import type { ChemEBrainInput } from "./types";

describe("compareAssemblyWithChemEBrain", () => {
  it("does not raise a critical disagreement for the complete Monod gate", () => {
    const report = analyzeChemEModel(completeMonodInput());
    const comparison = compareAssemblyWithChemEBrain(completeAssembly("monod_chemostat"), report);

    expect(comparison.severity).not.toBe("critical");
    expect(comparison.disagreements.some((item) => item.severity === "critical")).toBe(false);
  });

  it("raises critical disagreement when assembly says runnable but ChemE Brain reports missing Monod ICs", () => {
    const input = completeMonodInput();
    const extraction = input.extraction as Record<string, unknown>;
    extraction.initial_conditions = [];
    const report = analyzeChemEModel(input);

    const comparison = compareAssemblyWithChemEBrain(completeAssembly("monod_chemostat"), report);

    expect(comparison.severity).toBe("critical");
    expect(comparison.agrees).toBe(false);
    expect(comparison.disagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          category: "readiness",
        }),
        expect.objectContaining({
          severity: "critical",
          category: "missing_requirement",
          cheme_brain_says: expect.stringMatching(/initial/i),
        }),
      ]),
    );
  });

  it("reports gas-liquid missing Henry as warning unless assembly claims runnable", () => {
    const report = analyzeChemEModel(gasLiquidInput());

    const partialComparison = compareAssemblyWithChemEBrain(partialAssembly("gas_liquid"), report);
    expect(partialComparison.severity).toBe("warning");
    expect(partialComparison.disagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          cheme_brain_says: expect.stringMatching(/Henry/i),
        }),
      ]),
    );

    const runnableComparison = compareAssemblyWithChemEBrain(completeAssembly("gas_liquid"), report);
    expect(runnableComparison.severity).toBe("critical");
    expect(runnableComparison.disagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          cheme_brain_says: expect.stringMatching(/Henry|Initial/i),
        }),
      ]),
    );
  });

  it("raises critical disagreement for an unknown unsupported model marked runnable", () => {
    const report = analyzeChemEModel({
      extraction: {
        model_type: "unknown",
        process_description: "A source discusses operations without equations, parameters, or initial conditions.",
      },
    });

    const comparison = compareAssemblyWithChemEBrain(completeAssembly("unknown"), report);

    expect(comparison.severity).toBe("critical");
    expect(comparison.disagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "support",
          severity: "critical",
        }),
      ]),
    );
  });

  it("reports gas-liquid X role mismatch as warning", () => {
    const report = analyzeChemEModel(gasLiquidInput());

    const comparison = compareAssemblyWithChemEBrain(partialAssembly("gas_liquid"), report);

    expect(comparison.disagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "role-X",
          severity: "warning",
          category: "role",
          assembly_says: expect.stringMatching(/state/i),
          cheme_brain_says: expect.stringMatching(/input/i),
        }),
      ]),
    );
  });

  it("does not mutate inputs", () => {
    const report = analyzeChemEModel(gasLiquidInput());
    const assembly = partialAssembly("gas_liquid");
    const beforeReport = JSON.stringify(report);
    const beforeAssembly = JSON.stringify(assembly);

    compareAssemblyWithChemEBrain(assembly, report);

    expect(JSON.stringify(report)).toBe(beforeReport);
    expect(JSON.stringify(assembly)).toBe(beforeAssembly);
  });
});

function completeAssembly(modelType: string): AssemblyReportLike {
  return {
    assembly_status: "complete",
    target_model_type: modelType,
    can_generate_runnable_model: true,
    can_generate_scaffold: true,
    missing_requirements: [],
    available_from_current_source: [],
    recommended_next_actions: [],
  };
}

function partialAssembly(modelType: string): AssemblyReportLike {
  return {
    assembly_status: "partial",
    target_model_type: modelType,
    can_generate_runnable_model: false,
    can_generate_scaffold: true,
    missing_requirements: [],
    available_from_current_source: [],
    recommended_next_actions: [],
  };
}

function completeMonodInput(): ChemEBrainInput {
  return {
    extraction: {
      model_type: "monod_chemostat",
      process_description:
        "A continuous chemostat is modeled with biomass X and substrate S. The specific growth rate is mu = mumax*S/(Ks + S). The biomass balance is dX/dt = (mu - D)*X. The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X. Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS. Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L. The reactor is assumed well mixed and volume is constant.",
      variables: [
        { symbol: "X", name: "biomass concentration", role: "state", unit: "g/L" },
        { symbol: "S", name: "substrate concentration", role: "state", unit: "g/L" },
        { symbol: "mu", name: "specific growth rate", role: "output", unit: "1/h" },
        { symbol: "D", name: "dilution rate", role: "control", unit: "1/h" },
        { symbol: "Sin", name: "feed substrate concentration", role: "input", unit: "g/L" },
      ],
      parameters: [
        { symbol: "mumax", value_numeric: 0.8, unit: "1/h" },
        { symbol: "Ks", value_numeric: 0.05, unit: "g/L" },
        { symbol: "D", value_numeric: 0.1, unit: "1/h" },
        { symbol: "Sin", value_numeric: 10, unit: "g/L" },
        { symbol: "Yxs", value_numeric: 0.5, unit: "gX/gS" },
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
      assumptions: ["well mixed", "volume is constant"],
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
        { symbol: "X", name: "biomass concentration", role: "state", unit: "g/L" },
      ],
      parameters: [
        { symbol: "kLa", value_numeric: 80, unit: "1/h" },
        { symbol: "Cstar_O2", value_numeric: 0.008, unit: "g/L" },
        { symbol: "qO2", value_numeric: 0.02, unit: "gO2/gX/h" },
      ],
      equations: [{ equation_plaintext: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X" }],
      assumptions: ["well mixed", "temperature is constant"],
      limitations: ["The Henry-law convention is not specified."],
    },
  };
}

