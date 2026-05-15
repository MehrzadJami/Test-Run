import { describe, expect, it } from "vitest";

import { analyzeChemEModel } from "./analyzer";
import type { ChemEBrainInput, CorrectedRole, EquationClassification } from "./types";

const MONOD_TEXT =
  "A continuous chemostat is modeled with biomass X and substrate S. The specific growth rate is mu = mumax*S/(Ks + S). The biomass balance is dX/dt = (mu - D)*X. The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X. Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 gX/gS. Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L. The reactor is assumed well mixed and volume is constant.";

const GAS_TEXT =
  "An aerobic bioreactor is described by dissolved oxygen concentration C_O2 and biomass concentration X. The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X. Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h. The liquid phase is assumed well mixed and temperature is constant. The Henry-law convention is not specified.";

describe("analyzeChemEModel", () => {
  it("returns a deterministic runnable advisory report for the exact complete Monod gate", () => {
    const input = completeMonodInput();

    const report = analyzeChemEModel(input);
    const reportAgain = analyzeChemEModel(input);

    expect(reportAgain).toEqual(report);
    expect(report.canonical_model_type).toBe("monod_chemostat");
    expect(report.simulation_support.status).toBe("runnable");
    expect(report.confidence).toBe("high");
    expect(report.confidence_explanation.matchedEquations).toEqual(
      expect.arrayContaining(["dS/dt", "dX/dt", "mu rate law"]),
    );
    expect(report.confidence_explanation.matchedParameters).toEqual(
      expect.arrayContaining(["D", "Ks", "Sin", "Yxs", "mumax"]),
    );
    expect(report.evidence_status_summary.observed).toBeGreaterThan(0);
    expect(report.evidence_status_summary.inferred).toBeGreaterThan(0);

    const equations = report.equation_classification;
    expect(equationByText(equations, "dX/dt")?.recommendedType).toBe("dynamic_ode");
    expect(equationByText(equations, "dS/dt")?.recommendedType).toBe("dynamic_ode");
    expect(equationByText(equations, "mu =")?.recommendedType).toBe("rate_law");

    expect(checklistStatus(report.required_information_checklist, "monod-param-yxs")).toBe("observed");
    expect(checklistStatus(report.required_information_checklist, "monod-ic-x0")).toBe("observed");
    expect(checklistStatus(report.required_information_checklist, "monod-ic-s0")).toBe("observed");
    expect(report.missing_requirements.map((item) => item.item)).not.toContain("Initial conditions X0 and S0");

    const mu = roleBySymbol(report.corrected_roles, "mu");
    expect(mu?.recommendedRole).toBe("intermediate");
    expect(mu?.evidenceStatus).toBe("conflicting");
    const d = roleBySymbol(report.corrected_roles, "D");
    expect(d?.recommendedRole).toBe("control");
  });

  it("marks Monod without X0/S0 as supported but not ready", () => {
    const input = completeMonodInput();
    const extraction = input.extraction as Record<string, unknown>;
    extraction.initial_conditions = [];

    const report = analyzeChemEModel(input);

    expect(report.canonical_model_type).toBe("monod_chemostat");
    expect(report.simulation_support.status).toBe("supported_not_ready");
    expect(report.missing_requirements.map((item) => item.id)).toEqual(
      expect.arrayContaining(["monod-ic-x0-missing", "monod-ic-s0-missing", "monod-missing-ics"]),
    );
  });

  // AUDIT-3: observed vs inferred evidence must be separated in the readiness
  // decision. If a critical parameter is marked as finalizer-promoted (status
  // or confidence was mutated by the extraction-finalizer), it must not be
  // counted as "observed" — the audit downgrades the readiness from runnable
  // to supported_not_ready and surfaces the inferred evidence to the user.
  it("downgrades a Monod model to supported_not_ready when a critical parameter is finalizer-promoted", () => {
    const input = completeMonodInput();
    const extraction = input.extraction as Record<string, unknown>;
    const parameters = (extraction.parameters as Record<string, unknown>[]).slice();
    // Mark Yxs as finalizer-promoted (status was inferred → promoted to explicit
    // by the finalizer). The readiness gate must not treat this as observed.
    parameters[4] = {
      ...parameters[4],
      finalizer_changes: [
        { rule: "promote_explicit_parameter_evidence", field: "status", before: "unknown", after: "explicit" },
        { rule: "promote_explicit_parameter_evidence", field: "confidence", before: "low", after: "medium" },
      ],
    };
    extraction.parameters = parameters;

    const report = analyzeChemEModel(input);

    expect(report.canonical_model_type).toBe("monod_chemostat");
    expect(report.simulation_support.status).toBe("supported_not_ready");
    // The Yxs checklist item is now classified as inferred, not observed.
    expect(checklistStatus(report.required_information_checklist, "monod-param-yxs")).toBe("inferred");
  });

  it("audits the exact gas-liquid gate with C_O2 as state and X as forcing", () => {
    const report = analyzeChemEModel(gasLiquidInput());

    expect(report.canonical_model_type).toBe("gas_liquid");
    expect(report.simulation_support.status).toBe("scaffold_only");
    expect(equationByText(report.equation_classification, "dC_O2/dt")?.recommendedType).toBe("dynamic_ode");

    const cO2 = roleBySymbol(report.corrected_roles, "C_O2");
    expect(cO2?.recommendedRole).toBe("state");
    const x = roleBySymbol(report.corrected_roles, "X");
    expect(x?.recommendedRole).toBe("input");
    expect(x?.evidenceStatus).toBe("conflicting");
    const kla = roleBySymbol(report.corrected_roles, "kLa");
    expect(kla?.recommendedRole).toBe("parameter");

    expect(report.missing_requirements.map((item) => item.id)).toEqual(
      expect.arrayContaining(["gas-missing-henry", "gas-missing-ic"]),
    );
  });

  it("does not require dilution rate D for batch culture", () => {
    const report = analyzeChemEModel({
      extraction: {
        model_type: "batch_culture",
        process_description: "Batch culture with biomass X and substrate S in a closed vessel.",
        variables: [
          { symbol: "X", role: "state" },
          { symbol: "S", role: "state" },
        ],
        parameters: [
          { symbol: "mumax", value_numeric: 0.4, unit: "1/h" },
          { symbol: "Ks", value_numeric: 0.1, unit: "g/L" },
          { symbol: "Yxs", value_numeric: 0.5, unit: "gX/gS" },
        ],
        equations: [
          { equation_plaintext: "mu = mumax*S/(Ks + S)" },
          { equation_plaintext: "dX/dt = mu*X" },
          { equation_plaintext: "dS/dt = -(1/Yxs)*mu*X" },
        ],
        initial_conditions: [
          { symbol: "X0", state_symbol: "X", value_numeric: 0.1 },
          { symbol: "S0", state_symbol: "S", value_numeric: 5 },
        ],
      },
    });

    expect(report.canonical_model_type).toBe("batch_culture");
    expect(report.required_information_checklist.map((item) => item.id)).not.toContain("monod-param-d");
    expect(report.missing_requirements.map((item) => item.item).join(" ")).not.toMatch(/dilution rate/i);
  });

  it("recognizes fed-batch feed and volume evidence", () => {
    const report = analyzeChemEModel({
      extraction: {
        process_description: "A fed-batch culture uses feed profile F(t), volume V, and dV/dt = F(t).",
        variables: [
          { symbol: "X", role: "state" },
          { symbol: "S", role: "state" },
          { symbol: "V", role: "state" },
        ],
        parameters: [{ symbol: "F", name: "feed profile", unit: "L/h" }],
        equations: [{ equation_plaintext: "dV/dt = F(t)" }],
      },
    });

    expect(report.canonical_model_type).toBe("fed_batch");
    expect(checklistStatus(report.required_information_checklist, "fed-state-v")).toBe("observed");
    expect(checklistStatus(report.required_information_checklist, "fed-input-feed")).toBe("observed");
    expect(checklistStatus(report.required_information_checklist, "fed-eq-volume")).toBe("observed");
  });

  it("recognizes enzyme kinetics with Vmax and Km", () => {
    const report = analyzeChemEModel({
      extraction: {
        process_description: "The enzyme follows Michaelis-Menten kinetics.",
        variables: [
          { symbol: "S", role: "input" },
          { symbol: "v", role: "output" },
        ],
        parameters: [
          { symbol: "Vmax", value_numeric: 2.5, unit: "mM/min" },
          { symbol: "Km", value_numeric: 0.3, unit: "mM" },
        ],
        equations: [{ equation_plaintext: "v = Vmax*S/(Km + S)" }],
      },
    });

    expect(report.canonical_model_type).toBe("enzyme_kinetics");
    expect(checklistStatus(report.required_information_checklist, "enzyme-param-vmax")).toBe("observed");
    expect(checklistStatus(report.required_information_checklist, "enzyme-param-km")).toBe("observed");
    expect(equationByText(report.equation_classification, "Vmax")?.recommendedType).toBe("rate_law");
  });

  it("keeps oxygen-balanced mixotrophy scaffold-only and requests missing scientific sources", () => {
    const report = analyzeChemEModel({
      extraction: {
        process_description:
          "An oxygen-balanced mixotrophic microalgae photobioreactor uses acetate feed, PFD light, dissolved oxygen control, productivity calculations, yield equations, and carbon balance reporting.",
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
    });

    expect(report.canonical_model_type).toBe("oxygen_balanced_mixotrophy");
    expect(report.simulation_support.status).toBe("scaffold_only");
    const missingText = report.missing_requirements.map((item) => `${item.id} ${item.item}`).join(" ");
    expect(missingText).toMatch(/kinetic/i);
    expect(missingText).toMatch(/light/i);
    expect(missingText).toMatch(/henry/i);
    expect(missingText).toMatch(/controller/i);
    expect(missingText).toMatch(/initial/i);
    expect(equationByText(report.equation_classification, "productivity")?.recommendedType).toBe("productivity");
    expect(equationByText(report.equation_classification, "Yxs")?.recommendedType).toBe("yield");
  });

  it("does not hallucinate model facts for unknown generic input", () => {
    const report = analyzeChemEModel({
      extraction: {
        process_description: "This source discusses bioprocess operations at a high level without equations or parameter values.",
      },
    });

    expect(report.canonical_model_type).toBe("unknown");
    expect(report.simulation_support.status).toBe("unsupported");
    expect(report.equation_classification).toHaveLength(0);
    expect(report.confidence_explanation.matchedParameters).toHaveLength(0);
    expect(report.confidence_explanation.matchedEquations).toHaveLength(0);
    expect(report.required_information_checklist.filter((item) => item.evidenceStatus === "observed")).toHaveLength(0);
  });

  it("reports conflicting parameter values instead of silently choosing one", () => {
    const report = analyzeChemEModel({
      extraction: {
        model_type: "gas_liquid",
        variables: [{ symbol: "C_O2", role: "state" }],
        parameters: [
          { symbol: "kLa", value_numeric: 80, unit: "1/h" },
          { symbol: "kLa", value_numeric: 90, unit: "1/h" },
        ],
        equations: [{ equation_plaintext: "dC_O2/dt = kLa*(Cstar_O2 - C_O2)" }],
      },
    });

    expect(report.contradictions.join(" ")).toMatch(/kLa.*80.*90/i);
    expect(report.evidence_status_summary.conflicting).toBeGreaterThan(0);
  });
});

function completeMonodInput(): ChemEBrainInput {
  return {
    extraction: {
      model_type: "unknown",
      process_description: MONOD_TEXT,
      variables: [
        { symbol: "X", name: "biomass concentration", role: "state", unit: "g/L", source_context: { quote: "biomass X" } },
        { symbol: "S", name: "substrate concentration", role: "state", unit: "g/L", source_context: { quote: "substrate S" } },
        { symbol: "mu", name: "specific growth rate", role: "control", unit: "1/h", source_context: { quote: "specific growth rate is mu" } },
        { symbol: "D", name: "dilution rate", role: "input", unit: "1/h" },
        { symbol: "Sin", name: "feed substrate concentration", role: "input", unit: "g/L" },
      ],
      parameters: [
        { symbol: "mumax", value_numeric: 0.8, unit: "1/h", source_context: { quote: "mumax = 0.8 1/h" } },
        { symbol: "Ks", value_numeric: 0.05, unit: "g/L", source_context: { quote: "Ks = 0.05 g/L" } },
        { symbol: "D", value_numeric: 0.1, unit: "1/h", source_context: { quote: "D = 0.1 1/h" } },
        { symbol: "Sin", value_numeric: 10, unit: "g/L", source_context: { quote: "Sin = 10 g/L" } },
        { symbol: "Yxs", value_numeric: 0.5, unit: "gX/gS", source_context: { quote: "Yxs = 0.5 gX/gS" } },
      ],
      equations: [
        { equation_plaintext: "mu = mumax*S/(Ks + S)", source_context: { quote: "mu = mumax*S/(Ks + S)" } },
        { equation_plaintext: "dX/dt = (mu - D)*X", source_context: { quote: "dX/dt = (mu - D)*X" } },
        { equation_plaintext: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X", source_context: { quote: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X" } },
      ],
      initial_conditions: [
        { symbol: "X0", state_symbol: "X", value_numeric: 0.1, unit: "g/L", source_context: { quote: "X0 = 0.1 g/L" } },
        { symbol: "S0", state_symbol: "S", value_numeric: 5, unit: "g/L", source_context: { quote: "S0 = 5 g/L" } },
      ],
      assumptions: ["well mixed", "volume is constant"],
    },
  };
}

function gasLiquidInput(): ChemEBrainInput {
  return {
    extraction: {
      model_type: "unknown",
      process_description: GAS_TEXT,
      variables: [
        { symbol: "C_O2", name: "dissolved oxygen concentration", role: "state", unit: "g/L" },
        { symbol: "X", name: "biomass concentration", role: "state" },
      ],
      parameters: [
        { symbol: "kLa", value_numeric: 80, unit: "1/h", source_context: { quote: "kLa = 80 1/h" } },
        { symbol: "Cstar_O2", value_numeric: 0.008, unit: "g/L", source_context: { quote: "Cstar_O2 = 0.008 g/L" } },
        { symbol: "qO2", value_numeric: 0.02, unit: "gO2/gX/h", source_context: { quote: "qO2 = 0.02 gO2/gX/h" } },
      ],
      equations: [
        {
          equation_plaintext: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X",
          source_context: { quote: "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X" },
        },
      ],
      limitations: ["The Henry-law convention is not specified."],
    },
  };
}

function equationByText(equations: EquationClassification[], needle: string): EquationClassification | undefined {
  return equations.find((equation) => equation.equationPattern.includes(needle));
}

function roleBySymbol(roles: CorrectedRole[], symbol: string): CorrectedRole | undefined {
  const target = symbol.toLowerCase().replace(/[^a-z0-9]/g, "");
  return roles.find((role) => role.symbol.toLowerCase().replace(/[^a-z0-9]/g, "") === target);
}

function checklistStatus(checklist: { id: string; evidenceStatus: string }[], id: string): string | undefined {
  return checklist.find((item) => item.id === id)?.evidenceStatus;
}
