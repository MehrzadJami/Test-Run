# Professor Pipeline Acceptance Audit

Date: 2026-05-09

## Scope

This audit verifies the text-layer PDF professor-grade understanding pipeline end to end. It does not add OCR, Vision, web search, new providers, or new product workflows.

## Commands Run

Initial worktree snapshot:

```bash
git diff --stat
```

Required checks:

```bash
pnpm -r typecheck
pnpm test:unit
pnpm -r build
pnpm test:api
```

Results:

- `pnpm -r typecheck`: passed.
- `pnpm test:unit`: passed.
  - `@workspace/domain-classifier`: 1 file, 36 tests passed.
  - `@workspace/chem-ai`: 14 files, 187 tests passed.
  - `@workspace/api-server`: 5 files passed, 1 skipped; 79 tests passed, 3 skipped.
- `pnpm -r build`: passed.
- `pnpm test:api`: initially blocked by sandbox-local DB access (`connect EPERM 127.0.0.1:55432`), then passed when rerun with local Postgres access approved.
  - API routes: 1 file, 26 tests passed.

## Acceptance Fixtures Tested

- Simple Monod chemostat.
- Gas-liquid O2 transfer.
- Abiusi-like oxygen-balanced mixotrophic photobioreactor.
- Batch culture.
- Fed-batch culture.
- Michaelis-Menten enzyme kinetics.

## Flow Results

### PDF Upload And Parser

Passed:

- Structured PDF documents contain `pages`, `sections`, `chunks`, `tables_or_value_blocks`, and `diagnostics`.
- Page and chunk flags are populated for equation-like text, table-like text, and figure references.
- Low-text/scanned-like inputs return a structured fallback with:
  - `fallback_required: true`
  - `text_quality: "failed"`
  - `This appears scanned/image-based. Paste text manually or use OCR/vision mode later.`
- Figure references generate an explicit warning that visual data may require OCR/vision/manual review.

Remaining limitation:

- No OCR or visual table/figure interpretation is implemented. Image-only equations, figure plots, and scanned tables are detected as limitations, not understood.

### Source Persistence And Extraction

Passed:

- PDF source payloads persist `kind: "pdf"` plus `structuredDocument`.
- Persisted chunks preserve page, section, and content flags.
- Extraction route passes `structuredDocument.chunks` into `runExtraction`.
- OpenAI/Gemini/Ollama expose chunk-aware `extractFromChunks` paths and prompts include page/section chunk headers.
- RuleBased fallback audit states it is deterministic flat/local extraction, not full-paper semantic understanding.
- Mock remains fixed demo extraction.

DB-gated route coverage:

- Added route-level coverage for saving a PDF source with `structuredDocument` and reading it back from `GET /api/projects/:id`.

### Paper Understanding

Passed:

- `PaperUnderstandingSchema` accepts procedure steps, reactor setup, operating timeline, controls, table/value blocks, equation types, and model assembly assessment.
- Abiusi-like fixture detects microalgae PBR / oxygen-balanced mixotrophy, chemostat operation, DO control, acetate feed, PFD/light context, and reactor setup.
- Productivity, yield, acetate oxidation, and carbon-balance equations are classified as algebraic/stoichiometric, not `dynamic_ode`.
- Missing kinetic constants, light model parameters, Henry-law convention, controller parameters, and initial conditions are flagged.
- Unknown or nonnumeric parameter values remain raw/unknown/null and never become invented zeros.
- No complete six-state ODE model is hallucinated from the Abiusi-like fixture.

### UI Truthfulness

Passed by existing and strengthened tests/audit:

- MockProvider warning remains visible.
- RuleBased disclosure remains visible where surfaced.
- Incomplete or unsupported simulation is blocked/downgraded with scaffold guidance.
- Source Requests / assembly readiness show partial/scaffold-only status and missing requirements.
- Search for risky claims did not find positive claims of validated simulation, certified models, or digital-twin readiness. Existing home-page text is explicitly negative: the app is not a validated simulation platform or certified digital twin.

### Export

Passed:

- Package export includes model card, raw extraction JSON, source excerpts, equations, parameters, reproducibility report, unit report, assembly report, and missing requirements when available.
- Page/section source context is retained in `equations.md` and `source_excerpt.txt`.
- Unknown/non-numeric parameter values export as `unknown`, not `0`.
- Equation types are exported.
- Mock and RuleBased package exports now include provider warning evidence.

## Bugs Found And Fixed

1. Equation reset path did not preserve `control_law`.
   - Fixed the reset union in `artifacts/api-server/src/routes/editing.ts`.

2. OpenAPI/generated provider contracts were stale.
   - Runtime supported `ollama` and `rule_based`, but generated API enums only allowed `mock`, `openai`, and `gemini`.
   - Fixed OpenAPI and generated client/Zod provider enums and descriptions.

3. Export packages did not clearly carry provider warning evidence for Mock/RuleBased outputs.
   - Added warnings to `README.md` and `model_card.md` exports.

4. Acceptance coverage did not prove PDF `structuredDocument` route persistence.
   - Added DB-gated API route coverage.

5. Chemical-engineering acceptance coverage lacked deterministic batch/fed-batch/enzyme fixtures and explicit Abiusi initial-condition checks.
   - Added tests without changing provider behavior.

## Bugs Still Open

- No OCR or Vision support for scanned/image-only PDFs.
- No visual extraction from figures or image-rendered tables.
- RuleBased remains deterministic flat/local extraction and cannot perform professor-level full-paper semantic reasoning.
- Real OpenAI/Gemini/Ollama integration is still gated by configured providers; unit tests use mocked provider calls.

## Ready For OCR/Vision?

The text-layer pipeline is ready for OCR/Vision planning: structured pages, sections, chunks, table/value blocks, evidence-backed mapping, missing-source requests, and truthfulness guardrails are in place. OCR/Vision should be added as a separate phase and must preserve the same source-context and no-hallucination rules.
