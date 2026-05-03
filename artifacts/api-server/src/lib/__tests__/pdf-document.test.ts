import { describe, expect, it } from "vitest";
import {
  SCANNED_PDF_MESSAGE,
  buildStructuredPdfDocument,
} from "../pdf-document";

describe("buildStructuredPdfDocument", () => {
  it("detects common PDF section headings", () => {
    const doc = buildStructuredPdfDocument({
      pageCount: 2,
      pageTexts: [
        [
          "Bioreactor Oxygen Transfer Study",
          "Abstract",
          "This work studies oxygen transfer in an aerobic reactor.",
          "Introduction",
          "The introduction describes gas-liquid mass transfer.",
        ].join("\n"),
        [
          "Materials and Methods",
          "The reactor was operated with constant aeration.",
          "Results",
          "The measured kLa increased with agitation.",
        ].join("\n"),
      ],
    });

    expect(doc.sections.map((section) => section.heading)).toEqual(
      expect.arrayContaining([
        "Abstract",
        "Introduction",
        "Materials and Methods",
        "Results",
      ]),
    );
  });

  it("builds structured chunks with preserved page numbers", () => {
    const doc = buildStructuredPdfDocument({
      pageCount: 2,
      pageTexts: [
        [
          "Chemostat Model Paper",
          "Abstract",
          "Biomass and substrate balances are described. ".repeat(90),
        ].join("\n"),
        [
          "Additional abstract context continues on the next page. ".repeat(90),
          "Introduction",
          "The chemostat was operated at fixed dilution rate. ".repeat(90),
        ].join("\n"),
      ],
    });

    expect(doc.page_count).toBe(2);
    expect(doc.pages).toHaveLength(2);
    expect(doc.sections.find((section) => section.heading === "Abstract")).toMatchObject({
      page_start: 1,
      page_end: 2,
    });
    expect(doc.chunks.length).toBeGreaterThan(1);
    expect(doc.chunks.every((chunk) => chunk.page_start >= 1)).toBe(true);
    expect(doc.chunks.every((chunk) => chunk.page_end <= 2)).toBe(true);
    expect(doc.chunks.every((chunk) => chunk.char_count <= 3000)).toBe(true);
    expect(doc.chunks.some((chunk) => chunk.page_start === 2)).toBe(true);
  });

  it("marks very low text as fallback_required with scanned-PDF warning", () => {
    const doc = buildStructuredPdfDocument({
      pageCount: 1,
      pageTexts: ["Figure only"],
    });

    expect(doc.diagnostics.text_quality).toBe("fallback_required");
    expect(doc.diagnostics.warnings).toContain(SCANNED_PDF_MESSAGE);
  });
});
