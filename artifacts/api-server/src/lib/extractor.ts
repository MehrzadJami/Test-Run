// Extraction engine.
//
// Provider abstraction:
//   Providers include real AI providers (OpenAI, Gemini, Groq, Ollama), a local
//   RuleBasedProvider, and MockProvider (explicit deterministic demo). The
//   active provider is selected by getActiveProvider() based on the caller's
//   preference and which provider configuration is present. Keys are NEVER
//   hardcoded.
//
// Provider priority (getActiveProvider):
//   1. If the caller requests a specific named provider AND its key exists → use it.
//   2. If the caller requests "mock" → always use MockProvider (no key needed).
//   3. Otherwise (auto or requested provider not available) →
//      OpenAI → Gemini → Groq → Ollama → RuleBasedProvider.
//      MockProvider is explicit demo mode only.
//
// Validation contract:
//   runExtraction() is the single public entry point. It validates input,
//   calls the active provider, attempts one JSON repair pass on malformed
//   responses, and re-validates against ExtractionResultSchema. Callers
//   receive either a fully validated ExtractionResult or a typed error.
//   Bad data is NEVER saved to the database.
//
// Audit trail (M17):
//   runExtraction() now returns an `audit` object alongside `result` and
//   `providerName`. The audit captures: the model ID used, the exact system
//   prompt sent (NO secrets), a short prompt template summary, the raw
//   provider response before repair/validation, repair status, validation
//   errors (if any), and token usage metadata. Callers persist this to the
//   database via the extractions.audit* columns.
//
// Token / cost metadata:
//   Logged at info level when the provider supplies it. Never throws if
//   metadata is absent.
//
// Database mapping:
//   mapExtractionToDb() converts an ExtractionResult into the row shapes
//   the routes layer inserts. All fields from the extraction schema are now
//   stored in dedicated columns — rawExtractionJson remains the audit record.

import {
  ExtractionResultSchema,
  type ExtractionResult,
  type ExtractedEquation,
  type ExtractedEquationType,
  type ExtractedModelCardMeta,
  type ExtractedParameter,
  type ExtractedRole,
  type ExtractedStateVariable,
} from "./extraction-schema";
import { OpenAIProvider } from "./providers/openai-provider";
import { GeminiProvider } from "./providers/gemini-provider";
import { GroqProvider } from "./providers/groq-provider";
import { OllamaPaperUnderstandingProvider } from "./providers/ollama-paper-understanding-provider";
import { RuleBasedProvider } from "./providers/rule-based-provider";
import {
  GroqBudgetError,
  GroqRateLimitError,
} from "./providers/groq-budget";
import { PaperUnderstandingValidationError } from "./providers/paper-understanding-response";
import { EXTRACTION_SYSTEM_PROMPT, buildUserMessage } from "./providers/prompt";
import { logger } from "./logger";
import { normalizeModelType } from "@workspace/domain-classifier";
import {
  analyzeChunkTruncation,
  DEFAULT_MAX_TOTAL_CHARS,
  type ChunkTruncationReport,
  type PaperUnderstandingDocumentChunk,
} from "./paper-understanding-prompt";
import { findUnitWarnings } from "./unit-validation";
import { formatDocumentChunksAsSourceText } from "./structured-document";
import { finalizeExtractionResult } from "./extraction-finalizer";

// ---------- Public errors ----------

/** Bad input from the user (empty / too short). 400 territory. */
export class ExtractionInputError extends Error {
  readonly status = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = "ExtractionInputError";
  }
}

/** Provider failed or returned malformed output. 502 territory. */
export class ExtractionProviderError extends Error {
  readonly status: number;
  readonly details?: Record<string, unknown>;
  constructor(
    message: string,
    readonly providerName: string,
    status = 502,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ExtractionProviderError";
    this.status = status;
    this.details = details;
  }
}

// ---------- Provider interface ----------

export type ProviderName =
  | "mock"
  | "openai"
  | "gemini"
  | "groq"
  | "ollama"
  | "rule_based";
export type ProviderPreference = ProviderName | "auto";

export interface ExtractionProvider {
  readonly name: ProviderName;
  /**
   * Producer of an extraction result. May return any shape — the orchestrator
   * always re-validates against ExtractionResultSchema, so providers never
   * bypass validation.
   *
   * Real providers return `{ raw, tokenMeta, providerModel, systemPrompt }`.
   * Local providers return an ExtractionResult directly (no token metadata).
   */
  extract(sourceText: string): Promise<unknown>;
  extractFromChunks?(
    documentChunks: PaperUnderstandingDocumentChunk[],
  ): Promise<unknown>;
}

export type ExtractionRuntimeOptions = {
  openaiApiKey?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  documentChunks?: PaperUnderstandingDocumentChunk[];
  sourceKind?: "text" | "pdf";
};

// ---------- Audit data type ----------

/**
 * M17: Extraction audit record captured by runExtraction() and persisted
 * alongside every extraction row.
 *
 * Safety guarantees:
 * - systemPrompt contains only the instructional text sent to the AI provider.
 *   API keys, secrets, and user credentials are NEVER stored here.
 * - rawProviderResponse contains the AI output only — not the request payload.
 * - tokenUsage contains counts and estimated cost only — no billing details.
 */
export type AuditData = {
  /** Exact model identifier, e.g. "gpt-4o", "gemini-1.5-flash", "rule_based". */
  providerModel: string;
  /** System prompt sent to the provider. Safe — no secrets. Empty for local providers. */
  systemPrompt: string;
  /** Short description of the extraction template purpose. */
  promptTemplateSummary: string;
  /** Raw provider response BEFORE JSON repair and Zod validation. Null for local providers. */
  rawProviderResponse: unknown;
  /** Whether the response needed JSON repair before it could be validated. */
  repairStatus: "not_needed" | "repaired" | "failed";
  /** Zod validation error text if any. Null when extraction succeeded cleanly. */
  validationErrors: string | null;
  /** Token count / estimated cost metadata. Null when unavailable. */
  tokenUsage: Record<string, unknown> | null;
};

const PROMPT_TEMPLATE_SUMMARY =
  "Classifies model_type, then extracts a quantitative chemical engineering model (state variables, ODEs, parameters, assumptions, model card) from scientific/engineering text into a structured JSON object matching ExtractionResultSchema.";
const STRUCTURED_DOCUMENT_PROMPT_TEMPLATE_SUMMARY =
  "Uses structured PDF/document chunks with page and section context through PaperUnderstanding, then maps the validated PaperUnderstanding result to ExtractionResultSchema.";
const FLAT_STRUCTURED_DOCUMENT_FALLBACK_SUMMARY =
  "Structured PDF/document chunks were available, but the selected fallback used deterministic flat/local extraction over chunk text. It does not perform full-paper semantic understanding; page/section context may be limited.";

// ---------- Mock provider ----------

const TITLE_MAX = 90;

function deriveTitle(sourceText: string): string {
  const firstLine = sourceText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "Untitled extraction";
  return firstLine.length > TITLE_MAX
    ? firstLine.slice(0, TITLE_MAX - 3) + "..."
    : firstLine;
}

class MockProvider implements ExtractionProvider {
  readonly name = "mock" as const;

  async extract(sourceText: string): Promise<ExtractionResult> {
    const title = deriveTitle(sourceText);
    return {
      paper_title_or_topic: title,
      model_type: "unknown",
      system_type: "Generic dynamic system (mock)",
      process_description:
        "Mock extraction generated without a real AI provider configured. " +
        "Demonstrates the canonical structure: a model card with state " +
        "variables, parameters, equations, assumptions, and limitations.",
      state_variables: [
        {
          symbol: "x",
          name: "Lumped state",
          meaning: "Single lumped state variable for the mock system.",
          unit: "—",
          role: "state",
          source_context:
            "(mock) Single state generated by the mock extractor.",
          confidence: "low",
        },
        {
          symbol: "t",
          name: "Time",
          meaning: "Independent variable of integration.",
          unit: "s",
          role: "input",
          source_context: "(mock) Independent variable.",
          confidence: "high",
        },
      ],
      parameters: [
        {
          symbol: "k",
          name: "Rate constant",
          value: "0.1",
          unit: "1/s",
          source_context:
            "(mock) Default rate constant — replace with real value.",
          confidence: "low",
        },
      ],
      equations: [
        {
          label: "(1)",
          equation_latex: "\\frac{dx}{dt} = -k\\, x",
          equation_plaintext: "dx/dt = -k * x",
          meaning: "First-order decay of the lumped state.",
          variables_involved: ["x", "t", "k"],
          source_context: "(mock) Assumed first-order kinetics.",
          confidence: "low",
        },
      ],
      assumptions: [
        {
          assumption: "Lumped, well-mixed system with no spatial variation.",
          source_context: "(mock)",
          confidence: "medium",
        },
        {
          assumption: "Constant temperature.",
          source_context: "(mock)",
          confidence: "medium",
        },
      ],
      limitations: [
        {
          limitation:
            "Mock extraction — configure OPENAI_API_KEY or GEMINI_API_KEY to use a real AI provider.",
          source_context: "(mock)",
          confidence: "high",
        },
      ],
      model_card: {
        short_summary: `Mock extraction for "${title}".`,
        model_type: "Lumped ODE",
        inputs: ["t"],
        outputs: ["x"],
        control_variables: [],
        missing_information: [
          "Real source quotes (mock provider)",
          "Numeric parameter values from the source paper",
        ],
        can_generate_ode_template: true,
      },
    };
  }
}

// ---------- JSON repair ----------

/**
 * Attempt to extract a valid JSON object from a raw string that may contain
 * markdown fences, preamble text, or minor syntax errors.
 *
 * Returns the parsed value, or null if all repair strategies fail.
 */
function tryRepairJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;

  // 1. Direct parse (already succeeded in provider if raw is an object, but
  //    guard here for string responses that slipped through).
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }

  // 2. Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      /* fall through */
    }
  }

  // 3. Find the first complete, balanced JSON object — handles leading/trailing prose.
  // Using lastIndexOf("}") is unsafe: it can slice across multiple JSON objects or
  // unbalanced braces, producing a different valid JSON than the AI intended.
  // Instead, walk forward from the first "{" and stop at its matching "}" by tracking depth.
  const firstBrace = raw.indexOf("{");
  if (firstBrace !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = firstBrace; i < raw.length; i++) {
      const ch = raw[i];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\" && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(raw.slice(firstBrace, i + 1));
          } catch {
            break; // Slice was syntactically invalid — give up
          }
        }
      }
    }
  }

  return null;
}

function normalizeCandidateModelType(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return candidate;
  }
  const typed = candidate as Record<string, unknown>;
  if (typeof typed["model_type"] !== "string") return candidate;
  return {
    ...typed,
    model_type: normalizeModelType(typed["model_type"]),
  };
}

// ---------- Provider factory ----------

/**
 * Select the active extraction provider.
 *
 * Priority rules (see module header for full description):
 *  - "mock"       → always MockProvider
 *  - "rule_based" → always RuleBasedProvider
 *  - "openai"     → OpenAIProvider if OPENAI_API_KEY present, else auto-fallback
 *  - "gemini"     → GeminiProvider if GEMINI_API_KEY present, else auto-fallback
 *  - "groq"       → GroqProvider if GROQ_API_KEY present, else auto-fallback
 *  - "ollama"     → OllamaPaperUnderstandingProvider using configured/default local Ollama
 *  - "auto" / undefined → OpenAI → Gemini → Groq → Ollama → RuleBasedProvider
 */
export function getActiveProvider(
  preferred?: ProviderPreference,
  runtimeKeys?: ExtractionRuntimeOptions,
): ExtractionProvider {
  const hasOpenAI = !!(runtimeKeys?.openaiApiKey || process.env["OPENAI_API_KEY"]);
  const hasGemini = !!(runtimeKeys?.geminiApiKey || process.env["GEMINI_API_KEY"]);
  const hasGroq = !!(runtimeKeys?.groqApiKey || process.env["GROQ_API_KEY"]);
  const hasOllama = !!(runtimeKeys?.ollamaBaseUrl || process.env["OLLAMA_BASE_URL"]);

  if (preferred === "mock") {
    return new MockProvider();
  }
  if (preferred === "rule_based") {
    return new RuleBasedProvider();
  }
  if (preferred === "openai" && hasOpenAI) {
    return new OpenAIProvider("gpt-4o", runtimeKeys?.openaiApiKey);
  }
  if (preferred === "gemini" && hasGemini) {
    return new GeminiProvider("gemini-1.5-flash", runtimeKeys?.geminiApiKey);
  }
  if (preferred === "groq" && hasGroq) {
    return new GroqProvider(undefined, runtimeKeys?.groqApiKey);
  }
  if (preferred === "ollama") {
    return new OllamaPaperUnderstandingProvider(
      runtimeKeys?.ollamaBaseUrl,
      runtimeKeys?.ollamaModel,
    );
  }

  // Auto fallback chain (also used when preferred key is not configured)
  if (hasOpenAI) return new OpenAIProvider("gpt-4o", runtimeKeys?.openaiApiKey);
  if (hasGemini)
    return new GeminiProvider("gemini-1.5-flash", runtimeKeys?.geminiApiKey);
  if (hasGroq) return new GroqProvider(undefined, runtimeKeys?.groqApiKey);
  if (hasOllama)
    return new OllamaPaperUnderstandingProvider(
      runtimeKeys?.ollamaBaseUrl,
      runtimeKeys?.ollamaModel,
    );
  return new RuleBasedProvider();
}

// ---------- Public entry point ----------

export const MIN_SOURCE_CHARS = 30;

export async function runExtraction(
  sourceText: string,
  preferred?: ProviderPreference,
  runtimeKeys?: ExtractionRuntimeOptions,
): Promise<{
  result: ExtractionResult;
  providerName: ProviderName;
  audit: AuditData;
}> {
  const trimmed = sourceText.trim();
  if (trimmed.length === 0) {
    throw new ExtractionInputError("Source text is empty.");
  }
  if (trimmed.length < MIN_SOURCE_CHARS) {
    throw new ExtractionInputError(
      `Source text is too short to extract a model (need at least ${MIN_SOURCE_CHARS} characters, got ${trimmed.length}).`,
    );
  }

  const hasOpenAI = !!(runtimeKeys?.openaiApiKey || process.env["OPENAI_API_KEY"]);
  const hasGemini = !!(runtimeKeys?.geminiApiKey || process.env["GEMINI_API_KEY"]);
  const hasGroq = !!(runtimeKeys?.groqApiKey || process.env["GROQ_API_KEY"]);
  const hasOllama = !!(runtimeKeys?.ollamaBaseUrl || process.env["OLLAMA_BASE_URL"]);
  if (preferred === "openai" && !hasOpenAI) {
    throw new ExtractionProviderError(
      "OpenAI provider selected but OPENAI_API_KEY is not configured.",
      "openai",
      400,
    );
  }
  if (preferred === "gemini" && !hasGemini) {
    throw new ExtractionProviderError(
      "Gemini provider selected but GEMINI_API_KEY is not configured.",
      "gemini",
      400,
    );
  }
  if (preferred === "groq" && !hasGroq) {
    throw new ExtractionProviderError(
      "Groq provider selected but GROQ_API_KEY is not configured.",
      "groq",
      400,
    );
  }

  let provider = getActiveProvider(preferred, runtimeKeys);
  const providerFallbacks: Array<{
    from: string;
    to: string;
    reason: string;
  }> = [];
  const documentChunks = runtimeKeys?.documentChunks?.filter((chunk) =>
    chunk.text.trim().length > 0,
  );
  const hasDocumentChunks = (documentChunks?.length ?? 0) > 0;

  // P2.9: Warn when all provided chunks were empty — the caller should know
  // that chunk-based extraction was silently skipped.
  if (runtimeKeys?.documentChunks && runtimeKeys.documentChunks.length > 0 && !hasDocumentChunks) {
    logger.warn(
      { chunkCount: runtimeKeys.documentChunks.length },
      "All document chunks were empty after filtering — falling back to flat text extraction",
    );
  }
  const flatStructuredSourceText =
    hasDocumentChunks && documentChunks
      ? formatDocumentChunksAsSourceText(documentChunks)
      : "";
  const flatProviderSourceText = flatStructuredSourceText || trimmed;
  let promptTemplateSummary = PROMPT_TEMPLATE_SUMMARY;

  function providerCanUseDocumentChunks(
    candidateProvider: ExtractionProvider,
  ): candidateProvider is ExtractionProvider & {
    extractFromChunks: (
      documentChunks: PaperUnderstandingDocumentChunk[],
    ) => Promise<unknown>;
  } {
    return typeof candidateProvider.extractFromChunks === "function";
  }

  async function callProvider(candidateProvider: ExtractionProvider): Promise<unknown> {
    if (hasDocumentChunks && documentChunks && providerCanUseDocumentChunks(candidateProvider)) {
      promptTemplateSummary = STRUCTURED_DOCUMENT_PROMPT_TEMPLATE_SUMMARY;
      return candidateProvider.extractFromChunks(documentChunks);
    }
    if (hasDocumentChunks) {
      promptTemplateSummary = FLAT_STRUCTURED_DOCUMENT_FALLBACK_SUMMARY;
    }
    return candidateProvider.extract(flatProviderSourceText);
  }

  async function callRuleBasedFallback(reason: string): Promise<unknown> {
    logger.warn(
      { provider: provider.name, reason },
      "Auto extraction falling back to RuleBasedProvider",
    );
    providerFallbacks.push({ from: provider.name, to: "rule_based", reason });
    provider = new RuleBasedProvider();
    return callProvider(provider);
  }

  function providerErrorStatus(err: unknown): number {
    if (err instanceof GroqBudgetError) return err.status;
    if (err instanceof GroqRateLimitError) return 429;
    if (err instanceof PaperUnderstandingValidationError) return 400;
    return 502;
  }

  function providerErrorMessage(err: unknown): string {
    if (err instanceof GroqBudgetError && err.status === 413) {
      return err.message;
    }
    if (err instanceof PaperUnderstandingValidationError) {
      return "Groq returned malformed structured data. The app attempted repair/normalization but validation still failed.";
    }
    if (err instanceof Error) return err.message;
    return String(err);
  }

  function providerErrorDetails(err: unknown): Record<string, unknown> | undefined {
    if (err instanceof PaperUnderstandingValidationError) {
      return {
        provider: provider.name,
        validationStage: err.validationStage,
        validationIssues: err.validationIssues.slice(0, 5),
        debugArtifactPath: err.debugArtifactPath,
        model: err.model,
        promptVersion: err.promptVersion,
        schemaVersion: err.schemaVersion,
        responseFormatMode: err.responseFormatMode,
      };
    }
    return undefined;
  }

  async function callOllamaOrRuleBasedFallback(reason: string): Promise<unknown> {
    if (hasOllama) {
      const from = provider.name;
      providerFallbacks.push({ from, to: "ollama", reason });
      provider = new OllamaPaperUnderstandingProvider(
        runtimeKeys?.ollamaBaseUrl,
        runtimeKeys?.ollamaModel,
      );
      try {
        return await callProvider(provider);
      } catch (ollamaErr) {
        providerFallbacks.push({
          from: "ollama",
          to: "rule_based",
          reason: ollamaErr instanceof Error ? ollamaErr.message : String(ollamaErr),
        });
        provider = new RuleBasedProvider();
        return callProvider(provider);
      }
    }
    return callRuleBasedFallback(reason);
  }

  // Call the provider, catching any thrown error.
  let providerOutput: unknown;
  try {
    providerOutput = await callProvider(provider);
  } catch (err) {
    const isAuto = preferred == null || preferred === "auto";
    if (isAuto && provider.name === "groq") {
      const reason = err instanceof Error ? err.message : String(err);
      try {
        const fallbackReason = err instanceof GroqBudgetError
          ? `Groq free-tier budget reached. ${reason}`
            : err instanceof GroqRateLimitError
            ? reason
            : err instanceof PaperUnderstandingValidationError
              ? `Groq failed schema validation; Auto fallback used Ollama/RuleBased.${err.debugArtifactPath ? ` Debug artifact: ${err.debugArtifactPath}.` : ""} ${err.validationIssues.slice(0, 5).join(" | ")}`
            : `Groq was unavailable or returned invalid output. ${reason}`;
        providerOutput = await callOllamaOrRuleBasedFallback(fallbackReason);
      } catch (fallbackErr) {
        // Log the full fallback chain so the earlier Groq error is not silently lost.
        if (providerFallbacks.length > 0) {
          logger.warn({ providerFallbacks }, "All auto-fallback providers failed; error chain:");
        }
        throw new ExtractionProviderError(
          `Auto fallback failed after Groq error: ${
            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
          }`,
          provider.name,
          providerErrorStatus(fallbackErr),
        );
      }
    } else if (isAuto && provider.name === "ollama") {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Ollama unavailable during auto extraction; falling back to RuleBasedProvider",
      );
      try {
        providerOutput = await callRuleBasedFallback(
          err instanceof Error ? err.message : String(err),
        );
      } catch (fallbackErr) {
        throw new ExtractionProviderError(
          `RuleBasedProvider failed during auto fallback: ${
            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
          }`,
          provider.name,
          providerErrorStatus(fallbackErr),
        );
      }
    } else {
      const message = providerErrorMessage(err);
      throw new ExtractionProviderError(
        err instanceof PaperUnderstandingValidationError ? message : `Provider threw: ${message}`,
        provider.name,
        providerErrorStatus(err),
        providerErrorDetails(err),
      );
    }
  }

  // Real providers return { raw, tokenMeta, providerModel, systemPrompt };
  // Local providers return the ExtractionResult directly.
  // Normalise to: candidate, tokenMeta, providerModel, capturedSystemPrompt.
  let candidate: unknown;
  let tokenMeta: Record<string, unknown> | null = null;
  let providerModelId = "";
  let capturedSystemPrompt = "";
  let rawProviderResponse: unknown = null;

  if (
    providerOutput !== null &&
    typeof providerOutput === "object" &&
    "raw" in providerOutput &&
    "tokenMeta" in providerOutput
  ) {
    const typed = providerOutput as {
      raw: unknown;
      tokenMeta: unknown;
      providerModel?: string;
      systemPrompt?: string;
      rawProviderResponse?: unknown;
    };
    candidate = typed.raw;
    rawProviderResponse = typed.rawProviderResponse ?? typed.raw;
    tokenMeta =
      typed.tokenMeta && typeof typed.tokenMeta === "object"
        ? (typed.tokenMeta as Record<string, unknown>)
        : null;
    providerModelId = typed.providerModel ?? "";
    capturedSystemPrompt = typed.systemPrompt ?? "";
  } else {
    // Local providers — return ExtractionResult directly, no API call made.
    candidate = providerOutput;
    rawProviderResponse = null;
    providerModelId = provider.name;
    capturedSystemPrompt = "";
  }

  // Log token / cost metadata when present. Never throw if absent.
  if (tokenMeta) {
    logger.info(
      { provider: provider.name, tokenMeta },
      "Provider token usage",
    );
  }

  // First validation attempt.
  let normalizedCandidate = normalizeCandidateModelType(candidate);
  let parsed = ExtractionResultSchema.safeParse(normalizedCandidate);
  let repairStatus: AuditData["repairStatus"] = "not_needed";
  let validationErrors: string | null = null;

  // If validation failed, attempt one JSON repair pass.
  if (!parsed.success) {
    const firstError = parsed.error.message;
    const repaired = tryRepairJson(candidate);
    if (repaired !== null && repaired !== candidate) {
      logger.warn(
        { provider: provider.name },
        "First parse failed — attempting JSON repair pass",
      );
      normalizedCandidate = normalizeCandidateModelType(repaired);
      parsed = ExtractionResultSchema.safeParse(normalizedCandidate);
      if (parsed.success) {
        repairStatus = "repaired";
      } else {
        repairStatus = "failed";
        validationErrors = `Before repair: ${firstError}\nAfter repair: ${parsed.error.message}`;
      }
    } else {
      repairStatus = "failed";
      validationErrors = firstError;
    }
  }

  if (!parsed.success) {
    throw new ExtractionProviderError(
      `Provider returned malformed extraction JSON: ${parsed.error.message}`,
      provider.name,
    );
  }

  const finalized = finalizeExtractionResult(parsed.data);

  if (finalized.warnings.length > 0) {
    logger.warn({ warnings: finalized.warnings, provider: provider.name }, "Extraction finalizer warnings");
  }

  // AUDIT-10: report chunk-budget truncation. If chunks exceeded the prompt
  // budget the user must see it — silent truncation has misled past extractions.
  let chunkTruncation: ChunkTruncationReport | null = null;
  if (hasDocumentChunks && documentChunks && documentChunks.length > 0) {
    const report = analyzeChunkTruncation(documentChunks, DEFAULT_MAX_TOTAL_CHARS);
    if (report.droppedChars > 0 || report.droppedChunks > 0) {
      chunkTruncation = report;
    }
  }

  // AUDIT-9: surface visual-content (figures/tables) warnings from chunks so
  // the audit panel says clearly that text-layer extraction may have missed
  // information that lives in figures or images.
  const sourceWarnings: string[] = [];
  if (hasDocumentChunks && documentChunks) {
    const chunksWithFigures = documentChunks.filter((chunk) => chunk.contains_figure_reference).length;
    const chunksWithTables = documentChunks.filter((chunk) => chunk.contains_table_like_text).length;
    if (chunksWithFigures > 0) {
      sourceWarnings.push(
        `Source PDF contains ${chunksWithFigures} chunk(s) with figure references. Text-layer extraction does not read figures or images; verify that critical information is not figure-only.`,
      );
    }
    if (chunksWithTables > 0) {
      sourceWarnings.push(
        `Source PDF contains ${chunksWithTables} chunk(s) with table-like content. Verify that columnar values were preserved by the text-layer parser.`,
      );
    }
  }
  if (chunkTruncation) {
    sourceWarnings.push(
      `Prompt chunk budget exceeded: ${chunkTruncation.droppedChars} char(s) across ${chunkTruncation.droppedChunks} chunk(s) were dropped from the AI prompt (budget=${chunkTruncation.budget}, total=${chunkTruncation.totalChars}). Extraction may be incomplete.`,
    );
  }

  // AUDIT-6: basic unit validation. Walk every parameter + state variable
  // unit against the curated allow-list; non-matches are surfaced as warnings
  // so users see "kJ/zeptosecond" instead of trusting it as valid.
  const unitFlaggedRows = [
    ...findUnitWarnings(
      finalized.result.parameters.map((p) => ({ symbol: p.symbol, unit: p.unit })),
    ),
    ...findUnitWarnings(
      finalized.result.state_variables.map((v) => ({ symbol: v.symbol, unit: v.unit })),
    ),
  ];
  const unitWarnings = unitFlaggedRows.map(
    (row) =>
      `Unrecognised unit '${row.unit}' on '${row.symbol}'. Treat as raw/unvalidated until confirmed against the source.`,
  );

  const auditTokenUsage =
    tokenMeta ||
    providerFallbacks.length > 0 ||
    finalized.warnings.length > 0 ||
    sourceWarnings.length > 0 ||
    chunkTruncation ||
    unitWarnings.length > 0
      ? {
          ...(tokenMeta ?? {}),
          ...(providerFallbacks.length > 0 ? { providerFallbacks } : {}),
          ...(finalized.warnings.length > 0
            ? { finalizerWarnings: finalized.warnings }
            : {}),
          ...(sourceWarnings.length > 0 ? { sourceWarnings } : {}),
          ...(chunkTruncation ? { chunkTruncation } : {}),
          ...(unitWarnings.length > 0 ? { unitWarnings } : {}),
        }
      : null;

  const audit: AuditData = {
    providerModel: providerModelId,
    systemPrompt: capturedSystemPrompt,
    promptTemplateSummary:
      providerFallbacks.length > 0
        ? `${promptTemplateSummary} Provider fallback: ${providerFallbacks
            .map((fallback) => `${fallback.from} -> ${fallback.to}: ${fallback.reason}`)
            .join(" | ")}`
        : promptTemplateSummary,
    rawProviderResponse,
    repairStatus,
    validationErrors,
    tokenUsage: auditTokenUsage,
  };

  return { result: finalized.result, providerName: provider.name, audit };
}

// ---------- DB mapping ----------

export type DbExtractionRow = {
  modelCardTitle: string;
  domain: string;
  systemDescription: string;
  problemStatement: string;
  odeTemplate: string;
};

export type DbEquationRow = {
  ordinal: number;
  label: string;
  latex: string;
  plaintext: string;
  meaning: string;
  variablesInvolved: string[];
  equationType: ExtractedEquationType;
  confidence: "high" | "medium" | "low";
  description: string;
  sourceQuote: string;
};

export type DbVariableRow = {
  ordinal: number;
  symbol: string;
  name: string;
  meaning: string;
  unit: string;
  role: ExtractedRole;
  confidence: "high" | "medium" | "low";
  sourceQuote: string;
  originalValue?: Record<string, unknown> | null;
};

export type DbParameterRow = {
  ordinal: number;
  symbol: string;
  name: string;
  value: number;
  valueRaw: string;
  valueNumeric: number | null;
  unit: string;
  confidence: "high" | "medium" | "low";
  sourceQuote: string;
  originalValue?: Record<string, unknown> | null;
};

export type DbAssumptionRow = {
  ordinal: number;
  kind: "assumption" | "limitation";
  text: string;
  sourceQuote: string;
  confidence: "high" | "medium" | "low";
};

export type MappedExtraction = {
  extraction: DbExtractionRow;
  equations: DbEquationRow[];
  variables: DbVariableRow[];
  parameters: DbParameterRow[];
  assumptions: DbAssumptionRow[];
};

const NUMBER_RE = /-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/;
const UNKNOWN_PARAMETER_VALUE_RE =
  /^(?:unknown|not\s+specified|not\s+reported|n\.?d\.?|n\/a|na|none|null|missing|uncertain|\u2014|-|\?)$/i;

export function parseParameterValue(value: string): {
  raw: string;
  numeric: number | null;
  ok: boolean;
} {
  const trimmed = value.trim();
  if (trimmed === "" || UNKNOWN_PARAMETER_VALUE_RE.test(trimmed)) {
    return { raw: trimmed || "unknown", numeric: null, ok: false };
  }
  const direct = Number(trimmed);
  if (Number.isFinite(direct)) return { raw: trimmed, numeric: direct, ok: true };
  const m = trimmed.match(NUMBER_RE);
  if (m) {
    const n = Number(m[0]);
    if (Number.isFinite(n)) return { raw: trimmed, numeric: n, ok: true };
  }
  return { raw: trimmed, numeric: null, ok: false };
}

function inferEquationType(eq: ExtractedEquation): ExtractedEquationType {
  if (eq.equation_type && eq.equation_type !== "unknown") return eq.equation_type;
  const text = `${eq.equation_latex} ${eq.equation_plaintext}`;
  if (
    /(?:^|[^A-Za-z])d[A-Za-z][A-Za-z0-9_]*\s*\/\s*dt\s*=/.test(text) ||
    /\\frac\s*\{\s*d[A-Za-z][A-Za-z0-9_]*\s*\}\s*\{\s*dt\s*\}/.test(text)
  ) {
    return "dynamic_ode";
  }
  return eq.equation_type ?? "unknown";
}

function buildSystemDescription(r: ExtractionResult): string {
  const parts: string[] = [];
  if (r.process_description) parts.push(r.process_description);
  if (r.model_card.short_summary)
    parts.push(`\n\nSummary: ${r.model_card.short_summary}`);
  if (r.model_card.model_type)
    parts.push(`\nModel type: ${r.model_card.model_type}`);
  return parts.join("");
}

function buildProblemStatement(card: ExtractedModelCardMeta): string {
  const parts: string[] = [];
  if (card.outputs.length) parts.push(`Predict: ${card.outputs.join(", ")}.`);
  if (card.inputs.length)
    parts.push(`Given inputs: ${card.inputs.join(", ")}.`);
  if (card.control_variables.length)
    parts.push(`Control variables: ${card.control_variables.join(", ")}.`);
  if (card.missing_information.length)
    parts.push(
      `Missing information: ${card.missing_information.join("; ")}.`,
    );
  return parts.join(" ") || "—";
}

function buildOdeTemplate(r: ExtractionResult): string {
  if (!r.model_card.can_generate_ode_template) {
    return "# ODE template not available — provider reported can_generate_ode_template=false.\n";
  }
  const stateSyms = r.state_variables
    .filter((v) => v.role === "state")
    .map((v) => v.symbol);
  const paramAssignments = r.parameters
    .map((p) => {
      const { numeric, ok } = parseParameterValue(p.value);
      const note = ok ? "" : `  # NOTE: could not parse "${p.value}"`;
      return `    "${p.symbol}": ${ok ? numeric : "None"},  # ${p.unit || "—"}${note}`;
    })
    .join("\n");
  const initial = stateSyms.length
    ? stateSyms.map(() => "1.0").join(", ")
    : "1.0";

  return `# Generated ODE template — review and fill in any placeholders.
# State variables: ${stateSyms.join(", ") || "(none extracted)"}
# Solver: scipy.integrate.solve_ivp (RK45)

import numpy as np
from scipy.integrate import solve_ivp


PARAMS = {
${paramAssignments || "    # (no parameters extracted)"}
}


def rhs(t, y, p):
    """Right-hand side of the ODE system. Edit to match the extracted equations."""
    dydt = np.zeros_like(y)
    # TODO: implement equations using ${stateSyms.join(", ") || "the extracted states"}
    return dydt


def simulate(y0, t_span=(0.0, 100.0), n_points=200):
    sol = solve_ivp(
        fun=lambda t, y: rhs(t, y, PARAMS),
        t_span=t_span,
        y0=y0,
        t_eval=np.linspace(t_span[0], t_span[1], n_points),
        method="RK45",
    )
    return sol


if __name__ == "__main__":
    sol = simulate(y0=[${initial}])
    print(sol.t[:5], sol.y[:, :5])
`;
}

function formatEquationDescription(
  label: string,
  meaning: string,
  plaintext: string,
): string {
  const parts: string[] = [];
  if (label) parts.push(`[${label}]`);
  if (meaning) parts.push(meaning);
  if (plaintext && plaintext !== meaning) parts.push(`(${plaintext})`);
  return parts.join(" ");
}

function variableOriginalValue(variable: ExtractedStateVariable): Record<string, unknown> | null {
  if (!variable.initial_condition) return null;
  return {
    initial_condition: {
      kind: "initial_condition",
      ...variable.initial_condition,
    },
  };
}

function parameterOriginalValue(parameter: ExtractedParameter): Record<string, unknown> | null {
  if (parameter.status !== "initial_condition") return null;
  return {
    kind: "initial_condition",
    status: parameter.status,
    source_context: parameter.source_context,
  };
}

export function mapExtractionToDb(r: ExtractionResult): MappedExtraction {
  r = finalizeExtractionResult(r).result;
  const extraction: DbExtractionRow = {
    modelCardTitle: r.paper_title_or_topic,
    domain: r.system_type,
    systemDescription: buildSystemDescription(r),
    problemStatement: buildProblemStatement(r.model_card),
    odeTemplate: buildOdeTemplate(r),
  };

  const equations: DbEquationRow[] = r.equations.map((eq, i) => ({
    ordinal: i,
    label: eq.label,
    latex: eq.equation_latex,
    plaintext: eq.equation_plaintext,
    meaning: eq.meaning,
    variablesInvolved: eq.variables_involved,
    equationType: inferEquationType(eq),
    confidence: eq.confidence,
    description: formatEquationDescription(
      eq.label,
      eq.meaning,
      eq.equation_plaintext,
    ),
    sourceQuote: eq.source_context,
  }));

  const variables: DbVariableRow[] = r.state_variables.map((v, i) => ({
    ordinal: i,
    symbol: v.symbol,
    name: v.name,
    meaning: v.meaning,
    unit: v.unit,
    role: v.role,
    confidence: v.confidence,
    sourceQuote: v.source_context,
    originalValue: variableOriginalValue(v),
  }));

  const parameters: DbParameterRow[] = r.parameters.map((p, i) => {
    const { raw, numeric, ok } = parseParameterValue(p.value);
    return {
      ordinal: i,
      symbol: p.symbol,
      name: p.name,
      value: numeric ?? 0,
      valueRaw: raw,
      valueNumeric: numeric,
      unit: p.unit,
      confidence: ok ? p.confidence : "low",
      sourceQuote:
        (ok ? "" : `(value "${p.value}" could not be parsed numerically) `) +
        p.source_context,
      originalValue: parameterOriginalValue(p),
    };
  });

  const assumptions: DbAssumptionRow[] = [
    ...r.assumptions.map((a, i) => ({
      ordinal: i,
      kind: "assumption" as const,
      text: a.assumption,
      sourceQuote: a.source_context,
      confidence: a.confidence,
    })),
    ...r.limitations.map((l, i) => ({
      ordinal: i,
      kind: "limitation" as const,
      text: l.limitation,
      sourceQuote: l.source_context,
      confidence: l.confidence,
    })),
  ];

  return { extraction, equations, variables, parameters, assumptions };
}
