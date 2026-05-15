import { describe, expect, it } from "vitest";
import {
  SCANNED_PDF_MESSAGE,
  buildStructuredPdfDocument,
} from "../pdf-document";

describe("buildStructuredPdfDocument", () => {
  it("parses fake PDF text into pages, sections, and chunks", () => {
    const doc = buildStructuredPdfDocument({
      pageCount: 3,
      pageTexts: [
        [
          "Oxygen Balanced Mixotrophy in a Photobioreactor",
          "Abstract",
          "A mixotrophic photobioreactor procedure is summarized. ".repeat(35),
        ].join("\n"),
        [
          "Materials and Methods",
          "The reactor was operated with DO control and acetate feed. ".repeat(35),
        ].join("\n"),
        [
          "Results",
          "Productivity and yield calculations were reported separately. ".repeat(35),
        ].join("\n"),
      ],
    });

    expect(doc.title_guess).toBe("Oxygen Balanced Mixotrophy in a Photobioreactor");
    expect(doc.pages).toHaveLength(3);
    expect(doc.pages[1]).toMatchObject({
      page_number: 2,
      word_count: expect.any(Number),
      char_count: expect.any(Number),
      has_equation_like_text: false,
      has_table_like_text: false,
    });
    expect(doc.sections.map((section) => section.heading)).toEqual(
      expect.arrayContaining(["Abstract", "Materials and Methods", "Results"]),
    );
    expect(doc.chunks.length).toBeGreaterThan(0);
    expect(doc.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          page_start: 2,
          page_end: 2,
          section_heading: "Materials and Methods",
          contains_equation_like_text: false,
          contains_table_like_text: false,
        }),
      ]),
    );
  });

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
          "Experimental",
          "The dilution rate was varied.",
          "Photobioreactor setup",
          "The PBR was illuminated from one side.",
          "Calculations",
          "Productivity was calculated from biomass measurements.",
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
        "Experimental",
        "Photobioreactor setup",
        "Calculations",
        "Results",
      ]),
    );
  });

  it("detects equation-like, table-like, and figure-reference text", () => {
    const doc = buildStructuredPdfDocument({
      pageCount: 2,
      pageTexts: [
        [
          "Professor Test Paper",
          "Nomenclature",
          "D = 0.25 1/d",
          "PFD = 120 umol/m2/s",
          "kLa = 80 1/h",
          "Table 1 Operating values",
          "Symbol  Value  Unit",
          "V  1.8  L",
        ].join("\n"),
        [
          "Calculations",
          "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X.",
          "Productivity was calculated as P = (X2 - X1)/(t2 - t1).",
          "The reactor setup is depicted in Figure 2.",
        ].join("\n"),
      ],
    });

    expect(doc.pages[0]).toMatchObject({
      has_table_like_text: true,
    });
    expect(doc.pages[1]).toMatchObject({
      has_equation_like_text: true,
    });
    expect(doc.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section_heading: "Nomenclature",
          contains_table_like_text: true,
        }),
        expect.objectContaining({
          section_heading: "Calculations",
          contains_equation_like_text: true,
          contains_figure_reference: true,
        }),
      ]),
    );
    expect(doc.tables_or_value_blocks[0]).toMatchObject({
      page: 1,
      section_heading: "Nomenclature",
      extracted_rows: expect.arrayContaining([
        expect.objectContaining({
          symbol_or_item: "D",
          value: "0.25",
          unit: "1/d",
        }),
      ]),
    });
    expect(doc.diagnostics.warnings.join(" ")).toContain("Figure references detected");
    expect(doc.diagnostics.warnings.join(" ")).toContain("Equation/table-like text detected");
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

  it("marks very low text as failed with scanned-PDF warning", () => {
    const doc = buildStructuredPdfDocument({
      pageCount: 1,
      pageTexts: ["Figure only"],
    });

    expect(doc.diagnostics.text_quality).toBe("failed");
    expect(doc.diagnostics.fallback_required).toBe(true);
    expect(doc.diagnostics.message).toBe(SCANNED_PDF_MESSAGE);
    expect(doc.diagnostics.warnings).toContain(SCANNED_PDF_MESSAGE);
  });
});
