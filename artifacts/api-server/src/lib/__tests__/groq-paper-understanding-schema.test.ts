import { describe, expect, it } from "vitest";

import { ExtractionResultSchema } from "../extraction-schema";
import { PaperUnderstandingSchema } from "../paper-understanding-schema";
import {
  GROQ_PAPER_UNDERSTANDING_JSON_SCHEMA,
  GroqPaperUnderstandingSchema,
  mapGroqPaperUnderstandingToExtractionResult,
  mapGroqPaperUnderstandingToPaperUnderstanding,
} from "../providers/groq-paper-understanding-schema";

function validGroqFixture() {
  const source = {
    page_start: 2,
    page_end: 2,
    section_heading: "Methods",
    source_kind: "methods",
    source_context: "The chemostat balance is dX/dt = (mu - D)*X.",
    confidence: "high",
  };
  return {
    paper_title: "Monod chemostat fixture",
    paper_type: "modeling",
    model_type: "monod_chemostat",
    main_system: "Continuous Monod chemostat",
    organism_or_material: "microbial culture",
    process_type: "substrate-limited growth",
    operating_mode: "continuous culture",
    reactor_or_equipment_setup: [],
    procedure_steps: [],
    operating_timeline: [],
    experimental_setup: [
      {
        item: "Chemostat setup",
        details: "Continuous culture with dilution rate D.",
        ...source,
      },
    ],
    candidate_state_variables: [
      {
        symbol: "X",
        name: "Biomass",
        meaning: "Biomass concentration",
        unit: "g/L",
        role: "state",
        ...source,
      },
    ],
    candidate_inputs: [],
    candidate_outputs: [],
    candidate_controls: [
      {
        symbol: "D",
        name: "Dilution rate",
        meaning: "Operator-set dilution rate",
        unit: "1/h",
        role: "control",
        ...source,
      },
    ],
    candidate_parameters: [
      {
        symbol: "mumax",
        name: "Maximum specific growth rate",
        value_raw: "0.8",
        value_numeric: 0.8,
        unit: "1/h",
        meaning: "Maximum specific growth rate",
        status: "explicit",
        ...source,
      },
    ],
    initial_conditions: [
      {
        symbol: "X0",
        state_symbol: "X",
        name: "Initial condition for X",
        value_raw: "0.1",
        value_numeric: 0.1,
        unit: "g/L",
        status: "explicit",
        ...source,
      },
    ],
    candidate_equations: [
      {
        label: "Eq. 1",
        equation_plaintext: "dX/dt = (mu - D)*X",
        equation_latex: "dX/dt = (mu - D)X",
        equation_type: "dynamic_ode",
        meaning: "Biomass dynamic balance",
        variables_involved: ["X", "mu", "D"],
        ...source,
      },
    ],
    tables_or_reported_values: [],
    tables_or_value_blocks: [],
    controls_and_setpoints: [
      {
        variable: "D",
        value: "0.1",
        unit: "1/h",
        control_type: "operator-set dilution rate",
        ...source,
      },
    ],
    assumptions: [],
    limitations_or_missing_info: [],
    referenced_external_sources_needed: [],
    model_assembly_assessment: {
      assembly_status: "partial",
      can_generate_runnable_model: false,
      can_generate_scaffold: true,
      available_from_current_source: [],
      missing_requirements: [
        {
          item: "Initial conditions",
          details: "Initial biomass/substrate values are needed.",
          page_start: null,
          page_end: null,
          section_heading: "",
          source_kind: "unknown",
          source_context: "Initial conditions were not reported.",
          confidence: "low",
        },
      ],
      recommended_next_actions: ["Provide initial conditions"],
    },
  };
}

function validateAgainstJsonSchemaShape(schema: any, value: unknown, path = "$"): void {
  if (schema.anyOf) {
    const failures: Error[] = [];
    for (const option of schema.anyOf) {
      try {
        validateAgainstJsonSchemaShape(option, value, path);
        return;
      } catch (error) {
        failures.push(error as Error);
      }
    }
    throw failures[0] ?? new Error(`${path}: did not match any schema`);
  }
  if (schema.enum) {
    expect(schema.enum, `${path} enum`).toContain(value);
    return;
  }
  if (schema.type === "object") {
    expect(value && typeof value === "object" && !Array.isArray(value), path).toBe(true);
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      expect(record, `${path}.${key}`).toHaveProperty(key);
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (key in record) {
        validateAgainstJsonSchemaShape(childSchema, record[key], `${path}.${key}`);
      }
    }
    if (schema.additionalProperties === false) {
      expect(Object.keys(record).sort(), `${path} keys`).toEqual(
        Object.keys(schema.properties ?? {}).sort(),
      );
    }
    return;
  }
  if (schema.type === "array") {
    expect(Array.isArray(value), path).toBe(true);
    for (const [index, item] of (value as unknown[]).entries()) {
      validateAgainstJsonSchemaShape(schema.items, item, `${path}[${index}]`);
    }
    return;
  }
  if (schema.type === "integer") {
    expect(Number.isInteger(value), path).toBe(true);
    if (typeof schema.minimum === "number") expect(value).toBeGreaterThanOrEqual(schema.minimum);
    return;
  }
  if (schema.type === "number") {
    expect(typeof value, path).toBe("number");
    return;
  }
  if (schema.type === "boolean") {
    expect(typeof value, path).toBe("boolean");
    return;
  }
  if (schema.type === "null") {
    expect(value, path).toBeNull();
    return;
  }
  if (schema.type === "string") {
    expect(typeof value, path).toBe("string");
  }
}

describe("GroqPaperUnderstanding schema drift", () => {
  it("keeps the hand-written JSON schema, Zod schema, and mappers aligned", () => {
    const fixture = validGroqFixture();

    validateAgainstJsonSchemaShape(GROQ_PAPER_UNDERSTANDING_JSON_SCHEMA, fixture);
    const groqUnderstanding = GroqPaperUnderstandingSchema.parse(fixture);
    const paperUnderstanding = mapGroqPaperUnderstandingToPaperUnderstanding(
      groqUnderstanding,
    );
    expect(PaperUnderstandingSchema.safeParse(paperUnderstanding).success).toBe(true);
    expect(
      ExtractionResultSchema.safeParse(
        mapGroqPaperUnderstandingToExtractionResult(groqUnderstanding),
      ).success,
    ).toBe(true);
  });
});
