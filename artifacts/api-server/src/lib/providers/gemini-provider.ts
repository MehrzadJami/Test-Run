import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import type { ExtractionProvider, ProviderName } from "../extractor";
import { EXTRACTION_SYSTEM_PROMPT, buildUserMessage } from "./prompt";

export interface GeminiTokenMeta {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
}

const GENERATION_CONFIG: GenerationConfig = {
  temperature: 0.1,
  responseMimeType: "application/json",
};

export class GeminiProvider implements ExtractionProvider {
  readonly name: ProviderName = "gemini";

  private readonly modelName: string;
  private readonly apiKey?: string;

  constructor(modelName = "gemini-1.5-flash", apiKey?: string) {
    this.modelName = modelName;
    this.apiKey = apiKey;
  }

  async extract(sourceText: string): Promise<{
    raw: unknown;
    tokenMeta: GeminiTokenMeta | null;
    providerModel: string;
    systemPrompt: string;
  }> {
    const client = new GoogleGenerativeAI(
      this.apiKey ?? process.env["GEMINI_API_KEY"] ?? "",
    );
    const model = client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
      generationConfig: GENERATION_CONFIG,
    });

    const result = await model.generateContent(buildUserMessage(sourceText));
    const response = result.response;
    const content = response.text();

    let tokenMeta: GeminiTokenMeta | null = null;
    const usage = response.usageMetadata;
    if (usage) {
      tokenMeta = {
        promptTokens: usage.promptTokenCount ?? 0,
        candidateTokens: usage.candidatesTokenCount ?? 0,
        totalTokens: usage.totalTokenCount ?? 0,
      };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      raw = content;
    }

    return {
      raw,
      tokenMeta,
      // M17: expose model ID and system prompt for audit trail.
      // systemPrompt contains only instructional text — NO API keys.
      providerModel: this.modelName,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    };
  }
}
