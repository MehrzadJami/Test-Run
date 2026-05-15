import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod/v4";

import { ExtractionResultSchema, type ExtractionResult } from "../extraction-schema";
import { mapPaperUnderstandingToExtractionResult } from "../paper-understanding-mapper";
import { PaperUnderstandingSchema } from "../paper-understanding-schema";
import { normalizePaperUnderstandingCandidate } from "../paper-understanding-normalizer";
import {
  GroqPaperUnderstandingSchema,
  mapGroqPaperUnderstandingToPaperUnderstanding,
} from "./groq-paper-understanding-schema";

type ValidationDebugChunk = {
  chunk_id: string;
  page_start: number;
  page_end: number;
  section_heading: string;
};

export type PaperUnderstandingParseContext = {
  provider?: string;
  model?: string;
  promptVersion?: string;
  schemaVersion?: string;
  responseFormatMode?: string;
  selectedChunks?: ValidationDebugChunk[];
};

export class PaperUnderstandingValidationError extends Error {
  readonly normalizationApplied: boolean;
  readonly normalizationWarnings: string[];
  readonly validationIssues: string[];
  readonly debugArtifactPath?: string;
  readonly validationStage: string;
  readonly repairedJson: unknown;
  readonly normalizedJson: unknown;
  readonly rawResponseSnippet: string;
  readonly provider?: string;
  readonly model?: string;
  readonly promptVersion?: string;
  readonly schemaVersion?: string;
  readonly responseFormatMode?: string;

  constructor(
    message: string,
    options: {
      normalizationApplied: boolean;
      normalizationWarnings: string[];
      validationIssues: string[];
      validationStage: string;
      repairedJson: unknown;
      normalizedJson: unknown;
      rawResponseSnippet: string;
      debugArtifactPath?: string;
      context?: PaperUnderstandingParseContext;
    },
  ) {
    super(message);
    this.name = "PaperUnderstandingValidationError";
    this.normalizationApplied = options.normalizationApplied;
    this.normalizationWarnings = options.normalizationWarnings;
    this.validationIssues = options.validationIssues;
    this.validationStage = options.validationStage;
    this.repairedJson = options.repairedJson;
    this.normalizedJson = options.normalizedJson;
    this.rawResponseSnippet = options.rawResponseSnippet;
    this.debugArtifactPath = options.debugArtifactPath;
    this.provider = options.context?.provider;
    this.model = options.context?.model;
    this.promptVersion = options.context?.promptVersion;
    this.schemaVersion = options.context?.schemaVersion;
    this.responseFormatMode = options.context?.responseFormatMode;
  }
}

function tryRepairJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;

  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }

  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      /* fall through */
    }
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      /* fall through */
    }
  }

  return null;
}

function validationIssues(error: z.ZodError): string[] {
  return error.issues
    .slice(0, 20)
    .map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${pathLabel}: ${issue.message}`;
    });
}

function rawSnippet(content: string): string {
  return content.slice(0, 4_000);
}

function shouldWriteDebugArtifact(context?: PaperUnderstandingParseContext): boolean {
  return context?.provider === "groq" && process.env.NODE_ENV !== "production";
}

function writeValidationDebugArtifact(input: {
  context?: PaperUnderstandingParseContext;
  validationStage: string;
  validationIssues: string[];
  repairedJson: unknown;
  normalizedJson: unknown;
  rawResponseSnippet: string;
}): string | undefined {
  if (!shouldWriteDebugArtifact(input.context)) return undefined;
  const dir = path.resolve(process.cwd(), process.env.GROQ_DEBUG_DIR || "logs");
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(
    dir,
    `groq-validation-failure-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        provider: input.context?.provider ?? "groq",
        model: input.context?.model ?? "",
        promptVersion: input.context?.promptVersion ?? "",
        schemaVersion: input.context?.schemaVersion ?? "",
        responseFormatMode: input.context?.responseFormatMode ?? "",
        selectedChunks: input.context?.selectedChunks ?? [],
        validationStage: input.validationStage,
        validationIssues: input.validationIssues,
        repairedJson: input.repairedJson,
        normalizedJson: input.normalizedJson,
        rawResponseSnippet: input.rawResponseSnippet,
      },
      null,
      2,
    ),
  );
  return filePath;
}

function makeValidationError(input: {
  content: string;
  context?: PaperUnderstandingParseContext;
  validationStage: string;
  zodError: z.ZodError;
  repairedJson: unknown;
  normalizedJson: unknown;
  normalizationApplied: boolean;
  normalizationWarnings: string[];
}): PaperUnderstandingValidationError {
  const issues = validationIssues(input.zodError);
  const snippet = rawSnippet(input.content);
  const debugArtifactPath = writeValidationDebugArtifact({
    context: input.context,
    validationStage: input.validationStage,
    validationIssues: issues,
    repairedJson: input.repairedJson,
    normalizedJson: input.normalizedJson,
    rawResponseSnippet: snippet,
  });
  return new PaperUnderstandingValidationError(
    `Provider returned malformed PaperUnderstanding JSON: ${input.zodError.message}`,
    {
      normalizationApplied: input.normalizationApplied,
      normalizationWarnings: input.normalizationWarnings,
      validationIssues: issues,
      validationStage: input.validationStage,
      repairedJson: input.repairedJson,
      normalizedJson: input.normalizedJson,
      rawResponseSnippet: snippet,
      debugArtifactPath,
      context: input.context,
    },
  );
}

export function parsePaperUnderstandingResponse(
  content: string,
  context?: PaperUnderstandingParseContext,
): {
  raw: ExtractionResult;
  rawProviderResponse: unknown;
  normalizationApplied: boolean;
  normalizationWarnings: string[];
} {
  const candidate = tryRepairJson(content);
  const normalized = normalizePaperUnderstandingCandidate(candidate);
  const parsedGroqUnderstanding = GroqPaperUnderstandingSchema.safeParse(
    normalized.value,
  );
  if (!parsedGroqUnderstanding.success) {
    throw makeValidationError({
      content,
      context,
      validationStage: "groq_paper_understanding",
      zodError: parsedGroqUnderstanding.error,
      repairedJson: candidate,
      normalizedJson: normalized.value,
      normalizationApplied: normalized.applied,
      normalizationWarnings: normalized.warnings,
    });
  }

  let paperUnderstandingCandidate: unknown;
  try {
    paperUnderstandingCandidate = mapGroqPaperUnderstandingToPaperUnderstanding(
      parsedGroqUnderstanding.data,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw makeValidationError({
        content,
        context,
        validationStage: "paper_understanding",
        zodError: error,
        repairedJson: candidate,
        normalizedJson: parsedGroqUnderstanding.data,
        normalizationApplied: normalized.applied,
        normalizationWarnings: normalized.warnings,
      });
    }
    throw error;
  }

  const parsedUnderstanding = PaperUnderstandingSchema.safeParse(
    paperUnderstandingCandidate,
  );
  if (!parsedUnderstanding.success) {
    throw makeValidationError({
      content,
      context,
      validationStage: "paper_understanding",
      zodError: parsedUnderstanding.error,
      repairedJson: candidate,
      normalizedJson: parsedGroqUnderstanding.data,
      normalizationApplied: normalized.applied,
      normalizationWarnings: normalized.warnings,
    });
  }

  const extractionResult = mapPaperUnderstandingToExtractionResult(
    parsedUnderstanding.data,
  );
  const parsedExtraction = ExtractionResultSchema.safeParse(extractionResult);
  if (!parsedExtraction.success) {
    throw makeValidationError({
      content,
      context,
      validationStage: "extraction_result",
      zodError: parsedExtraction.error,
      repairedJson: candidate,
      normalizedJson: parsedUnderstanding.data,
      normalizationApplied: normalized.applied,
      normalizationWarnings: normalized.warnings,
    });
  }

  return {
    raw: parsedExtraction.data,
    rawProviderResponse: candidate,
    normalizationApplied: normalized.applied,
    normalizationWarnings: normalized.warnings,
  };
}
