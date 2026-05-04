import { describe, expect, it } from "vitest";
import {
  analyzeModelAssembly,
  type ModelAssemblyInput,
  type ModelAssemblyReport,
} from "../model-assembly";

function abiusiLikeInput(): ModelAssemblyInput {
  const systemDescription =
    "Abiusi-like continuous mixotrophic microalgae photobioreactor operated as a chemostat with acetate feed, DO control, measured productivity, yield calculations, and oxygen/carbon stoichiometry.";

  return {
    systemDescription,
    problemStatement:
      "Assemble an oxygen-balanced six-state dynamic model for biomass, acetate, dissolved oxygen, and carbon species.",
    variables: [
      {
        id: 1,
        symbol: "X",
        name: "biomass concentration",
        unit: "g/L",
        role: "state",
        sourceQuote: "Biomass concentration X was measured during continuous operation.",
      },
      {
        id: 2,
        symbol: "S_ac",
        name: "acetate concentration",
        unit: "g/L",
        role: "state",
        sourceQuote: "Acetate was supplied in the feed and monitored in the broth.",
      },
      {
        id: 3,
        symbol: "DO",
        name: "dissolved oxygen",
        unit: "%",
        role: "state",
        sourceQuote: "Dissolved oxygen was controlled during mixotrophic operation.",
      },
    ],
    parameters: [
      {
        id: 1,
        symbol: "D",
        value: 0.03,
        unit: "1/h",
        confidence: "high",
        sourceQuote: "The chemostat dilution rate was D = 0.03 1/h.",
      },
      {
        id: 2,
        symbol: "Ac_in",
        value: 1.2,
        unit: "g/L",
        confidence: "high",
        sourceQuote: "The feed acetate concentration was 1.2 g/L.",
      },
      {
        id: 3,
        symbol: "DO_set",
        value: 30,
        unit: "%",
        confidence: "high",
        sourceQuote: "DO was controlled at a 30% air-saturation setpoint.",
      },
      {
        id: 4,
        symbol: "V",
        value: 1.8,
        unit: "L",
        confidence: "high",
        sourceQuote: "The reactor working volume was 1.8 L.",
      },
      {
        id: 5,
        symbol: "PFD",
        value: 120,
        unit: "umol photons/m2/s",
        confidence: "high",
        sourceQuote: "Illumination was supplied at a PFD of 120 umol photons/m2/s.",
      },
    ],
    equations: [
      {
        id: 1,
        latex: "P_X = D X",
        description: "Biomass productivity calculation",
        sourceQuote: "Productivity was calculated as P_X = D X.",
      },
      {
        id: 2,
        latex: "Y_{X/S} = P_X / r_S",
        description: "Yield calculation from acetate consumption",
        sourceQuote: "Yield was calculated from biomass productivity and acetate uptake.",
      },
      {
        id: 3,
        latex: "CH3COO- + 2 O2 -> 2 CO2 + H2O",
        description: "Stoichiometric acetate oxidation relation",
        sourceQuote: "Stoichiometric equations were used for oxygen and carbon balances.",
      },
    ],
    assumptions: [
      {
        id: 1,
        text: "The reactor was operated as a well-mixed continuous culture.",
        kind: "assumption",
      },
      {
        id: 2,
        text: "Henry-law convention and closed-loop controller parameters were not specified.",
        kind: "limitation",
      },
    ],
    raw: {
      paper_title_or_topic: "Abiusi-like mixotrophic photobioreactor excerpt",
      system_type: "oxygen-balanced mixotrophic photobioreactor",
      process_description: systemDescription,
      state_variables: [
        {
          symbol: "X",
          name: "biomass concentration",
          role: "state",
          source_context: "Biomass concentration X was measured.",
          confidence: "high",
        },
        {
          symbol: "S_ac",
          name: "acetate concentration",
          role: "state",
          source_context: "Acetate was supplied in the feed.",
          confidence: "high",
        },
        {
          symbol: "DO",
          name: "dissolved oxygen",
          role: "state",
          source_context: "DO was controlled during cultivation.",
          confidence: "high",
        },
      ],
      parameters: [
        {
          symbol: "D",
          value: "0.03",
          unit: "1/h",
          source_context: "The chemostat dilution rate was D = 0.03 1/h.",
          confidence: "high",
        },
        {
          symbol: "DO_set",
          value: "30",
          unit: "%",
          source_context: "DO was controlled at 30% air saturation.",
          confidence: "high",
        },
        {
          symbol: "V",
          value: "1.8",
          unit: "L",
          source_context: "The reactor working volume was 1.8 L.",
          confidence: "high",
        },
        {
          symbol: "PFD",
          value: "120",
          unit: "umol photons/m2/s",
          source_context: "PFD was 120 umol photons/m2/s.",
          confidence: "high",
        },
      ],
      equations: [
        {
          equation_plaintext: "P_X = D*X",
          meaning: "Productivity calculation",
          source_context: "Productivity was calculated as P_X = D X.",
          confidence: "high",
        },
        {
          equation_plaintext: "CH3COO- + 2 O2 -> 2 CO2 + H2O",
          meaning: "O2 and CO2 stoichiometry",
          source_context: "Stoichiometric equations were used for oxygen and carbon balances.",
          confidence: "high",
        },
      ],
      limitations: [
        {
          limitation:
            "Kinetic constants, light attenuation parameters, initial conditions, and controller parameters were not reported.",
          source_context:
            "The excerpt reports experimental operation but not a full kinetic ODE model.",
          confidence: "high",
        },
        {
          limitation: "Henry-law convention was not specified.",
          source_context: "Henry-law convention was not specified.",
          confidence: "high",
        },
      ],
      model_card: {
        model_type: "oxygen_balanced_mixotrophy",
        inputs: ["Ac_in", "PFD", "DO_set"],
        outputs: ["X", "S_ac", "DO"],
        control_variables: ["D", "DO_set"],
        missing_information: [
          "kinetic constants",
          "light attenuation parameters",
          "initial conditions",
          "controller parameters",
          "Henry-law convention",
        ],
        can_generate_ode_template: false,
      },
    },
  };
}

function monodChemostatInput(): ModelAssemblyInput {
  return {
    systemDescription: "Simple Monod chemostat model.",
    problemStatement: "Predict X and S from Monod growth in a continuous culture.",
    variables: [
      {
        id: 1,
        symbol: "X",
        name: "biomass concentration",
        unit: "g/L",
        role: "state",
        sourceQuote: "Biomass balance: dX/dt = (mu - D)*X.",
      },
      {
        id: 2,
        symbol: "S",
        name: "substrate concentration",
        unit: "g/L",
        role: "state",
        sourceQuote: "Substrate balance: dS/dt = D*(Sin - S) - (1/Yxs)*mu*X.",
      },
    ],
    parameters: [
      {
        id: 1,
        symbol: "mumax",
        value: 0.8,
        unit: "1/h",
        confidence: "high",
        sourceQuote: "mumax = 0.8 1/h.",
      },
      {
        id: 2,
        symbol: "Ks",
        value: 0.05,
        unit: "g/L",
        confidence: "high",
        sourceQuote: "Ks = 0.05 g/L.",
      },
      {
        id: 3,
        symbol: "D",
        value: 0.1,
        unit: "1/h",
        confidence: "high",
        sourceQuote: "D = 0.1 1/h.",
      },
      {
        id: 4,
        symbol: "Sin",
        value: 10,
        unit: "g/L",
        confidence: "high",
        sourceQuote: "Sin = 10 g/L.",
      },
      {
        id: 5,
        symbol: "Yxs",
        value: 0.5,
        unit: "g/g",
        confidence: "high",
        sourceQuote: "Yxs = 0.5 g/g.",
      },
    ],
    equations: [
      {
        id: 1,
        latex: "mu = mumax*S/(Ks+S)",
        description: "Monod growth relation",
        sourceQuote: "The growth rate is mu = mumax*S/(Ks+S).",
      },
      {
        id: 2,
        latex: "dX/dt = (mu - D)*X",
        description: "Biomass balance",
        sourceQuote: "The biomass balance is dX/dt = (mu - D)*X.",
      },
      {
        id: 3,
        latex: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X",
        description: "Substrate balance",
        sourceQuote: "The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X.",
      },
    ],
    assumptions: [
      {
        id: 1,
        text: "The reactor is well-mixed and volume is constant.",
        kind: "assumption",
      },
    ],
    raw: {
      system_type: "Chemostat / Monod growth model",
      model_card: {
        inputs: ["Sin"],
        outputs: ["X", "S", "mu"],
        control_variables: ["D"],
        missing_information: ["Initial conditions were not specified."],
        can_generate_ode_template: true,
      },
    },
  };
}

function missingItems(report: ModelAssemblyReport): string {
  return report.missing_requirements.map((item) => item.item).join(" | ");
}

describe("analyzeModelAssembly", () => {
  it("detects an oxygen-balanced mixotrophic photobioreactor target", () => {
    const report = analyzeModelAssembly(abiusiLikeInput());

    expect(report.target_model_type).toBe("oxygen_balanced_mixotrophy");
  });

  it("maps legacy raw model_type values to canonical target model types", () => {
    const input = monodChemostatInput();
    input.raw = {
      ...input.raw,
      model_type: "chemostat",
    };

    const report = analyzeModelAssembly(input);

    expect(report.target_model_type).toBe("monod_chemostat");
  });

  it("marks the Abiusi-like model as partial and scaffold-only", () => {
    const report = analyzeModelAssembly(abiusiLikeInput());

    expect(report.assembly_status).toBe("partial");
    expect(report.can_generate_runnable_model).toBe(false);
    expect(report.can_generate_scaffold).toBe(true);
  });

  it("detects available D, DO control, reactor volume, and PFD evidence", () => {
    const report = analyzeModelAssembly(abiusiLikeInput());
    const available = report.available_from_current_source.map((item) => item.item);

    expect(available).toContain("D = 0.03 1/h");
    expect(available).toContain("DO_set = 30 %");
    expect(available).toContain("DO setpoint/control variable");
    expect(available).toContain("Reactor volume");
    expect(available).toContain("PFD / incident light intensity");
  });

  it("flags missing kinetic, light, Henry-law, initial-condition, calibration, and controller requirements", () => {
    const report = analyzeModelAssembly(abiusiLikeInput());
    const items = missingItems(report);
    const categories = report.missing_requirements.map((item) => item.category);

    expect(items).toContain("Kinetic constants for growth and uptake");
    expect(items).toContain("Calibration data or accepted parameter assumptions");
    expect(items).toContain("Light attenuation parameters");
    expect(items).toContain("Henry-law convention");
    expect(items).toContain("Initial conditions");
    expect(items).toContain("Controller parameters for DO control");
    expect(categories).toEqual(
      expect.arrayContaining([
        "kinetic_parameter",
        "light_model",
        "gas_transfer",
        "initial_condition",
        "calibration_required",
        "controller",
      ]),
    );
  });

  it("recommends uploading supporting information or cited papers for the Abiusi-like gaps", () => {
    const report = analyzeModelAssembly(abiusiLikeInput());

    expect(report.recommended_next_actions).toContain(
      "Upload the Supporting Information",
    );
    expect(report.recommended_next_actions).toContain(
      "Upload the cited light-model or kinetic-model paper",
    );
    expect(report.recommended_next_actions).toContain(
      "Provide assumed Henry-law convention",
    );
    expect(report.recommended_next_actions).toContain(
      "Provide kinetic constants or allow calibration",
    );
    expect(report.recommended_next_actions).toContain(
      "Upload experimental CSV for calibration or provide parameter assumptions",
    );
    expect(report.recommended_next_actions).toContain(
      "Upload existing control code if controller logic is already implemented",
    );
  });

  it("does not insert hallucinated numeric values into missing requirements", () => {
    const report = analyzeModelAssembly(abiusiLikeInput());

    for (const missing of report.missing_requirements) {
      expect(missing.item).not.toMatch(/=\s*-?\d/);
      expect(missing.why_needed).not.toMatch(/=\s*-?\d/);
    }
  });

  it("marks a simple Monod chemostat closer to runnable than the Abiusi-like model", () => {
    const abiusiReport = analyzeModelAssembly(abiusiLikeInput());
    const monodReport = analyzeModelAssembly(monodChemostatInput());

    const abiusiCritical = abiusiReport.missing_requirements.filter(
      (item) => item.severity === "critical",
    ).length;
    const monodCritical = monodReport.missing_requirements.filter(
      (item) => item.severity === "critical",
    ).length;

    expect(monodReport.target_model_type).toBe("monod_chemostat");
    expect(monodReport.assembly_status).toBe("partial");
    expect(monodReport.assembly_status).not.toBe("insufficient");
    expect(monodReport.can_generate_scaffold).toBe(true);
    expect(monodCritical).toBeLessThan(abiusiCritical);
    expect(monodReport.missing_requirements.map((item) => item.item)).toEqual([
      "Initial conditions",
    ]);
  });
});
