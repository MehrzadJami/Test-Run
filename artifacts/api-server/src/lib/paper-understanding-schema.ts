import { z } from "zod/v4";
import {
  ConfidenceSchema,
  ExtendedRoleSchema,
  ModelTypeSchema,
} from "./extraction-schema";

export const PaperTypeSchema = z.enum([
  "experimental",
  "modeling",
  "review",
  "mixed",
  "unknown",
]);

export const SourceKindSchema = z.enum([
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
]);

export const EquationKindSchema = z.enum([
  "dynamic_ode",
  "algebraic_calculation",
  "stoichiometric_reaction",
  "empirical_correlation",
  "reported_experimental_result",
  "control_law",
  "unknown",
]);

export const ParameterStatusSchema = z.enum([
  "explicit",
  "inferred",
  "missing",
  "unknown",
]);

const SourceContextSchema = z.object({
  page_start: z.number().int().min(1).nullable(),
  page_end: z.number().int().min(1).nullable(),
  section_heading: z.string(),
  source_kind: SourceKindSchema,
  source_context: z.string(),
  confidence: ConfidenceSchema,
}).strict();

export const SourceEvidenceSchema = z
  .object({
    page: z.number().int().min(1).nullable(),
    section_heading: z.string(),
    quote: z.string(),
  })
  .strict();

export const PaperEvidenceItemSchema = SourceContextSchema.extend({
  item: z.string().min(1),
  details: z.string(),
}).strict();

export const CandidateStateVariableSchema = SourceContextSchema.extend({
  symbol: z.string().min(1),
  name: z.string(),
  meaning: z.string(),
  unit: z.string(),
  role: ExtendedRoleSchema,
}).strict();

export const CandidateParameterSchema = SourceContextSchema.extend({
  symbol: z.string().min(1),
  name: z.string(),
  value: z.string().optional(),
  value_raw: z.string().optional(),
  value_numeric: z.number().nullable().optional(),
  unit: z.string(),
  meaning: z.string().optional(),
  status: ParameterStatusSchema.optional(),
  source_evidence: SourceEvidenceSchema.optional(),
}).strict();

export const InitialConditionSchema = SourceContextSchema.extend({
  symbol: z.string().min(1),
  state_symbol: z.string().min(1),
  name: z.string(),
  value_raw: z.string(),
  value_numeric: z.number().nullable(),
  unit: z.string(),
  status: ParameterStatusSchema.optional(),
  source_evidence: SourceEvidenceSchema.optional(),
}).strict();

export const CandidateEquationSchema = SourceContextSchema.extend({
  label: z.string(),
  equation_plaintext: z.string().min(1),
  equation_latex: z.string(),
  equation_type: EquationKindSchema,
  meaning: z.string(),
  variables_involved: z.array(z.string()),
  source_evidence: SourceEvidenceSchema.optional(),
}).strict();

export const TableValueRowSchema = z
  .object({
    symbol_or_item: z.string(),
    value: z.string(),
    unit: z.string(),
    meaning: z.string(),
    confidence: ConfidenceSchema,
    source_quote: z.string(),
  })
  .strict();

export const TableOrValueBlockSchema = z
  .object({
    page: z.number().int().min(1).nullable(),
    section_heading: z.string(),
    caption_or_context: z.string(),
    raw_text: z.string(),
    extracted_rows: z.array(TableValueRowSchema),
    confidence: ConfidenceSchema,
  })
  .strict();

export const ModelAssemblyAssessmentSchema = z
  .object({
    assembly_status: z.enum(["complete", "partial", "insufficient"]),
    can_generate_runnable_model: z.boolean(),
    can_generate_scaffold: z.boolean(),
    available_from_current_source: z.array(PaperEvidenceItemSchema),
    missing_requirements: z.array(PaperEvidenceItemSchema),
    recommended_next_actions: z.array(z.string()),
  })
  .strict();

export const TableOrReportedValueSchema = SourceContextSchema.extend({
  label: z.string(),
  item: z.string().min(1),
  value: z.string(),
  unit: z.string(),
}).strict();

export const ControlAndSetpointSchema = SourceContextSchema.extend({
  variable: z.string().min(1),
  value: z.string(),
  unit: z.string(),
  control_type: z.string(),
}).strict();

export const PaperUnderstandingSchema = z.object({
  paper_title: z.string().min(1),
  paper_type: PaperTypeSchema,
  model_type: ModelTypeSchema,
  main_system: z.string(),
  organism_or_material: z.string(),
  process_type: z.string(),
  operating_mode: z.string(),
  reactor_or_equipment_setup: z.array(PaperEvidenceItemSchema).optional(),
  procedure_steps: z.array(PaperEvidenceItemSchema).optional(),
  operating_timeline: z.array(PaperEvidenceItemSchema).optional(),
  experimental_setup: z.array(PaperEvidenceItemSchema),
  candidate_state_variables: z.array(CandidateStateVariableSchema).min(1),
  candidate_inputs: z.array(CandidateStateVariableSchema).optional(),
  candidate_outputs: z.array(CandidateStateVariableSchema).optional(),
  candidate_controls: z.array(CandidateStateVariableSchema).optional(),
  candidate_parameters: z.array(CandidateParameterSchema).min(1),
  initial_conditions: z.array(InitialConditionSchema).optional(),
  candidate_equations: z.array(CandidateEquationSchema),
  tables_or_reported_values: z.array(TableOrReportedValueSchema),
  tables_or_value_blocks: z.array(TableOrValueBlockSchema).optional(),
  controls_and_setpoints: z.array(ControlAndSetpointSchema),
  assumptions: z.array(PaperEvidenceItemSchema),
  limitations_or_missing_info: z.array(PaperEvidenceItemSchema),
  referenced_external_sources_needed: z.array(PaperEvidenceItemSchema),
  model_assembly_assessment: ModelAssemblyAssessmentSchema.optional(),
}).strict();

export type PaperUnderstanding = z.infer<typeof PaperUnderstandingSchema>;
export type PaperEvidenceItem = z.infer<typeof PaperEvidenceItemSchema>;
export type CandidateStateVariable = z.infer<typeof CandidateStateVariableSchema>;
export type CandidateParameter = z.infer<typeof CandidateParameterSchema>;
export type InitialCondition = z.infer<typeof InitialConditionSchema>;
export type CandidateEquation = z.infer<typeof CandidateEquationSchema>;
export type TableOrReportedValue = z.infer<typeof TableOrReportedValueSchema>;
export type TableOrValueBlock = z.infer<typeof TableOrValueBlockSchema>;
export type ControlAndSetpoint = z.infer<typeof ControlAndSetpointSchema>;
export type EquationKind = z.infer<typeof EquationKindSchema>;
export type ParameterStatus = z.infer<typeof ParameterStatusSchema>;
