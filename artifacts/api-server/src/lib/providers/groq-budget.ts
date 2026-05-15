import { createHash } from "node:crypto";

import type { PaperUnderstandingDocumentChunk } from "../paper-understanding-prompt";

export const GROQ_PROFESSOR_PROMPT_VERSION = "groq-professor-v2";
export const GROQ_PAPER_SCHEMA_VERSION = "groq-paper-understanding-v2";
export const GROQ_PROMPT_VERSION = GROQ_PROFESSOR_PROMPT_VERSION;

const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export type GroqLimits = {
  rpm: number;
  rpd: number;
  tpm: number;
  tpd: number;
  maxInputTokensPerRequest: number;
  maxOutputTokensPerRequest: number;
  maxChunksPerExtraction: number;
  maxTokensPerExtraction: number;
  maxExtractionsPerDay: number;
  queueConcurrency: number;
};

export type GroqConfig = {
  apiKey?: string;
  model: string;
  freeTierMode: boolean;
  limits: GroqLimits;
};

export type GroqUsageToday = {
  requests: number;
  estimatedTokens: number;
  extractions: number;
};

export type GroqChunkSelection = {
  chunks: PaperUnderstandingDocumentChunk[];
  totalChunkCount: number;
  selectedChunkCount: number;
  skippedChunkCount: number;
  estimatedTextTokens: number;
  warnings: string[];
};

export type GroqBudgetReservation = {
  ok: true;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  estimatedTotalTokens: number;
  usageToday: GroqUsageToday;
} | {
  ok: false;
  reason: string;
  status: 413 | 429;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  estimatedTotalTokens: number;
  usageToday: GroqUsageToday;
};

export type GroqUsageCommit = {
  estimatedInputTokens: number;
  maxOutputTokens: number;
  requestCount?: number;
};

type GroqBudgetState = {
  minuteStartedAt: number;
  dayKey: string;
  requestsThisMinute: number;
  tokensThisMinute: number;
  requestsToday: number;
  tokensToday: number;
  extractionsToday: number;
};

type CachedGroqResult = {
  rawProviderResponse: string;
  responseFormatMode?: "json_schema" | "json_object";
  responseFormatWarnings?: string[];
  createdAt: number;
};

const groqCache = new Map<string, CachedGroqResult>();

let state: GroqBudgetState = {
  minuteStartedAt: Date.now(),
  dayKey: dayKey(),
  requestsThisMinute: 0,
  tokensThisMinute: 0,
  requestsToday: 0,
  tokensToday: 0,
  extractionsToday: 0,
};

export class GroqBudgetError extends Error {
  readonly status: 413 | 429;

  constructor(message: string, status: 413 | 429 = 413) {
    super(message);
    this.name = "GroqBudgetError";
    this.status = status;
  }
}

export class GroqRateLimitError extends Error {
  retryAfter?: string;

  constructor(message: string, retryAfter?: string) {
    super(message);
    this.name = "GroqRateLimitError";
    this.retryAfter = retryAfter;
  }
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function resetExpiredWindows(): void {
  const now = Date.now();
  if (now - state.minuteStartedAt >= 60_000) {
    state.minuteStartedAt = now;
    state.requestsThisMinute = 0;
    state.tokensThisMinute = 0;
  }

  const currentDay = dayKey();
  if (state.dayKey !== currentDay) {
    state.dayKey = currentDay;
    state.requestsToday = 0;
    state.tokensToday = 0;
    state.extractionsToday = 0;
  }
}

function parseIntegerEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

function parseBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export function getGroqConfig(apiKeyOverride?: string): GroqConfig {
  return {
    apiKey: apiKeyOverride ?? process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
    freeTierMode: parseBooleanEnv("GROQ_FREE_TIER_MODE", true),
    limits: {
      rpm: parseIntegerEnv("GROQ_RPM_LIMIT", 20),
      rpd: parseIntegerEnv("GROQ_RPD_LIMIT", 300),
      tpm: parseIntegerEnv("GROQ_TPM_LIMIT", 11_500),
      tpd: parseIntegerEnv("GROQ_TPD_LIMIT", 75_000),
      maxInputTokensPerRequest: parseIntegerEnv(
        "GROQ_MAX_INPUT_TOKENS_PER_REQUEST",
        7_000,
      ),
      maxOutputTokensPerRequest: parseIntegerEnv(
        "GROQ_MAX_OUTPUT_TOKENS_PER_REQUEST",
        800,
      ),
      maxChunksPerExtraction: parseIntegerEnv(
        "GROQ_MAX_CHUNKS_PER_EXTRACTION",
        3,
      ),
      maxTokensPerExtraction: parseIntegerEnv(
        "GROQ_MAX_TOKENS_PER_EXTRACTION",
        8_500,
      ),
      maxExtractionsPerDay: parseIntegerEnv(
        "GROQ_MAX_EXTRACTIONS_PER_DAY",
        3,
      ),
      queueConcurrency: parseIntegerEnv("GROQ_QUEUE_CONCURRENCY", 1),
    },
  };
}

export function estimateGroqTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function getEffectiveGroqInputBudget(limits: GroqLimits): number {
  return Math.max(
    0,
    Math.min(
      limits.maxInputTokensPerRequest,
      limits.tpm - limits.maxOutputTokensPerRequest - 500,
    ),
  );
}

function hasValuePattern(text: string): boolean {
  return /[A-Za-z][A-Za-z0-9_]*\s*=\s*[-+]?\d/.test(text)
    || /\b\d+(?:\.\d+)?\s*(?:1\/h|h\^-1|g\/L|mg\/L|mol\/L|mmol|C-?mol|L|mL|g\/g|gO2\/gX\/h)\b/i.test(text);
}

function rankChunk(chunk: PaperUnderstandingDocumentChunk): number {
  const heading = chunk.section_heading.toLowerCase();
  const text = chunk.text.toLowerCase();
  let score = 0;

  if (/materials|methods|experimental|analytical|reactor|photobioreactor|setup|operation/.test(heading)) score += 80;
  if (/nomenclature|table|parameter/.test(heading)) score += 70;
  if (/calculation|equation/.test(heading)) score += 65;
  if (/abstract/.test(heading) && /\b(model|process|chemostat|reactor|pbr|growth|kinetic|equation|parameter)\b/.test(text)) score += 25;
  if (/results/.test(heading) && (chunk.contains_equation_like_text || chunk.contains_table_like_text || hasValuePattern(chunk.text))) score += 20;
  if (/references|bibliography|acknowledg/.test(heading)) score -= 200;
  if (/introduction|background/.test(heading)) score -= 45;
  if (/discussion/.test(heading) && !chunk.contains_equation_like_text && !chunk.contains_table_like_text && !hasValuePattern(chunk.text)) score -= 45;

  if (chunk.contains_equation_like_text) score += 40;
  if (chunk.contains_table_like_text) score += 35;
  if (hasValuePattern(chunk.text)) score += 25;
  if (/\b(control|setpoint|set point|do|oxygen|o2|co2|acetate|feed|pfd|light|yield|productivity|stoichiometry|dilution|chemostat|batch|fed-batch|kLa|Henry)\b/i.test(chunk.text)) {
    score += 25;
  }
  if (chunk.contains_figure_reference && !chunk.contains_equation_like_text && !chunk.contains_table_like_text && !hasValuePattern(chunk.text)) {
    score -= 18;
  }

  if (text.length < 80) score -= 20;

  return score;
}

function isLowSignalExcluded(chunk: PaperUnderstandingDocumentChunk): boolean {
  const heading = chunk.section_heading.toLowerCase();
  const hasSignal =
    chunk.contains_equation_like_text ||
    chunk.contains_table_like_text ||
    hasValuePattern(chunk.text) ||
    /\b(control|setpoint|set point|do|oxygen|o2|co2|acetate|feed|pfd|light|yield|productivity|stoichiometry|dilution|chemostat|batch|fed-batch|kLa|Henry)\b/i.test(chunk.text);
  if (/references|bibliography|acknowledg/.test(heading)) return true;
  if (/introduction|background/.test(heading) && !hasSignal) return true;
  if (/discussion/.test(heading) && !hasSignal) return true;
  if (chunk.contains_figure_reference && !hasSignal) return true;
  return false;
}

export function scoreGroqChunk(chunk: PaperUnderstandingDocumentChunk): number {
  return rankChunk(chunk);
}

export function selectGroqChunks(
  documentChunks: PaperUnderstandingDocumentChunk[],
  limits: GroqLimits = getGroqConfig().limits,
): GroqChunkSelection {
  const candidates = documentChunks.filter((chunk) => !isLowSignalExcluded(chunk));
  const pool = candidates.length > 0 ? candidates : documentChunks;
  const ranked = pool
    .map((chunk, index) => ({ chunk, index, score: rankChunk(chunk) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked
    .slice(0, limits.maxChunksPerExtraction)
    .map((item) => item.chunk);
  const skippedChunkCount = Math.max(0, documentChunks.length - selected.length);
  const estimatedTextTokens = estimateGroqTokens(
    selected.map((chunk) => chunk.text).join("\n\n"),
  );
  const warnings =
    skippedChunkCount > 0
      ? [
          "Groq free-tier mode processed only the highest-signal chunks. Some paper content was skipped due to token limits.",
        ]
      : [];

  return {
    chunks: selected,
    totalChunkCount: documentChunks.length,
    selectedChunkCount: selected.length,
    skippedChunkCount,
    estimatedTextTokens,
    warnings,
  };
}

export function makeGroqCacheKey(
  chunks: PaperUnderstandingDocumentChunk[],
  model: string,
  promptVersion = GROQ_PROMPT_VERSION,
): string {
  const hash = createHash("sha256");
  hash.update(promptVersion);
  hash.update("\n");
  hash.update(model);
  hash.update("\n");
  for (const chunk of chunks) {
    hash.update(chunk.chunk_id);
    hash.update(String(chunk.page_start));
    hash.update(String(chunk.page_end));
    hash.update(chunk.section_heading);
    hash.update(chunk.text);
    hash.update("\n---\n");
  }
  return hash.digest("hex");
}

export function getGroqCachedResult(cacheKey: string): CachedGroqResult | null {
  return groqCache.get(cacheKey) ?? null;
}

export function setGroqCachedResult(cacheKey: string, rawProviderResponse: string): void {
  groqCache.set(cacheKey, { rawProviderResponse, createdAt: Date.now() });
}

export function setGroqCachedResultWithMeta(
  cacheKey: string,
  rawProviderResponse: string,
  meta: {
    responseFormatMode?: "json_schema" | "json_object";
    responseFormatWarnings?: string[];
  } = {},
): void {
  groqCache.set(cacheKey, {
    rawProviderResponse,
    responseFormatMode: meta.responseFormatMode,
    responseFormatWarnings: meta.responseFormatWarnings,
    createdAt: Date.now(),
  });
}

export function getGroqUsageToday(): GroqUsageToday {
  resetExpiredWindows();
  return {
    requests: state.requestsToday,
    estimatedTokens: state.tokensToday,
    extractions: state.extractionsToday,
  };
}

export function reserveGroqBudget(input: {
  estimatedInputTokens: number;
  maxOutputTokens: number;
  requestCount?: number;
  limits?: GroqLimits;
}): GroqBudgetReservation {
  resetExpiredWindows();
  const limits = input.limits ?? getGroqConfig().limits;
  const estimatedTotalTokens = input.estimatedInputTokens + input.maxOutputTokens;
  const requestCount = Math.max(1, input.requestCount ?? 1);
  const usageToday = getGroqUsageToday();
  const base = {
    estimatedInputTokens: input.estimatedInputTokens,
    maxOutputTokens: input.maxOutputTokens,
    estimatedTotalTokens,
    usageToday,
  };

  if (input.estimatedInputTokens > limits.maxInputTokensPerRequest) {
    return {
      ok: false,
      reason: `Groq input estimate ${input.estimatedInputTokens} tokens exceeds GROQ_MAX_INPUT_TOKENS_PER_REQUEST=${limits.maxInputTokensPerRequest}.`,
      status: 413,
      ...base,
    };
  }

  if (input.maxOutputTokens > limits.maxOutputTokensPerRequest) {
    return {
      ok: false,
      reason: `Groq output cap ${input.maxOutputTokens} tokens exceeds GROQ_MAX_OUTPUT_TOKENS_PER_REQUEST=${limits.maxOutputTokensPerRequest}.`,
      status: 413,
      ...base,
    };
  }

  if (estimatedTotalTokens > limits.maxTokensPerExtraction) {
    return {
      ok: false,
      reason: `Groq extraction estimate ${estimatedTotalTokens} tokens exceeds GROQ_MAX_TOKENS_PER_EXTRACTION=${limits.maxTokensPerExtraction}.`,
      status: 413,
      ...base,
    };
  }

  if (state.extractionsToday + 1 > limits.maxExtractionsPerDay) {
    return {
      ok: false,
      reason: `Local Groq budget cap: daily successful extraction limit reached (${limits.maxExtractionsPerDay}). Restart the API server in development to reset in-memory counters.`,
      status: 429,
      ...base,
    };
  }

  if (state.requestsThisMinute + requestCount > limits.rpm) {
    return {
      ok: false,
      reason: `Local Groq budget cap: RPM budget reached (${limits.rpm}/minute).`,
      status: 429,
      ...base,
    };
  }

  if (state.requestsToday + requestCount > limits.rpd) {
    return {
      ok: false,
      reason: `Local Groq budget cap: RPD budget reached (${limits.rpd}/day).`,
      status: 429,
      ...base,
    };
  }

  if (state.tokensThisMinute + estimatedTotalTokens * requestCount > limits.tpm) {
    return {
      ok: false,
      reason: `Local Groq budget cap: TPM budget would be exceeded (${limits.tpm}/minute).`,
      status: 429,
      ...base,
    };
  }

  if (state.tokensToday + estimatedTotalTokens * requestCount > limits.tpd) {
    return {
      ok: false,
      reason: `Local Groq budget cap: TPD budget would be exceeded (${limits.tpd}/day).`,
      status: 429,
      ...base,
    };
  }

  return {
    ok: true,
    ...base,
    usageToday: getGroqUsageToday(),
  };
}

export function recordGroqRequestUsage(input: GroqUsageCommit): void {
  resetExpiredWindows();
  const requestCount = Math.max(1, input.requestCount ?? 1);
  const estimatedTotalTokens = input.estimatedInputTokens + input.maxOutputTokens;
  state.requestsThisMinute += requestCount;
  state.tokensThisMinute += estimatedTotalTokens * requestCount;
  state.requestsToday += requestCount;
  state.tokensToday += estimatedTotalTokens * requestCount;
}

export function recordGroqExtractionSuccess(): void {
  resetExpiredWindows();
  state.extractionsToday += 1;
}

export function getGroqBudgetStatus(apiKeyOverride?: string) {
  const config = getGroqConfig(apiKeyOverride);
  return {
    available: Boolean(config.apiKey),
    reason: config.apiKey ? "GROQ_API_KEY configured" : "GROQ_API_KEY missing",
    model: config.model,
    freeTierMode: config.freeTierMode,
    limits: {
      rpm: config.limits.rpm,
      rpd: config.limits.rpd,
      tpm: config.limits.tpm,
      tpd: config.limits.tpd,
      maxChunksPerExtraction: config.limits.maxChunksPerExtraction,
      maxTokensPerExtraction: config.limits.maxTokensPerExtraction,
      maxExtractionsPerDay: config.limits.maxExtractionsPerDay,
      maxInputTokensPerRequest: config.limits.maxInputTokensPerRequest,
      maxOutputTokensPerRequest: config.limits.maxOutputTokensPerRequest,
    },
    usageToday: getGroqUsageToday(),
  };
}

export function resetGroqBudgetForTests(): void {
  state = {
    minuteStartedAt: Date.now(),
    dayKey: dayKey(),
    requestsThisMinute: 0,
    tokensThisMinute: 0,
    requestsToday: 0,
    tokensToday: 0,
    extractionsToday: 0,
  };
  groqCache.clear();
}
