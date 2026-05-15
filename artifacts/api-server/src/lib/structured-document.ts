import { z } from "zod/v4";
import type { PaperUnderstandingDocumentChunk } from "./paper-understanding-prompt";

const StructuredDocumentChunkSchema = z.object({
  chunk_id: z.string().min(1),
  page_start: z.number().int().min(1),
  page_end: z.number().int().min(1),
  section_heading: z.string().min(1),
  text: z.string().min(1),
  char_count: z.number().int().nonnegative().optional(),
  contains_equation_like_text: z.boolean().optional(),
  contains_table_like_text: z.boolean().optional(),
  contains_figure_reference: z.boolean().optional(),
});

export const StructuredSourceDocumentSchema = z.object({
  chunks: z.array(StructuredDocumentChunkSchema),
});

export type StructuredSourceDocument = z.infer<
  typeof StructuredSourceDocumentSchema
>;

export function extractDocumentChunks(
  structuredDocument: unknown,
): PaperUnderstandingDocumentChunk[] {
  const parsed = StructuredSourceDocumentSchema.safeParse(structuredDocument);
  if (!parsed.success) return [];

  return parsed.data.chunks.map((chunk) => ({
    chunk_id: chunk.chunk_id,
    page_start: chunk.page_start,
    page_end: chunk.page_end,
    section_heading: chunk.section_heading,
    text: chunk.text,
    char_count: chunk.char_count,
    contains_equation_like_text: chunk.contains_equation_like_text,
    contains_table_like_text: chunk.contains_table_like_text,
    contains_figure_reference: chunk.contains_figure_reference,
  }));
}

function formatChunkHeader(chunk: PaperUnderstandingDocumentChunk): string {
  const pages =
    chunk.page_start === chunk.page_end
      ? `page ${chunk.page_start}`
      : `pages ${chunk.page_start}-${chunk.page_end}`;
  const flags = [
    chunk.contains_equation_like_text ? "equation_like=true" : "",
    chunk.contains_table_like_text ? "table_like=true" : "",
    chunk.contains_figure_reference ? "figure_reference=true" : "",
  ].filter(Boolean);
  const flagText = flags.length ? `; ${flags.join("; ")}` : "";
  return `[${chunk.chunk_id}; ${pages}; section="${chunk.section_heading}"${flagText}]`;
}

export function formatDocumentChunksAsSourceText(
  chunks: PaperUnderstandingDocumentChunk[],
): string {
  return chunks
    .map((chunk) => `${formatChunkHeader(chunk)}\n${chunk.text.trim()}`)
    .join("\n\n")
    .trim();
}
