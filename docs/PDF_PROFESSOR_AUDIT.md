# PDF Professor Pipeline Audit

Date: 2026-05-09

## Pre-edit Verification

Commands run before professor-grade PDF changes:

- `git diff --stat`
  - Existing working tree already contained M39/M40/M41 changes.
  - Baseline diff: 43 files changed, 850 insertions, 85 deletions.
- `pnpm -r typecheck`
  - Passed.
- `pnpm test:unit`
  - Passed.
  - Domain classifier: 36 passed.
  - ChemAI frontend/unit logic: 184 passed.
  - API server unit tests: 73 passed, 3 skipped.
- `pnpm -r build`
  - Passed.
  - API bundle emitted existing size warning for `dist/index.mjs`.

## What Already Worked

- PDF parse route returned extracted text and a structured document with pages, sections, and chunks.
- PDF upload flow preserved `structuredDocument` when saving PDF sources.
- `source_documents.structured_document` existed in the DB schema and API types.
- Extraction route passed structured chunks into `runExtraction` when available.
- Ollama, OpenAI, and Gemini providers exposed chunk-aware paper-understanding extraction.
- RuleBased fallback disclosed flat/local extraction in the audit trail.
- PaperUnderstanding mapping preserved page/section context in `source_context`.

## What Was Broken Or Limited

- Structured PDF pages/chunks did not mark equation-like, table-like, or figure-reference content.
- Diagnostics used the older `fallback_required` quality state instead of explicit `failed` plus `fallback_required`.
- Scanned/image-only PDFs could be treated as a parse error instead of a structured fallback.
- PaperUnderstanding lacked first-class procedure, setup, timeline, table/value block, and model assembly assessment fields.
- Equation typing did not include `control_law`.
- AI prompts did not explicitly enforce a multi-pass professor-style reasoning flow.

## What Was Fixed

- Text-layer PDF structure now marks equation-like, table-like, and figure-reference content on pages/chunks.
- Structured diagnostics now include `text_quality`, `fallback_required`, `message`, and warnings.
- Scanned/image-only PDFs return a structured fallback response with:
  - `This appears scanned/image-based. Paste text manually or use OCR/vision mode later.`
- Table/value blocks are detected from text-layer chunks and represented with raw text and extracted rows.
- PaperUnderstanding now supports reactor setup, procedure steps, operating timeline, candidate inputs/outputs/controls, table/value blocks, and model assembly assessment.
- Equation type support now includes `control_law`.
- AI paper-understanding prompt now uses an explicit four-pass workflow and repeats no-hallucination requirements.
- RuleBased fallback audit text now states deterministic flat/local extraction does not perform full-paper semantic understanding.
- Unsupported/incomplete simulation message now tells users a scaffold can still be exported.

## Remaining Limitations

- No OCR or computer vision is implemented in this phase.
- Figure references are detected, but visual data inside figures is not extracted.
- Table extraction is lightweight and text-layer only; complex PDF table layouts may need manual review.
- Equation detection is heuristic for text-layer PDFs; image-rendered equations still require OCR/vision later.
- AI provider quality depends on configured provider/model and validated JSON output.

## Final Verification

- `pnpm -r typecheck`
  - Passed after one API type narrowing fix in `pdf-document.ts`.
- `pnpm test:unit`
  - Passed.
  - Domain classifier: 36 passed.
  - ChemAI frontend/unit logic: 184 passed.
  - API server unit tests: 75 passed, 3 skipped.
- `pnpm -r build`
  - Passed.
  - API bundle emitted existing size warning for `dist/index.mjs`.

No `DATABASE_URL`-gated API integration tests were run as part of `pnpm test:unit`.
