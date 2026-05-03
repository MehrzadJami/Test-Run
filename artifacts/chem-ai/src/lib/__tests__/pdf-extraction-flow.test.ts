import { describe, expect, it } from "vitest";
import {
  PDF_FALLBACK_MESSAGE,
  buildParsedPdfSourcePayload,
  buildTextSourcePayload,
  parsedPdfNeedsFallback,
  type ParsedPdfForExtraction,
} from "../pdf-extraction-flow";

function parsedPdf(
  overrides: Partial<ParsedPdfForExtraction> = {},
): ParsedPdfForExtraction {
  return {
    name: "paper.pdf",
    text: "dX/dt = (mu - D)*X",
    pageCount: 3,
    charCount: 21,
    wordCount: 4,
    ...overrides,
  };
}

describe("PDF extraction flow helpers", () => {
  it("stores parsed PDF text as a text source payload for extraction", () => {
    const payload = buildParsedPdfSourcePayload(parsedPdf());

    expect(payload).toEqual({
      kind: "text",
      filename: "paper.pdf",
      content: "dX/dt = (mu - D)*X",
    });
  });

  it("flags fallback-required structured PDF diagnostics", () => {
    const pdf = parsedPdf({
      structuredDocument: {
        title_guess: "Untitled PDF document",
        page_count: 1,
        chunks: [],
        diagnostics: {
          text_quality: "fallback_required",
          warnings: [PDF_FALLBACK_MESSAGE],
        },
      },
    });

    expect(parsedPdfNeedsFallback(pdf)).toBe(true);
  });

  it("keeps paste-text extraction as a text source payload", () => {
    expect(buildTextSourcePayload("mu = mumax*S/(Ks+S)")).toEqual({
      kind: "text",
      filename: null,
      content: "mu = mumax*S/(Ks+S)",
    });
  });

  it("does not flag normal parsed PDF text", () => {
    const pdf = parsedPdf({
      structuredDocument: {
        title_guess: "Chemostat paper",
        page_count: 2,
        chunks: [
          {
            chunk_id: "chunk_001",
            page_start: 1,
            page_end: 1,
            section_heading: "Abstract",
            text: "A chemostat model is described.",
            char_count: 31,
          },
        ],
        diagnostics: {
          text_quality: "good",
          warnings: [],
        },
      },
    });

    expect(parsedPdfNeedsFallback(pdf)).toBe(false);
  });
});
