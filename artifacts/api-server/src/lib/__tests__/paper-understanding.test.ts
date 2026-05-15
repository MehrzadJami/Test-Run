import { describe, expect, it } from "vitest";
import { ExtractionResultSchema } from "../extraction-schema";
import {
  inferModelTypeFromPaperUnderstanding,
  mapPaperUnderstandingToExtractionResult,
} from "../paper-understanding-mapper";
import { analyzeChunkTruncation, buildPaperUnderstandingPrompt } from "../paper-understanding-prompt";
import { PaperUnderstandingSchema, type PaperUnderstanding } from "../paper-understanding-schema";
import { parsePaperUnderstandingResponse } from "../providers/paper-understanding-response";

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
    reactor_or_equipment_setup: [
      {
        item: "Photobioreactor setup",
        details:
          "A PBR with reported working volume and incident photon flux density was used.",
        source_context:
          "The PBR working volume and PFD were reported in the setup.",
        ...methodsContext,
      },
    ],
    procedure_steps: [
      {
        item: "Continuous operation",
        details:
          "Operate the PBR as a chemostat, feed acetic acid, and control dissolved oxygen.",
        source_context:
          "Continuous chemostat operation used acetic acid feed and DO control.",
        ...methodsContext,
      },
    ],
    operating_timeline: [
      {
        item: "Steady operation period",
        details:
          "The paper reports operating periods and productivity calculations from measured biomass.",
        source_context:
          "Productivity was calculated from measured biomass over time.",
        ...resultsContext,
      },
    ],
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
    candidate_inputs: [
      {
        symbol: "PFD",
        name: "Photon flux density",
        meaning: "Incident light input reported for the PBR.",
        unit: "umol/m2/s",
        role: "input",
        source_context: "PFD was reported for the photobioreactor.",
        ...methodsContext,
      },
    ],
    candidate_outputs: [
      {
        symbol: "P",
        name: "Biomass productivity",
        meaning: "Reported productivity calculation output, not a state.",
        unit: "g/L/d",
        role: "output",
        source_context: "Productivity was calculated from biomass change over time.",
        ...resultsContext,
      },
    ],
    candidate_controls: [
      {
        symbol: "DO_sp",
        name: "Dissolved oxygen setpoint",
        meaning: "Control target for oxygen-balanced operation.",
        unit: "%",
        role: "control",
        source_context: "DO was controlled at a setpoint during the run.",
        ...methodsContext,
      },
    ],
    candidate_parameters: [
      {
        symbol: "D",
        name: "Dilution rate",
        value: "0.25",
        value_raw: "0.25",
        value_numeric: 0.25,
        unit: "1/d",
        meaning: "Chemostat dilution rate.",
        status: "explicit",
        source_context: "Dilution rate D was 0.25 1/d.",
        ...methodsContext,
      },
      {
        symbol: "S_ac_feed",
        name: "Acetic acid feed concentration",
        value: "reported",
        value_raw: "reported",
        value_numeric: null,
        unit: "g/L",
        meaning: "Feed acetate concentration reported as a source value.",
        status: "explicit",
        source_context: "The feed contained acetic acid.",
        ...methodsContext,
      },
      {
        symbol: "PFD",
        name: "Photon flux density",
        value: "reported",
        value_raw: "reported",
        value_numeric: null,
        unit: "umol/m2/s",
        meaning: "Incident photon flux density.",
        status: "explicit",
        source_context: "PFD was reported for the photobioreactor.",
        ...methodsContext,
      },
      {
        symbol: "K_ac",
        name: "Acetate uptake half-saturation constant",
        value_raw: "unknown",
        value_numeric: null,
        unit: "",
        meaning: "Needed kinetic constant not reported in the current paper.",
        status: "missing",
        source_context: "Acetate uptake kinetic constant was not specified.",
        ...methodsContext,
        confidence: "low",
      },
    ],
    initial_conditions: [],
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
      {
        label: "Eq. carbon balance",
        equation_plaintext: "C_in = C_biomass + C_CO2 + C_residual",
        equation_latex: "C_{in} = C_{biomass} + C_{CO2} + C_{residual}",
        equation_type: "stoichiometric_reaction",
        meaning: "Reported carbon-balance accounting relation, not a state derivative.",
        variables_involved: ["C_in", "C_biomass", "C_CO2", "C_residual"],
        source_context: "Carbon balance was used to account for acetate conversion.",
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
    tables_or_value_blocks: [
      {
        page: 4,
        section_heading: "Table 1",
        caption_or_context: "Table 1 Operating values",
        raw_text: "V  1.8  L\nD  0.25  1/d\nPFD  reported  umol/m2/s",
        extracted_rows: [
          {
            symbol_or_item: "V",
            value: "1.8",
            unit: "L",
            meaning: "Working volume",
            confidence: "high",
            source_quote: "V  1.8  L",
          },
        ],
        confidence: "medium",
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
      {
        item: "Missing initial conditions",
        details: "Initial concentrations for the dynamic model states were not reported.",
        source_context: "Initial conditions for state variables were not specified.",
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
    model_assembly_assessment: {
      assembly_status: "partial",
      can_generate_runnable_model: false,
      can_generate_scaffold: true,
      available_from_current_source: [
        {
          item: "DO control and acetic acid feed",
          details: "The paper describes the control and feed procedure.",
          source_context:
            "Continuous chemostat operation used acetic acid feed and DO control.",
          ...methodsContext,
        },
      ],
      missing_requirements: [
        {
          item: "Controller gains",
          details: "Closed-loop DO simulation requires controller parameters.",
          source_context: "DO control was described without controller gains.",
          ...methodsContext,
          confidence: "medium",
        },
        {
          item: "Initial conditions",
          details: "Dynamic simulation requires starting values for biomass, acetate, oxygen, and carbon states.",
          source_context: "Initial conditions for state variables were not specified.",
          ...methodsContext,
          confidence: "medium",
        },
      ],
      recommended_next_actions: [
        "Upload the Supporting Information",
        "Upload the cited light-model paper",
        "Provide controller parameters or existing control code",
        "Provide initial conditions or calibration data",
      ],
    },
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
    expect(parsed.reactor_or_equipment_setup?.[0].item).toBe(
      "Photobioreactor setup",
    );
    expect(parsed.procedure_steps?.[0].details).toMatch(/chemostat/i);
    expect(parsed.candidate_controls?.[0]).toMatchObject({
      symbol: "DO_sp",
      role: "control",
    });
    expect(parsed.candidate_parameters.map((p) => p.name)).toContain(
      "Acetic acid feed concentration",
    );
    expect(parsed.candidate_parameters.find((p) => p.symbol === "K_ac")).toMatchObject({
      value_raw: "unknown",
      value_numeric: null,
      status: "missing",
    });
    expect(parsed.tables_or_value_blocks?.[0].extracted_rows[0]).toMatchObject({
      symbol_or_item: "V",
      value: "1.8",
    });
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

describe("PaperUnderstanding response normalization", () => {
  it("normalizes Groq-style string arrays before schema validation", () => {
    const malformed = {
      ...abiusiLikeUnderstanding(),
      candidate_state_variables: ["biomass", "dissolved oxygen"],
      candidate_inputs: ["acetate feed", "light intensity"],
      candidate_outputs: ["biomass productivity"],
      candidate_controls: ["DO setpoint"],
      candidate_parameters: ["kinetic constants not reported"],
      candidate_equations: ["P = (X2 - X1) / (t2 - t1)"],
      controls_and_setpoints: ["DO controlled at setpoint"],
      assumptions: ["well mixed"],
      limitations_or_missing_info: ["initial conditions not reported"],
      procedure_steps: ["feed acetic acid"],
      reactor_or_equipment_setup: ["photobioreactor setup"],
      operating_timeline: ["steady operation period"],
      referenced_external_sources_needed: ["Supporting Information"],
      model_assembly_assessment: {
        ...abiusiLikeUnderstanding().model_assembly_assessment,
        missing_requirements: ["controller gains"],
      },
    };

    const parsed = parsePaperUnderstandingResponse(JSON.stringify(malformed));

    expect(parsed.normalizationApplied).toBe(true);
    expect(parsed.normalizationWarnings).toContain(
      "Groq response required schema normalization before validation.",
    );
    expect(parsed.raw.model_type).toBe("oxygen_balanced_mixotrophy");
    expect(parsed.raw.model_card.inputs).toEqual(
      expect.arrayContaining(["acetate feed", "light intensity"]),
    );
    const unknownParameter = parsed.raw.parameters.find((parameter) =>
      parameter.name.includes("kinetic constants"),
    );
    expect(unknownParameter).toMatchObject({
      value: "unknown",
      confidence: "low",
    });
    expect(unknownParameter?.source_context).toContain("unknown page");
  });

  it("leaves valid structured responses unnormalized", () => {
    const parsed = parsePaperUnderstandingResponse(
      JSON.stringify(abiusiLikeUnderstanding()),
    );

    expect(parsed.normalizationApplied).toBe(false);
    expect(parsed.normalizationWarnings).toEqual([]);
    expect(parsed.raw.model_type).toBe("oxygen_balanced_mixotrophy");
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
    expect(result.model_card.control_variables).toContain("DO_sp");
    expect(result.model_card.inputs).toContain("S_ac");
    expect(result.model_card.inputs).toContain("PFD");
    expect(result.model_card.can_generate_ode_template).toBe(false);
    expect(result.process_description).toMatch(/acetic acid/i);
    expect(result.process_description).toMatch(/control dissolved oxygen|DO control/i);
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
          equation_type: "algebraic_calculation",
          meaning: expect.stringContaining("algebraic calculation"),
        }),
        expect.objectContaining({
          equation_plaintext: "CH3COOH + 2 O2 -> 2 CO2 + 2 H2O",
          equation_type: "stoichiometric_reaction",
          meaning: expect.stringContaining("stoichiometric reaction"),
        }),
        expect.objectContaining({
          equation_plaintext: "C_in = C_biomass + C_CO2 + C_residual",
          equation_type: "stoichiometric_reaction",
          meaning: expect.stringContaining("stoichiometric reaction"),
        }),
      ]),
    );
  });

  it("does not map Abiusi-like productivity or stoichiometry as dynamic ODEs", () => {
    const result = mapPaperUnderstandingToExtractionResult(
      PaperUnderstandingSchema.parse(abiusiLikeUnderstanding()),
    );
    const dynamicEquations = result.equations.filter(
      (equation) => equation.equation_type === "dynamic_ode",
    );

    expect(dynamicEquations).toHaveLength(0);
    expect(result.model_card.can_generate_ode_template).toBe(false);
  });

  it("flags missing kinetic, light, Henry-law, controller, and initial-condition requirements", () => {
    const result = mapPaperUnderstandingToExtractionResult(
      PaperUnderstandingSchema.parse(abiusiLikeUnderstanding()),
    );
    const missing = result.model_card.missing_information.join(" ");

    expect(missing).toMatch(/kinetic constants/i);
    expect(missing).toMatch(/light model/i);
    expect(missing).toMatch(/Henry-law/i);
    expect(missing).toMatch(/controller parameters/i);
    expect(missing).toMatch(/initial conditions/i);
    expect(missing).toMatch(/Supporting Information/i);
    expect(missing).toMatch(/cited light-model paper/i);
    expect(missing).toMatch(/Controller gains/i);
    expect(missing).toMatch(/Initial conditions/i);
    expect(missing).toMatch(/Provide initial conditions or calibration data/i);
  });

  it("keeps missing parameter values unknown instead of numeric zero", () => {
    const result = mapPaperUnderstandingToExtractionResult(
      PaperUnderstandingSchema.parse(abiusiLikeUnderstanding()),
    );
    const missing = result.parameters.find((parameter) => parameter.symbol === "K_ac");

    expect(missing).toMatchObject({
      value: "unknown",
      confidence: "low",
    });
  });

  // AUDIT-4: evidence-status discipline — when the AI omits `status` on a
  // candidate parameter, the mapped ExtractionResult must still carry a
  // defined status (coerced to "unknown"). No `undefined` may leak downstream.
  it("coerces missing parameter status to 'unknown' instead of leaving it undefined", () => {
    const understandingRaw = abiusiLikeUnderstanding();
    for (const parameter of understandingRaw.candidate_parameters) {
      delete (parameter as { status?: unknown }).status;
    }
    const understanding = PaperUnderstandingSchema.parse(understandingRaw);
    const result = mapPaperUnderstandingToExtractionResult(understanding);

    for (const parameter of result.parameters) {
      expect(parameter.status).toBeDefined();
      expect(["explicit", "inferred", "missing", "unknown", "initial_condition"]).toContain(
        parameter.status,
      );
    }
    // Round-trip through the schema also fills any leftover undefined with "unknown".
    const reparsed = ExtractionResultSchema.parse(result);
    for (const parameter of reparsed.parameters) {
      expect(parameter.status).toBeDefined();
    }
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
    expect(prompt.systemPrompt).toContain("control_law");
    expect(prompt.systemPrompt).toContain("Pass 1");
    expect(prompt.systemPrompt).toContain("Pass 4");
    expect(prompt.systemPrompt).toContain("tables_or_value_blocks");
    expect(prompt.systemPrompt).toContain("Never invent missing values");
    expect(prompt.systemPrompt).toContain("value_numeric null");
    expect(prompt.userPrompt).toContain(
      '[abiusi_002; pages 3-4; section="Materials and Methods"]',
    );
    expect(prompt.userPrompt).toContain("acetic acid feed");
    expect(prompt.userPrompt).toContain("DO setpoint");
    expect(prompt.userPrompt).toContain("figure references");
  });
});

// AUDIT-10: chunk-truncation analysis must report when chunks exceed the
// prompt char budget so the audit panel can warn the user about dropped
// content. The analyzer is a pure function on the chunk array.
describe("analyzeChunkTruncation", () => {
  it("reports zero dropped when chunks fit within budget", () => {
    const chunks = [
      {
        chunk_id: "a",
        page_start: 1,
        page_end: 1,
        section_heading: "Methods",
        text: "x".repeat(500),
      },
    ];
    const report = analyzeChunkTruncation(chunks, 1000);
    expect(report).toMatchObject({
      inputChunks: 1,
      includedChunks: 1,
      droppedChunks: 0,
      droppedChars: 0,
      budget: 1000,
      totalChars: 500,
    });
  });

  it("reports dropped chars when total exceeds budget", () => {
    const chunks = [
      {
        chunk_id: "a",
        page_start: 1,
        page_end: 1,
        section_heading: "Methods",
        text: "x".repeat(800),
      },
      {
        chunk_id: "b",
        page_start: 2,
        page_end: 2,
        section_heading: "Results",
        text: "y".repeat(500),
      },
    ];
    const report = analyzeChunkTruncation(chunks, 1000);
    expect(report.inputChunks).toBe(2);
    expect(report.totalChars).toBe(1300);
    expect(report.droppedChars).toBe(300);
    // Both chunks are at least partially included (b is partially); second
    // chunk has 200 chars used + 300 dropped == 500.
    expect(report.includedChunks + report.droppedChunks).toBe(2);
  });
});
