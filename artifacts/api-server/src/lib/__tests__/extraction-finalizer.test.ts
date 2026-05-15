import { describe, expect, it } from "vitest";

import { finalizeExtractionResult } from "../extraction-finalizer";
import type { ExtractionResult } from "../extraction-schema";

const monodText =
  "A continuous chemostat is modeled with biomass X and substrate S. " +
  "The specific growth rate is mu = mumax*S/(Ks + S). " +
  "The biomass balance is dX/dt = (mu - D)*X. " +
  "The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X. " +
  "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, " +
  "Sin = 10 g/L, and Yxs = 0.5 gX/gS. " +
  "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L. " +
  "The reactor is assumed well mixed and volume is constant.";

function monodResultWithPlaceholders(): ExtractionResult {
  return {
    paper_title_or_topic: "Unknown paper",
    model_type: "monod_chemostat",
    system_type: "Chemostat / Monod growth model",
    process_description: "Continuous chemostat with Monod growth.",
    state_variables: [
      {
        symbol: "unknown",
        name: "unknown",
        meaning: "Unknown placeholder",
        unit: "-",
        role: "state",
        source_context: monodText,
        confidence: "low",
      },
      {
        symbol: "X",
        name: "Biomass concentration",
        meaning: "Biomass concentration in the reactor.",
        unit: "-",
        role: "state",
        source_context: "biomass X",
        confidence: "high",
      },
      {
        symbol: "S",
        name: "Substrate concentration",
        meaning: "Substrate concentration in the reactor.",
        unit: "-",
        role: "state",
        source_context: "substrate S",
        confidence: "high",
      },
      {
        symbol: "mu",
        name: "Specific growth rate",
        meaning: "Specific growth rate from the growth-rate relation.",
        unit: "1/h",
        role: "control",
        source_context: "mu = mumax*S/(Ks + S)",
        confidence: "medium",
      },
    ],
    parameters: [
      {
        symbol: "unknown",
        name: "unknown",
        value: "0.8",
        unit: "1/h",
        source_context: "unknown page, : unknown placeholder",
        confidence: "low",
      },
      { symbol: "mumax", name: "Maximum specific growth rate", value: "0.8", unit: "1/h", source_context: monodText, confidence: "high" },
      { symbol: "Ks", name: "Monod half-saturation constant", value: "0.05", unit: "g/L", source_context: monodText, confidence: "high" },
      { symbol: "D", name: "Dilution rate", value: "0.1", unit: "1/h", source_context: monodText, confidence: "high" },
      { symbol: "Sin", name: "Feed substrate concentration", value: "10", unit: "g/L", source_context: monodText, confidence: "high" },
      { symbol: "Yxs", name: "Biomass yield on substrate", value: "0.5", unit: "gX/gS", source_context: monodText, confidence: "high" },
      { symbol: "X0", name: "X0", value: "0.1", unit: "g/L", source_context: monodText, confidence: "high" },
      { symbol: "S0", name: "S0", value: "5", unit: "g/L", source_context: monodText, confidence: "high" },
    ],
    initial_conditions: [],
    equations: [
      {
        label: "(1)",
        equation_latex: "mu = mumax*S/(Ks + S)",
        equation_plaintext: "mu = mumax*S/(Ks + S)",
        equation_type: "algebraic_calculation",
        meaning: "Monod growth relation",
        variables_involved: ["mu", "mumax", "S", "Ks"],
        source_context: "The specific growth rate is mu = mumax*S/(Ks + S).",
        confidence: "high",
      },
      {
        label: "(2)",
        equation_latex: "dX/dt = (mu - D)*X",
        equation_plaintext: "dX/dt = (mu - D)*X",
        equation_type: "dynamic_ode",
        meaning: "Biomass balance",
        variables_involved: ["X", "mu", "D"],
        source_context: "The biomass balance is dX/dt = (mu - D)*X.",
        confidence: "high",
      },
      {
        label: "(3)",
        equation_latex: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X",
        equation_plaintext: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X",
        equation_type: "dynamic_ode",
        meaning: "Substrate balance",
        variables_involved: ["S", "D", "Sin", "Yxs", "mu", "X"],
        source_context: "The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X.",
        confidence: "high",
      },
    ],
    assumptions: [
      {
        assumption: "The reactor is assumed well mixed and volume is constant.",
        source_context: "The reactor is assumed well mixed and volume is constant.",
        confidence: "low",
      },
    ],
    limitations: [],
    model_card: {
      short_summary: "Unknown paper about Unknown system. No complete dynamic ODE system was identified.",
      model_type: "monod_chemostat",
      inputs: ["Sin"],
      outputs: ["X", "S", "mu"],
      control_variables: ["mu"],
      missing_information: ["Initial conditions for state variables were not specified."],
      can_generate_ode_template: true,
    },
  };
}

function gasTransferResultWithPlaceholders(): ExtractionResult {
  return {
    paper_title_or_topic: "Gas transfer",
    model_type: "gas_liquid",
    system_type: "Gas-liquid bioreactor / transfer model",
    process_description: "Dissolved oxygen transfer and consumption.",
    state_variables: [
      {
        symbol: "unknown",
        name: "unknown",
        meaning: "Unknown placeholder",
        unit: "-",
        role: "state",
        source_context: "unknown page, : unknown placeholder",
        confidence: "low",
      },
      {
        symbol: "C_O2",
        name: "Dissolved oxygen concentration",
        meaning: "Dissolved oxygen concentration in the liquid phase.",
        unit: "-",
        role: "state",
        source_context: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X.",
        confidence: "high",
      },
      {
        symbol: "X",
        name: "Biomass concentration",
        meaning: "Biomass concentration in the oxygen uptake term.",
        unit: "-",
        role: "state",
        source_context: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X.",
        confidence: "medium",
      },
    ],
    parameters: [
      { symbol: "unknown", name: "unknown", value: "80", unit: "1/h", source_context: "", confidence: "low" },
      { symbol: "kLa", name: "Volumetric mass transfer coefficient", value: "80", unit: "1/h", source_context: "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h.", confidence: "low", status: "unknown" },
      { symbol: "Cstar_O2", name: "Saturation dissolved oxygen concentration", value: "0.008", unit: "g/L", source_context: "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h.", confidence: "low", status: "unknown" },
      { symbol: "qO2", name: "Specific oxygen uptake rate", value: "0.02", unit: "gO2/gX/h", source_context: "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h.", confidence: "high" },
      { symbol: "unknown", name: "Missing Henry convention", value: "unknown", unit: "unknown", source_context: "The Henry-law convention is not specified.", confidence: "low", status: "missing" },
    ],
    initial_conditions: [],
    equations: [
      {
        label: "(1)",
        equation_latex: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X",
        equation_plaintext: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X",
        equation_type: "dynamic_ode",
        meaning: "Oxygen balance",
        variables_involved: ["C_O2", "kLa", "Cstar_O2", "qO2", "X"],
        source_context: "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X.",
        confidence: "high",
      },
    ],
    assumptions: [],
    limitations: [
      {
        limitation: "The Henry-law convention is not specified.",
        source_context: "The Henry-law convention is not specified.",
        confidence: "low",
      },
    ],
    model_card: {
      short_summary: "Gas-liquid oxygen transfer model.",
      model_type: "gas_liquid",
      inputs: ["X"],
      outputs: ["C_O2"],
      control_variables: ["kLa"],
      missing_information: [
        "Henry-law convention was not specified.",
        "Initial conditions for state variables were not specified.",
      ],
      can_generate_ode_template: true,
    },
  };
}

describe("finalizeExtractionResult", () => {
  it("removes meaningless Monod placeholders, labels ICs, and is idempotent", () => {
    const first = finalizeExtractionResult(monodResultWithPlaceholders());
    const second = finalizeExtractionResult(first.result);

    expect(first.result.state_variables.some((variable) => variable.symbol === "unknown")).toBe(false);
    expect(first.result.parameters.some((parameter) => parameter.symbol === "unknown")).toBe(false);
    expect(first.result.parameters.find((parameter) => parameter.symbol === "X0")).toMatchObject({
      name: "Initial condition for X",
      status: "initial_condition",
    });
    expect(first.result.initial_conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "X0", state_symbol: "X", value: "0.1" }),
        expect.objectContaining({ symbol: "S0", state_symbol: "S", value: "5" }),
      ]),
    );
    expect(first.result.state_variables.find((variable) => variable.symbol === "X")).toMatchObject({
      unit: "g/L",
      initial_condition: expect.objectContaining({ symbol: "X0" }),
    });
    expect(first.result.state_variables.find((variable) => variable.symbol === "S")).toMatchObject({
      unit: "g/L",
      initial_condition: expect.objectContaining({ symbol: "S0" }),
    });
    expect(first.result.model_card.missing_information.join(" ")).not.toMatch(/initial conditions/i);
    expect(second.result).toEqual(first.result);
    expect(second.changed).toBe(false);
  });

  it("keeps meaningful gas-transfer missing information while removing duplicate placeholders", () => {
    const finalized = finalizeExtractionResult(gasTransferResultWithPlaceholders()).result;

    expect(finalized.state_variables.some((variable) => variable.symbol === "unknown")).toBe(false);
    expect(finalized.parameters.some((parameter) => parameter.symbol === "unknown")).toBe(false);
    expect(finalized.state_variables.find((variable) => variable.symbol === "C_O2")).toMatchObject({
      unit: "g/L",
    });
    expect(finalized.state_variables.find((variable) => variable.symbol === "X")).toMatchObject({
      role: "input",
    });
    expect(finalized.parameters.find((parameter) => parameter.symbol === "kLa")).toMatchObject({
      confidence: "medium",
      status: "explicit",
    });
    expect(finalized.parameters.find((parameter) => parameter.symbol === "Cstar_O2")).toMatchObject({
      confidence: "medium",
      status: "explicit",
    });
    expect(finalized.model_card.control_variables).not.toContain("kLa");
    expect(finalized.model_card.missing_information.join(" ")).toContain(
      "Henry-law convention",
    );
    expect(finalized.model_card.missing_information.join(" ")).toContain(
      "Initial conditions",
    );
  });

  // AUDIT-5: every mutating finalizer rule must record per-field provenance on
  // the rows it touched and contribute a human-readable summary warning.
  it("records finalizer_changes provenance and surfaces rule names in warnings", () => {
    const finalized = finalizeExtractionResult(monodResultWithPlaceholders());

    // 1. State-variable unit inference records both unit and confidence drops.
    const xVar = finalized.result.state_variables.find((v) => v.symbol === "X");
    expect(xVar?.finalizer_changes).toBeDefined();
    const xUnitChange = xVar!.finalizer_changes!.find(
      (change) => change.rule === "infer_state_unit_from_initial_condition" && change.field === "unit",
    );
    expect(xUnitChange).toMatchObject({ before: "-", after: "g/L" });

    // 2. Parameter promotion records confidence and/or status changes.
    const promotedRules = new Set<string>();
    for (const parameter of finalized.result.parameters) {
      for (const change of parameter.finalizer_changes ?? []) {
        promotedRules.add(change.rule);
      }
    }
    // At least one of the promotion rules should have fired on this fixture
    // (X0 and S0 are normalised to initial_condition status; mumax/Ks/D have
    // explicit `symbol = value` evidence so promote_explicit_parameter_evidence
    // applies confidence/status corrections).
    expect(
      promotedRules.has("normalize_initial_condition_parameter") ||
        promotedRules.has("promote_explicit_parameter_evidence"),
    ).toBe(true);

    // 3. Human-readable summary warnings include the rule names so the audit
    // panel can surface them without walking every row.
    const warningText = finalized.warnings.join(" | ");
    expect(warningText).toMatch(/Finalizer rule '/);
    expect(warningText).toMatch(/infer_state_unit_from_initial_condition/);
  });
});
