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
- `ExtractionProvider` interface + `getActiveProvider()` factory — picks OpenAI/Gemini from `OPENAI_API_KEY`/`GEMINI_API_KEY`, falls back to `MockProvider`
- `runExtraction(text, preferred?)` — validates input (≥30 chars), calls provider, attempts one JSON repair pass on failure, re-validates. Returns `{ result, providerName, audit: AuditData }`. Throws `ExtractionInputError` (400) or `ExtractionProviderError` (502)
- `AuditData` — `{ providerModel, systemPrompt, promptTemplateSummary, rawProviderResponse, repairStatus, validationErrors, tokenUsage }`. All persisted to DB. No secrets stored.
- `mapExtractionToDb(result)` — pure mapper from validated result to DB row shapes
- Providers: `OpenAIProvider` (GPT-4o, json_object mode, cost estimate), `GeminiProvider` (gemini-1.5-flash, json mime type), `MockProvider` (deterministic)

## DB Schema (lib/db/src/schema)

`projects → source_documents → extractions → { equations, variables, parameters, assumptions }`

All extraction children cascade on delete. `assumptions.kind = "assumption" | "limitation"`. Extractions table columns:
- `raw_extraction_json` (JSONB, nullable) — full validated payload
- `provider_model`, `system_prompt`, `prompt_template_summary` — M17 audit fields (text, default "")
- `raw_provider_response` (JSONB, nullable) — provider output BEFORE repair/validation
- `repair_status` enum ("not_needed"|"repaired"|"failed"), `validation_errors` (text, nullable)
- `token_usage` (JSONB, nullable) — provider token count + cost estimate

## Human Verification & Inline Editing (M16)

All four normalized child tables (variables, parameters, equations, assumptions) support inline editing:
- Backend: `artifacts/api-server/src/routes/editing.ts` — `PATCH /api/variables/:id`, `PATCH /api/parameters/:id`, `PATCH /api/equations/:id`, `PATCH /api/assumptions/:id` + reset-to-original routes
- Frontend tab components: `VariablesTab`, `ParametersTab`, `EquationsTab`, `AssumptionsTab` — each row has Edit/Reset/Save/Cancel inline controls, shows `editedByUser` badge, stores `originalValue` snapshot
- Used in `model-card-detail.tsx` tabs

## Prompt Transparency & Audit Trail (M17)

Every extraction records a full audit record persisted to `extractions` table:
- `providerModel` — exact model ID (e.g. "gpt-4o", "gemini-1.5-flash", "mock")
- `systemPrompt` — instructional text sent to provider (no API keys/secrets)
- `promptTemplateSummary` — one-line template description
- `rawProviderResponse` — raw provider output BEFORE JSON repair (null for mock)
- `repairStatus` — whether automatic JSON repair was needed
- `validationErrors` — Zod error details if repair failed
- `tokenUsage` — token counts + estimated cost (null for mock)
- Frontend: "Audit Trail" tab in model-card-detail.tsx using `AuditTrailTab` component
- Legacy rows (pre-M17) show a warning banner; all fields default to empty/null

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
| GET | `/api/auth/user` | Current session user (null if unauthenticated) |
| GET | `/api/login` | Start OIDC login flow (redirects to provider) |
| GET | `/api/callback` | OIDC callback — creates session, sets cookie |
| GET | `/api/logout` | Clear session + redirect to provider end-session |
| POST | `/api/mobile-auth/token-exchange` | Exchange auth code for session token (mobile) |
| POST | `/api/mobile-auth/logout` | Destroy session token (mobile) |
| GET | `/api/projects` | List projects visible to caller (own + public) |
| POST | `/api/projects` | Create project (private if authed, public if not) |
| GET | `/api/projects/:id` | Get project + sources + extractions |
| DELETE | `/api/projects/:id` | Delete project (owner or legacy only) |
| PATCH | `/api/projects/:id/visibility` | Toggle public/private (owner only) |
| POST | `/api/projects/:id/sources` | Add source document |
| POST | `/api/projects/:id/extractions` | Run extraction |
| GET | `/api/projects/:id/model-card` | Get latest model card |
| GET | `/api/projects/:id/export` | Full project JSON export |
| GET | `/api/export` | Export ALL projects as one JSON dump |
| GET | `/api/share/model-cards/:extractionId` | Public share — sensitive audit fields redacted |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes (prod) | Session signing secret |
| `REPL_ID` | Yes (auth) | OIDC client ID — provided automatically by Replit |
| `ISSUER_URL` | No | OIDC issuer (default: `https://replit.com/oidc`) |
| `PORT` | No | Injected by Replit per-service |
| `BASE_PATH` | No | Injected by Replit per-service |
| `OPENAI_API_KEY` | No | Enables OpenAI provider |
| `GEMINI_API_KEY` | No | Enables Gemini provider |

See `.env.example` for the full list with descriptions.

## Documentation

- `README.md` — full product README (14 sections)
- `docs/ARCHITECTURE.md` — monorepo structure, data flow, provider abstraction
- `docs/API.md` — full endpoint reference with request/response shapes
- `docs/LOCAL_SETUP.md` — local dev setup, Replit setup, troubleshooting
- `docs/ROADMAP.md` — M1–M11 completed, M12–M17 planned
- `docs/MODEL_EXTRACTION_SCHEMA.md` — ExtractionResultSchema field-by-field reference

## Domain Templates and Model Type Classifier (M19)

A pure TypeScript rule-based classifier lives in `lib/domain-classifier/`.

### Classifier (`lib/domain-classifier/src/classifier.ts`)
- `classifyModel(input: ClassificationInput): ClassificationResult`
- Searches source text, extracted title/domain, variable names, parameter names/symbols
- Field weights: title+domain = 3×, extracted names = 2×, symbols = 1×
- Confidence = score / (score + 5) — calibrated so a single definitive keyword in title → ~64%
- Never throws; defaults to "generic_ode" with confidence 0

### Domain Templates (`lib/domain-classifier/src/templates.ts`)
- `getDomainTemplate(modelType): DomainTemplate` — expected vars, params, units, checklist, ODE hints
- All 7 types fully specified (see below)

### DB schema (`lib/db/src/schema/extractions.ts`)
4 new columns: `model_type` (text enum, default "generic_ode"), `model_type_confidence` (real, default 0), `model_type_matched_keywords` (jsonb), `model_type_override` (nullable text enum — user override)

### API routes
- Classification runs automatically on every extraction insert (in `projects.ts`)
- `PATCH /api/extractions/:id/model-type` — sets/clears user override (`editing.ts`)

### Frontend
- Model type badge in model card header (violet for detected types, grey for generic_ode)
- Badge shows ★ prefix when user override is active
- "Domain Checklist" tab with: model type + confidence, matched keywords, expected variables/parameters with ✓/✗ status, grouped checklist items (Critical/Good Practice/Informational), ODE template hints, expected units grid, manual override dropdown

## Experimental CSV Upload and Parameter Fitting (M20)

New page at `/experimental-data` ("Exp. Data Fitting" in sidebar).

### Files
- `artifacts/chem-ai/src/lib/csv-parser.ts` — CSV parser + validator (required cols, numeric check, monotone time, min rows)
- `artifacts/chem-ai/src/lib/fitting.ts` — RK4 ODE solver + Nelder-Mead simplex + `fitMonodChemostat()`
- `artifacts/chem-ai/src/pages/experimental-data.tsx` — Full 3-step page (Upload → Configure → Results)
- `artifacts/chem-ai/public/samples/chemostat_sample.csv` — 16-row synthetic sample (served statically)
- `samples/chemostat_sample.csv` — same file in repo root

### Fitting method
- **Algorithm:** Nelder-Mead simplex (no derivatives, log-space parameters for positivity)
- **ODE solver:** RK4, dt ≈ 0.02 h (same Monod chemostat model as Simulation page)
- **Objective:** Normalized sum of squared residuals for X and S (normalization prevents large-scale domination)
- **Parameters fittable:** mumax, Ks, Yxs (any subset; rest fixed by user)
- **Fixed inputs:** D, Sin, X0, S0

### Limits / assumptions (v1)
- Only supports Monod chemostat model (continuous culture, D > 0)
- Fitting quality depends on data coverage (transient + steady-state data works best)
- Does not validate the model — only compares predictions to data
- No uncertainty quantification (confidence intervals) in v1
- Max 10,000 rows; time in hours; concentrations in g/L

## Unit Check v2 — Formal Dimensional Analysis (M21)

Augments the heuristic unit checker with pattern-based dimensional analysis. The Unit Check tab now has two clearly labelled sections.

### Files
- `artifacts/chem-ai/src/lib/dimensional-analysis.ts` — core library: Dim algebra, unit parser, `buildDimMap`, 5 pattern checkers, `runFormalDimensionalAnalysis()`
- `artifacts/chem-ai/src/lib/__tests__/dimensional-analysis.test.ts` — 35 tests (all pass)
- `artifacts/chem-ai/src/pages/model-card-detail.tsx` — `formalReport` useMemo + restructured Unit Check tab

### Dimension system
- **Dim vector:** `{M, V, T, N}` — mass, volume, time, amount (mol)
- **Unit parser:** handles `g/L`, `1/h`, `h^-1`, `g/L/h`, `mol/L`, `g/g`, `g-X/g-S`, `dimensionless`, etc.
- **Symbol map:** built from extraction variables + parameters, lowercase aliases added for normalised equation text matching

### Supported patterns (v1)
1. **ODE derivative LHS** — `d[Sym]/dt`: infers LHS dimension from symbol unit ÷ time unit; reports even when RHS cannot be parsed
2. **Monod growth kinetics** — `μ = μmax · S / (Ks + S)`: checks `dim(μ) = dim(μmax)` and `dim(S) = dim(Ks)`
3. **Biomass ODE** — `dX/dt = (μ − D) · X`: checks μ, D are [1/T] and X is concentration
4. **Substrate ODE** — `dS/dt = D·(Sin − S) − (1/Yxs)·μ·X`: checks Yxs is dimensionless, D is [1/T]
5. **Gas/O₂ transfer** — `kLa · (C* − C)`: checks kLa is [1/T]

### Unsupported (falls back to heuristic)
- Power-law kinetics, Haldane inhibition, Andrew's inhibition, double-substrate models
- Multi-phase or variable-volume (fed-batch) balances
- Equations where involved symbols are absent from the variables/parameters tables
- Arbitrary algebraic expressions that don't match the 5 structural patterns

### Fallback mechanism
If no pattern matches, `parsed=false` is set for that equation and the heuristic checker (v1) covers it in the section below. The two sections are always shown side by side. Neither section is hidden.

### Frontend changes (Unit Check tab)
- **Section A — Formal Dimensional Analysis** (teal): pattern legend showing matched count, per-equation cards with LHS/RHS dimension labels, consistency status, and issues
- **Section B — Heuristic Check** (slate): existing warning cards, relabelled clearly, always present as fallback/supplement

### Design rules upheld
- Never claims an equation is "checked" if it wasn't parsed
- Never silently zeroes out an unknown unit — unknown units are excluded from the dim map
- LHS dimension is computed whenever the state variable is found, even if RHS symbol lookup fails

## Limited LaTeX-to-Runnable-Python (M22)

Replaces blank TODO stubs with actual runnable Python for equations that match recognised templates. Unrecognised equations retain honest TODO scaffolds.

### Files
- `artifacts/chem-ai/src/lib/template-matcher.ts` — new: pattern recognition + Python codegen, `matchTemplates()`, `TemplateScanResult`
- `artifacts/chem-ai/src/lib/__tests__/template-matcher.test.ts` — new: 24 tests
- `artifacts/chem-ai/src/lib/python-generator.ts` — updated: accepts `templateResult`, replaces stubs with runnable code
- `artifacts/chem-ai/src/pages/model-card-detail.tsx` — updated: `templateResult` memo, ODE tab restructured

### Supported templates (v1)
| # | Template | Pattern | Python generated |
|---|----------|---------|-----------------|
| 1 | Monod growth kinetics | `μ = μmax·S/(Ks+S)` | `mu = mumax * S / (Ks + S)` |
| 2 | Chemostat biomass ODE | `dX/dt = (μ−D)·X` | `dXdt = (mu - D) * X` |
| 3 | Chemostat substrate ODE | `dS/dt = D·(Sin−S) − (1/Yxs)·μ·X` | `dSdt = D * (Sin - S) - (1.0 / Yxs) * mu * X` |
| 4 | First-order decay | `dC/dt = −k·C` | `dCdt = -k * C` |
| 5 | Gas–liquid transfer | `dC/dt = kLa·(C*−C)` | `dCdt = kLa * (Cstar - C)` |

### Scaffold-only (honest TODO kept)
- Power-law kinetics, Haldane / Andrews inhibition
- Fed-batch variable-volume balances
- Double-substrate models, competitive inhibition
- Any equation not matching one of the 5 structural patterns above

### Computed-intermediate rule
`mu` (growth rate) is computed by the Monod equation and exists as a local Python variable. It is intentionally NOT required to be in the variables/parameters extraction tables. The biomass and substrate ODEs only flag symbols as "missing" if they genuinely cannot be resolved.

### `runnable_template_status` values
- `full` — every equation matched a supported template AND all required symbols are present
- `partial` — some equations matched (runnable), others are TODO scaffolds
- `scaffold_only` — no equations matched any supported template

### ODE Template tab — new sections
1. **Template status card** (emerald/teal/slate): full · partial · scaffold only badge + explanation
2. **Equation Recognition panel**: recognised list (green, per-equation badges + runnable/missing status), scaffold-only list (grey)
3. **Existing Python code block** (now with runnable code where matched)

### Python file header
Added `# Runnable template status: ...` line to generated file header.

## Authentication & Project Privacy (M23)

### Architecture
- **Auth provider**: Replit OIDC (openid-client v6 functional API)
- **Session storage**: PostgreSQL `sessions` table (custom, no express-session)
- **Session cookie**: `sid` (httpOnly, secure, sameSite=lax), 7-day TTL with refresh
- **Auth middleware**: `authMiddleware.ts` — reads session cookie or `Authorization: Bearer` header, attaches `req.user`, supports token refresh

### DB Schema additions
- `users` table: `id` (Replit user ID), `email`, `firstName`, `lastName`, `profileImageUrl`, `createdAt`, `updatedAt`
- `sessions` table: `sid` (text PK), `sess` (JSONB), `expire` (timestamp)
- `projects.ownerId` (FK → users.id, nullable) — null = legacy/demo project (world-editable)
- `projects.visibility` (`private` | `public`, default `public`) — public = accessible by all

### Project visibility rules
- **GET /api/projects**: authenticated → own projects + all public + legacy (ownerId=null); unauthenticated → public + legacy only
- **GET /api/projects/:id**: accessible if public OR legacy OR caller is owner; 403 otherwise
- **Mutations** (add source, run extraction, export): accessible if public OR legacy OR owner
- **DELETE, PATCH visibility**: owner only (legacy projects world-mutable for backwards compat)
- **New projects**: authenticated → `visibility=private`, `ownerId=userId`; unauthenticated → `visibility=public`, `ownerId=null`

### Public Share
- `GET /api/share/model-cards/:extractionId` — project must be public or legacy; strips `systemPrompt`, `rawProviderResponse`, `promptTemplateSummary` before returning
- Frontend route `/share/model-cards/:id` — read-only view, no sidebar, shows branding banner with "Sign in" button

### Frontend
- `lib/replit-auth-web/` — `useAuth()` hook: fetches `/api/auth/user`, provides `user`, `isAuthenticated`, `login()`, `logout()`, `isLoading`
- Sidebar: shows user initials + display name + logout button when authenticated; shows "Sign In" button otherwise
- `model-card-detail.tsx`: visibility toggle (owner only, globe/lock icon), share link copy button (when public)
- `App.tsx`: `/share/model-cards/:id` route is rendered outside the main `<Layout>` (no sidebar)

### Key files
- `lib/db/src/schema/auth.ts` — sessionsTable, usersTable
- `artifacts/api-server/src/lib/auth.ts` — OIDC config, session CRUD
- `artifacts/api-server/src/middlewares/authMiddleware.ts` — session auth + token refresh
- `artifacts/api-server/src/routes/auth.ts` — login/callback/logout/mobile-auth
- `artifacts/api-server/src/routes/share.ts` — public share endpoint
- `lib/replit-auth-web/src/use-auth.ts` — `useAuth()` React hook
- `lib/api-zod/src/mobile-auth-schemas.ts` — hand-written Zod schemas (Orval only generates TS interfaces for these)

### Codegen note
`lib/api-zod/src/index.ts` exports only from `./generated/api` (Zod schemas) + `AuthUser` type from `./generated/types/authUser`. Three mobile-auth schemas are hand-written in `mobile-auth-schemas.ts` because Orval generates TypeScript interfaces (not Zod schemas) for component-ref body/response schemas that share the same name as their operationId pattern.

## Milestone Status

M1 ✅ · M2 ✅ · M3 ✅ · M4 ✅ · M5 ✅ · M6 ✅ · M7 ✅ · M8 ✅ · M8b ✅ · M9 ✅ · M10 ✅ · M11 ✅ · M12 ✅ · M13 ✅ · M16 ✅ · M17 ✅ · M19 ✅ · M20 ✅ · M21 ✅ · M22 ✅ · M23 ✅

M16: Human Verification & Inline Editing — DB schema, PATCH/reset API routes, 4 frontend tab components (Variables, Parameters, Equations, Assumptions) with inline edit/reset/save controls and editedByUser badges.
M17: Prompt Transparency & Extraction Audit Trail — DB columns, extractor AuditData return, provider model ID + system prompt capture, route persistence, OpenAPI spec update, codegen, AuditTrailTab frontend component.
M19: Domain Templates and Model Type Classifier — @workspace/domain-classifier lib (classifier + templates + 31 tests), 4 new DB columns, classifier integrated into extraction route, model type override PATCH route, model type badge in header, DomainChecklistTab frontend component.
M23: Authentication and Project Privacy — Replit OIDC auth, PostgreSQL session store, project ownership/visibility, public share URLs, sidebar auth controls, visibility toggle + share link in model card detail.
M24: Benchmark Dataset and Extraction Evaluation — 5 synthetic fixture files, 5 expected answer files, Jaccard/recall scoring engine, live HTTP-based runner, JSON reports. Run with `pnpm benchmark`.

## Extraction Benchmark (M24)

Developer benchmark to catch extraction regressions and compare provider behaviour.
See `docs/BENCHMARK.md` for full documentation.

### Location
```
benchmark/
├── fixtures/          # 5 synthetic text excerpts (non-copyrighted)
├── expected/          # 5 expected answer files (symbols, units, equations)
├── src/
│   ├── run.ts         # CLI runner — HTTP-based, creates/deletes temp projects
│   ├── evaluate.ts    # Scoring logic (Jaccard, recall, unit matching)
│   └── types.ts       # Shared TypeScript interfaces
└── reports/           # JSON reports written per run (gitignored)
```

### Fixtures
| File | System | Key symbols |
|---|---|---|
| `chemostat_monod.txt` | Continuous chemostat, Monod kinetics | X, S, mumax, Ks, Yxs, D, Sin |
| `gas_liquid_transfer.txt` | Oxygen transfer in aerobic bioreactor | C, X, kLa, Cstar, qO2 |
| `batch_reactor_first_order.txt` | First-order batch degradation | C, k, C0 |
| `fed_batch_growth.txt` | Fed-batch bioreactor, variable volume | X, S, V, mumax, Ks, F, Sin |
| `photobioreactor_light.txt` | Photobioreactor, Haldane light kinetics | X, mumax, KI, KiI, I |

### Scoring (weights)
- Variable symbol Jaccard: 25%
- Parameter symbol Jaccard: 25%
- Equation symbol-set recall: 25%
- Unit accuracy: 15%
- Missing information quality: 10%

### Usage
```bash
# Requires API server running: pnpm --filter @workspace/api-server run dev
pnpm benchmark                      # mock provider (always available)
pnpm benchmark --provider openai    # requires OPENAI_API_KEY
pnpm benchmark --provider gemini    # requires GEMINI_API_KEY
pnpm benchmark --provider all       # compare all three
pnpm benchmark --fixture chemostat  # single fixture only
```

### Mock baseline
The Mock provider returns a fixed Andrews 1968 chemostat response. It scores well only on `chemostat_monod`; low on other fixtures. Use it as a lower-bound regression baseline, not as an accuracy measurement.

## GitHub

Source: https://github.com/MehrzadJami/Serious-Tracker
