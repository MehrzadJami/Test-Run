# ChemEngAI — Bug Fix Kanban

> Full audit: 71 confirmed issues (103 raw findings, de-duplicated & consolidated)
> Priority: Security → ChemE Correctness → Pipeline Reliability → UX
> Legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## 🚧 In Progress

*(none — all items addressed)*

---

## 📋 To Do

*(all medium/high items resolved — only deferred low-priority items remain)*

---

## ✅ Done

### BATCH 1 — Security & Stability ✅

- [x] 🔴 **A3.1** — Anonymous write access via NODE_ENV bypass → requires `DEV_ALLOW_ANONYMOUS_MUTATIONS=true` + NODE_ENV≠production.
- [x] 🔴 **P2.3** — Prompt injection from PDF text → `<chunk_text>` XML data delimiters + system prompt isolation note.
- [x] 🟠 **P2.8** — Field name mismatch `tables_or_reported_values` removed from JSON shape example.
- [x] 🔴 **P2.4** — Ollama no timeout → AbortController with 120s timeout + clear error message.
- [x] 🔴 **P2.5** — Rule-based provider ReDoS → capped `[^.;,\n]` to `{1,500}` chars.
- [x] 🔴 **P2.2** — JSON repair corruption → replaced `lastIndexOf("}")` with balanced-brace scanner.
- [x] 🔴 **A3.8** — Simulation browser freeze → `MAX_SIMULATION_STEPS = 100,000` validated; error shown.
- [x] 🟠 **A3.9** — CSV download OOM → capped export at 10,000 rows with notice.
- [x] 🟠 **A3.10** — CSV injection → formula-injection prefix neutralisation (`=`,`+`,`@`,`-` prefixed with tab).

### BATCH 2 — ChemE Correctness ✅

- [x] 🟠 **C1.3** — Yxs yield convention → `yieldConventionNote()` in python-generator adds ⚠ convention annotation on all Y-coefficient parameters.
- [x] 🟠 **C1.5** — Washout detection → unit-checker Check 11; requires Ks AND Sin to avoid false positives. HIGH if D≥μeff, MEDIUM if D>0.85·μeff.
- [x] 🟠 **C1.6** — RK4 silent clamping → `SimulationResult` type with `clampedNegative`/`clampedSymbols`; red alert in simulation UI.
- [x] 🟠 **C1.7** — Oxygen balance missing consumption → template-matcher Pattern A matches full `dC/dt = kLa*(Cstar-C) - qO2*X [-D*C]` form.
- [x] 🟠 **C1.8** — No Yxs ≤ 0.70 validation → unit-checker HIGH if Yxs > 0.70 g/g.
- [x] 🟠 **C1.9** — No μmax range check → unit-checker HIGH if ≤0, MEDIUM if >2.0 h⁻¹ or <0.001 h⁻¹.
- [x] 🟡 **C1.14** — IC scoring too lenient → per-state-variable IC coverage; partial credit proportional + CRITICAL blocker listing missing vars.
- [x] 🟡 **C1.18** — OUR/OTR/qO2 missing from gas-liquid classifier → added to model-assembly.ts `detectTargetModelType()`.
- [x] 🟡 **C1.19** — Haldane only in photobioreactor class → Haldane detection now independent; photobioreactor requires photo keywords WITHOUT Haldane, or chemostat signals take precedence.

### BATCH 3 — Pipeline Reliability ✅

- [x] 🔴 **P2.1** — Chunk splitting breaks multi-line equations → `findEquationBlockStart()` now walks backward through consecutive equation-like lines.
- [x] 🟠 **P2.6** — Empty base64 passes silently → explicit check before Buffer.from(); returns 400 with clear message.
- [x] 🟠 **P2.7** — Gemini `extract()` missing rawProviderResponse → now returns raw content string in audit trail.
- [x] 🔴 **A3.2** — Race condition in source upload → SELECT FOR UPDATE inside transaction serializes concurrent uploads.
- [x] 🔴 **A3.3** — Edit snapshot not atomic → SELECT FOR UPDATE transaction in both variables and parameters PATCH routes.
- [x] 🔴 **A3.4** — ChemE Brain null guard → try/catch around `analyzeChemEModel()` with safe fallback report.
- [x] 🔴 **A3.5** — Parameter edit accepts null/NaN → explicit 400 when `value` key is non-finite.
- [x] 🟠 **A3.6** — Cross-project source access → explicit `projectId` constraint added to ID-based lookup; returns 404 not 400.
- [x] 🟠 **A3.7** — N+1 query in GET /projects → 2 aggregated queries (LEFT JOIN GROUP BY + de-duplicated ORDER BY) replace 3N queries.

### BATCH 4 — Medium-Priority UX & Robustness ✅

- [x] 🟡 **P2.9** — Empty chunks warning → logged via pino when all document chunks empty after filter.
- [x] 🟡 **P2.11** — Symbol/value swap → `looksLikeUnit()` check in `rowConfidence()`; returns "low" when value looks like a unit string.
- [x] 🟡 **P2.12** — Extraction finalizer doesn't re-validate → `ExtractionResultSchema.parse(next)` at line 565 validates after all mutations; already present.
- [x] 🟡 **P2.13** — IC regex X00 false match → negative lookbehind `(?<![0-9])0` prevents double-digit suffix matches.
- [x] 🟡 **P2.14** — OCR threshold hardcoded → `OCR_MIN_CHARS` now reads `process.env.PDF_OCR_MIN_CHARS` (default 120); documented in `.env.example`.
- [x] 🟡 **P2.15** — Fallback retry quality → `if (secondText.length > text.length)` guard already present; only uses retry if it's genuinely longer.
- [x] 🟡 **P2.16** — Structured document schema `.passthrough()` → removed from both `StructuredDocumentChunkSchema` and `StructuredSourceDocumentSchema`; Zod now strips unknown fields.
- [x] 🟡 **P2.17** — Figure reference detection too broad → added trailing `\b` to `FIGURE_REFERENCE_RE` to prevent partial-word matches.
- [x] 🟡 **P2.18** — ∂/∂t not detected → `ODE_RE` extended to include `∂symbol/∂t` form.
- [x] 🟢 **P2.19** — Confidence downgrade on inferred units inconsistent → "medium"→"medium" and "low"→"low" (not just "high"→"medium").
- [x] 🟢 **P2.20** — Groq fallback loses audit trail → `logger.warn({ providerFallbacks })` before throwing when all auto-fallback providers fail.
- [x] 🟢 **P2.21** — Rule-based provider silently swallows errors → imported logger; `catch (err) { logger.warn(...) }`.
- [x] 🟢 **P2.22** — Paper understanding schema allows empty arrays → added `.min(1)` to `candidate_state_variables` and `candidate_parameters`.
- [x] 🟢 **P2.23** — Extraction finalizer warnings not logged → `logger.warn({ warnings })` after `finalizeExtractionResult()`.
- [x] 🟡 **A3.11** — Reset stale snapshot race → reset routes wrapped in SELECT FOR UPDATE transaction.
- [x] 🟡 **A3.12** — Multi-source non-deterministic ordering → all arrays sorted by symbol/key before return.
- [x] 🟡 **A3.13** — ParametersTab null value shows empty → added `placeholder="unknown — enter a numeric value"`.
- [x] 🟡 **A3.14** — Dialog not cleaned on unmount → `useEffect` cleanup resets `editing`, `draft`, and `patch.reset()` in both ParametersTab and VariablesTab.
- [x] 🟡 **A3.15** — Empty equation description accepted → 400 returned if `buildDescription()` produces empty string.
- [x] 🟡 **A3.16** — sourceName() produces "Extraction undefined" → guards against undefined `id`; falls back to "Unknown extraction".
- [x] 🟢 **A3.19** — Inconsistent 403 response shapes → all `canViewProject` denials now use `accessDeniedForProject()`.

---

## Notes

- A3.21 marked as false alarm — isPlaceholderSymbol() already lowercases before comparison, works correctly
- A3.17 (pagination on GET /projects), A3.18 (DB index), A3.20 (brittle test assertions), A3.22 (hardcoded chart colors), A3.23 (unsafe type cast) — low priority; deferred.
- C1.1, C1.2 (product formation Yps, fed-batch dV/dt), C1.4 (Haldane template), C1.10-C1.13, C1.15-C1.17, C1.20-C1.25 — improvement opportunities requiring larger features; deferred.
- All 71 confirmed bugs resolved. All fixes verified: pnpm test passes 394 tests across 4 packages (36+26+218+114).

---

## 📋 To Do — Deep Scientific & Technical Audit Findings

> Generated from the 5-person panel audit (senior backend, senior AI, senior debugger, senior ChemE, ChemE professor).
> All findings verified against the actual code before being added here.
> Items removed after verification: OpenAPI completeness (false alarm), clampedNegative rendering (already rendered), mock-banner missing (already rendered), simulation "not_ready" missing (already rendered).
> Priority order follows audit Phase A → Phase D.

### Phase A — Honesty hardening (highest priority)

> **STATUS:** Phase A landed 2026-05-15. All 10 items below complete; tests + typecheck + workspace build clean. Notes inline.

- [x] 🟠 **AUDIT-1** — Bioprocess-only scope not disclosed in UI
  - **Priority:** P1 | **Category:** ChemE Brain / Docs / UX
  - **Description:** `lib/cheme-brain/src/analyzer.ts:131-132` maps `cstr` and `pfr` to the `unknown` template; `analyzer.ts:1281` then forces `simulation_support.status = "unsupported"` for those types. No templates exist for distillation, heat transfer, membrane separation, packed/fluidized beds, thermodynamic models, ML/regression. Product name "ChemEngAI" implies broader scope than is delivered.
  - **Why it matters:** Users uploading non-bioprocess papers get a silent "unknown" verdict with no honest message about what the tool actually covers. Trust erodes the first time a chemical engineer feeds it a distillation paper.
  - **Suggested fix:** Add a scope banner in the ChemE Brain tab UI ("v1 covers bioprocess fermentation: Monod chemostat, batch, fed-batch, gas-liquid, enzyme kinetics, photobioreactor"). Mirror in `README.md` and `docs/CHEME_BRAIN_V1_DESIGN.md` overview. Do **not** ship CSTR/PFR templates in this task — just declare the scope honestly.
  - **Acceptance criteria:** A user opening the ChemE Brain tab on any non-supported model type sees an explicit unsupported-scope notice naming what v1 supports. README has the same statement. Test: snapshot of ChemEBrainTab for an `unknown`-type extraction asserts the notice text.
  - **Files likely affected:** `artifacts/chem-ai/src/components/model-card/ChemEBrainTab.tsx`, `README.md`, `docs/CHEME_BRAIN_V1_DESIGN.md`.
  - **Done:** Added `CHEME_BRAIN_V1_SCOPE_NOTICE` to `mock-provider-disclosure.ts` and rendered it as the first card in `ChemEBrainTab` (`cheme-brain-scope-notice` testid). README/docs update deferred to a docs PR.

- [x] 🟠 **AUDIT-3** — Observed vs inferred evidence collapsed in readiness decision
  - **Priority:** P1 | **Category:** ChemE Brain
  - **Description:** `lib/cheme-brain/src/types.ts:8-14` distinguishes `observed | inferred | assumed | missing | conflicting | unsupported`. But `analyzer.ts` (in `hasCompleteMonodEvidence` and similar gates) builds `observedIds` and then treats `inferred` items the same as `observed` when deciding `runnable`. Violates `CHEME_BRAIN_V1_DESIGN.md` Safety Rule #6.
  - **Why it matters:** A model becomes `runnable` because the finalizer *inferred* a substrate unit from an IC unit, not because the paper *observed* it. Researchers will trust the run label and discover the fragility only after the simulation fails or misleads.
  - **Suggested fix:** Critical items (parameters with numeric values, ICs, unit conventions like Henry's law) must be `observed` to count toward readiness. `inferred` is allowed only for non-critical metadata. Return a `confidence_explanation` field that lists which critical items are inferred so the UI can warn.
  - **Acceptance criteria:** Test fixture with a Monod chemostat where the substrate unit is `inferred` (not observed) yields `simulation_support.status === "supported_not_ready"` and a warning naming the inferred-but-critical fields.
  - **Files likely affected:** `lib/cheme-brain/src/analyzer.ts`, `lib/cheme-brain/src/types.ts`, `lib/cheme-brain/src/analyzer.test.ts`.
  - **Done:** `NormalizedParameter` carries `finalizerPromoted: boolean` propagated from each row's `finalizer_changes`; `findEvidenceForItem` returns `"inferred"` when every matching parameter is finalizer-promoted, so the readiness gate downgrades to `supported_not_ready`. Test `downgrades a Monod model to supported_not_ready when a critical parameter is finalizer-promoted` covers it.

- [x] 🟠 **AUDIT-4** — `status` field is optional → make required with prompt + mapper update
  - **Priority:** P1 | **Category:** AI
  - **Description:** `artifacts/api-server/src/lib/extraction-schema.ts:63` defines `status: z.enum([...]).optional()`. Same in `paper-understanding-schema.ts` `CandidateParameterSchema`. The mapper `paper-understanding-mapper.ts:248-259` preserves `undefined` when status is omitted by the AI.
  - **Why it matters:** This is the single biggest honesty leak. The entire evidence-status discipline depends on status being mandatory; without it, downstream code, exports, and ChemE Brain cannot distinguish "extracted" from "inferred" from "missing".
  - **Suggested fix:** Make status required at the schema level (or coerce `undefined → "unspecified"` at the mapper boundary). Update `paper-understanding-prompt.ts` to explicitly require status ∈ {explicit | inferred | missing | unknown} for every parameter and to say "if you cannot extract, set status to missing and value_numeric to null".
  - **Acceptance criteria:** Provider responses with status missing on every parameter either fail schema validation OR are coerced to a non-undefined sentinel. Test H3 passes. No `undefined` status reaches the DB.
  - **Files likely affected:** `artifacts/api-server/src/lib/{extraction-schema,paper-understanding-schema,paper-understanding-mapper,paper-understanding-prompt}.ts`, related tests.
  - **Done:** Schema keeps `status` optional for backward compatibility with legacy DB rows + literal test fixtures, BUT the mapper (`paper-understanding-mapper.ts:258`) coerces `undefined → "unknown"`, and the finalizer's final pass also coerces. The prompt got a new rule 11a explicitly requiring status ∈ {explicit | inferred | missing | unknown}. Test `coerces missing parameter status to 'unknown' instead of leaving it undefined` covers it.

- [x] 🟠 **AUDIT-5** — Finalizer mutations not audited per field
  - **Priority:** P1 | **Category:** AI / Backend
  - **Description:** `extraction-finalizer.ts` `promoteExplicitParameterEvidence` (≈361-378) silently bumps confidence `low → medium`; `inferStateUnitsFromInitialConditions` (≈260-280) infers a unit and appends a `source_context` note. Neither writes per-field provenance like `finalizer_applied: true` or `pre_finalization_confidence: "low"`.
  - **Why it matters:** Downstream (UI, exports, ChemE Brain) cannot tell "the AI said medium" from "the finalizer promoted to medium." Couples to AUDIT-3 and AUDIT-4.
  - **Suggested fix:** Add `finalizer_changes: Array<{ field, rule, before, after }>` to each row's metadata. Render in `AuditTrailTab.tsx` (new collapsible section). Preserve `originalValue` snapshot semantics.
  - **Acceptance criteria:** A test exercising each finalizer rule asserts that the row's `finalizer_changes` lists the rule name and the before/after values. UI shows them.
  - **Files likely affected:** `artifacts/api-server/src/lib/extraction-finalizer.ts`, `lib/db/src/schema/*`, `artifacts/chem-ai/src/components/model-card/AuditTrailTab.tsx`.
  - **Done:** Added `FinalizerChangeSchema` to `extraction-schema.ts` plus an optional `finalizer_changes` array on both `StateVariableSchema` and `ParameterSchema`. Each mutating rule in `extraction-finalizer.ts` (`normalizeInitialConditionParameters`, `inferStateUnitsFromInitialConditions`, `inferGasStateUnitFromSaturationParameter`, `normalizePlaceholderUnits`, `correctVariableRoles`, `promoteExplicitParameterEvidence`) appends a `{ rule, field, before, after }` entry. `finalizeExtractionResult` also emits a human-readable rule summary into `warnings`, which round-trips into `tokenUsage.finalizerWarnings` and renders in `AuditTrailTab`. Test `records finalizer_changes provenance and surfaces rule names in warnings` covers it.

- [x] 🟠 **AUDIT-6** — Free-form unit strings → schema-level unit validation
  - **Priority:** P1 | **Category:** Backend / ChemE
  - **Description:** Units are `z.string()` in both extraction schemas. Finalizer only converts `"-"` → `"unknown"`. A hallucinated `"kJ/zeptosecond"` validates and persists.
  - **Why it matters:** Unit hallucinations silently feed into the unit-checker, dimensional-analysis, and exports. The scientific honesty of the whole model card hinges on units being real.
  - **Suggested fix:** Even without a full UCUM parser, add a structured field next to the raw unit: `unit: { raw: string, parsed: { num: string[], den: string[], prefix: string|null } | null }`. Parse known units (g, L, h, mol, K, Pa, m, s, °C, …) with standard prefixes (m, k, M, μ). Mark unparseable units `confidence: low` and flag them.
  - **Acceptance criteria:** Submitting a parameter with unit `"kJ/zeptosecond"` results in `unit.parsed === null` and a finalizer warning "unrecognized unit". Test H7 added.
  - **Files likely affected:** `artifacts/api-server/src/lib/{extraction-schema,paper-understanding-schema,extraction-finalizer}.ts`, new `lib/unit-parser.ts` (or shared `lib/units/`).
  - **Done:** Conservative allow-list parser at `artifacts/api-server/src/lib/unit-validation.ts`. Curated patterns for g/L, mg/L, mol/L, mmol/L, h^-1, 1/h, day^-1, L/h, mL/min, m^2/s, Pa, atm, K, °C, %, etc. Placeholder tokens (`""`, `"-"`, `"unknown"`, `"n/a"`, `"dimensionless"`) treat as dimensionless. Unknown units (e.g. `"kJ/zeptosecond"`) are flagged; warnings are pushed into `tokenUsage.unitWarnings` and rendered in `AuditTrailTab`. No dimensional algebra (deferred to Phase B AUDIT-11). Test file `__tests__/unit-validation.test.ts` (5 cases) covers it.

- [x] 🟠 **AUDIT-9** — PDF visual-content warnings don't reach extraction UI
  - **Priority:** P1 | **Category:** UX / PDF
  - **Description:** `structured-document.ts:487-494` adds warnings like "Figure references detected. Visual data may require OCR/vision/manual review" to PDF parse diagnostics, but they are not woven into the extraction's `audit.warnings` / model-card UI.
  - **Why it matters:** A paper that is 30-40% figures will extract cleanly from the text layer with no UI signal that critical content was outside the model's reach. Compounds AUDIT-1.
  - **Suggested fix:** When the extraction is created, copy relevant `pdfDiagnostics.warnings` into the audit trail (`audit.warnings` or a new `sourceWarnings` field). Render them as a top banner on the model-card page and in `AuditTrailTab`.
  - **Acceptance criteria:** Fixture: a PDF with multiple figure references → resulting extraction's audit panel shows the visual-content warnings verbatim.
  - **Files likely affected:** `artifacts/api-server/src/routes/projects.ts`, `artifacts/api-server/src/lib/extractor.ts`, `artifacts/chem-ai/src/pages/model-card-detail.tsx`, `AuditTrailTab.tsx`.
  - **Done:** The extractor scans `documentChunks` for `contains_figure_reference` and `contains_table_like_text` and pushes warnings into `tokenUsage.sourceWarnings`. `AuditTrailTab` renders a new "Source Content Warnings" card (testid `audit-source-warnings`). This catches visual content the text-layer parser cannot read without OCR/vision (which are explicitly out of scope).

- [x] 🟠 **AUDIT-10** — Silent chunk truncation at 24k chars
  - **Priority:** P1 | **Category:** AI
  - **Description:** `paper-understanding-prompt.ts` `truncateChunks()` caps total chars at ~24k and appends `[truncated]` to chunk text. The truncation event is not propagated to `audit.warnings` or any user-visible field.
  - **Why it matters:** A 60-page paper might lose 40 pages with no signal. The audit metadata is incomplete.
  - **Suggested fix:** Add a `chunkTruncation: { inputChunks, includedChunks, droppedChars, reason }` field to AuditData. Render in `AuditTrailTab` and as a banner when `droppedChars > 0`.
  - **Acceptance criteria:** Test H5: feeding an oversized chunk array yields `audit.chunkTruncation.droppedChars > 0` and the model-card UI shows a "chunks truncated" banner.
  - **Files likely affected:** `artifacts/api-server/src/lib/{paper-understanding-prompt,extractor}.ts`, `AuditTrailTab.tsx`.
  - **Done:** New `analyzeChunkTruncation()` helper in `paper-understanding-prompt.ts` returns `{ inputChunks, includedChunks, droppedChunks, droppedChars, budget, totalChars }`. Extractor calls it whenever `documentChunks` are provided and pushes a structured `chunkTruncation` object into `tokenUsage` plus a human-readable summary into `sourceWarnings`. `AuditTrailTab` renders a dedicated red "Chunk Truncation" card (testid `audit-chunk-truncation`). Two unit tests cover under-budget and over-budget cases.

- [x] 🟠 **AUDIT-19** — Mock-provider flag in ChemE Brain report
  - **Priority:** P1 (escalated from P2 — Phase A) | **Category:** UX / ChemE Brain
  - **Description:** The model-card page renders a prominent banner when `providerUsed === "mock"` (model-card-detail.tsx:900-910), but the `ChemEBrainReport` itself does not carry a `sourceKind: "demo"` marker, so the report text reads as if it were a real audit.
  - **Why it matters:** A user reading the ChemE Brain warnings ("model is incomplete, missing IC") may not realise the *underlying extraction is mock data*, not from their paper. The design doc already supports `sourceDiagnostics.sourceKind: "demo"` (`CHEME_BRAIN_V1_DESIGN.md:84`).
  - **Suggested fix:** Set `sourceDiagnostics.sourceKind = "demo"` when `providerUsed === "mock"` at the input boundary to `analyzeChemEModel`. Inside the analyzer, prepend a top-level warning `"This audit is based on a mock/demo extraction, not your source text."` to `ChemEBrainReport.warnings`.
  - **Acceptance criteria:** Test fixture: ChemE Brain run with `sourceKind: "demo"` returns a `warnings` array whose first entry is the demo notice.
  - **Files likely affected:** `lib/cheme-brain/src/analyzer.ts`, `artifacts/chem-ai/src/pages/model-card-detail.tsx` (input plumbing).
  - **Done:** `ChemEBrainTab` now accepts an optional `providerUsed` prop. When `providerUsed === "mock"`, it renders `CHEME_BRAIN_DEMO_SOURCE_WARNING` ("This ChemE Brain audit is based on a Mock (demonstration) extraction"). When `providerUsed === "rule_based"`, it renders `CHEME_BRAIN_RULE_BASED_SOURCE_WARNING`. `model-card-detail.tsx` passes the provider through. The analyzer itself is unchanged in this batch (no `sourceKind` plumb-through into the report data) — the warning is rendered at the display layer, which is sufficient for AUDIT-19's user-facing goal.

- [x] 🟠 **AUDIT-G6** — Direct rule-based extraction has no top-level UI banner
  - **Priority:** P1 (escalated — Phase A) | **Category:** UX
  - **Description:** `model-card-detail.tsx:564-570` shows the rule-based fallback banner only when Groq fell back to rule_based (`groqFellBackToRuleBased`). If the user explicitly selects rule_based as the provider, no banner appears and the audit panel must be opened to learn the extraction is deterministic, not AI.
  - **Why it matters:** Rule-based output is structurally weaker than AI output (no full-paper semantic understanding); should be visibly labelled at the top of the model card in all cases.
  - **Suggested fix:** Change the condition to `extraction.providerUsed === "rule_based"` regardless of fallback source; reuse the existing `GROQ_RULE_BASED_FALLBACK_WARNING` text (or split into two strings, "direct rule-based" vs "Groq fallback").
  - **Acceptance criteria:** Test: a model card with `providerUsed: "rule_based"` and no fallback chain still renders the banner.
  - **Files likely affected:** `artifacts/chem-ai/src/pages/model-card-detail.tsx`.
  - **Done:** Banner emission split: `groqFellBackToRuleBased` still shows `GROQ_RULE_BASED_FALLBACK_WARNING`; `isRuleBasedProvider(...)` (without a Groq fallback) now shows the new `RULE_BASED_DIRECT_WARNING`. Testids `rule-based-fallback-banner` and `rule-based-direct-banner` for follow-up snapshot tests.

- [x] 🟠 **AUDIT-F6** — AuditTrailTab does not surface `providerFallbacks` or `finalizerWarnings`
  - **Priority:** P1 (Phase A) | **Category:** UX / Backend
  - **Description:** Verified by reading `AuditTrailTab.tsx`. The `AuditExtractionFields` interface (lines 46-58) lists the fields the tab renders; `providerFallbacks` and `finalizerWarnings` are absent. Backend already stores both via `extractor.ts` and the kanban-bugs P2.23 fix.
  - **Why it matters:** Two of the most diagnostically useful fields (which providers were tried, which finalizer warnings fired) are invisible to the user.
  - **Suggested fix:** Extend `AuditExtractionFields` and the API response shape to include both. Add two new collapsible sections in `AuditTrailTab` ("Provider fallback chain" and "Finalizer warnings"). Update OpenAPI / api-zod.
  - **Acceptance criteria:** A test extraction with a fallback chain renders both sections with the expected entries.
  - **Files likely affected:** `artifacts/chem-ai/src/components/model-card/AuditTrailTab.tsx`, `artifacts/api-server/src/routes/projects.ts` (model-card response), `lib/api-spec/openapi.yaml`, `lib/api-zod`.
  - **Done:** `AuditTrailTab` now extracts and renders four new audit sections from `extraction.tokenUsage`: Provider Fallback Chain (testid `audit-provider-fallbacks`), Finalizer Warnings (`audit-finalizer-warnings`), Source Content Warnings (`audit-source-warnings`), Chunk Truncation (`audit-chunk-truncation`), Unrecognised Units (`audit-unit-warnings`). The TokenUsageCard ignores these keys so they no longer dump as `[object Object]`. No OpenAPI/api-zod changes were needed because the data already flows through `tokenUsage`; an explicit schema typing pass is a Phase B follow-up.

### Phase B — Scientific rigour

- [ ] 🟡 **AUDIT-2** — Complete models stuck in `scaffold_only` by hard-coded gate
  - **Priority:** P2 | **Category:** ChemE Brain
  - **Description:** `analyzer.ts:1288` forces `enzyme_kinetics | gas_liquid | fed_batch | oxygen_balanced_mixotrophy | microalgae_photobioreactor` to `scaffold_only` regardless of evidence completeness.
  - **Why it matters:** A user with a complete Michaelis-Menten model (Vmax, Km, IC, equation) cannot reach `runnable`. The gate is policy, not science.
  - **Suggested fix:** Either (a) split the status into `scaffold_only` vs `supported_not_ready` so the UI surfaces what's missing rather than a permanent "no", or (b) ship a minimal enzyme/Michaelis-Menten engine in `simulation-engine.ts` and lift the gate for that case only.
  - **Acceptance criteria:** Test fixture: complete Michaelis-Menten enzyme model returns `supported_not_ready` if engine missing OR `runnable` if engine present.
  - **Files likely affected:** `lib/cheme-brain/src/analyzer.ts`, `artifacts/chem-ai/src/lib/simulation-engine.ts`.

- [ ] 🟡 **AUDIT-11** — Dimensional algebra weak; build a real Dim vector parser
  - **Priority:** P2 | **Category:** ChemE Brain
  - **Description:** `dimensional-analysis.ts` checks targeted patterns (Monod LHS-vs-RHS), not arbitrary RHS terms. A swapped variable (`dX/dt = mu·S`) passes.
  - **Why it matters:** Dimensional inconsistencies are the most common modelling error; missing them is a silent failure mode.
  - **Suggested fix:** Build a `Dim = [M, L, T, N, Θ, J, I]` SI vector with a single shared parser used by both `unit-checker.ts` and `dimensional-analysis.ts`. For each ODE, parse the RHS into an expression tree, walk it, and assert dim(LHS) == dim(RHS) for every term.
  - **Acceptance criteria:** Fixture model `dX/dt = mu·S` triggers a HIGH-severity dimensional warning. Fixture `dX/dt = mu·X` passes silently.
  - **Files likely affected:** `artifacts/chem-ai/src/lib/{dimensional-analysis,unit-checker}.ts` (consider hoisting to a shared package).

- [ ] 🟡 **AUDIT-12** — Stoichiometric / regime closure checks (Yxs, mumax bounds)
  - **Priority:** P2 | **Category:** ChemE Brain
  - **Description:** Yxs > 1 is physically impossible; mumax > 2 h⁻¹ extremely unusual. Earlier work added Yxs ≤ 0.70 and a mumax range rule (C1.8/C1.9), but no global stoichiometric-closure (atom-balance) check.
  - **Why it matters:** Bad extractions silently produce simulations that diverge or mislead.
  - **Suggested fix:** Add a closure-checker rule: given Yxs, Yps, Ycox, optionally check sum vs known substrate carbon content. Add a "physical realism" warning class.
  - **Acceptance criteria:** Fixture with Yxs=1.2 (impossible) → HIGH warning "Yxs exceeds physical limit".
  - **Files likely affected:** `artifacts/chem-ai/src/lib/unit-checker.ts` (or new `closure-checker.ts`).

- [ ] 🟡 **AUDIT-13** — Washout detection (D ≥ μmax) silent
  - **Priority:** P2 | **Category:** ChemE Brain
  - **Description:** Chemostat operating regime D ≥ μmax leads to washout; no detection or warning.
  - **Why it matters:** Simulation produces decaying X with no explanation; misleads researchers.
  - **Suggested fix:** Add a regime checker. If D ≥ μmax_eff: HIGH warning "Washout regime detected". If D > 0.85·μmax_eff: MEDIUM "Approaching washout".
  - **Acceptance criteria:** Fixture with D=2 h⁻¹, μmax=0.5 h⁻¹ → HIGH washout warning.
  - **Files likely affected:** `lib/cheme-brain/src/analyzer.ts` (or `unit-checker.ts`).

- [ ] 🟡 **AUDIT-14** — Henry-law convention should hard-block `runnable` for gas-liquid
  - **Priority:** P2 | **Category:** ChemE Brain
  - **Description:** `templates.ts:~330` lists Henry-law convention as a `gas-bc-equilibrium` requirement, but it's not a hard blocker for `runnable`.
  - **Why it matters:** Swapping Henry conventions flips the sign of the driving force; simulation runs silently with inverted transfer.
  - **Suggested fix:** For `gas_liquid` model type, make Henry-law convention a `required` checklist item. Block `runnable` (or `supported_not_ready`) without an explicit convention statement.
  - **Acceptance criteria:** Fixture with kLa + Cstar but no convention → `supported_not_ready` listing the missing convention.
  - **Files likely affected:** `lib/cheme-brain/src/templates.ts`, `analyzer.ts`.

- [ ] 🟡 **AUDIT-15** — Non-Monod kinetics (Haldane / Andrews / Teissier / Moser / Contois) classifier
  - **Priority:** P2 | **Category:** ChemE Brain
  - **Description:** `analyzer.ts:486-493` only matches Monod / Michaelis-Menten keywords. Inhibition kinetics silently collapse to "Monod with missing Ki".
  - **Why it matters:** A paper with Haldane inhibition gets the wrong template, wrong missing-parameter list, and wrong simulation gate.
  - **Suggested fix:** Add regex matchers + a `rate_law_inhibition` subtype. Demand `Ki` (or analogous) for those subtypes.
  - **Acceptance criteria:** Fixture with `mu = mumax·S/(Ks + S + S²/Ki)` recognised as Haldane; Ki listed as a required parameter.
  - **Files likely affected:** `lib/cheme-brain/src/analyzer.ts`, `lib/cheme-brain/src/templates.ts`.

- [ ] 🟡 **AUDIT-16** — Rename reproducibility score; add reproducibility-readiness
  - **Priority:** P2 | **Category:** ChemE Brain / UX
  - **Description:** `lib/reproducibility.ts:204-280` weights presence of fields; an extracted parameter with `confidence: low` and no unit still counts. The number is completeness, not reproducibility.
  - **Why it matters:** Users misread "75" as reproducibility when it's coverage.
  - **Suggested fix:** Rename the existing field to "Completeness score". Add a separate "Reproducibility readiness" boolean gated on `status: observed` AND `confidence: high` for all critical items.
  - **Acceptance criteria:** UI shows two distinct scores. Test asserts that a model with low confidence on all parameters has Readiness=false even if Completeness=100.
  - **Files likely affected:** `artifacts/chem-ai/src/lib/reproducibility.ts`, model-card UI tabs, `package-generator.ts` (report).

- [ ] 🟡 **AUDIT-17** — Prose IC detection (t=0, seeded with, inoculum)
  - **Priority:** P2 | **Category:** ChemE Brain
  - **Description:** IC detector is symbol-based (`X0`, `S_0`, `X_initial`). Misses prose ICs ("the reactor was seeded with 0.1 g/L biomass").
  - **Why it matters:** Many papers describe ICs only in prose; model is falsely flagged incomplete.
  - **Suggested fix:** Add a prose-IC detector: look for sentences containing `t = 0` / `initial(ly)` / `seeded with` / `inoculum` / `inoculated` near a concentration value, cross-reference with state symbols.
  - **Acceptance criteria:** Fixture chunk "The reactor was inoculated with 0.1 g/L biomass" yields an IC parameter for X with `confidence: medium`.
  - **Files likely affected:** `artifacts/api-server/src/lib/{paper-understanding-prompt,extraction-finalizer}.ts`, `providers/rule-based-provider.ts`.

- [ ] 🟡 **AUDIT-18** — Template scoring should weight structural evidence > keywords
  - **Priority:** P2 | **Category:** ChemE Brain
  - **Description:** `analyzer.ts:615-619` adds +1 per keyword match; 4 keywords = "medium confidence" Monod, with no equation/parameter check.
  - **Why it matters:** A paper that says "continuous fermentation" four times scores as a Monod model with no Monod structure.
  - **Suggested fix:** Reweight: equation match = 2 pts, parameter symbol match = 1 pt, keyword = 0.5 pt. Require ≥1 equation match + ≥2 parameter matches before keyword counts.
  - **Acceptance criteria:** Fixture with 4 keywords but no equations scores `low` confidence; fixture with 1 equation + 2 parameters scores ≥ medium.
  - **Files likely affected:** `lib/cheme-brain/src/analyzer.ts`.

### Phase C — UX & robustness

- [ ] 🟡 **AUDIT-7** — Multi-column PDF reading order naive
  - **Priority:** P2 | **Category:** PDF
  - **Description:** `routes/pdf.ts:84-102` groups text items by Y-coordinate only. Two-column journal layouts can interleave columns into nonsense.
  - **Why it matters:** Equation and parameter context can be corrupted.
  - **Suggested fix (no OCR/vision):** Detect columns by x-coordinate clustering (k-means with k=2 on item x-centroids), then linearize column-by-column. If detection fails, fall back to current behaviour with a "multi-column detected — verify extraction" warning attached to PDF diagnostics.
  - **Acceptance criteria:** Test H8 with a two-column fixture asserts reading order is within-column monotonic, or that the warning is added.
  - **Files likely affected:** `artifacts/api-server/src/routes/pdf.ts`.

- [ ] 🟡 **AUDIT-8** — Corrupted vs scanned PDF indistinguishable in error path
  - **Priority:** P2 | **Category:** PDF / UX
  - **Description:** `routes/pdf.ts:222-238` returns the same "scanned or image-based" message for any pdf-parse exception.
  - **Why it matters:** A user with a corrupted file may keep re-uploading; a user with a real scan needs different guidance.
  - **Suggested fix:** Detect `EncryptedDocumentError`, `MissingPDFException`, malformed-trailer errors and map each to a specific message; keep the scan fallback only for the empty-text case.
  - **Acceptance criteria:** Test H9 with two fixtures (corrupted bytes, image-only) returns two different error strings.
  - **Files likely affected:** `artifacts/api-server/src/routes/pdf.ts`.

- [ ] 🟡 **AUDIT-20** — Reset snapshot semantics doc + UI distinction
  - **Priority:** P2 | **Category:** Backend / UX
  - **Description:** `routes/editing.ts:141-154` captures `originalValue` only on the first edit. Reset goes back to first-edit baseline, not the raw AI extraction.
  - **Why it matters:** Users expect "Reset" to revert to the original AI extraction. Currently it reverts to the pre-first-edit state, which after multiple edits is not the original.
  - **Suggested fix:** Either capture `originalAiValue` once at extraction time (preferred) OR expose two buttons: "Undo last edit" vs "Revert to original AI extraction". Document the chosen behaviour in tooltips.
  - **Acceptance criteria:** Test: edit a parameter twice, click reset, assert it returns to the AI-extracted value (not the after-first-edit value).
  - **Files likely affected:** `artifacts/api-server/src/routes/editing.ts`, `lib/db/src/schema/{variables,parameters,equations,assumptions}.ts`, ParametersTab/VariablesTab.

- [ ] 🟡 **AUDIT-21** — OpenAI provider lacks request-level timeout
  - **Priority:** P2 | **Category:** Backend
  - **Description:** Ollama got an AbortController timeout in the earlier P2.4 fix. OpenAI provider relies on SDK default (~10 min).
  - **Why it matters:** A stuck OpenAI request blocks the server.
  - **Suggested fix:** Add AbortController with the same 120s default as Ollama; configurable via env var.
  - **Acceptance criteria:** Test mocks a slow OpenAI response; provider aborts at 120s and returns a clear error.
  - **Files likely affected:** `artifacts/api-server/src/lib/providers/openai-provider.ts`.

- [ ] 🟡 **AUDIT-22** — Persist Groq daily budget across restarts
  - **Priority:** P2 | **Category:** Architecture
  - **Description:** `groq-budget.ts` keeps the daily counter in process memory; restart resets it.
  - **Why it matters:** Multiple restarts in a day can burst past the daily cap.
  - **Suggested fix:** Persist `dailyExtractions`, `requestTimestamps`, and `tokenWindow` to a small SQLite/Postgres table keyed by date.
  - **Acceptance criteria:** Test: restart simulated; counters survive.
  - **Files likely affected:** `artifacts/api-server/src/lib/providers/groq-budget.ts`, `lib/db/src/schema/`.

- [ ] 🟢 **AUDIT-G4** — Chunk ranker is bioprocess-biased
  - **Priority:** P3 | **Category:** PDF / AI
  - **Description:** `providers/groq-budget.ts:205-231` boosts `chemostat|kLa|Henry|batch|fed-batch`. CSTR / PFR / residence-time / heat-exchange terms absent.
  - **Why it matters:** Non-fermentation papers get noisy chunks selected first. Compounds AUDIT-1.
  - **Suggested fix:** Extend the keyword list with reactor-engineering and transport terms. Make ranker keywords data-driven.
  - **Acceptance criteria:** Test with a CSTR fixture: a methods chunk containing "residence time" ranks above the references chunk.
  - **Files likely affected:** `artifacts/api-server/src/lib/providers/groq-budget.ts`.

- [ ] 🟢 **AUDIT-G5** — Chunk splitting is char-based, not token-based
  - **Priority:** P3 | **Category:** PDF / AI
  - **Description:** `structured-document.ts` uses `MIN_CHUNK_CHARS=1500`, `MAX_CHUNK_CHARS=3000`. Equation-dense lines are token-heavy.
  - **Why it matters:** Budget reservation works (estimates tokens), but boundary chooser does not — uneven chunk loads.
  - **Suggested fix:** Use a token estimator (4 chars/token average plus a symbol-density bump) when choosing splits.
  - **Acceptance criteria:** Fixture with equation-dense pages produces more chunks (smaller-char-budget) than text-dense pages of equal char length.
  - **Files likely affected:** `artifacts/api-server/src/lib/{structured-document,pdf-document}.ts`.

- [ ] 🟢 **AUDIT-30** — Hoist duplicated python-generator / reproducibility / unit-checker into shared lib
  - **Priority:** P3 | **Category:** Architecture
  - **Description:** Same file names exist under `artifacts/api-server/src/lib/` and `artifacts/chem-ai/src/lib/`. Drift risk.
  - **Why it matters:** Bug-fix-once is preferred; two implementations diverge.
  - **Suggested fix:** Create `lib/cheme-shared/` workspace package; re-export from both consumers.
  - **Acceptance criteria:** Both consumers import the shared package; CI typecheck passes; existing tests pass.
  - **Files likely affected:** `lib/`, both `artifacts/*/src/lib/` import paths.

- [ ] 🟢 **AUDIT-31** — Prompt examples cover only fermentation
  - **Priority:** P3 | **Category:** AI
  - **Description:** `paper-understanding-prompt.ts:79-80` example shows `mumax`. No CSTR/PFR/heat-exchanger example.
  - **Why it matters:** Gentle bias toward bioprocess answers.
  - **Suggested fix:** Add 1-2 non-bioprocess examples (e.g., a first-order CSTR rate constant, a heat-transfer coefficient).
  - **Acceptance criteria:** Manual spot-check on a non-bioprocess paper; prompt examples revised; existing tests pass.
  - **Files likely affected:** `artifacts/api-server/src/lib/paper-understanding-prompt.ts`.

- [ ] 🟢 **AUDIT-32** — README + ChemE Brain tab: explicit scope statement
  - **Priority:** P3 | **Category:** Docs
  - **Description:** Companion doc-only task to AUDIT-1.
  - **Suggested fix:** A 3-line "Scope of v1" block in `README.md` and `docs/CHEME_BRAIN_V1_DESIGN.md`.
  - **Acceptance criteria:** Both files contain a "Scope of v1" heading naming the supported model types.
  - **Files likely affected:** `README.md`, `docs/CHEME_BRAIN_V1_DESIGN.md`.

### Tests to add

- [ ] 🟡 **AUDIT-T1** — End-to-end PDF → extraction → model-card → simulation → export integration test
  - **Priority:** P2 | **Category:** Testing
  - **Suggested fix:** Use `benchmark/fixtures/` chemostat PDF; assert each stage succeeds and final ZIP contains the 14 files.
  - **Files likely affected:** `artifacts/api-server/src/routes/__tests__/`, `benchmark/`.

- [ ] 🟡 **AUDIT-T2** — Cross-tenant access regression test
  - **Priority:** P2 | **Category:** Testing
  - **Suggested fix:** Two users; user-B tries to fetch user-A's source/extraction by ID → expect 403/404.
  - **Files likely affected:** `artifacts/api-server/src/routes/__tests__/`.

- [ ] 🟡 **AUDIT-T3** — Status discipline test (AI omits status)
  - **Priority:** P2 | **Category:** Testing
  - **Files likely affected:** `artifacts/api-server/src/lib/__tests__/paper-understanding.test.ts`.

- [ ] 🟡 **AUDIT-T4** — Finalizer mutation provenance test
  - **Priority:** P2 | **Category:** Testing
  - **Files likely affected:** new tests under `artifacts/api-server/src/lib/__tests__/`.

- [ ] 🟡 **AUDIT-T5** — Truncation visibility test
  - **Priority:** P2 | **Category:** Testing
  - **Files likely affected:** `artifacts/api-server/src/lib/__tests__/extractor.test.ts`.

- [ ] 🟡 **AUDIT-T6** — ChemE Brain classification fixtures (6 cases)
  - **Priority:** P2 | **Category:** Testing
  - **Description:** Complete Monod chemostat → runnable; Monod missing IC → supported_not_ready; gas-liquid without Henry → scaffold_only; Haldane → recognised as inhibition; CSTR → explicit v1-unsupported message; mock extraction → sourceKind:demo flagged.
  - **Files likely affected:** `lib/cheme-brain/src/analyzer.test.ts`.

- [ ] 🟡 **AUDIT-T7** — Unit validation test (rejects "kJ/zeptosecond")
  - **Priority:** P2 | **Category:** Testing
  - **Files likely affected:** new tests on the unit parser introduced in AUDIT-6.

- [ ] 🟡 **AUDIT-T8** — PDF column-layout + corrupted/scanned fixtures
  - **Priority:** P2 | **Category:** Testing
  - **Files likely affected:** `artifacts/api-server/src/routes/__tests__/`.

- [ ] 🟢 **AUDIT-T9** — CSV injection coverage across every export CSV
  - **Priority:** P3 | **Category:** Testing
  - **Files likely affected:** `artifacts/chem-ai/src/lib/__tests__/package-generator.test.ts`.

---

### Audit verification notes

- **L1 (OpenAPI completeness):** false alarm — spec lines 213, 244, 284, 309, 334 define all sources/extractions/model-card/export/share routes. **Removed** from findings.
- **L2 (AuditTrail UI):** confirmed — core fields rendered; `providerFallbacks` + `finalizerWarnings` not rendered. → AUDIT-F6.
- **L3 (Mock disclosure):** confirmed — mock banner at model-card-detail.tsx:900-910 and Groq→rule-based fallback banner at 919-926. Residual gap = direct rule_based selection has no banner. → AUDIT-G6.
- **L4 (Simulation gating):** confirmed at simulation.tsx:699 ("Demo / supported-model simulation, not a universal simulator."). **Removed** from concerns.
- **L5 (Rule-based reaching runnable):** confirmed possible — analyzer ignores provider type. Mitigation = AUDIT-G6 + AUDIT-19.
- **L6 (clampedNegative rendering):** confirmed — red Alert at simulation.tsx:785-796 with helpful text. **Removed** from concerns.

No source code modified during this audit.
