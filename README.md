# ChemAI Model Compiler

**ChemAI Model Compiler turns scientific literature and experimental notes into transparent, reproducible, simulation-ready engineering model packages.**

It is a research scaffold tool, not a validated simulation platform or certified digital twin. Every extracted field carries a source quote, a confidence level, and an explicit record of what is missing — so nothing is hidden from the engineer who needs to verify the result.

---

## Quick Demo

1. Open the app at `/`
2. Click **View Demo Model** to open the seeded chemostat model card
3. Explore all 10 tabs — Overview, Equations, Variables, Parameters, Assumptions, Limitations, Missing Info, Unit Check, Reproducibility, ODE Template
4. Navigate to `/simulation` → click **Run simulation** → download the time-series CSV
5. Click **Download Package** in the model card header to get the 14-file ZIP

No sign-in required. No API key required for the demo — extractions run on MockProvider by default.

---

## 1. Problem

Chemical and biochemical engineers routinely build simulation models from published papers. That workflow looks like this:

1. Read a paper
2. Manually transcribe equations, often from LaTeX to plain text
3. Hunt for parameter values buried in prose
4. Try to infer units from context
5. Discover that half the initial conditions are never stated
6. Write a Python scaffold from scratch

This takes hours per paper. Much of it is copy-paste work that does not require engineering judgment — it requires pattern recognition that a language model can do.

**ChemAI Model Compiler automates steps 1–5** and produces a 14-file model package with structured equations, parameter tables, unit check, reproducibility score, and a Python ODE scaffold. The engineer's judgment is still required to verify, correct, and simulate — but the starting point is a structured, transparent artifact rather than raw prose.

---

## 2. Why this is not a NotebookLM clone

| Capability | NotebookLM | ChemAI Model Compiler |
|---|---|---|
| Summarise and chat with papers | ✓ | ✗ |
| Audio overviews | ✓ | ✗ |
| Extract structured equations in LaTeX | ✗ | ✓ |
| Variables table with units and roles | ✗ | ✓ |
| Parameters table with values and confidence | ✗ | ✓ |
| Flag missing information explicitly | ✗ | ✓ |
| Reproducibility score (0–100) | ✗ | ✓ |
| Heuristic unit & consistency checks | ✗ | ✓ |
| Python ODE scaffold (scipy.integrate) | ✗ | ✓ |
| 14-file reproducible model package ZIP | ✗ | ✓ |

NotebookLM is a general document assistant. ChemAI Model Compiler is a domain-specific extraction and model-card generation tool for chemical engineering literature.

---

## 3. Why this is not a black-box industrial optimizer

Industrial bioprocess and digital-twin platforms optimize validated processes from experimental or sensor data. They assume a working, calibrated model exists.

ChemAI Model Compiler works at the step *before* that:

- **Input:** prose from a paper or notes
- **Output:** a transparent model card with equations, parameter tables, missing-information report, and a Python scaffold

It does not fit parameters to data. It does not run validated simulations. It does not produce certified outputs. Its value is in making the model-building starting point explicit, traceable, and reproducible — not in replacing the engineer's judgment.

---

## 4. Core Workflow

```
1. Paste source text          — methodology section, equations, parameter tables
2. Extract model data         — POST /api/projects/:id/extractions
3. Inspect variables          — symbol, unit, role (state / input / output), source quote
4. Inspect parameters         — value, unit, confidence (high / medium / low), source quote
5. Detect missing information — explicit list with severity (high / medium)
6. Check units                — dimension cross-check across equation terms
7. Score reproducibility      — 0–100 score across 8 sub-dimensions
8. Generate ODE template      — Python scaffold using scipy.integrate.solve_ivp
9. Export model package       — 14-file ZIP: README, model card, CSVs, reports, Python
```

Steps 1–9 can be completed in under two minutes for a well-structured paper excerpt.

---

## 5. Features

**Extraction engine**
- Provider-agnostic interface: `MockProvider` (deterministic), `OpenAIProvider` (GPT-4o), `GeminiProvider` (Gemini 1.5 Flash)
- Provider priority chain: user-selected → OpenAI → Gemini → Mock (auto fallback)
- Provider selector on the New Extraction page; per-extraction `providerUsed` stored in the database
- JSON repair pass before Zod validation — tolerates minor model formatting drift
- Token and cost logging per extraction (provider, model, input/output tokens)
- Full `ExtractionResultSchema` Zod validation on every provider response — no silent failures
- Atomic DB transaction: equations, variables, parameters, assumptions all committed together or not at all
- Raw provider JSON preserved in `raw_extraction_json` column for traceability

**Model card (10 tabs)**
- Overview, Equations, Variables, Parameters, Assumptions, Limitations, Missing Information, Unit Check, Reproducibility, ODE Template
- Every field has a `source_quote` linking back to the original text
- Reproducibility score computed client-side across 8 dimensions
- Unit check runs a dimensional consistency heuristic across all equation terms

**Simulation playground**
- Monod chemostat model: Runge-Kutta 4 solver, in-browser, no server
- Analytical steady-state overlay on the live chart
- Download simulation output as CSV

**Exports**
- Model Package ZIP (15 files): `README.md`, `model_card.md`, `equations.md`, `variables.csv`, `parameters.csv`, `assumptions.md`, `limitations.md`, `missing_information.md`, `reproducibility_report.json`, `unit_check_report.json`, `raw_extraction.json`, `simulate.py`, `model_notebook.ipynb`, `requirements.txt`, `source_excerpt.txt`
- Jupyter Notebook export (`model_notebook.ipynb`) from each model card, including summary, tables, equations, missing info, reproducibility/unit checks, and simulation scaffold cells
- Python ODE template (`simulate.py`): parameters pre-filled, equation bodies marked TODO, readiness banners included
- Simulation CSV: time-series (t, X, S) from the browser RK4 solver

**PDF ingestion**
- Upload a PDF directly on the New Extraction page — no copy-paste needed
- Server-side text extraction via `pdf-parse` (Node.js, no browser globals required)
- `POST /api/pdf/parse` accepts base64-encoded PDF; returns plain text + page/word/char counts
- Limits: 20 MB file size, 200 pages, minimum 30 extractable characters (rejects image-only PDFs)
- Parsed text preview shown before confirming extraction; fallback to paste-text tab on failure

**Developer experience**
- OpenAPI-first contract: `lib/api-spec` → codegen → React Query hooks + Zod schemas
- Drizzle ORM with typed schema across all tables
- Pino structured logging (JSON) on the API server
- pnpm monorepo with `@workspace/*` shared libraries
- 11 transitive dependency vulnerabilities patched via `pnpm-workspace.yaml` overrides (picomatch, path-to-regexp, lodash, brace-expansion, yaml, postcss)

---

## 5.1 Current Gaps & Bug-Hunt Priorities (May 2026)

This project has moved fast and currently has several areas that need a dedicated stability sprint:

- **PDF extraction quality variability** on some non-scanned PDFs (parser output can still be low-quality depending on document structure).
- **Simulation trustworthiness** is still constrained by model compatibility; some flows fall back to demo assumptions.
- **Provider UX consistency** (runtime keys/providers added incrementally; needs a unified settings/diagnostics experience).
- **Documentation drift risk** after rapid milestone shipping (feature counts, route tables, and behavior notes can desync).
- **Multi-source aggregation robustness** requires deeper fixture coverage and conflict-resolution UX.

Planned remediation is tracked in `kanban.md` under:
- **M27 Stability & Bug-Hunt Hardening**
- **M28 OCR & Document Ingestion Quality**
- **M29 Simulation Reliability Upgrade**
- **M30 Provider UX & Security Hardening**

---

## 6. Tech Stack

| Layer | Technology |
|---|---|
| API server | Express 5, TypeScript 5.9, Pino, Zod |
| Database | PostgreSQL, Drizzle ORM, drizzle-zod |
| Frontend | React, Vite, Tailwind CSS 4, shadcn/ui |
| Routing | wouter |
| Data fetching | TanStack Query (React Query) |
| Charts | Recharts |
| Export | JSZip (client-side) |
| Package manager | pnpm workspaces |
| Shared libs | `@workspace/db`, `@workspace/api-spec`, `@workspace/api-zod`, `@workspace/api-client-react` |
| Extraction providers | MockProvider (built-in), OpenAI GPT-4o, Gemini 1.5 Flash |
| PDF parsing | pdf-parse v1 (server-side, Node.js-safe) |

---

## 7. Demo Workflow

The application ships with a seeded demo model (project ID 1):

**Chemostat — Monod kinetics (Andrews 1968)**
- Reproducibility score: 100/100
- Unit check: 0 High / 5 Medium issues
- 2 state variables (X, S), 5 parameters, 3 equations
- Complete Python ODE scaffold

**To run through the demo:**

1. Open the app at `/`
2. Click **View Demo Model** → model card opens at `/model-cards/1`
3. Explore all 10 tabs (Overview, Equations, Variables, Parameters…)
4. Click **Download Package** in the header to get the 14-file ZIP
5. Navigate to `/simulation` → click **Run simulation** → download CSV
6. Navigate to `/new` → click **Monod Chemostat (Andrews 1968)** to pre-fill the paste tab
7. Click **Extract Model** to create a second extraction

No API key is required for the demo. Without API keys, extractions use MockProvider. With `OPENAI_API_KEY` or `GEMINI_API_KEY` configured, real providers can be selected on the New Extraction page.

---

## 8. Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/MehrzadJami/Test-Run
cd Test-Run
# Note: the repository can later be renamed to chemai-model-compiler

# 2. Install dependencies (requires Node 20+ and pnpm 9+)
pnpm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL

# 4. Run database migrations
pnpm --filter @workspace/db run migrate

# 5. (Optional) Seed the demo model
pnpm --filter @workspace/db run seed

# 6. Start the API server
pnpm --filter @workspace/api-server run dev

# 7. Start the frontend (separate terminal)
pnpm --filter @workspace/chem-ai run dev
```

The frontend is served at `http://localhost:<PORT>/` and the API at `http://localhost:<PORT>/api`.

See [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) for detailed Replit setup, port configuration, and troubleshooting.

---

## 9. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `SESSION_SECRET` | Yes (prod) | — | Secret for session signing |
| `PORT` | No | `8080` (API) | Assigned automatically by Replit |
| `OPENAI_API_KEY` | No | — | Enables OpenAI GPT-4o provider; falls back to Gemini or Mock without it |
| `GEMINI_API_KEY` | No | — | Enables Gemini 1.5 Flash provider; falls back to Mock without it |
| `NODE_ENV` | No | `development` | Set to `production` for deployed builds |

With no AI API key set, the system falls back to `MockProvider` automatically.

---

## 10. Database Setup

The database schema is managed by Drizzle ORM. Migrations live in `lib/db/drizzle/`.

```bash
# Generate a migration from schema changes
pnpm --filter @workspace/db run generate

# Apply pending migrations
pnpm --filter @workspace/db run migrate

# Inspect the database (Drizzle Studio)
pnpm --filter @workspace/db run studio
```

**Tables:**

| Table | Description |
|---|---|
| `projects` | Top-level model project (name, description) |
| `source_documents` | Raw text or PDF content attached to a project |
| `extractions` | One extraction run per source document |
| `equations` | Individual equations from an extraction |
| `variables` | State variables with symbols, units, and roles |
| `parameters` | Numeric parameters with values, units, and confidence |
| `assumptions` | Assumptions and limitations extracted from the text |

---

## 11. Smoke Tests

There is no automated test suite yet (planned for a future milestone). Manual smoke tests:

```bash
# API health check
curl http://localhost:80/api/healthz

# List projects
curl http://localhost:80/api/projects

# Create a project
curl -X POST http://localhost:80/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke test project","description":""}'

# Full extraction (using the created project id, e.g. 2)
curl -X POST http://localhost:80/api/projects/2/sources \
  -H "Content-Type: application/json" \
  -d '{"kind":"text","content":"dX/dt = (mu - D)*X where mu = mumax*S/(Ks+S)"}'

curl -X POST http://localhost:80/api/projects/2/extractions \
  -H "Content-Type: application/json" \
  -d '{}'

# Retrieve model card
curl http://localhost:80/api/projects/2/model-card

# Export full project JSON
curl http://localhost:80/api/projects/2/export
```

All requests go through the shared proxy at `localhost:80`. Do not call service ports directly.

---

## 12. Limitations

- **Real AI providers active.** OpenAI GPT-4o and Gemini 1.5 Flash are live when API keys are set; the system falls back to MockProvider automatically without them.
- **PDF ingestion active, text-based PDFs only.** Image-only and scanned PDFs are rejected with a clear error; use the paste-text tab for those.
- **Single-source projects.** Each extraction uses the most recent source document. Multi-source aggregation is not implemented.
- **Reproducibility score is heuristic.** The scoring algorithm is rule-based, not validated against a reference dataset.
- **Unit check is dimensional only.** It identifies plausible mismatches; it does not perform rigorous dimensional analysis.
- **No authentication.** All data is accessible to anyone who can reach the app. Do not store sensitive or proprietary research data in the current build.
- **Simulation is chemostat-specific.** The browser RK4 solver is hardcoded to Monod chemostat kinetics. Other models require manual adaptation of `simulate.py`.
- **No automated tests.** The extraction pipeline, API routes, and UI components have no automated test coverage in the current build.

---

## 13. Roadmap

| Milestone | Status | Description |
|---|---|---|
| M1 — Full-stack Scaffold | ✓ Done | pnpm monorepo, Express 5, PostgreSQL, Drizzle |
| M2 — AI Extraction Engine | ✓ Done | Provider interface, MockProvider, Zod validation |
| M3 — Database Schema & Seeding | ✓ Done | projects→extractions schema, cascade deletes, demo seed |
| M4 — Branding & Landing Page | ✓ Done | Product name, hero section, comparison cards, homepage |
| M5 — Model Card — 10-Tab View | ✓ Done | 10-tab UI, equations, variables, parameters, source quotes |
| M6 — Reproducibility Scoring Engine | ✓ Done | 0–100 score across 8 sub-dimensions |
| M7 — Unit & Dimension Checker | ✓ Done | Heuristic checks, badge in model card header |
| M8 — Python ODE Template Generator | ✓ Done | scipy.integrate scaffold, parameter pre-fill |
| M9 — Reproducible Model Package Export | ✓ Done | 14-file ZIP (JSZip, client-side) |
| M10 — UI Polish & Demo Readiness | ✓ Done | Demo workflow, empty states, exports page |
| M11 — README & Documentation | ✓ Done | README, ARCHITECTURE, API, LOCAL_SETUP, ROADMAP, SCHEMA |
| M12 — Portability & Development Handoff | ✓ Done | Replit monorepo migration, env config, name standardization |
| M13 — Real AI Providers | ✓ Done | OpenAI GPT-4o + Gemini 1.5 Flash; provider selector UI; JSON repair; token/cost logging |
| M14 — PDF Ingestion | ✓ Done | Server-side PDF extraction via pdf-parse; 20 MB / 200 page limits; upload tab with preview |
| M15 — Unit check v2 | Planned | Rigorous dimensional analysis with pint |
| M16 — Authentication | Planned | Replit Auth or Clerk |
| M17 — Multi-source | Planned | Aggregate multiple papers into one model card |
| M18 — Inline editing | Planned | Edit extracted fields directly in the model card UI |
| M19 — Automated tests | Planned | Vitest unit tests, Playwright E2E |
| Future | Idea | MATLAB / Julia / Modelica stubs, bulk export, peer review workflow |

---

## 14. Scientific Accuracy Note

> **AI-extracted models must be manually verified before use in research, engineering, or decision-making.**
>
> ChemAI Model Compiler is an extraction and reproducibility aid. It does not guarantee the correctness of extracted equations, parameter values, or units. Confidence levels ("high / medium / low") are model-assigned heuristics, not expert assessments.
>
> Always cross-check extracted content against the original source document before using any output in a simulation, publication, or engineering decision.

---

## Deploying on Replit

ChemAI Model Compiler is a two-service pnpm monorepo. Replit's publishing tool handles both services automatically once secrets are configured.

### Required secrets (Replit → Secrets tab)

| Secret | Where to get it | Required? |
|---|---|---|
| `DATABASE_URL` | Added automatically by the Replit PostgreSQL integration | **Yes** |
| `SESSION_SECRET` | `openssl rand -hex 32` | Reserved — needed when auth (M16) is added |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) | No — app runs in mock mode without it |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) | No — app runs in mock mode without it |

`PORT`, `BASE_PATH`, and `NODE_ENV` are injected automatically per-service — do not set them as secrets.

### Database setup (first deployment only)

The schema must be applied to the production database before the first deployment:

```bash
# From the Replit Shell (uses the DATABASE_URL secret automatically)
pnpm --filter @workspace/db run push
```

After that, the server seeds demo data automatically on every startup (idempotent — safe to run repeatedly).

### Run commands

Replit injects these automatically via each artifact's `artifact.toml` — no manual configuration needed.

| Service | Production command |
|---|---|
| API server | `node --enable-source-maps artifacts/api-server/dist/index.mjs` |
| Frontend | Served as static files from `artifacts/chem-ai/dist/public` |

### Verify the deployment

After publishing, check these endpoints on your `.replit.app` domain:

```
GET /api/healthz        → {"status":"ok"}
GET /api/projects       → [{"id":1,"name":"Chemostat — microalgae bioreactor (Andrews 1968)",...}]
GET /                   → React app loads, demo model visible in dashboard
```

### Mock mode (no AI keys needed)

All extraction features work in mock mode — a deterministic mock provider returns a pre-built chemostat model card with realistic equations, parameters, and a reproducibility score. The full 10-tab model card, RK4 simulator, and ZIP export all function without any API key.

To enable real AI extraction, add `OPENAI_API_KEY` or `GEMINI_API_KEY` to Replit Secrets. The provider selector on the New Extraction page lets you choose OpenAI, Gemini, or Auto (tries best available).

---

## Contributing

This project is under active development. If you find a bug or want to propose a feature, open an issue or submit a pull request.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the codebase overview before making changes.
