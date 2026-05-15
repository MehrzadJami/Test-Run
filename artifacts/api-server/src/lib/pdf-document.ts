export type PdfTextQuality = "good" | "low_text" | "failed";

export type StructuredPdfPage = {
  page_number: number;
  text: string;
  char_count: number;
  word_count: number;
  has_equation_like_text: boolean;
  has_table_like_text: boolean;
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
  contains_equation_like_text: boolean;
  contains_table_like_text: boolean;
  contains_figure_reference: boolean;
};

export type StructuredPdfValueRow = {
  symbol_or_item: string;
  value: string;
  unit: string;
  meaning: string;
  confidence: "high" | "medium" | "low";
  source_quote: string;
};

export type StructuredPdfTableValueBlock = {
  page: number;
  section_heading: string;
  caption_or_context: string;
  raw_text: string;
  extracted_rows: StructuredPdfValueRow[];
  confidence: "high" | "medium" | "low";
};

export type StructuredPdfDocument = {
  title_guess: string;
  page_count: number;
  pages: StructuredPdfPage[];
  sections: StructuredPdfSection[];
  chunks: StructuredPdfChunk[];
  tables_or_value_blocks: StructuredPdfTableValueBlock[];
  diagnostics: {
    text_quality: PdfTextQuality;
    fallback_required: boolean;
    message: string | null;
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
  "This appears scanned/image-based. Paste text manually or use OCR/vision mode later.";
const FIGURE_WARNING =
  "Figure references detected. Visual data may require OCR/vision/manual review.";

const HEADING_PATTERNS: Array<{ canonical: string; re: RegExp }> = [
  { canonical: "Abstract", re: /^abstract$/i },
  { canonical: "Introduction", re: /^introduction$/i },
  {
    canonical: "Materials and Methods",
    re: /^(materials?\s+and\s+methods?|materials?|methods?)$/i,
  },
  { canonical: "Experimental", re: /^experimental(?:\s+setup)?$/i },
  { canonical: "Reactor setup", re: /^(reactor\s+setup|reactor\s+configuration)$/i },
  {
    canonical: "Photobioreactor setup",
    re: /^(photobioreactor\s+setup|pbr\s+setup|photobioreactor\s+configuration)$/i,
  },
  { canonical: "Calculations", re: /^(calculations?|model\s+calculations?)$/i },
  {
    canonical: "Analytical Methods",
    re: /^(analytical\s+methods?|analysis|measurements?)$/i,
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

const UNIT_RE =
  /\b(?:1\/[a-z]+|[a-z]+\^-?1|g\/L|mg\/L|mol\/L|mmol\/L|g\/g|mg\/g|L|mL|h|hr|d|s|min|%|ppm|bar|K|C|umol\/m2\/s|µmol\/m2\/s|gO2\/gX\/h)\b/i;
const SCIENTIFIC_SYMBOL_RE = /[A-Za-z][A-Za-z0-9_]*(?:\s*[\/*+\-]\s*[A-Za-z0-9_().]+)+/;
const ODE_RE = /\bd[A-Za-z][A-Za-z0-9_]*\s*\/\s*dt\b|∂[A-Za-z][A-Za-z0-9_]*\s*\/\s*∂t\b/i;
const EQ_REFERENCE_RE = /\b(?:eq\.?|equation)\s*\(?\d+[a-z]?\)?|\(\s*\d+[a-z]?\s*\)/i;
const REACTION_ARROW_RE = /(?:->|<->|=>|→|↔|⇌)/;
const FIGURE_REFERENCE_RE = /\b(?:fig\.?|figure)\s*\d+[a-z]?\b|\bdepicted\s+in\s+(?:fig\.?|figure)\b/i;
const TABLE_REFERENCE_RE = /\btable\s+\d+[a-z]?|\bnomenclature\b/i;
const PRODUCTIVITY_FORMULA_RE =
  /\b(?:yield|productivity|rate|conversion|carbon\s+balance|oxygen\s+balance)\b.{0,80}=/i;

export function hasEquationLikeText(text: string): boolean {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  return lines.some((line) => {
    if (ODE_RE.test(line)) return true;
    if (EQ_REFERENCE_RE.test(line) && /=|→|->|=>/.test(line)) return true;
    if (REACTION_ARROW_RE.test(line) && /[A-Za-z0-9]/.test(line)) return true;
    if (PRODUCTIVITY_FORMULA_RE.test(line)) return true;
    if (/=/.test(line) && SCIENTIFIC_SYMBOL_RE.test(line)) return true;
    return false;
  });
}

export function hasFigureReference(text: string): boolean {
  return FIGURE_REFERENCE_RE.test(text);
}

export function hasTableLikeText(text: string): boolean {
  if (TABLE_REFERENCE_RE.test(text)) return true;
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const unitLines = lines.filter((line) => UNIT_RE.test(line)).length;
  const symbolValueRows = lines.filter((line) =>
    /^[A-Za-z][A-Za-z0-9_]*\s+(?:[-+]?\d|\w).*(?:\s{2,}|\t|=|:).*/.test(line),
  ).length;
  return unitLines >= 2 || symbolValueRows >= 3;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function cleanText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function cleanLine(line: string): string {
  return line.trim().replace(/\s+/g, " ");
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
      has_equation_like_text: hasEquationLikeText(text),
      has_table_like_text: hasTableLikeText(text),
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
    contains_equation_like_text: hasEquationLikeText(clean),
    contains_table_like_text: hasTableLikeText(clean),
    contains_figure_reference: hasFigureReference(clean),
  });
}

function findEquationBlockStart(text: string, maxIndex: number): number {
  const beforeLimit = text.slice(0, maxIndex);
  const lastNewline = beforeLimit.lastIndexOf("\n");
  const lineStart = lastNewline >= 0 ? lastNewline + 1 : 0;
  const lineEnd = text.indexOf("\n", maxIndex);
  const candidateLine = text.slice(lineStart, lineEnd >= 0 ? lineEnd : text.length);
  if (!hasEquationLikeText(candidateLine)) return -1;

  // Walk backward through consecutive equation-like lines so we don't split
  // a multi-line equation block mid-expression.
  let blockStart = lineStart;
  let scanPos = lineStart;
  while (scanPos > 0) {
    const prevNewline = beforeLimit.lastIndexOf("\n", scanPos - 2);
    const prevLineStart = prevNewline >= 0 ? prevNewline + 1 : 0;
    const prevLine = text.slice(prevLineStart, scanPos - 1);
    if (!hasEquationLikeText(prevLine)) break;
    blockStart = prevLineStart;
    scanPos = prevLineStart;
  }
  return blockStart;
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
    const equationStart = findEquationBlockStart(remaining, MAX_CHUNK_CHARS);
    const end =
      equationStart > MIN_CHUNK_CHARS
        ? equationStart
        : splitAt > MIN_CHUNK_CHARS
          ? splitAt
          : MAX_CHUNK_CHARS;
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
    return "failed";
  }
  const charsPerPage = totalChars / Math.max(pages.length, 1);
  if (charsPerPage < 500) {
    warnings.push(
      "Extracted text is sparse for the reported page count; verify that equations and tables were captured.",
    );
    return "low_text";
  }
  return "good";
}

function looksLikeUnit(s: string): boolean {
  return UNIT_RE.test(s) && !/^[-+]?\d/.test(s);
}

function rowConfidence(row: { value: string; unit: string }): "high" | "medium" | "low" {
  // If the value field contains a unit string, the symbol/value were likely swapped.
  if (row.value && looksLikeUnit(row.value)) return "low";
  if (row.value && row.unit && /^[-+]?\d/.test(row.value)) return "high";
  if (row.value || row.unit) return "medium";
  return "low";
}

function extractValueRows(rawText: string): StructuredPdfValueRow[] {
  const rows: StructuredPdfValueRow[] = [];
  const lines = rawText.split(/\n/).map((line) => cleanLine(line)).filter(Boolean);
  const rowRe =
    /^([A-Za-z][A-Za-z0-9_]*(?:\s+[A-Za-z][A-Za-z0-9_-]*){0,4})\s*(?:=|:|\t|\s{2,})\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|reported|unknown|not\s+specified|n\.?d\.?)?\s*([^,;()]{0,24})?\s*(.*)$/i;

  for (const line of lines) {
    if (!UNIT_RE.test(line) && !/[=:]|\s{2,}|\t/.test(line)) continue;
    const match = line.match(rowRe);
    if (!match) continue;

    const symbolOrItem = cleanLine(match[1] ?? "");
    const value = cleanLine(match[2] ?? "");
    const unit = cleanLine(match[3] ?? "").replace(/[.,;:]+$/g, "");
    const meaning = cleanLine(match[4] ?? "");
    if (!symbolOrItem || (!value && !unit && !meaning)) continue;

    const row = {
      symbol_or_item: symbolOrItem,
      value,
      unit,
      meaning,
      confidence: "low" as const,
      source_quote: line,
    };
    rows.push({ ...row, confidence: rowConfidence(row) });
  }

  return rows.slice(0, 20);
}

function captionOrContext(text: string, fallback: string): string {
  const line =
    text
      .split(/\n/)
      .map((candidate) => cleanLine(candidate))
      .find((candidate) => TABLE_REFERENCE_RE.test(candidate)) ?? fallback;
  return line.slice(0, 180);
}

function buildTableValueBlocks(
  chunks: StructuredPdfChunk[],
): StructuredPdfTableValueBlock[] {
  return chunks
    .filter((chunk) => chunk.contains_table_like_text)
    .map((chunk) => {
      const extractedRows = extractValueRows(chunk.text);
      return {
        page: chunk.page_start,
        section_heading: chunk.section_heading,
        caption_or_context: captionOrContext(chunk.text, chunk.section_heading),
        raw_text: chunk.text,
        extracted_rows: extractedRows,
        confidence: extractedRows.some((row) => row.confidence === "high")
          ? ("medium" as const)
          : ("low" as const),
      };
    })
    .slice(0, 12);
}

function addDiagnostics(
  pages: StructuredPdfPage[],
  sections: StructuredPdfSection[],
  chunks: StructuredPdfChunk[],
  warnings: string[],
) {
  if (pages.some((page) => page.char_count === 0)) {
    warnings.push(
      "One or more reported pages produced no extractable text; missing page content may require OCR/vision/manual review.",
    );
  }
  const referenceChars = sections
    .filter((section) => section.heading === "References")
    .reduce((sum, section) => sum + section.text.length, 0);
  const totalChars = pages.reduce((sum, page) => sum + page.char_count, 0);
  if (totalChars > 0 && referenceChars / totalChars > 0.4) {
    warnings.push(
      "Extracted text is references-heavy; key methods, tables, or equations may be sparse or missing.",
    );
  }
  if (chunks.some((chunk) => chunk.contains_equation_like_text || chunk.contains_table_like_text)) {
    warnings.push(
      "Equation/table-like text detected. Verify that PDF text extraction preserved symbols, columns, units, and equation formatting.",
    );
  }
  if (chunks.some((chunk) => chunk.contains_figure_reference)) {
    warnings.push(FIGURE_WARNING);
  }
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
  const publicSections = sections.map((section) => ({
    heading: section.heading,
    page_start: section.page_start,
    page_end: section.page_end,
    text: section.text,
  }));
  addDiagnostics(pages, publicSections, chunks, warnings);
  const quality = textQuality(pages, warnings);
  const fallbackRequired = quality === "failed";

  return {
    title_guess: guessTitle(pages),
    page_count: pages.length,
    pages,
    sections: publicSections,
    chunks,
    tables_or_value_blocks: buildTableValueBlocks(chunks),
    diagnostics: {
      text_quality: quality,
      fallback_required: fallbackRequired,
      message: fallbackRequired ? SCANNED_PDF_MESSAGE : null,
      warnings,
    },
  };
}

export { SCANNED_PDF_MESSAGE };
