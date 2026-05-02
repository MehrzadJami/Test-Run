# Roadmap

This document tracks the milestone plan for ChemAI Model Compiler.

For the living Kanban board, see `kanban.md`.

---

## Completed Milestones

### M1 — Project Scaffold
- pnpm monorepo with `@workspace/*` shared libraries
- Express 5 API with Pino structured logging
- PostgreSQL database via Drizzle ORM
- Vite + React + Tailwind 4 + shadcn/ui frontend
- OpenAPI-first contract with Orval codegen

### M2 — Source Document Ingestion
- `POST /api/projects/:id/sources` endpoint
- Support for plain text and PDF (text content) uploads
- Source document stored with `kind`, `filename`, and `content`

### M3 — Extraction Engine
- Provider abstraction (`ExtractionProvider` interface)
- `MockProvider` — deterministic, always-available, seeded chemostat output
- `ExtractionResultSchema` — Zod validation on all provider responses
- `mapExtractionToDb()` — pure function converting provider output to DB row shapes
- Atomic DB transaction for extraction + all structured data
- `rawExtractionJson` column for traceability

### M4 — Model Card Display
- `/model-cards/:id` detail page with full extraction data
- Project overview, system description, problem statement
- Domain and provider badges
- Basic tab layout

### M5 — Structured Data Tabs
- Equations tab — LaTeX rendering, source quotes
- Variables tab — symbol, unit, role, source quote
- Parameters tab — value, unit, confidence, source quote
- Assumptions and Limitations tabs
- Missing Information tab with severity levels

### M6 — Missing Information Detection
- Extracted from `model_card.missing_information` provider field
- Displayed with HIGH / MEDIUM / LOW severity badges
- Shown as dedicated tab on model card

### M7 — Reproducibility Scoring
- `analyzeReproducibility()` — client-side, 8 sub-dimensions
- Score 0–100 with per-dimension breakdown
- Score badge shown in model card header
- Reproducibility tab with full report

### M8 — Python ODE Template
- `generatePythonOdeTemplate()` — client-side Python code generation
- Parameters pre-filled from extracted values
- Equation bodies marked as TODO with LaTeX comments
- Readiness and unit-check warning banners included
- Download `.py` button on ODE Template tab

### M9 — Model Package Export (ZIP)
- `generateModelPackage()` — assembles 14 files in memory
- JSZip client-side ZIP generation
- **Files in package:**
  - `README.md` — overview, scores, missing gaps, run instructions
  - `model_card.md` — full human-readable model card (Markdown)
  - `equations.md` — LaTeX equations with source context
  - `variables.csv` — symbol, name, unit, role, source_quote
  - `parameters.csv` — symbol, value, unit, confidence, source_quote
  - `assumptions.md` — all assumptions with source context
  - `limitations.md` — all limitations with source context
  - `missing_info.md` — missing information with severity levels
  - `reproduce.md` — reproducibility score breakdown
  - `unit_check_report.json` — dimensional check results
  - `reproducibility_report.json` — score breakdown JSON
  - `simulate.py` — Python ODE scaffold
  - `source_excerpt.txt` — deduplicated source quotes (traceability record)
  - `metadata.json` — extraction metadata
- "Download Package" button added to model card header

### M10 — UI Polish and Demo Readiness
- Landing page: hero, NotebookLM comparison, "not a black-box optimizer" section, workflow cards, example output stats, scientific accuracy callout
- New Extraction: demo source text pre-fill (Monod Chemostat, Aerobic Bioreactor)
- Exports page: all formats now linked and active; "Available in Milestone 5" labels removed
- Dashboard: color-coded stat cards, animated skeleton loading, error state with retry
- Model Cards: animated skeleton loading, icon-based empty state, search no-results state
- Scientific accuracy note on landing page

### M11 — Documentation
- `README.md` — full rewrite with 14 sections
- `docs/ARCHITECTURE.md` — data flow, provider abstraction, monorepo structure
- `docs/API.md` — full endpoint reference with request/response shapes
- `docs/LOCAL_SETUP.md` — setup steps, env vars, troubleshooting
- `docs/ROADMAP.md` — this document
- `docs/MODEL_EXTRACTION_SCHEMA.md` — ExtractionResultSchema field reference

---

## Planned Milestones

### M12 — Real AI Providers
- `OpenAIProvider` — GPT-4o with structured output (JSON mode)
- `GeminiProvider` — Gemini 1.5 Pro with JSON mode
- Runtime provider selection via `getActiveProvider()` based on env vars
- Prompt engineering for chemical engineering domain
- Provider fallback chain: OpenAI → Gemini → Mock
- Cost / token usage logging

### M13 — PDF Ingestion
- Server-side PDF text extraction (e.g., `pdf-parse` or `pdfjs-dist`)
- Binary PDF upload via multipart form
- Automatic text extraction and chunking

### M14 — Unit Check v2
- Replace heuristic with rigorous dimensional analysis using `pint` (Python) or a TypeScript unit library
- Explicit dimensional algebra for each equation term
- Report by equation, not just by term

### M15 — Authentication
- Replit Auth (OpenID Connect) or Clerk
- Per-user project isolation
- Public / private model card visibility

### M16 — Multi-source Projects
- Attach multiple source documents to one project
- Aggregate model card across sources
- Conflict detection when the same parameter appears with different values across sources

### M17 — Automated Tests
- Vitest unit tests: `analyzeReproducibility`, `runUnitCheck`, `generatePythonOdeTemplate`, `generateModelPackage`
- API integration tests for all routes
- Playwright E2E tests for the extraction workflow
- CI workflow in GitHub Actions

---

## Future Ideas

These are not scheduled and are listed for discussion only:

- **MATLAB / Julia / Modelica stubs** — additional ODE template formats
- **Bulk export** — export all projects as a single ZIP or NDJSON
- **Peer review workflow** — flag an extracted model card for manual review, leave comments per field
- **Equation similarity search** — find other model cards that share the same governing equations
- **Parameter provenance graph** — visualise which source quotes a parameter value came from
- **Notebook export** — Jupyter notebook with the ODE template and parameter cells pre-filled
- **LLM prompt transparency** — show the exact prompt sent to the AI provider per extraction
