import { z } from "zod/v4";

import { ExtractionResultSchema } from "../extraction-schema";
import { mapPaperUnderstandingToExtractionResult } from "../paper-understanding-mapper";
import {
  PaperUnderstandingSchema,
  type PaperUnderstanding,
} from "../paper-understanding-schema";

const confidenceValues = ["high", "medium", "low"] as const;
const sourceKindValues = [
  "abstract",
  "introduction",
  "methods",
  "materials_and_methods",
  "results",
  "discussion",
  "conclusions",
  "nomenclature",
  "supporting_information",
  "table",
  "figure",
  "references",
  "unknown",
] as const;
const roleValues = ["state", "input", "output", "parameter", "control"] as const;
const equationTypeValues = [
  "dynamic_ode",
  "algebraic_calculation",
  "stoichiometric_reaction",
  "empirical_correlation",
  "reported_experimental_result",
  "control_law",
  "unknown",
] as const;
const parameterStatusValues = ["explicit", "inferred", "missing", "unknown"] as const;
const modelTypeValues = [
  "monod_chemostat",
  "fed_batch",
  "batch_culture",
  "cstr",
  "pfr",
  "enzyme_kinetics",
  "gas_liquid",
  "microalgae_photobioreactor",
  "oxygen_balanced_mixotrophy",
  "unknown",
] as const;
const paperTypeValues = ["experimental", "modeling", "review", "mixed", "unknown"] as const;
const assemblyStatusValues = ["complete", "partial", "insufficient"] as const;

const GroqSourceContextSchema = z.object({
  page_start: z.number().int().min(1).nullable(),
  page_end: z.number().int().min(1).nullable(),
  section_heading: z.string(),
  source_kind: z.enum(sourceKindValues),
  source_context: z.string(),
  confidence: z.enum(confidenceValues),
}).strict();

const GroqEvidenceItemSchema = GroqSourceContextSchema.extend({
  item: z.string().min(1),
  details: z.string(),
}).strict();

const GroqVariableSchema = GroqSourceContextSchema.extend({
  symbol: z.string().min(1),
  name: z.string(),
  meaning: z.string(),
  unit: z.string(),
  role: z.enum(roleValues),
}).strict();

const GroqParameterSchema = GroqSourceContextSchema.extend({
  symbol: z.string().min(1),
  name: z.string(),
  value: z.string().optional(),
  value_raw: z.string(),
  value_numeric: z.number().nullable(),
  unit: z.string(),
  meaning: z.string(),
  status: z.enum(parameterStatusValues),
}).strict();

const GroqInitialConditionSchema = GroqSourceContextSchema.extend({
  symbol: z.string().min(1),
  state_symbol: z.string().min(1),
  name: z.string(),
  value_raw: z.string(),
  value_numeric: z.number().nullable(),
  unit: z.string(),
  status: z.enum(parameterStatusValues),
}).strict();

const GroqEquationSchema = GroqSourceContextSchema.extend({
  label: z.string(),
  equation_plaintext: z.string().min(1),
  equation_latex: z.string(),
  equation_type: z.enum(equationTypeValues),
  meaning: z.string(),
  variables_involved: z.array(z.string()),
}).strict();

const GroqTableValueRowSchema = z.object({
  symbol_or_item: z.string(),
  value: z.string(),
  unit: z.string(),
  meaning: z.string(),
  confidence: z.enum(confidenceValues),
  source_quote: z.string(),
}).strict();

const GroqTableOrValueBlockSchema = z.object({
  page: z.number().int().min(1).nullable(),
  section_heading: z.string(),
  caption_or_context: z.string(),
  raw_text: z.string(),
  extracted_rows: z.array(GroqTableValueRowSchema),
  confidence: z.enum(confidenceValues),
}).strict();

const GroqControlAndSetpointSchema = GroqSourceContextSchema.extend({
  variable: z.string().min(1),
  value: z.string(),
  unit: z.string(),
  control_type: z.string(),
}).strict();

const GroqModelAssemblyAssessmentSchema = z.object({
  assembly_status: z.enum(assemblyStatusValues),
  can_generate_runnable_model: z.boolean(),
  can_generate_scaffold: z.boolean(),
  available_from_current_source: z.array(GroqEvidenceItemSchema),
  missing_requirements: z.array(GroqEvidenceItemSchema),
  recommended_next_actions: z.array(z.string()),
}).strict();

export const GroqPaperUnderstandingSchema = z.object({
  paper_title: z.string().min(1),
  paper_type: z.enum(paperTypeValues),
  model_type: z.enum(modelTypeValues),
  main_system: z.string(),
  organism_or_material: z.string(),
  process_type: z.string(),
  operating_mode: z.string(),
  reactor_or_equipment_setup: z.array(GroqEvidenceItemSchema),
  procedure_steps: z.array(GroqEvidenceItemSchema),
  operating_timeline: z.array(GroqEvidenceItemSchema),
  experimental_setup: z.array(GroqEvidenceItemSchema),
  candidate_state_variables: z.array(GroqVariableSchema),
  candidate_inputs: z.array(GroqVariableSchema),
  candidate_outputs: z.array(GroqVariableSchema),
  candidate_controls: z.array(GroqVariableSchema),
  candidate_parameters: z.array(GroqParameterSchema),
  initial_conditions: z.array(GroqInitialConditionSchema),
  candidate_equations: z.array(GroqEquationSchema),
  tables_or_reported_values: z.array(
    GroqSourceContextSchema.extend({
      label: z.string(),
      item: z.string().min(1),
      value: z.string(),
      unit: z.string(),
    }).strict(),
  ),
  tables_or_value_blocks: z.array(GroqTableOrValueBlockSchema),
  controls_and_setpoints: z.array(GroqControlAndSetpointSchema),
  assumptions: z.array(GroqEvidenceItemSchema),
  limitations_or_missing_info: z.array(GroqEvidenceItemSchema),
  referenced_external_sources_needed: z.array(GroqEvidenceItemSchema),
  model_assembly_assessment: GroqModelAssemblyAssessmentSchema,
}).strict();

export type GroqPaperUnderstanding = z.infer<typeof GroqPaperUnderstandingSchema>;

function enumSchema(values: readonly string[]) {
  return { type: "string", enum: [...values] };
}

function nullableIntegerSchema() {
  return { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] };
}

function arrayOf(items: Record<string, unknown>) {
  return { type: "array", items };
}

const sourceContextProperties = {
  page_start: nullableIntegerSchema(),
  page_end: nullableIntegerSchema(),
  section_heading: { type: "string" },
  source_kind: enumSchema(sourceKindValues),
  source_context: { type: "string" },
  confidence: enumSchema(confidenceValues),
} as const;

const sourceContextRequired = [
  "page_start",
  "page_end",
  "section_heading",
  "source_kind",
  "source_context",
  "confidence",
] as const;

function objectSchema(
  properties: Record<string, unknown>,
  required: readonly string[] = Object.keys(properties),
) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: [...required],
  };
}

const evidenceItemJsonSchema = objectSchema({
  ...sourceContextProperties,
  item: { type: "string" },
  details: { type: "string" },
}, [...sourceContextRequired, "item", "details"]);

const variableJsonSchema = objectSchema({
  ...sourceContextProperties,
  symbol: { type: "string" },
  name: { type: "string" },
  meaning: { type: "string" },
  unit: { type: "string" },
  role: enumSchema(roleValues),
}, [...sourceContextRequired, "symbol", "name", "meaning", "unit", "role"]);

const parameterJsonSchema = objectSchema({
  ...sourceContextProperties,
  symbol: { type: "string" },
  name: { type: "string" },
  value_raw: { type: "string" },
  value_numeric: { anyOf: [{ type: "number" }, { type: "null" }] },
  unit: { type: "string" },
  meaning: { type: "string" },
  status: enumSchema(parameterStatusValues),
}, [...sourceContextRequired, "symbol", "name", "value_raw", "value_numeric", "unit", "meaning", "status"]);

const initialConditionJsonSchema = objectSchema({
  ...sourceContextProperties,
  symbol: { type: "string" },
  state_symbol: { type: "string" },
  name: { type: "string" },
  value_raw: { type: "string" },
  value_numeric: { anyOf: [{ type: "number" }, { type: "null" }] },
  unit: { type: "string" },
  status: enumSchema(parameterStatusValues),
}, [...sourceContextRequired, "symbol", "state_symbol", "name", "value_raw", "value_numeric", "unit", "status"]);

const equationJsonSchema = objectSchema({
  ...sourceContextProperties,
  label: { type: "string" },
  equation_plaintext: { type: "string" },
  equation_latex: { type: "string" },
  equation_type: enumSchema(equationTypeValues),
  meaning: { type: "string" },
  variables_involved: arrayOf({ type: "string" }),
}, [...sourceContextRequired, "label", "equation_plaintext", "equation_latex", "equation_type", "meaning", "variables_involved"]);

const tableValueRowJsonSchema = objectSchema({
  symbol_or_item: { type: "string" },
  value: { type: "string" },
  unit: { type: "string" },
  meaning: { type: "string" },
  confidence: enumSchema(confidenceValues),
  source_quote: { type: "string" },
});

const tableOrValueBlockJsonSchema = objectSchema({
  page: nullableIntegerSchema(),
  section_heading: { type: "string" },
  caption_or_context: { type: "string" },
  raw_text: { type: "string" },
  extracted_rows: arrayOf(tableValueRowJsonSchema),
  confidence: enumSchema(confidenceValues),
});

const controlAndSetpointJsonSchema = objectSchema({
  ...sourceContextProperties,
  variable: { type: "string" },
  value: { type: "string" },
  unit: { type: "string" },
  control_type: { type: "string" },
}, [...sourceContextRequired, "variable", "value", "unit", "control_type"]);

const tableReportedValueJsonSchema = objectSchema({
  ...sourceContextProperties,
  label: { type: "string" },
  item: { type: "string" },
  value: { type: "string" },
  unit: { type: "string" },
}, [...sourceContextRequired, "label", "item", "value", "unit"]);

const modelAssemblyJsonSchema = objectSchema({
  assembly_status: enumSchema(assemblyStatusValues),
  can_generate_runnable_model: { type: "boolean" },
  can_generate_scaffold: { type: "boolean" },
  available_from_current_source: arrayOf(evidenceItemJsonSchema),
  missing_requirements: arrayOf(evidenceItemJsonSchema),
  recommended_next_actions: arrayOf({ type: "string" }),
});

export const GROQ_PAPER_UNDERSTANDING_JSON_SCHEMA = objectSchema({
  paper_title: { type: "string" },
  paper_type: enumSchema(paperTypeValues),
  model_type: enumSchema(modelTypeValues),
  main_system: { type: "string" },
  organism_or_material: { type: "string" },
  process_type: { type: "string" },
  operating_mode: { type: "string" },
  reactor_or_equipment_setup: arrayOf(evidenceItemJsonSchema),
  procedure_steps: arrayOf(evidenceItemJsonSchema),
  operating_timeline: arrayOf(evidenceItemJsonSchema),
  experimental_setup: arrayOf(evidenceItemJsonSchema),
  candidate_state_variables: arrayOf(variableJsonSchema),
  candidate_inputs: arrayOf(variableJsonSchema),
  candidate_outputs: arrayOf(variableJsonSchema),
  candidate_controls: arrayOf(variableJsonSchema),
  candidate_parameters: arrayOf(parameterJsonSchema),
  initial_conditions: arrayOf(initialConditionJsonSchema),
  candidate_equations: arrayOf(equationJsonSchema),
  tables_or_reported_values: arrayOf(tableReportedValueJsonSchema),
  tables_or_value_blocks: arrayOf(tableOrValueBlockJsonSchema),
  controls_and_setpoints: arrayOf(controlAndSetpointJsonSchema),
  assumptions: arrayOf(evidenceItemJsonSchema),
  limitations_or_missing_info: arrayOf(evidenceItemJsonSchema),
  referenced_external_sources_needed: arrayOf(evidenceItemJsonSchema),
  model_assembly_assessment: modelAssemblyJsonSchema,
});

export const GROQ_LITE_PAPER_UNDERSTANDING_JSON_SCHEMA = objectSchema({
  paper_title: { type: "string" },
  paper_type: enumSchema(paperTypeValues),
  model_type: enumSchema(modelTypeValues),
  main_system: { type: "string" },
  organism_or_material: { type: "string" },
  process_type: { type: "string" },
  operating_mode: { type: "string" },
  candidate_state_variables: arrayOf(variableJsonSchema),
  candidate_inputs: arrayOf(variableJsonSchema),
  candidate_outputs: arrayOf(variableJsonSchema),
  candidate_controls: arrayOf(variableJsonSchema),
  candidate_parameters: arrayOf(parameterJsonSchema),
  initial_conditions: arrayOf(initialConditionJsonSchema),
  candidate_equations: arrayOf(equationJsonSchema),
  controls_and_setpoints: arrayOf(controlAndSetpointJsonSchema),
  assumptions: arrayOf(evidenceItemJsonSchema),
  limitations_or_missing_info: arrayOf(evidenceItemJsonSchema),
  referenced_external_sources_needed: arrayOf(evidenceItemJsonSchema),
  model_assembly_assessment: modelAssemblyJsonSchema,
});

export function mapGroqPaperUnderstandingToPaperUnderstanding(
  groqUnderstanding: GroqPaperUnderstanding,
): PaperUnderstanding {
  return PaperUnderstandingSchema.parse(groqUnderstanding);
}

export function mapGroqPaperUnderstandingToExtractionResult(
  groqUnderstanding: GroqPaperUnderstanding,
) {
  const paperUnderstanding = mapGroqPaperUnderstandingToPaperUnderstanding(
    groqUnderstanding,
  );
  return ExtractionResultSchema.parse(
    mapPaperUnderstandingToExtractionResult(paperUnderstanding),
  );
}
