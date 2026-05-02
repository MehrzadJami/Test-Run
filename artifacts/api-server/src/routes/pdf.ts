// PDF text extraction endpoint.
//
// Accepts a base64-encoded PDF, runs pdf-parse v1 server-side, and returns the
// extracted plain text plus metadata (pageCount, wordCount, charCount).
//
// pdf-parse v1 is a pure Node.js library (no browser globals needed).
// It wraps pdf.js in a server-safe way and exports a single async function.
//
// Size & sanity limits (all checked before any expensive work):
//   MAX_PDF_BYTES  20 MB — hard limit on decoded PDF size
//   MAX_PAGES      200   — reject large academic PDFs / books
//   MIN_TEXT_CHARS  30   — reject blank/image-only PDFs immediately
//
// On any parse failure the client is told to fall back to the paste-text tab.
// This route never touches the database; it is a pure utility endpoint.

import { Router, type IRouter } from "express";
import { z } from "zod/v4";
// pdf-parse v1 is a CJS module. esbuild handles CJS→ESM interop at build time.
// We import from the inner lib path to avoid the test-runner guard in index.js.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Type the minimal subset we use so we don't need @types/pdf-parse at runtime.
type PdfParseResult = {
  text: string;
  numpages: number;
};
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pdfParse: (
  buf: Buffer,
  opts?: Record<string, unknown>,
) => Promise<PdfParseResult> =
  // Use the inner lib file to skip the test-runner code in the package entry point.
  require("pdf-parse/lib/pdf-parse.js");

const router: IRouter = Router();

// ─── Limits ────────────────────────────────────────────────────────────────────

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_PAGES = 200;
const MIN_TEXT_CHARS = 30;

// base64 encoding inflates size by ~33 %; accept up to ceil(MAX_PDF_BYTES * 4/3)
const MAX_BASE64_CHARS = Math.ceil(MAX_PDF_BYTES * (4 / 3));

// ─── Zod body schema ──────────────────────────────────────────────────────────

const ParsePdfBody = z.object({
  base64: z
    .string()
    .min(1, "base64 is required")
    .max(
      MAX_BASE64_CHARS,
      "PDF exceeds the 20 MB limit. Upload a smaller file or paste the relevant sections manually.",
    ),
});

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/pdf/parse", async (req, res): Promise<void> => {
  const body = ParsePdfBody.safeParse(req.body ?? {});
  if (!body.success) {
    res
      .status(400)
      .json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  // Decode base64 → Buffer
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = Buffer.from(body.data.base64, "base64");
  } catch {
    res.status(400).json({
      error: "Invalid base64 data. Please try uploading the file again.",
    });
    return;
  }

  // Guard against the ~33 % base64 approximation being slightly off
  if (pdfBuffer.byteLength > MAX_PDF_BYTES) {
    const mb = (pdfBuffer.byteLength / 1024 / 1024).toFixed(1);
    res.status(400).json({
      error: `PDF is ${mb} MB — the limit is 20 MB. For large documents, paste the relevant methodology sections manually.`,
    });
    return;
  }

  // Parse the PDF
  let parseResult: PdfParseResult;
  try {
    parseResult = await pdfParse(pdfBuffer);
  } catch (err) {
    req.log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "pdf-parse failed",
    );
    res.status(400).json({
      error:
        "Could not extract text from this PDF. It may be a scanned document or image-based PDF. " +
        "Please paste the text content manually on the 'Paste Text' tab.",
    });
    return;
  }

  // Page count guard (checked after parse so we have the real number)
  if (parseResult.numpages > MAX_PAGES) {
    res.status(400).json({
      error:
        `This PDF has ${parseResult.numpages} pages — the limit is ${MAX_PAGES}. ` +
        "Paste the relevant sections (equations, parameters, assumptions) manually instead.",
    });
    return;
  }

  // Text quality guard — reject image-only / scanned PDFs
  const text = (parseResult.text ?? "").trim();
  if (text.length < MIN_TEXT_CHARS) {
    res.status(400).json({
      error:
        "No readable text was found in this PDF. It may be an image-based or scanned document. " +
        "Please paste the text content manually on the 'Paste Text' tab.",
    });
    return;
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  req.log.info(
    { pages: parseResult.numpages, chars: text.length, words: wordCount },
    "PDF parsed successfully",
  );

  res.json({
    text,
    pageCount: parseResult.numpages,
    wordCount,
    charCount: text.length,
  });
});

export default router;
