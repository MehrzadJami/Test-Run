import type { ExtractionProvider, ProviderName } from "../extractor";
import { EXTRACTION_SYSTEM_PROMPT, buildUserMessage } from "./prompt";

export class OllamaProvider implements ExtractionProvider {
  readonly name: ProviderName = "ollama";
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(baseUrl?: string, model?: string) {
    this.baseUrl = (baseUrl ?? process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = model ?? process.env["OLLAMA_MODEL"] ?? "llama3.1:8b";
  }

  async extract(sourceText: string): Promise<{
    raw: unknown;
    tokenMeta: null;
    providerModel: string;
    systemPrompt: string;
  }> {
    const prompt = `${EXTRACTION_SYSTEM_PROMPT}\n\n${buildUserMessage(sourceText)}\n\nReturn strict JSON only.`;
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt, stream: false }),
    });

    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.status}`);
    }

    const data = (await res.json()) as { response?: string };
    const text = data.response ?? "";
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      raw = text;
    }

    return {
      raw,
      tokenMeta: null,
      providerModel: this.model,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    };
  }
}
