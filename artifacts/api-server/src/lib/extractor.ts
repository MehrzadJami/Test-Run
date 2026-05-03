// Extraction engine.
//
// Provider abstraction:
//   Providers include real AI providers (OpenAI, Gemini, Ollama), a local
//   RuleBasedProvider, and MockProvider (deterministic demo fallback). The
//   active provider is selected by getActiveProvider() based on the caller's
//   preference and which provider configuration is present. Keys are NEVER
//   hardcoded.
//
// Provider priority (getActiveProvider):
//   1. If the caller requests a specific named provider AND its key exists → use it.
//   2. If the caller requests "mock" → always use MockProvider (no key needed).
//   3. Otherwise (auto or requested provider not available) →
//      OpenAI → Gemini → Ollama → RuleBasedProvider → Mock.
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
  type ExtractedModelCardMeta,
} from "./extraction-schema";
import { OpenAIProvider } from "./providers/openai-provider";
import { GeminiProvider } from "./providers/gemini-provider";
import { OllamaPaperUnderstandingProvider } from "./providers/ollama-paper-understanding-provider";
import { RuleBasedProvider } from "./providers/rule-based-provider";
import { EXTRACTION_SYSTEM_PROMPT, buildUserMessage } from "./providers/prompt";
import { logger } from "./logger";

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
  readonly status = 502 as const;
  constructor(
    message: string,
    readonly providerName: string,
  ) {
    super(message);
    this.name = "ExtractionProviderError";
  }
}

// ---------- Provider interface ----------

export type ProviderName = "mock" | "openai" | "gemini" | "ollama" | "rule_based";
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
}

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

  // 3. Slice from first `{` to last `}` — handles leading/trailing prose.
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      /* fall through */
    }
  }

  return null;
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
 *  - "ollama"     → OllamaPaperUnderstandingProvider using configured/default local Ollama
 *  - "auto" / undefined → OpenAI → Gemini → Ollama → RuleBasedProvider → Mock
 */
export function getActiveProvider(
  preferred?: ProviderPreference,
  runtimeKeys?: {
    openaiApiKey?: string;
    geminiApiKey?: string;
    ollamaBaseUrl?: string;
    ollamaModel?: string;
  },
): ExtractionProvider {
  const hasOpenAI = !!(runtimeKeys?.openaiApiKey || process.env["OPENAI_API_KEY"]);
  const hasGemini = !!(runtimeKeys?.geminiApiKey || process.env["GEMINI_API_KEY"]);
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
  if (hasOllama)
    return new OllamaPaperUnderstandingProvider(
      runtimeKeys?.ollamaBaseUrl,
      runtimeKeys?.ollamaModel,
    );
  try {
    return new RuleBasedProvider();
  } catch {
    return new MockProvider();
  }
}

// ---------- Public entry point ----------

export const MIN_SOURCE_CHARS = 30;

export async function runExtraction(
  sourceText: string,
  preferred?: ProviderPreference,
  runtimeKeys?: {
    openaiApiKey?: string;
    geminiApiKey?: string;
    ollamaBaseUrl?: string;
    ollamaModel?: string;
  },
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
  if (preferred === "openai" && !hasOpenAI) {
    throw new ExtractionProviderError(
      "OpenAI provider selected but OPENAI_API_KEY is not configured.",
      "openai",
    );
  }
  if (preferred === "gemini" && !hasGemini) {
    throw new ExtractionProviderError(
      "Gemini provider selected but GEMINI_API_KEY is not configured.",
      "gemini",
    );
  }

  let provider = getActiveProvider(preferred, runtimeKeys);

  // Call the provider, catching any thrown error.
  let providerOutput: unknown;
  try {
    providerOutput = await provider.extract(trimmed);
  } catch (err) {
    if ((preferred == null || preferred === "auto") && provider.name === "ollama") {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Ollama unavailable during auto extraction; falling back to RuleBasedProvider",
      );
      try {
        provider = new RuleBasedProvider();
        providerOutput = await provider.extract(trimmed);
      } catch (fallbackErr) {
        logger.warn(
          {
            err:
              fallbackErr instanceof Error
                ? fallbackErr.message
                : String(fallbackErr),
          },
          "RuleBasedProvider failed during auto extraction; falling back to MockProvider",
        );
        provider = new MockProvider();
        providerOutput = await provider.extract(trimmed);
      }
    } else {
      throw new ExtractionProviderError(
        `Provider threw: ${err instanceof Error ? err.message : String(err)}`,
        provider.name,
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
  let parsed = ExtractionResultSchema.safeParse(candidate);
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
      parsed = ExtractionResultSchema.safeParse(repaired);
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

  const audit: AuditData = {
    providerModel: providerModelId,
    systemPrompt: capturedSystemPrompt,
    promptTemplateSummary: PROMPT_TEMPLATE_SUMMARY,
    rawProviderResponse,
    repairStatus,
    validationErrors,
    tokenUsage: tokenMeta,
  };

  return { result: parsed.data, providerName: provider.name, audit };
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
  role: "state" | "input" | "output";
  confidence: "high" | "medium" | "low";
  sourceQuote: string;
};

export type DbParameterRow = {
  ordinal: number;
  symbol: string;
  name: string;
  value: number;
  unit: string;
  confidence: "high" | "medium" | "low";
  sourceQuote: string;
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

function parseNumeric(value: string): { num: number; ok: boolean } {
  const trimmed = value.trim();
  const direct = Number(trimmed);
  if (Number.isFinite(direct)) return { num: direct, ok: true };
  const m = trimmed.match(NUMBER_RE);
  if (m) {
    const n = Number(m[0]);
    if (Number.isFinite(n)) return { num: n, ok: true };
  }
  return { num: 0, ok: false };
}

/** Reduce the rich provider-side role enum to the simplified DB enum. */
function downgradeRole(role: string): "state" | "input" | "output" {
  if (role === "state" || role === "input" || role === "output") return role;
  return "input";
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
      const { num, ok } = parseNumeric(p.value);
      const note = ok ? "" : `  # NOTE: could not parse "${p.value}"`;
      return `    "${p.symbol}": ${ok ? num : 0.0},  # ${p.unit || "—"}${note}`;
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

export function mapExtractionToDb(r: ExtractionResult): MappedExtraction {
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
    role: downgradeRole(v.role),
    confidence: v.confidence,
    sourceQuote: v.source_context,
  }));

  const parameters: DbParameterRow[] = r.parameters.map((p, i) => {
    const { num, ok } = parseNumeric(p.value);
    return {
      ordinal: i,
      symbol: p.symbol,
      name: p.name,
      value: num,
      unit: p.unit,
      confidence: ok ? p.confidence : "low",
      sourceQuote:
        (ok ? "" : `(value "${p.value}" could not be parsed numerically) `) +
        p.source_context,
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
