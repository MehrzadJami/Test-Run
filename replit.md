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
- `artifacts/chem-ai` — React + Vite web UI at `/`. ChemAI Model Extractor: ingest, extract, model card view with overview / equations / variables / parameters / ODE template tabs, JSON export, simulation page.
- `artifacts/mockup-sandbox` — design exploration only.

## Project Purpose

**ChemAI Model Extractor** — a research workbench that converts scientific papers into simulation-ready model artifacts (equations, variables, parameters, ODE templates). Migrated from https://github.com/MehrzadJami/Serious-Tracker.

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

## Roadmap

- **Milestone 1 — Skeleton ✅**: Full-stack scaffold, sidebar nav, six pages, demo data, health check.
- **Milestone 2 — AI extraction layer**: Provider interface, mock + OpenAI + Gemini, `/api/extract/text` and `/api/extract/pdf` endpoints, persistence in Postgres.
- **Milestone 3 — Editing flows**: Inline edits to variables and parameters with optimistic UI.
- **Milestone 4 — Simulation ✅**: RK4 integrator, Recharts time-series chart, parameter sliders.
- **Milestone 5 — Exports**: Markdown, CSV, Python ODE template downloads.
- **Milestone 6 — Polish + deploy**: End-to-end test on a real paper, screenshots, publish.

## GitHub

Source: https://github.com/MehrzadJami/Serious-Tracker
