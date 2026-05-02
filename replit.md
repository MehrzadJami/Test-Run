# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

- `artifacts/api-server` — Express 5 API at `/api`. Persists projects, source documents, extractions (model cards, equations, variables, parameters, assumptions). Seeds a chemostat/microalgae demo project on first boot.
- `artifacts/chem-ai` — React + Vite web UI at `/`. ChemAI Model Compiler: ingest, extract, 9-tab model card view (Overview, Variables, Parameters, Equations, Assumptions, Missing Info, ODE Template, Reproducibility, Raw JSON), JSON export, simulation page.
- `artifacts/mockup-sandbox` — design exploration only.

## Project Purpose

**ChemAI Model Compiler** — a research workbench that converts scientific papers into simulation-ready model artifacts (equations, variables, parameters, ODE templates). Migrated from https://github.com/MehrzadJami/Serious-Tracker.

## ChemAI extraction engine

Canonical contract: `artifacts/api-server/src/lib/extraction-schema.ts` (Zod) defines the strict JSON shape every extraction provider must return — `paper_title_or_topic`, `system_type`, `process_description`, `state_variables[]`, `parameters[]`, `equations[]`, `assumptions[]`, `limitations[]`, `model_card{...}`, with `confidence` on every list item.

Engine: `artifacts/api-server/src/lib/extractor.ts` exposes:
- `ExtractionProvider` interface + `getActiveProvider()` factory (today: always `MockProvider`; future: picks OpenAI / Gemini based on `OPENAI_API_KEY` / `GEMINI_API_KEY` — never hardcoded).
- `runExtraction(sourceText)` — single entry point. Validates input (≥30 chars), calls the provider, re-validates the provider's output against `ExtractionResultSchema`. Throws `ExtractionInputError` (400) or `ExtractionProviderError` (502).
- `mapExtractionToDb(result)` — pure mapper from the rich validated result onto the existing DB row shapes.

## M4 — Simulation page (artifacts/chem-ai/src/pages/simulation.tsx)

Pure in-browser RK4 ODE solver for the Monod chemostat model (no server, no arbitrary code execution).

- **Model**: μ = μmax·S/(Ks+S), dX/dt = (μ-D)·X, dS/dt = D·(Sin-S) - (1/Yxs)·μ·X
- **Solver**: 4th-order Runge-Kutta, capped at 50 000 steps, decimated to ≤ 1 000 plot points
- **Chart**: Recharts LineChart with teal/orange X and S traces + dashed reference lines at analytical steady state

## DB schema (lib/db/src/schema)

`projects → source_documents → extractions → { equations, variables, parameters, assumptions }`. All `extractions`-children cascade on delete. `assumptions.kind` is `assumption | limitation`.

`extractions.raw_extraction_json` (JSONB, nullable) preserves the full validated `ExtractionResultSchema` payload alongside the normalized rows.

## M6 — Reproducibility Analysis (artifacts/chem-ai/src/lib/reproducibility.ts)

Pure client-side analysis engine (no server, no AI). Called from `model-card-detail.tsx` via `useMemo` on the already-fetched card data.

- **Input**: normalized DB rows (equations, variables, parameters, assumptions) + `raw_extraction_json` passthrough
- **Fallback**: gracefully degrades when `raw_extraction_json` is null — uses normalized table data only
- **Checks**: 13+ rule-based checks across equations, parameters, units, initial conditions, symbol cross-reference, gas-transfer, yield coefficients, Henry's law, kinetic constants
- **Scores** (each 0–100): equations completeness (25%), parameters completeness (25%), units completeness (20%), initial conditions (20%), source traceability (10%)
- **Overall**: weighted average of the five sub-scores
- **Readiness**: `ready` (≥75 overall, 0 criticals), `partial` (≥40 overall, ≤1 critical), `not_ready` otherwise
- **Output**: `ReproducibilityReport` — overall score, 5 sub-scores, readiness status, main blockers, `MissingItem[]` (severity-sorted: critical → warning → info), recommended next steps
- **UI**: "Reproducibility" tab (9th tab on model card), score badge in page header, score breakdown bars, readiness badge, blocker list, missing items list, next steps

## Roadmap

- **Milestone 1 — Skeleton ✅**: Full-stack scaffold, sidebar nav, six pages, demo data, health check.
- **Milestone 2 — AI extraction layer**: Provider interface, mock + OpenAI + Gemini — wire real keys when ready.
- **Milestone 3 — Editing flows**: Inline edits to variables and parameters with optimistic UI.
- **Milestone 4 — Model Card polish ✅**: 9-tab professional model card, product name, landing page positioning.
- **Milestone 5 — Simulation ✅**: RK4 integrator, Recharts time-series chart, full parameter inputs.
- **Milestone 6 — Reproducibility ✅**: Missing information detector, reproducibility score, simulation readiness badge.
- **Milestone 7 — Unit Check ✅**: MVP heuristic unit & dimension checker, 10 checks, Unit Check tab on model card, status badge in header.
- **Milestone 8 — Python ODE Template ✅**: Client-side generator (`python-generator.ts`), rich ODE Template tab, download as `model_template.py`, readiness + unit-check warning banners.
- **Remaining**: Real AI providers (M2), Exports page (Markdown/CSV), push back to GitHub.

## GitHub

Source: https://github.com/MehrzadJami/Serious-Tracker
