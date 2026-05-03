export type PdfTextQuality = "good" | "low" | "fallback_required";

export type StructuredPdfPage = {
  page_number: number;
  text: string;
  char_count: number;
  word_count: number;
};

export type StructuredPdfSection = {
  heading: string;
  page_start: number;
  page_end: number;
  text: string;
};

export type StructuredPdfChunk = {
  chunk_id: string;
  page_start: number;
  page_end: number;
  section_heading: string;
  text: string;
  char_count: number;
};

export type StructuredPdfDocument = {
  title_guess: string;
  page_count: number;
  pages: StructuredPdfPage[];
  sections: StructuredPdfSection[];
  chunks: StructuredPdfChunk[];
  diagnostics: {
    text_quality: PdfTextQuality;
    warnings: string[];
  };
};

type SectionRecord = StructuredPdfSection & {
  segments: Array<{ page_number: number; text: string }>;
};

const MIN_CHUNK_CHARS = 1500;
const MAX_CHUNK_CHARS = 3000;
const LOW_TEXT_CHARS = 120;
const LOW_TEXT_WORDS = 20;
const SCANNED_PDF_MESSAGE =
  "This appears to be scanned/image-based. Paste text manually or use AI/OCR mode when configured.";

const HEADING_PATTERNS: Array<{ canonical: string; re: RegExp }> = [
  { canonical: "Abstract", re: /^abstract$/i },
  { canonical: "Introduction", re: /^introduction$/i },
  {
    canonical: "Materials and Methods",
    re: /^(materials?\s+and\s+methods?|materials?|methods?)$/i,
  },
  { canonical: "Results", re: /^results$/i },
  { canonical: "Discussion", re: /^discussion$/i },
  { canonical: "Conclusions", re: /^conclusions?$/i },
  { canonical: "Nomenclature", re: /^nomenclature$/i },
  {
    canonical: "Supporting Information",
    re: /^(supporting\s+information|supplementary\s+information)$/i,
  },
  { canonical: "References", re: /^references$/i },
];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function cleanText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function normalizeHeadingCandidate(line: string): string {
  return line
    .trim()
    .replace(/^\d+(?:\.\d+)*\s+/, "")
    .replace(/^[A-Z]\.\s+/, "")
    .replace(/[:.\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectHeading(line: string): string | null {
  const normalized = normalizeHeadingCandidate(line);
  if (!normalized || normalized.length > 80) return null;
  for (const pattern of HEADING_PATTERNS) {
    if (pattern.re.test(normalized)) return pattern.canonical;
  }
  return null;
}

function guessTitle(pages: StructuredPdfPage[]): string {
  const firstLines = pages
    .flatMap((page) => page.text.split("\n"))
    .map((line) => cleanText(line))
    .filter((line) => line.length > 0);
  const title = firstLines.find((line) => {
    if (detectHeading(line)) return false;
    return line.length >= 8 && line.length <= 160;
  });
  return title ?? "Untitled PDF document";
}

function buildPages(pageTexts: string[], pageCount: number): StructuredPdfPage[] {
  const safePageCount = Math.max(pageCount, pageTexts.length, 1);
  return Array.from({ length: safePageCount }, (_, idx) => {
    const text = cleanText(pageTexts[idx] ?? "");
    return {
      page_number: idx + 1,
      text,
      char_count: text.length,
      word_count: wordCount(text),
    };
  });
}

function createSection(
  heading: string,
  pageNumber: number,
): SectionRecord {
  return {
    heading,
    page_start: pageNumber,
    page_end: pageNumber,
    text: "",
    segments: [],
  };
}

function closeSection(section: SectionRecord): SectionRecord {
  const text = cleanText(section.segments.map((segment) => segment.text).join("\n"));
  return {
    ...section,
    text,
    page_end: section.segments.at(-1)?.page_number ?? section.page_end,
  };
}

function buildSections(pages: StructuredPdfPage[]): SectionRecord[] {
  const sections: SectionRecord[] = [];
  let current = createSection("Document", pages[0]?.page_number ?? 1);

  for (const page of pages) {
    const lines = page.text.split("\n");
    for (const line of lines) {
      const trimmed = cleanText(line);
      if (!trimmed) continue;

      const heading = detectHeading(trimmed);
      if (heading) {
        const closed = closeSection(current);
        if (closed.text && closed.heading !== "Document") sections.push(closed);
        current = createSection(heading, page.page_number);
        continue;
      }

      current.segments.push({ page_number: page.page_number, text: trimmed });
      current.page_end = page.page_number;
    }
  }

  const closed = closeSection(current);
  if (closed.text && (closed.heading !== "Document" || sections.length === 0)) {
    sections.push(closed);
  }
  return sections;
}

function nextChunkId(index: number): string {
  return `chunk_${String(index + 1).padStart(3, "0")}`;
}

function pushChunk(
  chunks: StructuredPdfChunk[],
  sectionHeading: string,
  text: string,
  pageStart: number,
  pageEnd: number,
) {
  const clean = cleanText(text);
  if (!clean) return;
  chunks.push({
    chunk_id: nextChunkId(chunks.length),
    page_start: pageStart,
    page_end: pageEnd,
    section_heading: sectionHeading,
    text: clean,
    char_count: clean.length,
  });
}

function splitLargeSegment(
  chunks: StructuredPdfChunk[],
  sectionHeading: string,
  text: string,
  pageNumber: number,
) {
  let remaining = cleanText(text);
  while (remaining.length > MAX_CHUNK_CHARS) {
    const splitAt = Math.max(
      remaining.lastIndexOf("\n", MAX_CHUNK_CHARS),
      remaining.lastIndexOf(" ", MAX_CHUNK_CHARS),
    );
    const end = splitAt > MIN_CHUNK_CHARS ? splitAt : MAX_CHUNK_CHARS;
    pushChunk(chunks, sectionHeading, remaining.slice(0, end), pageNumber, pageNumber);
    remaining = cleanText(remaining.slice(end));
  }
  return remaining;
}

function buildChunks(sections: SectionRecord[]): StructuredPdfChunk[] {
  const chunks: StructuredPdfChunk[] = [];

  for (const section of sections) {
    let currentText = "";
    let pageStart = section.page_start;
    let pageEnd = section.page_start;

    for (const segment of section.segments) {
      let segmentText = cleanText(segment.text);
      if (!segmentText) continue;

      if (segmentText.length > MAX_CHUNK_CHARS) {
        if (currentText) {
          pushChunk(chunks, section.heading, currentText, pageStart, pageEnd);
          currentText = "";
        }
        segmentText = splitLargeSegment(
          chunks,
          section.heading,
          segmentText,
          segment.page_number,
        );
        pageStart = segment.page_number;
        pageEnd = segment.page_number;
      }

      const nextText = currentText ? `${currentText}\n${segmentText}` : segmentText;
      if (currentText && currentText.length >= MIN_CHUNK_CHARS && nextText.length > MAX_CHUNK_CHARS) {
        pushChunk(chunks, section.heading, currentText, pageStart, pageEnd);
        currentText = segmentText;
        pageStart = segment.page_number;
        pageEnd = segment.page_number;
      } else {
        currentText = nextText;
        pageEnd = segment.page_number;
      }
    }

    if (currentText) {
      pushChunk(chunks, section.heading, currentText, pageStart, pageEnd);
    }
  }

  return chunks;
}

function textQuality(
  pages: StructuredPdfPage[],
  warnings: string[],
): PdfTextQuality {
  const totalChars = pages.reduce((sum, page) => sum + page.char_count, 0);
  const totalWords = pages.reduce((sum, page) => sum + page.word_count, 0);
  if (totalChars < LOW_TEXT_CHARS || totalWords < LOW_TEXT_WORDS) {
    warnings.push(SCANNED_PDF_MESSAGE);
    return "fallback_required";
  }
  const charsPerPage = totalChars / Math.max(pages.length, 1);
  if (charsPerPage < 500) {
    warnings.push(
      "Extracted text is sparse for the reported page count; verify that equations and tables were captured.",
    );
    return "low";
  }
  return "good";
}

export function buildStructuredPdfDocument(input: {
  pageTexts: string[];
  pageCount: number;
  warnings?: string[];
}): StructuredPdfDocument {
  const warnings = [...(input.warnings ?? [])];
  const pages = buildPages(input.pageTexts, input.pageCount);
  const sections = buildSections(pages);
  const chunks = buildChunks(sections);

  return {
    title_guess: guessTitle(pages),
    page_count: pages.length,
    pages,
    sections: sections.map((section) => ({
      heading: section.heading,
      page_start: section.page_start,
      page_end: section.page_end,
      text: section.text,
    })),
    chunks,
    diagnostics: {
      text_quality: textQuality(pages, warnings),
      warnings,
    },
  };
}

export { SCANNED_PDF_MESSAGE };
