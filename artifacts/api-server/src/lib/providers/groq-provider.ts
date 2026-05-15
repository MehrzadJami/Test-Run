import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import OpenAI from "openai";

import type { ExtractionProvider, ProviderName } from "../extractor";
import {
  buildPaperUnderstandingPrompt,
  type PaperUnderstandingPrompt,
  type PaperUnderstandingDocumentChunk,
} from "../paper-understanding-prompt";
import {
  ExtractionResultSchema,
  type ExtractionResult,
  type ExtractedEquation,
  type ExtractedModelType,
  type ExtractedParameter,
  type ExtractedStateVariable,
} from "../extraction-schema";
import {
  PaperUnderstandingValidationError,
  parsePaperUnderstandingResponse,
} from "./paper-understanding-response";
import { finalizeExtractionResult } from "../extraction-finalizer";
import { RuleBasedProvider } from "./rule-based-provider";
import {
  GROQ_LITE_PAPER_UNDERSTANDING_JSON_SCHEMA,
  GROQ_PAPER_UNDERSTANDING_JSON_SCHEMA,
} from "./groq-paper-understanding-schema";
import {
  estimateGroqTokens,
  getGroqCachedResult,
  getGroqConfig,
  getEffectiveGroqInputBudget,
  GROQ_PAPER_SCHEMA_VERSION,
  GROQ_PROMPT_VERSION,
  GROQ_PROFESSOR_PROMPT_VERSION,
  GroqBudgetError,
  GroqRateLimitError,
  makeGroqCacheKey,
  recordGroqExtractionSuccess,
  recordGroqRequestUsage,
  reserveGroqBudget,
  selectGroqChunks,
  setGroqCachedResultWithMeta,
} from "./groq-budget";

type ChatClient = {
  chat: {
    completions: {
      create: (input: unknown) => Promise<{
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      }>;
    };
  };
};

function getRetryAfter(error: unknown): string | undefined {
  const headers = (error as { headers?: Headers | Record<string, string> | undefined }).headers;
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get("retry-after") ?? undefined;
  return headers["retry-after"] ?? headers["Retry-After"];
}

function isRateLimitError(error: unknown): boolean {
  const status = (error as { status?: number; code?: string }).status;
  const code = (error as { status?: number; code?: string }).code;
  return status === 429 || code === "rate_limit_exceeded";
}

function isStructuredOutputUnsupported(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);
  return (
    status === 400 &&
    /response_format|json_schema|schema|structured output|unsupported|not support/i.test(
      message,
    )
  );
}

function appendUnique(list: string[] | undefined, values: string[]): string[] {
  const out = [...(list ?? [])];
  for (const value of values) {
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

const GROQ_CHUNK_SKIP_WARNING =
  "Groq free-tier mode processed only the highest-signal chunks. Some paper content was skipped due to token limits.";
const GROQ_STRICT_SCHEMA_RETRY_WARNING =
  "Groq strict schema unsupported; retried with JSON object mode.";

function buildGroqPrompt(
  chunks: PaperUnderstandingDocumentChunk[],
  warnings: string[],
  maxInputTokens: number,
  freeTierMode: boolean,
): PaperUnderstandingPrompt {
  if (freeTierMode) {
    const chunkText = chunks.length
      ? chunks.map(formatLiteChunk).join("\n\n")
      : "[No high-signal chunks fit Groq free-tier limits]";
    return {
      systemPrompt: [
        "You are a chemical engineering model-extraction assistant.",
        "Return strict JSON only. Use the provided text-layer chunks as evidence.",
        "Use the compact Groq Lite PaperUnderstanding shape. Structured arrays must contain objects, never strings.",
        "Extract every equation in the chunks. Derivatives like dX/dt are dynamic_ode. Growth-rate, yield, productivity, and stoichiometric formulas are not dynamic_ode unless they define a state derivative.",
        "Extract every numeric assignment, including D, Sin, Yxs, controls, setpoints, and initial conditions X0/S0 if present.",
        "Do not invent missing values. Unknown numeric values must use value_raw=\"unknown\" and value_numeric=null. Unknown pages use page_start=null and page_end=null.",
        "If only limited chunks were processed, mark assembly partial/scaffold-only when evidence is incomplete and list missing sources.",
      ].join(" "),
      userPrompt: [
        `Groq free-tier Lite mode. Fit within about ${maxInputTokens} input tokens.`,
        warnings.length ? `Warnings: ${warnings.join(" ")}` : "",
        "Required top-level keys: paper_title, paper_type, model_type, main_system, organism_or_material, process_type, operating_mode, candidate_state_variables, candidate_inputs, candidate_outputs, candidate_controls, candidate_parameters, initial_conditions, candidate_equations, controls_and_setpoints, assumptions, limitations_or_missing_info, referenced_external_sources_needed, model_assembly_assessment.",
        "For each item include page_start, page_end, section_heading, source_kind, source_context, and confidence.",
        "Keep initial conditions separate in initial_conditions; do not mix them with kinetic parameters unless also clearly labelled downstream.",
        "Document chunks:",
        chunkText,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  return buildPaperUnderstandingPrompt(chunks, {
    maxTotalChars: Number.MAX_SAFE_INTEGER,
    note: [
      "Groq free-tier mode is enabled. Analyze only the selected high-signal chunks and do not infer facts from skipped chunks.",
      "Extract every equation appearing in the provided text. Do not omit equations. Keep each equation as a separate candidate_equations object.",
      "If an equation defines a derivative such as dX/dt, dS/dt, or dC_O2/dt, classify it as dynamic_ode. If an equation defines mu, a growth-rate relation, productivity, yield, or another algebraic calculation, do not classify it as dynamic_ode.",
      "Extract every numeric assignment, including control/input quantities such as D and Sin, yield parameters such as Yxs, and initial conditions such as X0 and S0.",
      "Every candidate_* array and structured evidence array must contain objects, not strings. Never return arrays like [\"item1\", \"item2\"] for structured fields.",
      "Example candidate_inputs item: {\"symbol\":\"Sin\",\"name\":\"feed substrate concentration\",\"meaning\":\"substrate concentration in the feed\",\"unit\":\"g/L\",\"role\":\"input\",\"page_start\":2,\"page_end\":2,\"section_heading\":\"Methods\",\"source_kind\":\"methods\",\"source_context\":\"Sin was reported in the feed table.\",\"confidence\":\"high\"}.",
      "Example candidate_parameters item: {\"symbol\":\"mumax\",\"name\":\"maximum specific growth rate\",\"value_raw\":\"0.8\",\"value_numeric\":0.8,\"unit\":\"1/h\",\"meaning\":\"maximum specific growth rate\",\"status\":\"explicit\",\"page_start\":2,\"page_end\":2,\"section_heading\":\"Methods\",\"source_kind\":\"methods\",\"source_context\":\"mumax = 0.8 1/h\",\"confidence\":\"high\"}.",
      "Example initial_conditions item: {\"symbol\":\"X0\",\"state_symbol\":\"X\",\"name\":\"Initial condition for X\",\"value_raw\":\"0.1\",\"value_numeric\":0.1,\"unit\":\"g/L\",\"status\":\"explicit\",\"page_start\":2,\"page_end\":2,\"section_heading\":\"Methods\",\"source_kind\":\"methods\",\"source_context\":\"Initial conditions are X0 = 0.1 g/L\",\"confidence\":\"high\"}.",
      "Example candidate_equations item: {\"label\":\"Eq. 1\",\"equation_plaintext\":\"dX/dt = (mu - D)*X\",\"equation_latex\":\"dX/dt = (mu - D)X\",\"equation_type\":\"dynamic_ode\",\"meaning\":\"biomass balance\",\"variables_involved\":[\"X\",\"mu\",\"D\"],\"page_start\":3,\"page_end\":3,\"section_heading\":\"Calculations\",\"source_kind\":\"methods\",\"source_context\":\"The biomass balance is dX/dt = (mu - D)*X.\",\"confidence\":\"high\"}.",
      "Example model_assembly_assessment.missing_requirements item: {\"item\":\"Initial conditions\",\"details\":\"Runnable simulation requires initial values for all dynamic states.\",\"page_start\":null,\"page_end\":null,\"section_heading\":\"\",\"source_kind\":\"unknown\",\"source_context\":\"Initial conditions were not reported.\",\"confidence\":\"low\"}.",
      "Unknown values must use value_raw=\"unknown\" and value_numeric=null. Do not invent numbers. If page evidence is unknown, use page_start=null and page_end=null.",
      `The estimated input prompt must fit within ${maxInputTokens} tokens.`,
      ...warnings,
    ].join(" "),
  });
}

function formatLiteChunk(chunk: PaperUnderstandingDocumentChunk): string {
  const pages =
    chunk.page_start === chunk.page_end
      ? `page ${chunk.page_start}`
      : `pages ${chunk.page_start}-${chunk.page_end}`;
  const flags = [
    chunk.contains_equation_like_text ? "equation_like=true" : "",
    chunk.contains_table_like_text ? "table_like=true" : "",
    chunk.contains_figure_reference ? "figure_reference=true" : "",
  ].filter(Boolean);
  const flagText = flags.length ? `; ${flags.join("; ")}` : "";
  return [
    `[${chunk.chunk_id}; ${pages}; section="${chunk.section_heading}"${flagText}]`,
    chunk.text.trim(),
  ].join("\n");
}

function buildBudgetedPrompt(input: {
  documentChunks: PaperUnderstandingDocumentChunk[];
  maxInputTokens: number;
  initialWarnings: string[];
  freeTierMode: boolean;
  jsonSchema: Record<string, unknown>;
}): {
  prompt: PaperUnderstandingPrompt;
  chunks: PaperUnderstandingDocumentChunk[];
  warnings: string[];
  estimatedInputTokens: number;
  estimatedPromptTokens: number;
  estimatedSchemaTokens: number;
  skippedChunks: number;
} {
  const warnings = [...input.initialWarnings];
  const chunks = [...input.documentChunks];
  const schemaTokens = estimateGroqTokens(JSON.stringify(input.jsonSchema));
  let prompt = buildGroqPrompt(chunks, warnings, input.maxInputTokens, input.freeTierMode);
  let promptTokens = estimateGroqTokens(`${prompt.systemPrompt}\n\n${prompt.userPrompt}`);
  let estimatedInputTokens = promptTokens + schemaTokens;

  while (estimatedInputTokens > input.maxInputTokens && chunks.length > 0) {
    chunks.pop();
    if (!warnings.includes(GROQ_CHUNK_SKIP_WARNING)) {
      warnings.push(GROQ_CHUNK_SKIP_WARNING);
    }
    prompt = buildGroqPrompt(chunks, warnings, input.maxInputTokens, input.freeTierMode);
    promptTokens = estimateGroqTokens(`${prompt.systemPrompt}\n\n${prompt.userPrompt}`);
    estimatedInputTokens = promptTokens + schemaTokens;
  }

  return {
    prompt,
    chunks,
    warnings,
    estimatedInputTokens,
    estimatedPromptTokens: promptTokens,
    estimatedSchemaTokens: schemaTokens,
    skippedChunks: input.documentChunks.length - chunks.length,
  };
}

function normalizedKey(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function parseNumericValue(value: string): number | null {
  const match = value.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferExplicitEquationType(equation: ExtractedEquation): ExtractedEquation["equation_type"] {
  const text = equation.equation_plaintext;
  if (/^\s*d[A-Za-z][A-Za-z0-9_]*\s*\/\s*d\s*t\s*=/.test(text)) {
    return "dynamic_ode";
  }
  if (/^\s*mu\s*=|mumax|growth/i.test(text)) {
    return "algebraic_calculation";
  }
  return equation.equation_type ?? "unknown";
}

function initialStateSymbol(symbol: string): string | null {
  const match = symbol.match(/^([A-Za-z][A-Za-z0-9_]*?)(?:0|_0)$/);
  return match?.[1] ?? null;
}

function isInitialConditionParameter(parameter: ExtractedParameter): boolean {
  return Boolean(initialStateSymbol(parameter.symbol));
}

function asInitialConditionParameter(parameter: ExtractedParameter): ExtractedParameter {
  const stateSymbol = initialStateSymbol(parameter.symbol) ?? parameter.symbol;
  return {
    ...parameter,
    name: `Initial condition for ${stateSymbol}`,
    status: "initial_condition",
    source_context: `${parameter.source_context} [initial_condition]`,
  };
}

function isUnknownPlaceholder(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "" || normalized === "-" || normalized === "unknown";
}

function hasUsefulSourceContext(sourceContext: string | undefined): boolean {
  const normalized = (sourceContext ?? "").trim().toLowerCase();
  const compact = normalized.replace(/[\s,.:;-]+/g, "");
  return Boolean(compact) && compact !== "unknownpage" && compact !== "unknown";
}

function parameterValueKey(parameter: ExtractedParameter): string | null {
  const numeric = parseNumericValue(parameter.value);
  const unit = (parameter.unit ?? "").trim().toLowerCase();
  if (numeric == null || isUnknownPlaceholder(unit)) return null;
  return `${numeric}:${unit}`;
}

function removeMeaninglessUnknownRows(result: ExtractionResult): { changed: boolean; warnings: string[] } {
  let changed = false;
  const warnings: string[] = [];
  const hasNamedVariable = result.state_variables.some(
    (variable) =>
      !isUnknownPlaceholder(variable.symbol) ||
      !isUnknownPlaceholder(variable.name),
  );

  const stateVariables = result.state_variables.filter((variable) => {
    const isMeaninglessUnknown =
      isUnknownPlaceholder(variable.symbol) &&
      isUnknownPlaceholder(variable.name) &&
      variable.confidence === "low" &&
      !hasUsefulSourceContext(variable.source_context) &&
      hasNamedVariable;
    if (isMeaninglessUnknown) {
      changed = true;
      return false;
    }
    return true;
  });

  const namedParameterValueKeys = new Set(
    result.parameters
      .filter((parameter) => !isUnknownPlaceholder(parameter.symbol))
      .map(parameterValueKey)
      .filter((value): value is string => Boolean(value)),
  );
  const parameters = result.parameters.filter((parameter) => {
    const isUnknownSymbol = isUnknownPlaceholder(parameter.symbol);
    const isLowConfidence = parameter.confidence === "low";
    const hasDuplicateNamedValue =
      isUnknownSymbol &&
      parameterValueKey(parameter) != null &&
      namedParameterValueKeys.has(parameterValueKey(parameter)!);
    const isEmptyUnknown =
      isUnknownSymbol &&
      isUnknownPlaceholder(parameter.name) &&
      isLowConfidence &&
      !hasUsefulSourceContext(parameter.source_context);
    if (hasDuplicateNamedValue || isEmptyUnknown) {
      changed = true;
      return false;
    }
    return true;
  });

  if (changed) {
    result.state_variables = stateVariables;
    result.parameters = parameters;
    warnings.push("Removed low-confidence placeholder unknown rows that duplicated explicit source-backed evidence.");
  }
  return { changed, warnings };
}

function isPlaceholderUnit(unit: string | undefined): boolean {
  return isUnknownPlaceholder(unit);
}

function inferStateUnitsFromInitialConditions(result: ExtractionResult): boolean {
  let changed = false;
  const initialByState = new Map(
    (result.initial_conditions ?? [])
      .filter((initial) => !isPlaceholderUnit(initial.unit))
      .map((initial) => [initial.state_symbol.toLowerCase(), initial]),
  );

  result.state_variables = result.state_variables.map((variable) => {
    if (!isPlaceholderUnit(variable.unit)) return variable;
    const initial = initialByState.get(variable.symbol.toLowerCase());
    if (!initial) return variable;
    changed = true;
    const note = "Unit inferred from initial condition.";
    return {
      ...variable,
      unit: initial.unit,
      confidence: variable.confidence === "high" ? "medium" : variable.confidence,
      source_context: variable.source_context.includes(note)
        ? variable.source_context
        : `${variable.source_context} ${note}`.trim(),
    };
  });
  return changed;
}

function equationContainsBoth(result: ExtractionResult, left: string, right: string): boolean {
  const leftKey = left.toLowerCase();
  const rightKey = right.toLowerCase();
  return result.equations.some((equation) => {
    const text = `${equation.equation_plaintext} ${equation.equation_latex}`.toLowerCase();
    return text.includes(leftKey) && text.includes(rightKey);
  });
}

function inferGasStateUnitFromSaturationParameter(result: ExtractionResult): boolean {
  if (result.model_type !== "gas_liquid") return false;
  const cstar = result.parameters.find(
    (parameter) =>
      parameter.symbol.toLowerCase() === "cstar_o2" &&
      !isPlaceholderUnit(parameter.unit),
  );
  if (!cstar || !equationContainsBoth(result, "C_O2", "Cstar_O2")) return false;
  let changed = false;
  result.state_variables = result.state_variables.map((variable) => {
    if (variable.symbol.toLowerCase() !== "c_o2" || !isPlaceholderUnit(variable.unit)) {
      return variable;
    }
    changed = true;
    const note = "Unit inferred from Cstar_O2 in the same oxygen balance.";
    return {
      ...variable,
      unit: cstar.unit,
      confidence: variable.confidence === "high" ? "medium" : variable.confidence,
      source_context: variable.source_context.includes(note)
        ? variable.source_context
        : `${variable.source_context} ${note}`.trim(),
    };
  });
  return changed;
}

function normalizePlaceholderUnits(result: ExtractionResult): boolean {
  let changed = false;
  result.state_variables = result.state_variables.map((variable) => {
    if (variable.unit !== "-") return variable;
    changed = true;
    return { ...variable, unit: "unknown" };
  });
  return changed;
}

function roleBySymbol(symbol: string, modelType: ExtractedModelType): ExtractedStateVariable["role"] | null {
  const lower = symbol.toLowerCase();
  if (lower === "mu") return "output";
  if (lower === "sin") return "input";
  if (lower === "cstar_o2") return "input";
  if (lower === "kla") return "parameter";
  if (lower === "d" && modelType === "monod_chemostat") return "control";
  return null;
}

function correctVariableRoles(result: ExtractionResult): boolean {
  let changed = false;
  result.state_variables = result.state_variables.map((variable) => {
    const role = roleBySymbol(variable.symbol, result.model_type);
    if (!role || variable.role === role) return variable;
    changed = true;
    return { ...variable, role };
  });
  return changed;
}

function hasSymbol(values: string[], symbol: string): boolean {
  return values.some((value) => value.trim().toLowerCase() === symbol.toLowerCase());
}

function refineModelCardControls(result: ExtractionResult): boolean {
  let changed = false;
  const before = result.model_card.control_variables;
  const controls = before.filter((symbol) => {
    const lower = symbol.toLowerCase();
    if (lower !== "kla" && lower !== "cstar_o2") return true;
    const sourceText = [
      ...result.parameters.filter((parameter) => parameter.symbol.toLowerCase() === lower).map((parameter) => parameter.source_context),
      ...result.state_variables.filter((variable) => variable.symbol.toLowerCase() === lower).map((variable) => variable.source_context),
    ].join(" ");
    return /\b(control|controlled|manipulated|setpoint|set point)\b/i.test(sourceText);
  });
  if (result.model_type === "monod_chemostat" && result.parameters.some((parameter) => parameter.symbol.toLowerCase() === "d") && !hasSymbol(controls, "D")) {
    controls.push("D");
  }
  if (controls.length !== before.length || controls.some((value, index) => value !== before[index])) {
    result.model_card.control_variables = controls;
    changed = true;
  }
  return changed;
}

function maybeSetFallbackSummary(result: ExtractionResult): boolean {
  const summary = result.model_card.short_summary.trim();
  const weakSummary = !summary || /\bunknown paper\b|\bunknown system\b|no complete dynamic ode system was identified/i.test(summary);
  if (!weakSummary) return false;

  if (result.model_type === "monod_chemostat") {
    result.model_card.short_summary =
      "Continuous Monod chemostat model with biomass X, substrate S, dilution rate D, and feed substrate Sin.";
    return true;
  }
  if (result.model_type === "gas_liquid") {
    result.model_card.short_summary =
      "Aerobic gas-liquid oxygen-transfer model with dissolved oxygen C_O2, kLa transfer, and biomass oxygen uptake qO2*X.";
    return true;
  }
  return false;
}

function mergeStringLists(left: string[], right: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [...left, ...right].map((item) => item.trim()).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function strongerModelType(
  groqType: ExtractedModelType,
  explicitType: ExtractedModelType,
): ExtractedModelType {
  if (groqType === "unknown" && explicitType !== "unknown") return explicitType;
  if (explicitType === "monod_chemostat" && groqType === "unknown") return explicitType;
  return groqType;
}

function mergeExplicitEvidence(
  groqResult: ExtractionResult,
  explicitResult: ExtractionResult,
): { result: ExtractionResult; applied: boolean; warnings: string[] } {
  let applied = false;
  const warnings: string[] = [];
  const next: ExtractionResult = {
    ...groqResult,
    state_variables: [...groqResult.state_variables],
    parameters: [...groqResult.parameters],
    initial_conditions: [...(groqResult.initial_conditions ?? [])],
    equations: [...groqResult.equations],
    assumptions: [...groqResult.assumptions],
    limitations: [...groqResult.limitations],
    model_card: {
      ...groqResult.model_card,
      inputs: [...groqResult.model_card.inputs],
      outputs: [...groqResult.model_card.outputs],
      control_variables: [...groqResult.model_card.control_variables],
      missing_information: [...groqResult.model_card.missing_information],
    },
  };

  const mergedModelType = strongerModelType(next.model_type, explicitResult.model_type);
  if (mergedModelType !== next.model_type) {
    next.model_type = mergedModelType;
    applied = true;
  }
  if (/^unknown paper$/i.test(next.paper_title_or_topic) && explicitResult.paper_title_or_topic) {
    next.paper_title_or_topic = explicitResult.paper_title_or_topic;
    applied = true;
  }
  if (/^unknown system$/i.test(next.system_type) && explicitResult.system_type) {
    next.system_type = explicitResult.system_type;
    applied = true;
  }

  const variableKeys = new Set(next.state_variables.map((variable) => variable.symbol));
  for (const variable of explicitResult.state_variables) {
    if (variableKeys.has(variable.symbol)) continue;
    next.state_variables.push(variable);
    variableKeys.add(variable.symbol);
    applied = true;
  }

  const parameterKeys = new Map(
    next.parameters.map((parameter, index) => [parameter.symbol.toLowerCase(), index]),
  );
  for (const rawParameter of explicitResult.parameters) {
    const parameter = isInitialConditionParameter(rawParameter)
      ? asInitialConditionParameter(rawParameter)
      : rawParameter;
    const key = parameter.symbol.toLowerCase();
    const existingIndex = parameterKeys.get(key);
    if (existingIndex == null) {
      next.parameters.push(parameter);
      parameterKeys.set(key, next.parameters.length - 1);
      applied = true;
      continue;
    }
    const existing = next.parameters[existingIndex];
    if (
      existing &&
      parseNumericValue(existing.value) == null &&
      parseNumericValue(parameter.value) != null
    ) {
      next.parameters[existingIndex] = parameter;
      applied = true;
    }
  }

  const initialKeys = new Set((next.initial_conditions ?? []).map((item) => item.symbol.toLowerCase()));
  for (const parameter of next.parameters) {
    if (parameter.status !== "initial_condition") continue;
    const stateSymbol = initialStateSymbol(parameter.symbol);
    if (!stateSymbol || initialKeys.has(parameter.symbol.toLowerCase())) continue;
    next.initial_conditions = next.initial_conditions ?? [];
    next.initial_conditions.push({
      symbol: parameter.symbol,
      state_symbol: stateSymbol,
      name: parameter.name || `Initial condition for ${stateSymbol}`,
      value: parameter.value,
      value_numeric: parseNumericValue(parameter.value),
      unit: parameter.unit,
      source_context: parameter.source_context,
      confidence: parameter.confidence,
    });
    initialKeys.add(parameter.symbol.toLowerCase());
    applied = true;
  }

  const initialByState = new Map(
    (next.initial_conditions ?? []).map((item) => [item.state_symbol, item]),
  );
  next.state_variables = next.state_variables.map((variable) => {
    if (variable.initial_condition || !initialByState.has(variable.symbol)) return variable;
    const initial = initialByState.get(variable.symbol)!;
    applied = true;
    return {
      ...variable,
      initial_condition: {
        symbol: initial.symbol,
        value: initial.value,
        value_numeric: initial.value_numeric,
        unit: initial.unit,
        source_context: initial.source_context,
        confidence: initial.confidence,
      },
    };
  });

  const equationKeys = new Set(next.equations.map((equation) => normalizedKey(equation.equation_plaintext)));
  for (const equation of explicitResult.equations) {
    const key = normalizedKey(equation.equation_plaintext);
    if (equationKeys.has(key)) continue;
    next.equations.push({
      ...equation,
      equation_type: inferExplicitEquationType(equation),
    });
    equationKeys.add(key);
    applied = true;
  }

  const assumptionKeys = new Set(next.assumptions.map((item) => item.assumption.toLowerCase()));
  for (const assumption of explicitResult.assumptions) {
    const key = assumption.assumption.toLowerCase();
    if (assumptionKeys.has(key)) continue;
    next.assumptions.push(assumption);
    assumptionKeys.add(key);
    applied = true;
  }

  next.model_card.inputs = mergeStringLists(next.model_card.inputs, explicitResult.model_card.inputs);
  next.model_card.outputs = mergeStringLists(next.model_card.outputs, explicitResult.model_card.outputs);
  next.model_card.control_variables = mergeStringLists(
    next.model_card.control_variables,
    explicitResult.model_card.control_variables,
  );
  next.model_card.missing_information = mergeStringLists(
    next.model_card.missing_information,
    explicitResult.model_card.missing_information,
  );
  next.model_card.can_generate_ode_template =
    next.model_card.can_generate_ode_template ||
    next.equations.some((equation) => equation.equation_type === "dynamic_ode");
  next.model_card.model_type =
    next.model_type === "unknown" ? next.model_card.model_type : next.model_type;

  if (correctVariableRoles(next)) applied = true;
  if (inferStateUnitsFromInitialConditions(next)) applied = true;
  if (inferGasStateUnitFromSaturationParameter(next)) applied = true;
  if (normalizePlaceholderUnits(next)) applied = true;
  if (refineModelCardControls(next)) applied = true;
  if (maybeSetFallbackSummary(next)) applied = true;
  const cleanup = removeMeaninglessUnknownRows(next);
  if (cleanup.changed) applied = true;
  warnings.push(...cleanup.warnings);

  if (applied) {
    warnings.push("Groq result was merged with explicit equations, parameters, and initial conditions found verbatim in the source text.");
  }

  return { result: next, applied, warnings };
}

function shouldWriteMonodDebugArtifact(sourceText: string, applied: boolean): boolean {
  return applied &&
    process.env.NODE_ENV !== "production" &&
    /\bchemostat\b|\bmumax\b|\bks\b|dX\/dt|dS\/dt/i.test(sourceText);
}

function writeMonodDebugArtifact(input: {
  sourceText: string;
  rawProviderResponse: unknown;
  parsedBeforeMerge: ExtractionResult;
  explicitResult: ExtractionResult;
  mergedResult: ExtractionResult;
  tokenMeta: Record<string, unknown>;
}): string | undefined {
  if (!shouldWriteMonodDebugArtifact(input.sourceText, true)) return undefined;
  const dir = path.resolve(process.cwd(), process.env.GROQ_DEBUG_DIR || "logs");
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(
    dir,
    `groq-monod-debug-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        provider: "groq",
        rawProviderResponse: input.rawProviderResponse,
        parsedBeforeMerge: input.parsedBeforeMerge,
        explicitResult: input.explicitResult,
        mergedResult: input.mergedResult,
        tokenMeta: input.tokenMeta,
      },
      null,
      2,
    ),
  );
  return filePath;
}

export class GroqProvider implements ExtractionProvider {
  readonly name: ProviderName = "groq";

  private readonly model?: string;
  private readonly apiKey?: string;
  private readonly clientOverride?: ChatClient;

  constructor(model?: string, apiKey?: string, clientOverride?: ChatClient) {
    this.model = model;
    this.apiKey = apiKey;
    this.clientOverride = clientOverride;
  }

  async extract(sourceText: string): Promise<{
    raw: unknown;
    tokenMeta: Record<string, unknown> | null;
    providerModel: string;
    systemPrompt: string;
    rawProviderResponse: unknown;
  }> {
    return this.extractFromChunks([
      {
        chunk_id: "text_001",
        page_start: 1,
        page_end: 1,
        section_heading: "Source text",
        text: sourceText,
        char_count: sourceText.length,
        contains_equation_like_text: /=|d[A-Za-z][A-Za-z0-9_]*\/dt/.test(sourceText),
        contains_table_like_text: /\b(symbol|unit|value|table)\b/i.test(sourceText),
        contains_figure_reference: /\b(?:fig\.?|figure)\s*\d+/i.test(sourceText),
      },
    ]);
  }

  async extractFromChunks(
    documentChunks: PaperUnderstandingDocumentChunk[],
  ): Promise<{
    raw: unknown;
    tokenMeta: Record<string, unknown> | null;
    providerModel: string;
    systemPrompt: string;
    rawProviderResponse: unknown;
  }> {
    const config = getGroqConfig(this.apiKey);
    if (!config.apiKey && !this.clientOverride) {
      throw new Error("GROQ_API_KEY is required for Groq extraction.");
    }

    const model = this.model ?? config.model;
    const selection = selectGroqChunks(documentChunks, config.limits);
    const effectiveInputBudget = getEffectiveGroqInputBudget(config.limits);
    const activeJsonSchema = config.freeTierMode
      ? GROQ_LITE_PAPER_UNDERSTANDING_JSON_SCHEMA
      : GROQ_PAPER_UNDERSTANDING_JSON_SCHEMA;
    const budgeted = buildBudgetedPrompt({
      documentChunks: selection.chunks,
      maxInputTokens: effectiveInputBudget,
      initialWarnings: selection.warnings,
      freeTierMode: config.freeTierMode,
      jsonSchema: activeJsonSchema,
    });
    const prompt = budgeted.prompt;
    const estimatedInputTokens = budgeted.estimatedInputTokens;
    const maxOutputTokens = config.limits.maxOutputTokensPerRequest;
    const estimatedTotalTokens = estimatedInputTokens + maxOutputTokens;

    if (
      estimatedInputTokens > effectiveInputBudget ||
      (selection.chunks.length > 0 && budgeted.chunks.length === 0)
    ) {
      throw new GroqBudgetError(
        config.freeTierMode
          ? "Groq free-tier budget cannot fit this PDF. Try fewer chunks, paste a smaller excerpt, or use a paid/higher-limit provider."
          : "Groq token budget exceeded. Reduce PDF size, increase GROQ_MAX_INPUT_TOKENS_PER_REQUEST, or use Auto fallback.",
        413,
      );
    }

    const cacheKey = makeGroqCacheKey(
      budgeted.chunks,
      model,
      `${GROQ_PROFESSOR_PROMPT_VERSION}:${GROQ_PAPER_SCHEMA_VERSION}`,
    );
    const cached = getGroqCachedResult(cacheKey);
    const budget = cached
      ? null
      : reserveGroqBudget({
          estimatedInputTokens,
          maxOutputTokens,
          limits: config.limits,
        });

    if (budget && !budget.ok) {
      throw new GroqBudgetError(budget.reason, budget.status);
    }

    const responseFormatWarnings = [...(cached?.responseFormatWarnings ?? [])];
    const callResult = cached
      ? {
          content: cached.rawProviderResponse,
          responseFormatMode: cached.responseFormatMode ?? "json_schema",
          responseFormatWarnings,
          requestCount: 0,
        }
      : await this.callGroq({
          model,
          apiKey: config.apiKey,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          maxOutputTokens,
          jsonSchema: activeJsonSchema,
          reserveRetryBudget: () => {
            const retryBudget = reserveGroqBudget({
              estimatedInputTokens,
              maxOutputTokens,
              requestCount: 2,
              limits: config.limits,
            });
            if (!retryBudget.ok) {
              throw new GroqBudgetError(retryBudget.reason, retryBudget.status);
            }
          },
        });
    if (!cached && callResult.requestCount > 0) {
      recordGroqRequestUsage({
        estimatedInputTokens,
        maxOutputTokens,
        requestCount: callResult.requestCount,
      });
    }
    const rawProviderResponse = callResult.content;

    let parsed: ReturnType<typeof parsePaperUnderstandingResponse>;
    try {
      parsed = parsePaperUnderstandingResponse(rawProviderResponse, {
        provider: "groq",
        model,
        promptVersion: GROQ_PROFESSOR_PROMPT_VERSION,
        schemaVersion: GROQ_PAPER_SCHEMA_VERSION,
        responseFormatMode: callResult.responseFormatMode,
        selectedChunks: budgeted.chunks.map((chunk) => ({
          chunk_id: chunk.chunk_id,
          page_start: chunk.page_start,
          page_end: chunk.page_end,
          section_heading: chunk.section_heading,
        })),
      });
    } catch (error) {
      if (error instanceof PaperUnderstandingValidationError) {
        error.normalizationWarnings.push(...callResult.responseFormatWarnings);
      }
      throw error;
    }
    if (budgeted.warnings.length > 0 || callResult.responseFormatWarnings.length > 0) {
      parsed.raw.model_card.missing_information = appendUnique(
        parsed.raw.model_card.missing_information,
        [...budgeted.warnings, ...callResult.responseFormatWarnings],
      );
    }

    const explicitSourceText = budgeted.chunks.map((chunk) => chunk.text).join("\n\n");
    const explicitResult = await new RuleBasedProvider().extract(explicitSourceText);
    const merged = mergeExplicitEvidence(parsed.raw, explicitResult);
    if (merged.warnings.length > 0) {
      merged.result.model_card.missing_information = appendUnique(
        merged.result.model_card.missing_information,
        merged.warnings,
      );
    }

    const finalized = finalizeExtractionResult(merged.result);
    const debugTokenMeta = {
      provider: "groq",
      model,
      promptVersion: GROQ_PROMPT_VERSION,
      professorPromptVersion: GROQ_PROFESSOR_PROMPT_VERSION,
      paperSchemaVersion: GROQ_PAPER_SCHEMA_VERSION,
      groqFreeTierMode: config.freeTierMode,
      cacheHit: Boolean(cached),
      responseFormatMode: callResult.responseFormatMode,
      responseFormatWarnings: callResult.responseFormatWarnings,
      selectedChunks: budgeted.chunks.length,
      totalChunks: selection.totalChunkCount,
      skippedChunks: selection.skippedChunkCount + budgeted.skippedChunks,
      selectionWarnings: budgeted.warnings,
      normalizationApplied: parsed.normalizationApplied,
      normalizationWarnings: parsed.normalizationWarnings,
      explicitEvidenceMergeApplied: merged.applied,
      explicitEvidenceMergeWarnings: merged.warnings,
      finalizerApplied: finalized.changed,
      finalizerWarnings: finalized.warnings,
      estimatedInputTokens,
      estimatedPromptTokens: budgeted.estimatedPromptTokens,
      estimatedSchemaTokens: budgeted.estimatedSchemaTokens,
      effectiveInputBudget,
      maxOutputTokens,
      estimatedTotalTokens,
    };
    const monodDebugArtifactPath = shouldWriteMonodDebugArtifact(
      explicitSourceText,
      merged.applied,
    )
      ? writeMonodDebugArtifact({
          sourceText: explicitSourceText,
          rawProviderResponse,
          parsedBeforeMerge: parsed.raw,
          explicitResult,
          mergedResult: finalized.result,
          tokenMeta: debugTokenMeta,
        })
      : undefined;

    const result = ExtractionResultSchema.parse(finalized.result);
    if (!cached) {
      recordGroqExtractionSuccess();
      setGroqCachedResultWithMeta(cacheKey, rawProviderResponse, {
        responseFormatMode: callResult.responseFormatMode,
        responseFormatWarnings: callResult.responseFormatWarnings,
      });
    }

    return {
      raw: result,
      rawProviderResponse,
      systemPrompt: prompt.systemPrompt,
      providerModel: model,
      tokenMeta: {
        ...debugTokenMeta,
        ...(monodDebugArtifactPath ? { monodDebugArtifactPath } : {}),
      },
    };
  }

  private async callGroq(input: {
    model: string;
    apiKey?: string;
    systemPrompt: string;
    userPrompt: string;
    maxOutputTokens: number;
    jsonSchema: Record<string, unknown>;
    reserveRetryBudget?: () => void;
  }): Promise<{
    content: string;
    responseFormatMode: "json_schema" | "json_object";
    responseFormatWarnings: string[];
    requestCount: number;
  }> {
    const client = this.clientOverride
      ?? new OpenAI({
        apiKey: input.apiKey,
        baseURL: "https://api.groq.com/openai/v1",
      });

    try {
      const completion = await this.createCompletion(client, {
        model: input.model,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        maxOutputTokens: input.maxOutputTokens,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "paper_understanding",
            strict: true,
            schema: input.jsonSchema,
          },
        },
      });
      const content = completion.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Groq returned an empty response.");
      }
      return {
        content,
        responseFormatMode: "json_schema",
        responseFormatWarnings: [],
        requestCount: 1,
      };
    } catch (error) {
      if (isRateLimitError(error)) {
        const retryAfter = getRetryAfter(error);
        const suffix = retryAfter ? ` Retry after ${retryAfter} seconds.` : "";
        throw new GroqRateLimitError(
          `Groq rate limit reached. Try again later or reduce PDF size.${suffix}`,
          retryAfter,
        );
      }
      if (isStructuredOutputUnsupported(error)) {
        try {
          input.reserveRetryBudget?.();
          const completion = await this.createCompletion(client, {
            model: input.model,
            systemPrompt: input.systemPrompt,
            userPrompt: input.userPrompt,
            maxOutputTokens: input.maxOutputTokens,
            responseFormat: { type: "json_object" },
          });
          const content = completion.choices?.[0]?.message?.content;
          if (!content) {
            throw new Error("Groq returned an empty response.");
          }
          return {
            content,
            responseFormatMode: "json_object",
            responseFormatWarnings: [GROQ_STRICT_SCHEMA_RETRY_WARNING],
            requestCount: 2,
          };
        } catch (retryError) {
          if (retryError instanceof GroqBudgetError) {
            throw retryError;
          }
          if (isRateLimitError(retryError)) {
            const retryAfter = getRetryAfter(retryError);
            const suffix = retryAfter ? ` Retry after ${retryAfter} seconds.` : "";
            throw new GroqRateLimitError(
              `Groq rate limit reached. Try again later or reduce PDF size.${suffix}`,
              retryAfter,
            );
          }
          const message = retryError instanceof Error
            ? retryError.message
            : String(retryError);
          throw new Error(`Groq provider failed: ${message}`);
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Groq provider failed: ${message}`);
    }
  }

  private async createCompletion(
    client: ChatClient,
    input: {
      model: string;
      systemPrompt: string;
      userPrompt: string;
      maxOutputTokens: number;
      responseFormat: unknown;
    },
  ) {
    return client.chat.completions.create({
      model: input.model,
      temperature: 0.1,
      max_tokens: input.maxOutputTokens,
      response_format: input.responseFormat,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
    });
  }
}
