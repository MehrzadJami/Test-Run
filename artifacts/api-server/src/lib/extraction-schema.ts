// Canonical extraction contract.
//
// Every provider (mock today; OpenAI / Gemini in future milestones) MUST return
// data that matches `ExtractionResultSchema`. The shape is intentionally rich
// so the AI has clear instructions; the DB mapping layer reduces it to the
// columns we actually persist.
//
// Do NOT loosen this schema casually — it is the single source of truth for
// "what a successful extraction looks like".

import { z } from "zod/v4";

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);

export const ExtendedRoleSchema = z.enum([
  "state",
  "input",
  "output",
  "parameter",
  "control",
]);

export const StateVariableSchema = z.object({
  symbol: z.string().min(1, "Variable symbol is required"),
  name: z.string(),
  meaning: z.string(),
  unit: z.string(),
  role: ExtendedRoleSchema,
  source_context: z.string(),
  confidence: ConfidenceSchema,
});

export const ParameterSchema = z.object({
  symbol: z.string().min(1, "Parameter symbol is required"),
  name: z.string(),
  value: z.string(),
  unit: z.string(),
  source_context: z.string(),
  confidence: ConfidenceSchema,
});

export const EquationSchema = z.object({
  label: z.string(),
  equation_latex: z.string().min(1, "equation_latex is required"),
  equation_plaintext: z.string(),
  meaning: z.string(),
  variables_involved: z.array(z.string()),
  source_context: z.string(),
  confidence: ConfidenceSchema,
});

export const AssumptionSchema = z.object({
  assumption: z.string().min(1, "assumption text is required"),
  source_context: z.string(),
  confidence: ConfidenceSchema,
});

export const LimitationSchema = z.object({
  limitation: z.string().min(1, "limitation text is required"),
  source_context: z.string(),
  confidence: ConfidenceSchema,
});

export const ModelCardMetaSchema = z.object({
  short_summary: z.string(),
  model_type: z.string(),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  control_variables: z.array(z.string()),
  missing_information: z.array(z.string()),
  can_generate_ode_template: z.boolean(),
});

export const ExtractionResultSchema = z.object({
  paper_title_or_topic: z.string().min(1),
  system_type: z.string(),
  process_description: z.string(),
  state_variables: z.array(StateVariableSchema),
  parameters: z.array(ParameterSchema),
  equations: z.array(EquationSchema),
  assumptions: z.array(AssumptionSchema),
  limitations: z.array(LimitationSchema),
  model_card: ModelCardMetaSchema,
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type ExtractedStateVariable = z.infer<typeof StateVariableSchema>;
export type ExtractedParameter = z.infer<typeof ParameterSchema>;
export type ExtractedEquation = z.infer<typeof EquationSchema>;
export type ExtractedAssumption = z.infer<typeof AssumptionSchema>;
export type ExtractedLimitation = z.infer<typeof LimitationSchema>;
export type ExtractedModelCardMeta = z.infer<typeof ModelCardMetaSchema>;
