import OpenAI from "openai";
import type { ExtractionProvider, ProviderName } from "../extractor";
import { EXTRACTION_SYSTEM_PROMPT, buildUserMessage } from "./prompt";

// Singleton — one client per process lifetime; key read at call time, not module
// load time, so tests / env changes don't require a restart.
export interface OpenAITokenMeta {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
}

// GPT-4o pricing (May 2025): $5 / 1M input, $15 / 1M output.
// These are estimates only — actual billing is via OpenAI dashboard.
const INPUT_PRICE_PER_TOKEN = 5 / 1_000_000;
const OUTPUT_PRICE_PER_TOKEN = 15 / 1_000_000;

export class OpenAIProvider implements ExtractionProvider {
  readonly name: ProviderName = "openai";

  private readonly model: string;
  private readonly apiKey?: string;

  constructor(model = "gpt-4o", apiKey?: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async extract(sourceText: string): Promise<{
    raw: unknown;
    tokenMeta: OpenAITokenMeta | null;
    providerModel: string;
    systemPrompt: string;
  }> {
    const client = new OpenAI({
      apiKey: this.apiKey ?? process.env["OPENAI_API_KEY"],
    });

    const response = await client.chat.completions.create({
      model: this.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(sourceText) },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";

    let tokenMeta: OpenAITokenMeta | null = null;
    if (response.usage) {
      const pt = response.usage.prompt_tokens;
      const ct = response.usage.completion_tokens;
      tokenMeta = {
        promptTokens: pt,
        completionTokens: ct,
        totalTokens: response.usage.total_tokens,
        estimatedCostUsd:
          pt * INPUT_PRICE_PER_TOKEN + ct * OUTPUT_PRICE_PER_TOKEN,
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
      providerModel: this.model,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    };
  }
}
