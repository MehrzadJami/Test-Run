# Architecture

## Overview

ChemEngAI Model Compiler is a **pnpm monorepo** with a clear separation between the API server, the React frontend, and shared libraries. The system uses a path-based reverse proxy so all traffic passes through `localhost:80`, regardless of which service is handling the request.

```
/           → artifacts/chem-ai   (React + Vite frontend)
/api        → artifacts/api-server (Express 5 API)
```

---

## Repository Structure

```
.
├── artifacts/
│   ├── api-server/          # Express 5 REST API
│   │   ├── src/
│   │   │   ├── index.ts     # Server entry point, Pino logger, middleware
│   │   │   ├── routes/
│   │   │   │   ├── health.ts     # GET /api/healthz
│   │   │   │   ├── projects.ts   # All /api/projects/* routes
│   │   │   │   └── index.ts      # Route aggregator
│   │   │   └── lib/
│   │   │       ├── extractor.ts          # Provider orchestrator
│   │   │       ├── extraction-schema.ts  # Zod schema (ExtractionResultSchema)
│   │   │       ├── providers/
│   │   │       │   └── mock.ts           # MockProvider (deterministic)
│   │   │       ├── python-generator.ts   # Python ODE scaffold generator
│   │   │       └── package-generator.ts  # 14-file model package generator (M9)
│   │   └── package.json
│   │
│   └── chem-ai/             # React + Vite frontend
│       ├── src/
│       │   ├── App.tsx           # Router, providers, Toaster
│       │   ├── pages/
│       │   │   ├── home.tsx           # Landing page
│       │   │   ├── dashboard.tsx      # Stats + project table
│       │   │   ├── new-extraction.tsx # Source upload + extraction trigger
│       │   │   ├── model-cards.tsx    # Project list
│       │   │   ├── model-card-detail.tsx  # 10-tab model card (main view)
│       │   │   ├── simulation.tsx     # In-browser RK4 simulator
│       │   │   └── exports.tsx        # Export guide and links
│       │   ├── components/
│       │   │   ├── ui/           # shadcn/ui primitives
│       │   │   ├── layout.tsx    # App shell (sidebar, header)
│       │   │   └── ThemeProvider.tsx
│       │   └── lib/
│       │       ├── reproducibility.ts  # Reproducibility scoring (client-side)
│       │       ├── unit-check.ts       # Unit dimension check (client-side)
│       │       ├── python-generator.ts # Python ODE template (client-side)
│       │       └── package-generator.ts # 14-file package assembler (client-side)
│       └── package.json
│
├── lib/
│   ├── db/                  # @workspace/db — Drizzle ORM + schema + migrations
│   │   └── src/schema/      # One file per table
│   ├── api-spec/            # @workspace/api-spec — OpenAPI YAML + codegen
│   ├── api-zod/             # @workspace/api-zod — Zod schemas for API bodies
│   └── api-client-react/    # @workspace/api-client-react — TanStack Query hooks
│
├── scripts/                 # @workspace/scripts — shared utility scripts
├── pnpm-workspace.yaml      # Workspace + catalog pinning
├── tsconfig.base.json       # Shared strict TypeScript defaults
└── kanban.md                # Living milestone roadmap
```

---

## Data Flow

### Extraction pipeline

```
User pastes text
    │
    ▼
POST /api/projects/:id/sources       (store source document)
    │
    ▼
POST /api/projects/:id/extractions
    │
    ├─ Input validation (min length check)
    ├─ getActiveProvider() → MockProvider | OpenAIProvider | GeminiProvider
    ├─ provider.extract(text) → raw JSON
    ├─ ExtractionResultSchema.parse(raw) → typed ExtractionResult
    ├─ mapExtractionToDb(result) → row shapes
    └─ DB transaction:
          INSERT extractions (+ raw_extraction_json)
          INSERT equations
          INSERT variables
          INSERT parameters
          INSERT assumptions
    │
    ▼
201 { extraction, equations, variables, parameters, assumptions }
    │
    ▼
Frontend: model-card-detail.tsx loads via useGetModelCardByProject()
```

### Client-side analysis (no server round-trip)

The following run entirely in the browser after the model card loads:

```
rawExtractionJson + normalized tables
    │
    ├─ analyzeReproducibility()  → score 0–100, 8 sub-dimensions
    ├─ runUnitCheck()            → HIGH / MEDIUM issues per equation term
    └─ generatePythonOdeTemplate() → Python code string
```

### Export pipeline

```
Model card loaded in browser
    │
    ▼
generateModelPackage()      (lib/package-generator.ts)
    │  Assembles 14 files in memory
    │
    ▼
JSZip.generateAsync("blob")
    │
    ▼
URL.createObjectURL() → <a> click → chemengai_<name>_package.zip
```

---

## Provider Abstraction

```typescript
interface ExtractionProvider {
  readonly name: ProviderName; // "mock" | "openai" | "gemini"
  extract(text: string): Promise<unknown>;
}
```

`getActiveProvider()` selects the active provider at runtime:

| Env vars present | Provider used |
|---|---|
| Neither | MockProvider |
| `OPENAI_API_KEY` | OpenAI GPT-4o (planned) |
| `GEMINI_API_KEY` | Gemini 1.5 Pro (planned) |

Every provider response is re-validated against `ExtractionResultSchema` before being persisted. Providers cannot bypass the schema.

---

## Shared Libraries

| Package | Role |
|---|---|
| `@workspace/db` | Drizzle client, all table definitions, migrations |
| `@workspace/api-spec` | OpenAPI YAML, Orval codegen config |
| `@workspace/api-zod` | Zod schemas for request bodies and params (used in routes) |
| `@workspace/api-client-react` | Generated TanStack Query hooks (`useListProjects`, `useGetModelCardByProject`, etc.) |

The contract flows: `api-spec` (OpenAPI) → `codegen` → `api-zod` + `api-client-react`. Changing the OpenAPI spec requires running `pnpm --filter @workspace/api-spec run codegen` before the types propagate.

---

## Routing and Proxy

The Replit reverse proxy routes by path prefix. Each artifact registers its paths in `.replit-artifact/artifact.toml`. The API server handles `/api/*`; the frontend handles `/`. Path-based routing means:

- The frontend uses relative API calls (no hardcoded host or port)
- `curl` testing goes through `localhost:80`, not a service port directly
- In production, both services are reachable under the same `.replit.app` domain

---

## Logging

The API server uses Pino structured logging (JSON output).

- In route handlers: `req.log.info(...)`, `req.log.error(...)`
- Outside request context: import the singleton `logger` from `src/index.ts`
- Never use `console.log` in server code

---

## TypeScript Configuration

- `tsconfig.base.json` — shared strict defaults
- `lib/*` packages — composite, emit declarations (`tsc --build`)
- `artifacts/*` — leaf packages, checked with `tsc --noEmit`
- Root `tsconfig.json` — solution file for libs only; artifacts are not referenced

Run the full typecheck: `pnpm run typecheck`
