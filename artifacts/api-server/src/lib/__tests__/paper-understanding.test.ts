import { describe, expect, it } from "vitest";
import { ExtractionResultSchema } from "../extraction-schema";
import {
  inferModelTypeFromPaperUnderstanding,
  mapPaperUnderstandingToExtractionResult,
} from "../paper-understanding-mapper";
import { buildPaperUnderstandingPrompt } from "../paper-understanding-prompt";
import { PaperUnderstandingSchema, type PaperUnderstanding } from "../paper-understanding-schema";

const methodsContext = {
  page_start: 3,
  page_end: 4,
  section_heading: "Materials and Methods",
  source_kind: "methods" as const,
  confidence: "high" as const,
};

const resultsContext = {
  page_start: 6,
  page_end: 6,
  section_heading: "Results",
  source_kind: "results" as const,
  confidence: "high" as const,
};

function abiusiLikeUnderstanding(): PaperUnderstanding {
  return {
    paper_title: "Abiusi-like oxygen-balanced mixotrophic photobioreactor study",
    paper_type: "mixed",
    model_type: "unknown",
    main_system: "DO-controlled acetate-fed mixotrophic microalgae photobioreactor",
    organism_or_material: "Chlorella sorokiniana microalgae",
    process_type: "oxygen-balanced mixotrophic photobioreactor",
    operating_mode: "continuous chemostat operation with dilution rate D",
    experimental_setup: [
      {
        item: "Photobioreactor operation",
        details:
          "A continuous PBR was operated with incident PFD and acetic acid feed.",
        source_context:
          "The photobioreactor was operated continuously with PFD and acetic acid feed.",
        ...methodsContext,
      },
    ],
    candidate_state_variables: [
      {
        symbol: "X",
        name: "Biomass concentration",
        meaning: "Microalgae biomass concentration in the reactor.",
        unit: "g/L",
        role: "state",
        source_context: "Biomass concentration X was measured during continuous operation.",
        ...methodsContext,
      },
      {
        symbol: "DO",
        name: "Dissolved oxygen",
        meaning: "Dissolved oxygen signal used for oxygen-balance control.",
        unit: "%",
        role: "state",
        source_context: "Dissolved oxygen was controlled at a setpoint.",
        ...methodsContext,
      },
      {
        symbol: "S_ac",
        name: "Acetic acid concentration",
        meaning: "Acetic acid available to heterotrophic metabolism.",
        unit: "g/L",
        role: "input",
        source_context: "Acetic acid was supplied in the feed.",
        ...methodsContext,
      },
    ],
    candidate_parameters: [
      {
        symbol: "D",
        name: "Dilution rate",
        value: "0.25",
        unit: "1/d",
        source_context: "Dilution rate D was 0.25 1/d.",
        ...methodsContext,
      },
      {
        symbol: "S_ac_feed",
        name: "Acetic acid feed concentration",
        value: "reported",
        unit: "g/L",
        source_context: "The feed contained acetic acid.",
        ...methodsContext,
      },
      {
        symbol: "PFD",
        name: "Photon flux density",
        value: "reported",
        unit: "umol/m2/s",
        source_context: "PFD was reported for the photobioreactor.",
        ...methodsContext,
      },
    ],
    candidate_equations: [
      {
        label: "Eq. productivity",
        equation_plaintext: "P = (X2 - X1) / (t2 - t1)",
        equation_latex: "P = (X_2 - X_1)/(t_2 - t_1)",
        equation_type: "algebraic_calculation",
        meaning: "Reported biomass productivity calculation, not a dynamic state balance.",
        variables_involved: ["P", "X2", "X1", "t2", "t1"],
        source_context: "Productivity was calculated from biomass change over time.",
        ...resultsContext,
      },
      {
        label: "Eq. acetate oxidation",
        equation_plaintext: "CH3COOH + 2 O2 -> 2 CO2 + 2 H2O",
        equation_latex: "CH_3COOH + 2 O_2 \\to 2 CO_2 + 2 H_2O",
        equation_type: "stoichiometric_reaction",
        meaning: "Stoichiometric acetate oxidation relation, not an ODE.",
        variables_involved: ["CH3COOH", "O2", "CO2", "H2O"],
        source_context: "Acetate oxidation stoichiometry was stated.",
        ...resultsContext,
      },
    ],
    tables_or_reported_values: [
      {
        label: "Table 1",
        item: "Working volume",
        value: "1.8",
        unit: "L",
        source_context: "Table 1 reported a 1.8 L working volume.",
        page_start: 4,
        page_end: 4,
        section_heading: "Table 1",
        source_kind: "table",
        confidence: "high",
      },
    ],
    controls_and_setpoints: [
      {
        variable: "DO",
        value: "setpoint reported",
        unit: "%",
        control_type: "closed-loop dissolved oxygen control",
        source_context: "DO was controlled at a setpoint during the run.",
        ...methodsContext,
      },
    ],
    assumptions: [
      {
        item: "Well-mixed liquid",
        details: "The PBR liquid phase was treated as well mixed for reporting.",
        source_context: "The reactor was well mixed.",
        ...methodsContext,
      },
    ],
    limitations_or_missing_info: [
      {
        item: "Missing kinetic constants",
        details:
          "Autotrophic growth, heterotrophic acetate uptake, and oxygen uptake kinetic constants were not fully reported.",
        source_context: "Kinetic constants were not specified in the excerpt.",
        ...methodsContext,
        confidence: "medium",
      },
      {
        item: "Missing light model parameters",
        details: "Light attenuation and PFD-to-growth relation require an external light model.",
        source_context: "PFD was reported, but no light attenuation model was given.",
        ...methodsContext,
        confidence: "medium",
      },
      {
        item: "Missing Henry-law convention",
        details: "Gas-liquid equilibrium convention for oxygen and carbon dioxide was not specified.",
        source_context: "Henry-law convention was not specified.",
        ...methodsContext,
        confidence: "medium",
      },
      {
        item: "Missing controller parameters",
        details: "DO controller gains and actuator limits were not reported.",
        source_context: "DO control was described without controller parameters.",
        ...methodsContext,
        confidence: "medium",
      },
    ],
    referenced_external_sources_needed: [
      {
        item: "Supporting Information",
        details: "Upload SI for controller details, calibration values, and table definitions.",
        source_context: "Supporting information was referenced for additional methods.",
        page_start: 8,
        page_end: 8,
        section_heading: "References",
        source_kind: "references",
        confidence: "medium",
      },
      {
        item: "Cited light-model paper",
        details: "Upload cited light-model source to define attenuation parameters.",
        source_context: "A cited light model was referenced.",
        page_start: 8,
        page_end: 8,
        section_heading: "References",
        source_kind: "references",
        confidence: "medium",
      },
    ],
  };
}

describe("PaperUnderstandingSchema", () => {
  it("validates an Abiusi-like full-paper understanding object", () => {
    const parsed = PaperUnderstandingSchema.parse(abiusiLikeUnderstanding());

    expect(parsed.paper_type).toBe("mixed");
    expect(parsed.main_system).toMatch(/photobioreactor/i);
    expect(parsed.operating_mode).toMatch(/continuous chemostat/i);
    expect(parsed.controls_and_setpoints[0]).toMatchObject({
      variable: "DO",
      source_kind: "methods",
      page_start: 3,
    });
    expect(parsed.candidate_parameters.map((p) => p.name)).toContain(
      "Acetic acid feed concentration",
    );
  });

  it("requires page and source context for extracted items", () => {
    const understanding = abiusiLikeUnderstanding();
    const invalid = {
      ...understanding,
      candidate_parameters: [
        {
          symbol: "D",
          name: "Dilution rate",
          value: "0.25",
          unit: "1/d",
        },
      ],
    };

    expect(PaperUnderstandingSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("paper-understanding mapper", () => {
  it("detects oxygen-balanced mixotrophy and maps to ExtractionResultSchema", () => {
    const understanding = PaperUnderstandingSchema.parse(abiusiLikeUnderstanding());
    const result = mapPaperUnderstandingToExtractionResult(understanding);

    expect(inferModelTypeFromPaperUnderstanding(understanding)).toBe(
      "oxygen_balanced_mixotrophy",
    );
    expect(result.model_type).toBe("oxygen_balanced_mixotrophy");
    expect(result.system_type).toMatch(/DO-controlled acetate-fed/i);
    expect(result.model_card.control_variables).toContain("DO");
    expect(result.model_card.inputs).toContain("S_ac");
    expect(result.model_card.can_generate_ode_template).toBe(false);
    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });

  it("preserves algebraic and stoichiometric equations as non-ODE calculations", () => {
    const result = mapPaperUnderstandingToExtractionResult(
      PaperUnderstandingSchema.parse(abiusiLikeUnderstanding()),
    );

    expect(result.equations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          equation_plaintext: "P = (X2 - X1) / (t2 - t1)",
          meaning: expect.stringContaining("algebraic calculation"),
        }),
        expect.objectContaining({
          equation_plaintext: "CH3COOH + 2 O2 -> 2 CO2 + 2 H2O",
          meaning: expect.stringContaining("stoichiometric reaction"),
        }),
      ]),
    );
  });

  it("flags missing kinetic, light, Henry-law, and controller requirements", () => {
    const result = mapPaperUnderstandingToExtractionResult(
      PaperUnderstandingSchema.parse(abiusiLikeUnderstanding()),
    );
    const missing = result.model_card.missing_information.join(" ");

    expect(missing).toMatch(/kinetic constants/i);
    expect(missing).toMatch(/light model/i);
    expect(missing).toMatch(/Henry-law/i);
    expect(missing).toMatch(/controller parameters/i);
    expect(missing).toMatch(/Supporting Information/i);
    expect(missing).toMatch(/cited light-model paper/i);
  });
});

describe("buildPaperUnderstandingPrompt", () => {
  it("builds a strict full-paper prompt over Abiusi-like chunks", () => {
    const prompt = buildPaperUnderstandingPrompt(
      [
        {
          chunk_id: "abiusi_001",
          page_start: 1,
          page_end: 2,
          section_heading: "Abstract",
          text:
            "An acetate-fed mixotrophic microalgae photobioreactor was operated with dissolved oxygen control.",
        },
        {
          chunk_id: "abiusi_002",
          page_start: 3,
          page_end: 4,
          section_heading: "Materials and Methods",
          text:
            "The PBR used continuous chemostat operation, dilution rate D, acetic acid feed, PFD, and a DO setpoint.",
        },
        {
          chunk_id: "abiusi_003",
          page_start: 6,
          page_end: 6,
          section_heading: "Results",
          text:
            "Productivity was calculated algebraically and acetate oxidation was reported as stoichiometry.",
        },
      ],
      { maxTotalChars: 2000 },
    );

    expect(prompt.systemPrompt).toContain("Return strict JSON only");
    expect(prompt.systemPrompt).toContain("oxygen_balanced_mixotrophy");
    expect(prompt.systemPrompt).toContain("dynamic_ode");
    expect(prompt.systemPrompt).toContain("stoichiometric_reaction");
    expect(prompt.systemPrompt).toContain("Never invent missing values");
    expect(prompt.userPrompt).toContain(
      '[abiusi_002; pages 3-4; section="Materials and Methods"]',
    );
    expect(prompt.userPrompt).toContain("acetic acid feed");
    expect(prompt.userPrompt).toContain("DO setpoint");
  });
});
