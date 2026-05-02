# ChemEngAI — Project Kanban

> Living document. Move cards between columns as work progresses.
> Source: https://github.com/MehrzadJami/Serious-Tracker

---

## ✅ Done

### M1 — Full-stack Scaffold
- Express 5 API + Vite React + TypeScript throughout
- PostgreSQL database + Drizzle ORM schema
- pnpm monorepo: `api-server` (/api) · `chem-ai` (/) · `mockup-sandbox` (/__mockup)
- Sidebar navigation: Dashboard · New Extraction · Model Cards · Simulation · Exports
- Demo seed data auto-loads on first boot (chemostat / Andrews 1968)

### M2 — AI Extraction Engine
- `ExtractionProvider` interface — swap providers without changing call sites
- `MockProvider` — deterministic fixture for development and testing
- `runExtraction()` entry point with Zod input + output validation
- `mapExtractionToDb()` pure mapper from provider result → DB row shapes
- Future-ready: picks OpenAI / Gemini automatically when env vars are present

### DB Schema & Seeding
- `projects → source_documents → extractions → { equations, variables, parameters, assumptions }`
- `assumptions.kind` enum: `assumption | limitation`
- `extractions.raw_extraction_json` (JSONB) preserves full validated payload
- Cascade deletes on all child tables
- Seed: chemostat demo scores 100/100 reproducibility, 0H/5M unit check

### M4 — Branding & Landing Page
- Product name corrected everywhere: **ChemEngAI** (was "ChemAI" — now fixed in all files)
- "NOT A NOTEBOOKLM CLONE" differentiation section
- "NOT A BLACK-BOX OPTIMIZER" section
- Professional hero with flask icon and teal brand color

### Model Card — 10-Tab View
- **Overview** — system description, problem statement, model card summary (inputs/outputs/controls)
- **Variables (N)** — state variables table with symbol, role, unit, source quote, confidence
- **Parameters (N)** — parameters table with symbol, value, unit, source quote, confidence
- **Equations (N)** — equation list with LaTeX rendering, symbol inventory, source quotes
- **Assumptions (N)** — assumptions and limitations
- **Missing Info** — critical/warning/info missing items detected automatically
- **ODE Template** — generated Python code viewer + download (see M8)
- **Reproducibility** — score breakdown (see M6)
- **Unit Check** — heuristic unit analysis (see M7)
- **Raw JSON** — full extraction payload for debugging
- Header badges: system type · MOCK tag · readiness badge · Repro score · Unit check status
- "Run Simulation" and "Export JSON" buttons in header

### M5 — Simulation Playground
- Pure in-browser RK4 ODE solver (no server, no arbitrary code execution)
- Monod chemostat model: μ = μmax·S/(Ks+S), dX/dt = (μ−D)·X, dS/dt = D·(Sin−S) − (μ/Yxs)·X
- Capped at 50,000 steps, decimated to ≤1,000 plot points
- Recharts `LineChart` with teal/orange X and S traces
- Dashed reference lines at analytical steady-state
- Full parameter panel (μmax, Ks, D, Sin, Yxs, X0, S0, tFinal, dt)
- "Download CSV" export with metadata header

### M6 — Reproducibility Engine
- Pure client-side, no server/AI call (`src/lib/reproducibility.ts`)
- 13+ rule-based checks: equations, parameters, units, ICs, symbol cross-reference, gas-transfer, yield coefficients, Henry's law, kinetic constants
- 5 weighted sub-scores: equations (25%) · parameters (25%) · units (20%) · ICs (20%) · traceability (10%)
- Overall score 0–100 with readiness gate: `ready` ≥75 + 0 criticals · `partial` ≥40 + ≤1 critical · `not_ready` otherwise
- Output: score, sub-scores, readiness, blockers, `MissingItem[]` severity-sorted, next steps
- UI: Reproducibility tab + score badge in model card header

### M7 — Unit & Dimension Checker
- Pure client-side (`src/lib/unit-checker.ts`)
- 10 heuristic checks: dimensionless kinetics, mixed time units, yield bounds, rate consistency, concentration units, dimensionless ratios, unit presence, unit–value agreement, kinetic constant units, Monod constant reasonability
- Severity levels: high · medium · info
- Status badge in model card header: `Units: 0H / 5M`
- Unit Check tab with check-by-check results

### M8 — Python ODE Template Generator
- Pure client-side (`src/lib/python-generator.ts`), fires via `useMemo` in model card
- 10 output sections: header comment block · imports · `params={}` dict · `y0=[]` ICs · equations comment · `ode_model()` · `solve_ivp` call · plotting · missing info notes · unit check warnings
- Honest-scaffold: numeric values only where extracted; all equation bodies are `# TODO` stubs with LaTeX shown as comments
- Readiness warning banner (amber) if `simulation_readiness` is `partial` or `not_ready`
- Unit check warning banner (red) if any high-severity issues
- Scrollable code viewer + "Copy to clipboard" + "Download model_template.py"

### M9 — Reproducible Model Package Export
- Client-side ZIP generation (`jszip`) — no server needed
- "Download Package" button in model card header (Run Simulation + Export JSON preserved)
- 14-file `model_package/` ZIP: README.md · model_card.md · variables.csv · parameters.csv · equations.md · assumptions.md · limitations.md · missing_information.md · reproducibility_report.json · unit_check_report.json · raw_extraction.json · simulate.py · requirements.txt · source_excerpt.txt
- simulate.py reuses M8 python-generator — honest scaffold, no hallucinated code
- README.md embeds repro score, unit check status, all gaps, and how-to-run instructions
- source_excerpt.txt: deduplicated verbatim source quotes — the traceability record

### M10 — UI Polish & Demo Readiness
- **Landing page** — bold hero with teal "Simulation-Ready" highlight, "View Demo Model" CTA, amber scientific accuracy callout, NotebookLM side-by-side comparison card, "not a black-box optimizer" section, numbered core workflow cards, example-output stat tiles (repro score, package count, Python, unit check), "Open demo model card" link
- **Dashboard** — color-coded stat cards with left accent borders (teal/violet/teal), animated skeleton loading rows, icon + retry button error state, clean empty state with CTA
- **New Extraction** — prominent "Load a demo source text" panel with two pre-fill buttons: Monod Chemostat (Andrews 1968) and Aerobic Bioreactor O₂ transfer; realistic full-length methodology source texts; character counter; "What gets extracted" tip box
- **Exports** — full rewrite: all buttons now active and linked; green "Available" badges; 4 export cards (Model Package ZIP, Python ODE Template, CSV Tables, Simulation CSV + Raw JSON); explanation of client-side generation
- **Model Cards** — animated skeleton loading, better empty state with library icon + CTA, search no-results state with clear button, result count badge
- **Simulation** — already polished; left unchanged
- **Model Card Detail** — already polished; left unchanged
- Scientific accuracy note added to landing page (required per spec, honest wording)
- No exaggerated claims: "digital twin" and "guaranteed optimization" language absent throughout

### Canvas Kanban Board
- Visual Kanban built directly on the Replit canvas (27 shapes)
- 3 columns: Done · In Progress / Planned · Future Ideas

---

## ⚡ In Progress / Planned

### M10 is complete — see Done section above

### Real AI Providers
- Provider interface is ready — `getActiveProvider()` factory is wired
- **To do:** set `OPENAI_API_KEY` and/or `GEMINI_API_KEY` env vars
- OpenAI: call GPT-4o with structured output against `ExtractionResultSchema`
- Gemini: call `gemini-1.5-pro` with JSON mode
- Add provider selection UI (dropdown in New Extraction page)

### Exports Page — Downloads
- Markdown model card export (human-readable `.md` file)
- CSV export: variables table · parameters table · equations list
- UI cards exist on the Exports page; downloads need backend route + file generation

### M3 — Inline Editing
- Edit variable symbol, unit, role inline in the Variables tab
- Edit parameter symbol, value, unit inline in the Parameters tab
- Optimistic UI updates + `PATCH /api/...` persistence
- Undo/redo support

### GitHub Push-back
- Finalize model package locally → push JSON + Python template back to source repo
- Requires GitHub OAuth token or Personal Access Token stored as env var

---

## 💡 Future Ideas

### PDF Upload & Direct Extraction
- Drag-drop a paper PDF → extract text server-side → run extraction provider
- No manual copy-paste required
- Libraries: `pdf-parse` (Node) or `pdfjs-dist` (browser)

### Multi-Model Comparison
- Select two or more model cards → side-by-side tab view
- Overlay simulation results from multiple models on one chart
- Diff equations, parameters, assumptions between models

### Parameter Fitting from Data
- Upload experimental time-series CSV (t, X, S)
- Fit μmax, Ks, Yxs using `scipy.optimize.minimize` or in-browser Nelder-Mead
- Show fitted vs measured overlay on simulation chart

### Sensitivity Analysis
- Vary one parameter across a user-defined range
- Run ensemble of simulations → plot output bands (min/mean/max)
- Compute first-order Sobol indices for ranked parameter importance

### Export to MATLAB / Julia / Modelica
- Generate simulation stubs for platforms beyond Python/SciPy
- MATLAB: `.m` script with `ode45`
- Julia: `DifferentialEquations.jl` compatible
- Modelica: `.mo` component block

### Batch Extraction
- Queue multiple papers (text blocks or PDFs)
- Process sequentially through the extraction provider
- Results page: compare extracted model cards in a table

### Model Versioning & History
- Version history per extraction
- Diff two versions: highlight changed equations, parameters
- Restore any previous version

### LaTeX → Python Translator (AST-based)
- Parse extracted LaTeX equations using `latex2sympy2` or custom grammar
- Generate runnable Python math instead of `# TODO` stubs
- Validate dimensional consistency symbolically

### Gas-Transfer & O₂ Sub-models
- Built-in `kLa`, Henry's law, and dissolved O₂ transfer blocks
- Toggle on/off for aerobic bioreactor models
- Pre-validated unit conventions for gas-phase ↔ liquid-phase transfer

### Custom Provider Plugins
- Plugin API: implement `ExtractionProvider`, register via config
- Community-contributed providers for domain-specific extraction schemas
- Plugin marketplace or registry (future)

### Inline Equation Editor
- Click an equation → edit LaTeX inline in the Equations tab
- Live MathJax preview as you type
- Save back to DB with audit trail

### CI / CD Integration
- GitHub Actions template for running simulation tests on every push
- Auto-export model package on tag/release

---

## How to update this file

- When a planned task is started, move its card to **In Progress / Planned**
- When a task is complete, move it to **Done** with a short bullet summary of what was built
- New ideas go at the bottom of **Future Ideas**
- Keep bullet points short — one line per detail, not paragraphs
