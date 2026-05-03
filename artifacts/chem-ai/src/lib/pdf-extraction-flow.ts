export const PDF_FALLBACK_MESSAGE =
  "This appears to be scanned/image-based. Paste text manually or use AI/OCR mode when configured.";

export type ParsedPdfForExtraction = {
  name: string;
  text: string;
  pageCount: number;
  charCount: number;
  wordCount: number;
  structuredDocument?: {
    title_guess: string;
    page_count: number;
    chunks: Array<{
      chunk_id: string;
      page_start: number;
      page_end: number;
      section_heading: string;
      text: string;
      char_count: number;
    }>;
    diagnostics: {
      text_quality: "good" | "low" | "fallback_required";
      warnings: string[];
    };
  };
};

export function buildParsedPdfSourcePayload(pdf: ParsedPdfForExtraction): {
  kind: "text";
  filename: string;
  content: string;
} {
  return {
    kind: "text",
    filename: pdf.name,
    content: pdf.text,
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
  return pdf.structuredDocument?.diagnostics.text_quality === "fallback_required";
}
