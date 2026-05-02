# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

**Project:** ChemAI Model Compiler — turns scientific literature and experimental notes into transparent, reproducible, simulation-ready engineering model packages.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite + Tailwind CSS 4 + shadcn/ui + wouter + TanStack Query + Recharts
- **Exports**: JSZip (client-side 14-file model package ZIP)
- **Logging**: Pino (structured JSON, API server only)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run migrate` — apply DB migrations
- `pnpm --filter @workspace/db run seed` — seed demo project (Andrews 1968 chemostat)
- `pnpm --filter @workspace/db run studio` — Drizzle Studio DB browser
- `pnpm --filter @workspace/api-server run dev` — run API server
- `pnpm --filter @workspace/chem-ai run dev` — run frontend

Smoke test: `curl localhost:80/api/healthz` — all requests go through the shared proxy at `localhost:80`, never directly to service ports.

## Artifacts

- `artifacts/api-server` — Express 5 API at `/api`. Projects, source documents, extractions (model cards, equations, variables, parameters, assumptions). Seeds demo on first boot.
- `artifacts/chem-ai` — React + Vite web UI at `/`. Full ChemAI Model Compiler frontend: landing page, dashboard, new extraction, model cards list, 10-tab model card detail, in-browser RK4 simulation, exports guide.
- `artifacts/mockup-sandbox` — design exploration only.

## Shared Libraries

| Package | Role |
|---|---|
| `@workspace/db` | Drizzle client, all table definitions, migrations |
| `@workspace/api-spec` | OpenAPI YAML + Orval codegen config |
| `@workspace/api-zod` | Zod request/response schemas (used in routes) |
| `@workspace/api-client-react` | Generated TanStack Query hooks |

## Extraction Engine

Canonical contract: `artifacts/api-server/src/lib/extraction-schema.ts` (Zod) — every extraction provider must return data matching `ExtractionResultSchema`: `paper_title_or_topic`, `system_type`, `process_description`, `state_variables[]`, `parameters[]`, `equations[]`, `assumptions[]`, `limitations[]`, `model_card{}`, with `confidence` on every item.

Engine: `artifacts/api-server/src/lib/extractor.ts`
- `ExtractionProvider` interface + `getActiveProvider()` factory — today: always `MockProvider`; future: picks OpenAI/Gemini from `OPENAI_API_KEY`/`GEMINI_API_KEY`
- `runExtraction(text)` — validates input (≥30 chars), calls provider, re-validates output against schema. Throws `ExtractionInputError` (400) or `ExtractionProviderError` (502)
- `mapExtractionToDb(result)` — pure mapper from validated result to DB row shapes

## DB Schema (lib/db/src/schema)

`projects → source_documents → extractions → { equations, variables, parameters, assumptions }`

All extraction children cascade on delete. `assumptions.kind = "assumption" | "limitation"`. `extractions.raw_extraction_json` (JSONB, nullable) preserves the full validated payload alongside normalized rows.

## Client-Side Analysis

All run in-browser after model card loads (no server round-trip):
- `analyzeReproducibility()` — 0–100 score across 8 sub-dimensions (`lib/reproducibility.ts`)
- `runUnitCheck()` — dimensional heuristic check across all equation terms (`lib/unit-check.ts`)
- `generatePythonOdeTemplate()` — Python scipy.integrate scaffold (`lib/python-generator.ts`)
- `generateModelPackage()` — 14-file model package assembler (`lib/package-generator.ts`)

## Simulation Page (simulation.tsx)

Pure in-browser RK4 ODE solver for Monod chemostat model (no server).
- Model: μ = μmax·S/(Ks+S), dX/dt = (μ-D)·X, dS/dt = D·(Sin-S) - (1/Yxs)·μ·X
- Solver: 4th-order Runge-Kutta, capped at 50 000 steps, decimated to ≤ 1 000 plot points
- Analytical steady-state dashed reference lines on chart
- Download CSV button after simulation runs

## Demo Workflow

1. Navigate to `/` — "View Demo Model" → `/model-cards/1` (Andrews 1968 chemostat, repro 100/100)
2. Navigate to `/new` — click "Monod Chemostat (Andrews 1968)" to pre-fill source text, then "Extract Model"
3. Navigate to `/simulation` — run RK4 sim, download CSV
4. On any model card — "Download Package" button creates 14-file ZIP client-side

## API Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/healthz` | Health check |
| GET | `/api/projects` | List all projects with counts |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project + sources + extractions |
| DELETE | `/api/projects/:id` | Delete project (cascade) |
| POST | `/api/projects/:id/sources` | Add source document |
| POST | `/api/projects/:id/extractions` | Run extraction |
| GET | `/api/projects/:id/model-card` | Get latest model card |
| GET | `/api/projects/:id/export` | Full project JSON export |
| GET | `/api/export` | Export ALL projects as one JSON dump |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes (prod) | Session signing secret |
| `PORT` | No | Injected by Replit per-service |
| `BASE_PATH` | No | Injected by Replit per-service |
| `OPENAI_API_KEY` | No | Enables OpenAI provider (future) |
| `GEMINI_API_KEY` | No | Enables Gemini provider (future) |

See `.env.example` for the full list with descriptions.

## Documentation

- `README.md` — full product README (14 sections)
- `docs/ARCHITECTURE.md` — monorepo structure, data flow, provider abstraction
- `docs/API.md` — full endpoint reference with request/response shapes
- `docs/LOCAL_SETUP.md` — local dev setup, Replit setup, troubleshooting
- `docs/ROADMAP.md` — M1–M11 completed, M12–M17 planned
- `docs/MODEL_EXTRACTION_SCHEMA.md` — ExtractionResultSchema field-by-field reference

## Milestone Status

M1 ✅ · M2 ✅ · M3 ✅ · M4 ✅ · M5 ✅ · M6 ✅ · M7 ✅ · M8 ✅ · M8b ✅ · M9 ✅ · M10 ✅ · M11 ✅ · M12 ✅

Next: M13 Real AI Providers (OpenAI GPT-4o + Gemini 1.5 Pro structured output)

## GitHub

Source: https://github.com/MehrzadJami/Serious-Tracker
