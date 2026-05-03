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
  "unknown",
]);

const SourceContextSchema = z.object({
  page_start: z.number().int().min(1),
  page_end: z.number().int().min(1),
  section_heading: z.string(),
  source_kind: SourceKindSchema,
  source_context: z.string(),
  confidence: ConfidenceSchema,
}).strict();

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
  value: z.string(),
  unit: z.string(),
}).strict();

export const CandidateEquationSchema = SourceContextSchema.extend({
  label: z.string(),
  equation_plaintext: z.string().min(1),
  equation_latex: z.string(),
  equation_type: EquationKindSchema,
  meaning: z.string(),
  variables_involved: z.array(z.string()),
}).strict();

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
  experimental_setup: z.array(PaperEvidenceItemSchema),
  candidate_state_variables: z.array(CandidateStateVariableSchema),
  candidate_parameters: z.array(CandidateParameterSchema),
  candidate_equations: z.array(CandidateEquationSchema),
  tables_or_reported_values: z.array(TableOrReportedValueSchema),
  controls_and_setpoints: z.array(ControlAndSetpointSchema),
  assumptions: z.array(PaperEvidenceItemSchema),
  limitations_or_missing_info: z.array(PaperEvidenceItemSchema),
  referenced_external_sources_needed: z.array(PaperEvidenceItemSchema),
}).strict();

export type PaperUnderstanding = z.infer<typeof PaperUnderstandingSchema>;
export type PaperEvidenceItem = z.infer<typeof PaperEvidenceItemSchema>;
export type CandidateStateVariable = z.infer<typeof CandidateStateVariableSchema>;
export type CandidateParameter = z.infer<typeof CandidateParameterSchema>;
export type CandidateEquation = z.infer<typeof CandidateEquationSchema>;
export type TableOrReportedValue = z.infer<typeof TableOrReportedValueSchema>;
export type ControlAndSetpoint = z.infer<typeof ControlAndSetpointSchema>;
export type EquationKind = z.infer<typeof EquationKindSchema>;
