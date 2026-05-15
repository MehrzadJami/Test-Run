import { describe, expect, it, afterEach } from "vitest";

import {
  estimateGroqTokens,
  getEffectiveGroqInputBudget,
  getGroqBudgetStatus,
  resetGroqBudgetForTests,
  reserveGroqBudget,
  selectGroqChunks,
} from "../providers/groq-budget";
import { getProviderStatus } from "../provider-status";

afterEach(() => {
  resetGroqBudgetForTests();
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_MAX_INPUT_TOKENS_PER_REQUEST;
});

describe("Groq free-tier budget and chunk selection", () => {
  it("estimates tokens conservatively from text length", () => {
    expect(estimateGroqTokens("123456789")).toBe(3);
  });

  it("ranks equation/table/method chunks before references", () => {
    const selection = selectGroqChunks(
      [
        {
          chunk_id: "ref",
          page_start: 9,
          page_end: 9,
          section_heading: "References",
          text: "References and citations.",
          contains_figure_reference: true,
        },
        {
          chunk_id: "methods",
          page_start: 3,
          page_end: 3,
          section_heading: "Materials and Methods",
          text: "The balance is dX/dt = (mu - D)*X and D = 0.1 1/h.",
          contains_equation_like_text: true,
          contains_table_like_text: true,
        },
      ],
      {
        rpm: 20,
        rpd: 300,
        tpm: 9000,
        tpd: 75000,
        maxInputTokensPerRequest: 6000,
        maxOutputTokensPerRequest: 1200,
        maxChunksPerExtraction: 2,
        maxTokensPerExtraction: 25000,
        maxExtractionsPerDay: 3,
        queueConcurrency: 1,
      },
    );

    expect(selection.chunks.map((chunk) => chunk.chunk_id)).toEqual(["methods"]);
  });

  it("adds a warning when chunks are skipped", () => {
    const selection = selectGroqChunks(
      Array.from({ length: 3 }, (_, index) => ({
        chunk_id: `chunk_${index}`,
        page_start: index + 1,
        page_end: index + 1,
        section_heading: index === 0 ? "Methods" : "References",
        text: index === 0 ? "D = 0.1 1/h" : "Reference text",
        contains_equation_like_text: index === 0,
      })),
      {
        rpm: 20,
        rpd: 300,
        tpm: 9000,
        tpd: 75000,
        maxInputTokensPerRequest: 6000,
        maxOutputTokensPerRequest: 1200,
        maxChunksPerExtraction: 1,
        maxTokensPerExtraction: 25000,
        maxExtractionsPerDay: 3,
        queueConcurrency: 1,
      },
    );

    expect(selection.selectedChunkCount).toBe(1);
    expect(selection.skippedChunkCount).toBe(2);
    expect(selection.warnings[0]).toMatch(/highest-signal chunks/i);
  });

  it("blocks oversized requests before a network call", () => {
    const reservation = reserveGroqBudget({
      estimatedInputTokens: 6001,
      maxOutputTokens: 1200,
      limits: {
        rpm: 20,
        rpd: 300,
        tpm: 9000,
        tpd: 75000,
        maxInputTokensPerRequest: 6000,
        maxOutputTokensPerRequest: 1200,
        maxChunksPerExtraction: 8,
        maxTokensPerExtraction: 25000,
        maxExtractionsPerDay: 3,
        queueConcurrency: 1,
      },
    });

    expect(reservation.ok).toBe(false);
    if (!reservation.ok) {
      expect(reservation.reason).toMatch(/GROQ_MAX_INPUT_TOKENS_PER_REQUEST/);
    }
  });

  it("reports Groq status without exposing the API key", () => {
    process.env.GROQ_API_KEY = "gsk-secret";
    const status = getProviderStatus();

    expect(status.groq.available).toBe(true);
    expect(status.groq.reason).toBe("GROQ_API_KEY configured");
    expect(JSON.stringify(status)).not.toContain("gsk-secret");
    expect(status.groq.freeTierMode).toBe(true);
    expect(status.groq.limits.maxChunksPerExtraction).toBe(3);
  });

  it("reports missing Groq key as unavailable", () => {
    const status = getGroqBudgetStatus();

    expect(status.available).toBe(false);
    expect(status.reason).toBe("GROQ_API_KEY missing");
  });

  it("computes an effective input budget below TPM after output and safety margin", () => {
    expect(
      getEffectiveGroqInputBudget({
        rpm: 20,
        rpd: 300,
        tpm: 11_500,
        tpd: 75_000,
        maxInputTokensPerRequest: 7_000,
        maxOutputTokensPerRequest: 800,
        maxChunksPerExtraction: 3,
        maxTokensPerExtraction: 8_500,
        maxExtractionsPerDay: 3,
        queueConcurrency: 1,
      }),
    ).toBe(7_000);
    expect(
      getEffectiveGroqInputBudget({
        rpm: 20,
        rpd: 300,
        tpm: 6_000,
        tpd: 75_000,
        maxInputTokensPerRequest: 7_000,
        maxOutputTokensPerRequest: 800,
        maxChunksPerExtraction: 3,
        maxTokensPerExtraction: 8_500,
        maxExtractionsPerDay: 3,
        queueConcurrency: 1,
      }),
    ).toBe(4_700);
  });
});
