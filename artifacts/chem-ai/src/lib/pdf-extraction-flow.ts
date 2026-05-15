export const PDF_FALLBACK_MESSAGE =
  "This appears scanned/image-based. Paste text manually or use OCR/vision mode later.";

export type ParsedPdfForExtraction = {
  name: string;
  text: string;
  pageCount: number;
  charCount: number;
  wordCount: number;
  structuredDocument?: {
    title_guess: string;
    page_count: number;
    pages?: Array<{
      page_number: number;
      text: string;
      char_count: number;
      word_count: number;
      has_equation_like_text?: boolean;
      has_table_like_text?: boolean;
    }>;
    sections?: Array<{
      heading: string;
      page_start: number;
      page_end: number;
      text: string;
    }>;
    chunks: Array<{
      chunk_id: string;
      page_start: number;
      page_end: number;
      section_heading: string;
      text: string;
      char_count: number;
      contains_equation_like_text?: boolean;
      contains_table_like_text?: boolean;
      contains_figure_reference?: boolean;
    }>;
    tables_or_value_blocks?: Array<{
      page: number;
      section_heading: string;
      caption_or_context: string;
      raw_text: string;
      extracted_rows: Array<{
        symbol_or_item: string;
        value: string;
        unit: string;
        meaning: string;
        confidence: "high" | "medium" | "low";
        source_quote: string;
      }>;
      confidence: "high" | "medium" | "low";
    }>;
    diagnostics: {
      text_quality: "good" | "low" | "low_text" | "failed" | "fallback_required";
      fallback_required?: boolean;
      message?: string | null;
      warnings: string[];
    };
  };
};

export function buildParsedPdfSourcePayload(pdf: ParsedPdfForExtraction): {
  kind: "pdf";
  filename: string;
  content: string;
  structuredDocument: ParsedPdfForExtraction["structuredDocument"] | null;
} {
  return {
    kind: "pdf",
    filename: pdf.name,
    content: pdf.text,
    structuredDocument: pdf.structuredDocument ?? null,
  };
}

export function buildTextSourcePayload(
  content: string,
  filename: string | null = null,
): {
  kind: "text";
  filename: string | null;
  content: string;
} {
  return {
    kind: "text",
    filename,
    content,
  };
}

export function parsedPdfNeedsFallback(pdf: ParsedPdfForExtraction): boolean {
  const diagnostics = pdf.structuredDocument?.diagnostics;
  return (
    diagnostics?.fallback_required === true ||
    diagnostics?.text_quality === "failed" ||
    diagnostics?.text_quality === "fallback_required"
  );
}
