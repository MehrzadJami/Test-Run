# ChemAI Model Compiler — Project Kanban

> Living document. Move cards between columns as work progresses.
> Source: https://github.com/MehrzadJami/Test-Run

---

## ✅ Done

### M1 — Full-stack Scaffold
- Express 5 API + Vite React + TypeScript throughout
- PostgreSQL + Drizzle ORM — schema-first, strongly typed
- pnpm monorepo: `api-server` (/api) · `chem-ai` (/) · `mockup-sandbox` (/__mockup)
- OpenAPI spec in `lib/api-spec/openapi.yaml` → Orval codegen → React Query hooks + Zod schemas
- Pino structured logging (`req.log` in routes, singleton `logger` elsewhere)
- Path-based reverse proxy at `localhost:80` — no direct port access needed
- Sidebar navigation: Dashboard · New Extraction · Model Cards · Simulation · Exports

### M2 — AI Extraction Engine
- `ExtractionProvider` interface — swap providers without changing call sites
- `MockProvider` — deterministic fixture for development; always active until M13
- `ExtractionResultSchema` — Zod validation on all provider responses
- `runExtraction()` entry point with full input + output validation
- `mapExtractionToDb()` — pure mapper from provider result → DB row shapes
- `getActiveProvider()` factory ready: picks OpenAI/Gemini automatically when env vars are set
- `rawExtractionJson` (JSONB) — full validated payload stored for traceability

### M3 — Database Schema & Seeding
- `projects → source_documents → extractions → { equations, variables, parameters, assumptions }`
- `assumptions.kind` enum: `assumption | limitation`
- Cascade deletes on all child tables
- Auto-seed on first boot: chemostat demo (Andrews 1968) — 100/100 reproducibility, 0H/5M unit check
- Seed is idempotent — safe to run on every server startup
- Standalone seed script: `pnpm --filter @workspace/db run seed`

### M4 — Branding & Landing Page
- Product name: **ChemAI Model Compiler** — consistent in all files
- Hero section: teal "Simulation-Ready" highlight, flask icon, "View Demo Model" CTA
- "NOT A NOTEBOOKLM CLONE" — side-by-side capability comparison card
- "NOT A BLACK-BOX OPTIMIZER" — honest scope differentiation section
- Core workflow 3-step card row: Ingest → Extract → Simulate & Export
- Example output stat tiles: repro score · 14-file package · Python scaffold · unit check
- Amber scientific accuracy callout (required disclaimer, honest wording)
- No exaggerated claims ("digital twin", "guaranteed optimization" absent throughout)

### M5 — Model Card — 10-Tab View
- **Overview** — system description, problem statement, model card summary (inputs/outputs/controls)
- **Variables (N)** — state variables with symbol, role, unit, source quote, confidence badge
- **Parameters (N)** — parameters with symbol, value, unit, confidence badge, source quote
- **Equations (N)** — equation list with LaTeX rendering, symbol inventory, source quotes
- **Assumptions (N)** — assumptions and limitations in separate sub-sections
- **Missing Info** — critical/warning/info severity items with source context
- **ODE Template** — generated Python code viewer + copy + download (M8)
- **Reproducibility** — score breakdown with per-dimension bars (M6)
- **Unit Check** — heuristic check-by-check results (M7)
- **Raw JSON** — full extraction payload for debugging
- Header badges: system type · MOCK provider tag · readiness badge · repro score · unit check status
- Header actions: "Run Simulation" · "Export JSON" · "Download Package"

### M6 — Reproducibility Scoring Engine
- Pure client-side (`src/lib/reproducibility.ts`) — no server/AI call
- 13+ rule-based checks: equations, parameters, units, ICs, symbol cross-reference, gas-transfer, yield coefficients, Henry's law, kinetic constants
- 5 weighted sub-scores: equations 25% · parameters 25% · units 20% · ICs 20% · traceability 10%
- Overall score 0–100, readiness gate: `ready` ≥75 + 0 criticals · `partial` ≥40 + ≤1 critical · `not_ready` otherwise
- Output: score, sub-scores, readiness, blockers, `MissingItem[]` severity-sorted, next steps
- Score badge in model card header; full breakdown in Reproducibility tab

### M7 — Unit & Dimension Checker
- Pure client-side (`src/lib/unit-checker.ts`)
- 10 heuristic checks: dimensionless kinetics, mixed time units, yield bounds, rate consistency, concentration units, dimensionless ratios, unit presence, unit–value agreement, kinetic constant units, Monod constant reasonability
- Severity levels: high · medium · info
- Status badge in model card header: e.g. `Units: 0H / 5M`
- Unit Check tab with check-by-check results

### M8 — Python ODE Template Generator
- Pure client-side (`src/lib/python-generator.ts`), generated via `useMemo` in model card
- 10 output sections: header comment · imports · `params={}` dict · `y0=[]` ICs · equations comment · `ode_model()` · `solve_ivp` call · plotting · missing info notes · unit check warnings
- Honest-scaffold: numeric values only where extracted; equation bodies are `# TODO` stubs with LaTeX shown as comments
- Amber readiness warning banner if `simulation_readiness` is `partial` or `not_ready`
- Red unit-check warning banner if any high-severity unit issues
- Scrollable code viewer · "Copy to clipboard" · "Download model_template.py"

### M9 — Reproducible Model Package Export (14-file ZIP)
- Client-side ZIP generation via `jszip` — no server needed
- "Download Package" button in model card header
- 14 files in `model_package/`:
  - `README.md` — overview, scores, missing gaps, how-to-run instructions
  - `model_card.md` — full human-readable model card
  - `equations.md` — LaTeX equations with source context
  - `variables.csv` — symbol, name, unit, role, source_quote
  - `parameters.csv` — symbol, value, unit, confidence, source_quote
  - `assumptions.md` — all assumptions with source context
  - `limitations.md` — all limitations with source context
  - `missing_information.md` — missing information with severity levels
  - `reproducibility_report.json` — score breakdown (machine-readable)
  - `unit_check_report.json` — unit check results (machine-readable)
  - `raw_extraction.json` — raw extraction JSON from the provider
  - `simulate.py` — Python ODE scaffold (reuses M8 generator)
  - `requirements.txt` — `numpy`, `scipy`, `matplotlib`
  - `source_excerpt.txt` — deduplicated verbatim source quotes (traceability record)

### M10 — UI Polish & Demo Readiness
- **Dashboard** — color-coded stat cards (teal/violet accent borders), animated skeleton loading, icon + retry error state, clean empty state with CTA
- **New Extraction** — "Load demo source text" panel with two pre-fill buttons: Monod Chemostat (Andrews 1968) and Aerobic Bioreactor O₂ transfer; character counter; "What gets extracted" tip box
- **Exports page** — full rewrite: all buttons active and linked; green "Available" badges; 4 export cards (Package ZIP · Python ODE · CSV Tables · Simulation CSV + Raw JSON); explanation of client-side generation
- **Model Cards list** — animated skeleton loading, library-icon empty state with CTA, search no-results state with clear button, result count badge
- **Simulation** — polished (unchanged in M10)
- **Model Card Detail** — polished (unchanged in M10)

### M11 — README & Documentation
- `README.md` — 14-section product README (honest tone, no exaggeration, full feature walkthrough)
- `docs/ARCHITECTURE.md` — monorepo structure, data flow, provider abstraction, proxy routing
- `docs/API.md` — full endpoint reference with request/response shapes and curl smoke tests
- `docs/LOCAL_SETUP.md` — step-by-step for local dev and Replit, Docker section, Vite proxy tip
- `docs/ROADMAP.md` — all completed milestones + planned milestones with acceptance criteria
- `docs/MODEL_EXTRACTION_SCHEMA.md` — `ExtractionResultSchema` field-by-field reference

### M12 — Portability & Development Handoff
- `.env.example` — all required/optional vars documented with no real values
- `docker-compose.yml` — single-command local Postgres (`docker compose up -d`)
- `lib/db/package.json` — added `generate`, `migrate`, `studio`, `seed` npm scripts
- `lib/db/drizzle.config.ts` — dotenv loaded automatically; `out` dir for migration files
- `lib/db/src/seed.ts` — standalone seed script runnable without the API server
- `GET /api/export` — full DB dump as JSON (all projects + model cards)
- `scripts/src/export-data.ts` — CLI: export all data to a JSON file
- `scripts/src/import-data.ts` — CLI: import from exported JSON into a fresh DB
- `.gitignore` — added `.env`, `.env.local`, `.env.*.local`, `logs/`, `*.log`
- `docs/LOCAL_SETUP.md` rewritten with correct ports, Docker section, export/import steps

### Deployment Preparation (pre-M13)
- `artifacts/chem-ai/vite.config.ts` — `PORT` now optional during `vite build` (dev-server-only); production build passes without env vars
- `artifacts/chem-ai/.replit-artifact/artifact.toml` — title updated to "ChemAI Model Compiler"; production: static serve from `dist/public` with SPA rewrite
- `artifacts/api-server/.replit-artifact/artifact.toml` — production: `node --enable-source-maps dist/index.mjs`; health check on `/api/healthz`; `PORT=8080` + `NODE_ENV=production` injected
- `README.md` — "Deploying on Replit" section added: secrets table, one-time schema push step, run commands, verification endpoints, mock-mode feature list
- Both production builds verified clean: API server (esbuild bundle) + frontend (Vite static)
- App not yet published — click "Publish" in Replit to deploy

### M13 — Real AI Providers
- `OpenAIProvider` — GPT-4o with `response_format: { type: "json_object" }`; full `ExtractionResultSchema` Zod validation
- `GeminiProvider` — Gemini 1.5 Flash via `@google/generative-ai`; JSON mode enabled
- Provider priority chain: user-selected → OpenAI → Gemini → Mock (automatic fallback)
- Provider selector UI on New Extraction page (Auto / OpenAI / Gemini / Mock)
- JSON repair pass before Zod validation — recovers from minor model formatting drift
- Token + cost logging per extraction: provider, model, input/output tokens logged via Pino
- `providerUsed` column on `extractions` table — enum `["mock","openai","gemini"]`
- Shared engineering extraction system prompt in `lib/providers/prompt.ts` (LaTeX, units, Monod kinetics context)
- Provider files: `openai-provider.ts`, `gemini-provider.ts`, `prompt.ts`

### M14 — PDF Ingestion
- `POST /api/pdf/parse` — accepts base64-encoded PDF; returns `{ text, pageCount, wordCount, charCount }`
- Server-side extraction via `pdf-parse` v1 (pure Node.js; no browser globals; downgraded from v2 which required `DOMMatrix`)
- Limits: 20 MB decoded size, 200 pages, minimum 30 extractable characters
- Image-only / scanned PDFs rejected with a user-readable fallback message pointing to paste-text tab
- OpenAPI spec updated: `ParsePdfInput` + `ParsePdfResult` schemas; codegen re-run (hooks + Zod)
- New Extraction page: "Upload Document" tab — detects PDF vs plain text, base64-encodes file, calls `/api/pdf/parse`, shows parsed preview card (page count, char/word stats, text snippet)
- Submit button changes to "Confirm & Extract Model" once PDF is successfully parsed

### Security — Dependency Vulnerability Fixes
- 11 transitive vulnerabilities resolved (4 high, 7 moderate) via `pnpm-workspace.yaml` overrides — no direct dependency changes
- `picomatch@<2.3.2` → 2.3.2 (GHSA-c2c7-rcm5-vvqj, GHSA-3v7f-55p6-f55p)
- `picomatch@>=4.0.0 <4.0.4` → 4.0.4 (same CVEs)
- `path-to-regexp@>=8.0.0 <8.4.0` → 8.4.0 (GHSA-j3q9-mxjg-w52f, GHSA-27v5-c462-wpq7)
- `lodash@<=4.17.23` → 4.18.1 (GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh)
- `brace-expansion@>=2.0.0 <2.0.3` → 2.0.3 (GHSA-f886-m6hf-6m8v)
- `yaml@>=2.0.0 <2.8.3` → 2.8.4 (GHSA-48c2-rrv3-qjmp); added to `minimumReleaseAgeExclude`
- `postcss@<8.5.10` → 8.5.10 (GHSA-qx2v-qp2m-jg93)

---

## ⚡ Planned

### M15 — Unit Check v2 (Rigorous Dimensional Analysis)
- Replace heuristic checks with formal dimensional algebra
- Each equation term gets explicit unit decomposition
- Report failures by equation and term, not just heuristic patterns
- Consider: TypeScript unit library (`unitmath`, `mathjs`) or call a Python `pint` microservice

### M16 — Authentication
- Replit Auth (OpenID Connect + PKCE) or Clerk
- Per-user project isolation — users only see their own projects
- Public / private model card visibility toggle
- `SESSION_SECRET` env var already reserved in `.env.example`

### M17 — Multi-source Projects
- Attach multiple source documents to one project
- Aggregate model card across all sources
- Conflict detection: same parameter, different values across sources — flag with source attribution
- `POST /api/projects/:id/sources` already exists; aggregation logic is the new work

### M18 — Inline Editing
- Edit variable symbol, unit, role inline in the Variables tab
- Edit parameter symbol, value, unit inline in the Parameters tab
- Optimistic UI updates + `PATCH /api/variables/:id` and `PATCH /api/parameters/:id` routes
- Undo/redo stack (client-side)

### M19 — Automated Tests
- Vitest unit tests: `analyzeReproducibility`, `runUnitCheck`, `generatePythonOdeTemplate`, `generateModelPackage`
- API integration tests for all routes (supertest or `node:test`)
- Playwright E2E: full extraction workflow, model card navigation, ZIP download
- GitHub Actions CI workflow on push to `main`

---

## 💡 Future Ideas

### LaTeX → Runnable Python (AST-based)
- Parse extracted LaTeX with `latex2sympy2` or custom grammar
- Generate real Python math instead of `# TODO` stubs
- Validate dimensional consistency symbolically before generating code

### Parameter Fitting from Experimental Data
- Upload time-series CSV (t, X, S columns)
- Fit μmax, Ks, Yxs via `scipy.optimize.minimize` or in-browser Nelder-Mead
- Fitted vs measured overlay on the simulation chart

### Sensitivity Analysis
- Vary one parameter across a user-defined range
- Run simulation ensemble → plot min/mean/max output bands
- First-order Sobol indices for ranked parameter importance

### Multi-Model Comparison
- Select two or more model cards → side-by-side tab view
- Overlay simulation traces from multiple models on one chart
- Diff equations, parameters, assumptions between models

### Export to MATLAB / Julia / Modelica
- MATLAB: `.m` script with `ode45`
- Julia: `DifferentialEquations.jl` compatible scaffold
- Modelica: `.mo` component block

### Gas-Transfer & O₂ Sub-models
- Built-in `kLa`, Henry's law, dissolved O₂ transfer blocks
- Toggle on/off for aerobic bioreactor models
- Pre-validated unit conventions for gas-phase ↔ liquid-phase transfer

### Notebook Export
- Jupyter `.ipynb` with ODE template, parameter cells pre-filled, and simulation plot cell
- One-click download from model card header

### Equation Similarity Search
- Find other model cards that share the same governing equations
- Match by normalized LaTeX structure, not string equality

### LLM Prompt Transparency
- Show the exact prompt sent to the AI provider per extraction
- Side-by-side: prompt → raw response → validated schema

### Batch Extraction
- Queue multiple papers (text blocks or PDFs)
- Process sequentially through the provider
- Results page: compare extracted model cards in a table

### Model Versioning & History
- Version history per extraction with diff view
- Highlight changed equations, parameters between versions
- Restore any previous version

### Custom Provider Plugins
- Plugin API: implement `ExtractionProvider`, register via config
- Community-contributed providers for domain-specific extraction schemas

### CI/CD Integration
- GitHub Actions: run simulation tests on every push
- Auto-export model package on `git tag`/release

---

## How to update this file

- When a planned milestone is started, add a note to its card in **Planned**
- When a milestone is complete, move it to **Done** with bullet-point detail of what was built
- New ideas go at the bottom of **Future Ideas** with a one-line description
- Keep bullets short — one line per detail, not paragraphs
