import type { ExtractionProvider, ProviderName } from "../extractor";
import { ExtractionResultSchema, type ExtractionResult } from "../extraction-schema";
import { mapPaperUnderstandingToExtractionResult } from "../paper-understanding-mapper";
import {
  PaperUnderstandingSchema,
  type PaperUnderstanding,
} from "../paper-understanding-schema";
import {
  buildPaperUnderstandingPrompt,
  type PaperUnderstandingDocumentChunk,
} from "../paper-understanding-prompt";

type OllamaGenerateResponse = {
  response?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
};

export type OllamaPaperUnderstandingOutput = {
  raw: ExtractionResult;
  tokenMeta: Record<string, unknown> | null;
  providerModel: string;
  systemPrompt: string;
  paperUnderstanding: PaperUnderstanding;
  rawProviderResponse: unknown;
};

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3.1";

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

function chunkSourceText(sourceText: string): PaperUnderstandingDocumentChunk[] {
  const trimmed = sourceText.trim();
  return [
    {
      chunk_id: "source_001",
      page_start: 1,
      page_end: 1,
      section_heading: "Source Text",
      text: trimmed,
      char_count: trimmed.length,
    },
  ];
}

function ollamaUnavailableMessage(baseUrl: string): string {
  return `Ollama is unavailable at ${baseUrl}. Start Ollama with 'ollama serve' and pull/configure the model, or use Rule-based, OpenAI, Gemini, or Mock.`;
}

export class OllamaPaperUnderstandingProvider implements ExtractionProvider {
  readonly name: ProviderName = "ollama";
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl?: string, model?: string, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = (baseUrl ?? process.env["OLLAMA_BASE_URL"] ?? DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
    this.model = model ?? process.env["OLLAMA_MODEL"] ?? DEFAULT_OLLAMA_MODEL;
    this.fetchImpl = fetchImpl;
  }

  async extract(sourceText: string): Promise<OllamaPaperUnderstandingOutput> {
    return this.extractFromChunks(chunkSourceText(sourceText));
  }

  async extractFromChunks(
    documentChunks: PaperUnderstandingDocumentChunk[],
  ): Promise<OllamaPaperUnderstandingOutput> {
    const prompt = buildPaperUnderstandingPrompt(documentChunks);
    const combinedPrompt = `${prompt.systemPrompt}\n\n${prompt.userPrompt}\n\nReturn strict JSON only.`;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: combinedPrompt,
          stream: false,
          format: "json",
        }),
      });
    } catch (err) {
      throw new Error(
        `${ollamaUnavailableMessage(this.baseUrl)} ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (!res.ok) {
      throw new Error(`${ollamaUnavailableMessage(this.baseUrl)} HTTP ${res.status}`);
    }

    const data = (await res.json()) as OllamaGenerateResponse;
    const responseText = data.response ?? "";
    const candidate = tryRepairJson(responseText);
    const parsedUnderstanding = PaperUnderstandingSchema.safeParse(candidate);
    if (!parsedUnderstanding.success) {
      throw new Error(
        `Ollama returned malformed PaperUnderstanding JSON: ${parsedUnderstanding.error.message}`,
      );
    }

    const extractionResult =
      mapPaperUnderstandingToExtractionResult(parsedUnderstanding.data);
    const parsedExtraction = ExtractionResultSchema.safeParse(extractionResult);
    if (!parsedExtraction.success) {
      throw new Error(
        `Mapped Ollama paper understanding did not validate as ExtractionResult: ${parsedExtraction.error.message}`,
      );
    }

    return {
      raw: parsedExtraction.data,
      tokenMeta: {
        promptEvalCount: data.prompt_eval_count ?? null,
        evalCount: data.eval_count ?? null,
        totalDuration: data.total_duration ?? null,
      },
      providerModel: this.model,
      systemPrompt: prompt.systemPrompt,
      paperUnderstanding: parsedUnderstanding.data,
      rawProviderResponse: responseText,
    };
  }
}
