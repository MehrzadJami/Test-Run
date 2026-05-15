# ChemE Brain v1 Design

## 1. Architecture

ChemE Brain v1 is a proposed non-invasive reasoning layer for ChemAI Model Compiler. It organizes the existing extraction, classification, unit, template, assembly, reproducibility, finalizer, PaperUnderstanding, and simulation modules into one provider-independent chemical-engineering audit workflow.

The proposed future module boundary is:

```text
lib/cheme-brain/
```

Do not move existing files into this module for v1. The first implementation should call existing modules where useful and should run in shadow/audit mode only.

### V1 Operating Mode

ChemE Brain v1 should:

- Consume finalized extraction data.
- Produce a `ChemEBrainReport` beside the existing model assembly report.
- Preserve extraction rows, model-card fields, exports, and simulation state unchanged.
- Provide reasoning, warnings, evidence labels, and next-source requests.
- Remain provider-independent across Mock, RuleBased, Groq, Ollama, OpenAI, Gemini, and Auto fallback outputs.

ChemE Brain v1 should not:

- Rewrite provider extraction logic.
- Rewrite model assembly, simulation, or package export.
- Add OCR, Vision, web search, scraping, or new product workflow.
- Insert guessed numerical values.
- Treat generic textbook knowledge as source evidence.

### Existing Modules To Orchestrate

ChemE Brain should be a coordinator over existing pieces:

- `domain-classifier`: canonical model type detection and legacy model type normalization.
- `template-matcher`: known equation patterns and runnable-template status.
- `unit-checker`: heuristic unit warnings.
- `dimensional-analysis`: formal checks for supported equation patterns.
- `model-assembly`: current readiness and missing-requirement report.
- `reproducibility`: traceability and completeness report.
- `extraction-finalizer`: provider-independent cleanup and explicit-evidence normalization.
- Rule-based/explicit evidence extraction: deterministic source-backed equations and parameter assignments.
- AI PaperUnderstanding providers: richer full-paper context when configured.
- `python-generator`: simulation scaffold/runnable code generation for supported models.

## 2. Data Types And Interfaces

These are conceptual interfaces for the first implementation. They should live under `lib/cheme-brain/` when runtime code is added.

```ts
type EvidenceStatus =
  | "observed"
  | "inferred"
  | "assumed"
  | "missing"
  | "conflicting"
  | "unsupported";

type SimulationSupport =
  | "unsupported"
  | "scaffold_only"
  | "supported_not_ready"
  | "runnable";

type ChemEEquationClass =
  | "dynamic_ode"
  | "algebraic"
  | "rate_law"
  | "stoichiometric"
  | "productivity"
  | "control_law"
  | "reporting"
  | "unknown";
```

### ChemEBrainInput

```ts
interface ChemEBrainInput {
  extraction: ExtractionResult;
  sourceDiagnostics?: {
    sourceKind?: "text" | "pdf" | "demo" | "unknown";
    textQuality?: "good" | "low_text" | "failed" | "unknown";
    warnings?: string[];
  };
  classifierResult?: {
    modelType: ModelType;
    confidence: number;
    matchedKeywords: string[];
    scores?: Partial<Record<ModelType, number>>;
  };
  assemblyReport?: ModelAssemblyReport;
  reproducibilityReport?: ReproducibilityReport;
  unitReport?: UnitCheckReport;
  templateScan?: TemplateScanResult;
}
```

### ChemEBrainReport

```ts
interface ChemEBrainReport {
  canonical_model_type: ModelType;
  confidence: "high" | "medium" | "low";
  corrected_roles: ChemERoleAssessment[];
  equation_classification: ChemEEquationAssessment[];
  required_information_checklist: ChemEChecklistItem[];
  missing_requirements: ChemEMissingRequirement[];
  inferred_units: ChemEInferredUnit[];
  contradictions: ChemEContradiction[];
  simulation_support: {
    status: SimulationSupport;
    reason: string;
    supported_model?: "monod_chemostat" | "batch_culture";
  };
  recommended_next_sources: ChemENextSourceRequest[];
  warnings: ChemEWarning[];
  audit_trail: ChemEAuditEvent[];
}
```

### Evidence Records

Each reasoning claim should carry status and provenance:

```ts
interface ChemEEvidence {
  status: EvidenceStatus;
  source_context?: string;
  source_kind?: "provider" | "explicit_text" | "classifier" | "cheme_rule" | "user";
  confidence: "high" | "medium" | "low";
}
```

Evidence status meanings:

- `observed`: explicitly present in source or extracted provider output with source context.
- `inferred`: logically derived from observed evidence plus chemical-engineering rules, such as `mu` unit from Monod relation and `mumax` unit.
- `assumed`: supplied by user or configured app default, never silently created by ChemE Brain.
- `missing`: required for the target model but absent.
- `conflicting`: incompatible evidence exists, such as state role without derivative evidence where another role is more likely.
- `unsupported`: the app cannot model or simulate this item yet.

## 3. Model Templates

ChemE Brain templates are audit templates, not source-of-truth values. They define what to check, what to warn about, and what source to request next.

`photobioreactor_light` is a ChemE Brain specialization under the reasoning layer. It should not be added as a canonical DB or extraction `model_type` enum in v1.

### monod_chemostat

- Required states: `X`, `S`.
- Common inputs: `Sin`, feed stream, time.
- Common controls: `D`, sometimes feed flow `F` if volume is known.
- Common outputs: `X`, `S`, `mu`, productivity if reported.
- Required parameters: `mumax`, `Ks`, `D`, `Sin`, `Yxs`.
- Required equations: Monod rate law, biomass ODE, substrate ODE.
- Required IC/BC: `X0`, `S0`, feed substrate concentration, dilution rate.
- Common units: `X` and `S` in concentration units, `mumax` and `D` in 1/time, `Ks` and `Sin` in concentration units, `Yxs` in mass or molar ratio.
- Common missing requirements: initial conditions, `Yxs`, feed concentration, time unit.
- Simulation support: runnable only when all required states, equations, parameters, and ICs are present.
- Dangerous assumptions: assuming steady-state equations are dynamic ODEs; treating `volume is constant` as a numeric reactor volume.

### batch_culture

- Required states: at least biomass `X` and substrate `S` for growth models.
- Common inputs: initial substrate and biomass, incubation conditions.
- Common controls: temperature, pH, light, aeration if reported.
- Common outputs: biomass, substrate, product, growth rate.
- Required parameters: kinetic constants for growth or uptake, yield coefficients if substrate balance is used.
- Required equations: growth rate law and state balances without inlet/outlet dilution terms.
- Required IC/BC: initial values for each state.
- Common units: concentrations for states, 1/time for growth rates, ratio units for yields.
- Common missing requirements: initial conditions, kinetic constants, yield coefficients.
- Simulation support: supported only if required batch parameters and dynamic equations are present.
- Dangerous assumptions: adding dilution rate `D` when no inlet/outlet exists.

### fed_batch

- Required states: biomass, substrate, volume, and any product or dissolved species being modeled.
- Common inputs: feed rate `F(t)`, feed substrate concentration, initial volume.
- Common controls: feed profile, pH, temperature, aeration, DO control.
- Common outputs: biomass, substrate, product, volume, productivity.
- Required parameters: kinetic constants, yield coefficients, feed concentration, volume/feed definitions.
- Required equations: variable-volume balances with feed terms.
- Required IC/BC: initial concentrations and initial volume; feed schedule or feed function.
- Common units: volume, flow, concentration, time.
- Common missing requirements: `F(t)`, volume dynamics, feed composition, ICs.
- Simulation support: scaffold-only in v1 unless a supported fed-batch engine is added later.
- Dangerous assumptions: treating fed-batch as constant-volume batch or chemostat.

### gas_liquid

- Required states: dissolved species with derivative evidence, such as `C_O2` or `C_CO2`.
- Common inputs: gas-phase concentration, saturation concentration, biomass forcing `X`, gas flow.
- Common controls: `kLa` only if manipulated, gas composition, aeration rate.
- Common outputs: dissolved oxygen, dissolved carbon dioxide, oxygen uptake rate.
- Required parameters: `kLa`, saturation concentration or Henry-law relation, uptake/production rates.
- Required equations: mass-transfer balance and biological consumption/production terms.
- Required IC/BC: initial dissolved species concentrations; gas-liquid convention.
- Common units: concentration for dissolved species, 1/time for `kLa`, concentration for saturation terms.
- Common missing requirements: Henry-law convention, ICs, gas-phase units, temperature.
- Simulation support: unsupported in v1, scaffold-only.
- Dangerous assumptions: treating biomass `X` as a state unless `dX/dt` exists; treating Henry constants as interchangeable across conventions.

### enzyme_kinetics

- Required states: substrate and product if dynamic, or substrate for rate-only analysis.
- Common inputs: enzyme concentration, initial substrate.
- Common controls: temperature, pH, enzyme loading.
- Common outputs: rate, product formation, conversion.
- Required parameters: `Vmax`, `Km`; inhibition constants if inhibition is claimed.
- Required equations: Michaelis-Menten or explicit empirical rate law.
- Required IC/BC: initial substrate/product for dynamics; enzyme loading for rates.
- Common units: concentration/time for rates, concentration for `Km`.
- Common missing requirements: enzyme concentration, initial substrate, inhibition constants.
- Simulation support: scaffold-only in v1 unless a supported enzyme engine is added later.
- Dangerous assumptions: treating reported initial rate data as full dynamic ODEs.

### photobioreactor_light

- Required states: biomass and relevant substrate or product states when dynamic modeling is claimed.
- Common inputs: PFD/irradiance, reactor geometry, path length, optical density.
- Common controls: light intensity, dilution/feed, temperature, pH, gas flow.
- Common outputs: biomass, productivity, light-limited growth rate.
- Required parameters: light attenuation, maximum photosynthetic rate or light-growth relation, geometry terms.
- Required equations: light attenuation and growth/light relation if dynamic PBR model is claimed.
- Required IC/BC: initial biomass, initial substrate/product, light boundary condition.
- Common units: PFD in photon flux units, biomass concentration, path length/area/volume units.
- Common missing requirements: cited light model, attenuation coefficients, geometry, calibration data.
- Simulation support: unsupported/scaffold-only in v1.
- Dangerous assumptions: using incident light as average light without attenuation model.

### oxygen_balanced_mixotrophy

- Required states: biomass, acetate/substrate, dissolved oxygen, dissolved CO2 or TIC if carbon balance is claimed.
- Common inputs: acetate feed, light/PFD, gas transfer inputs, dilution/feed.
- Common controls: DO setpoint, acetate feed, dilution rate, light, gas flow.
- Common outputs: biomass, acetate, DO, CO2/TIC, productivity, yields.
- Required parameters: autotrophic growth/light relation, heterotrophic acetate uptake, O2/CO2 stoichiometry, gas-transfer coefficients, Henry convention, controller parameters if closed-loop control is modeled.
- Required equations: dynamic balances for claimed states plus stoichiometric/gas-transfer/control equations where needed.
- Required IC/BC: all state ICs, feed concentrations, controller setpoints and gains if closed-loop.
- Common units: concentration units, 1/time rates, PFD units, stoichiometric ratio units.
- Common missing requirements: kinetic constants, light model parameters, Henry convention, controller parameters, ICs, cited papers or SI.
- Simulation support: scaffold-only in v1.
- Dangerous assumptions: treating productivity/yield equations as ODEs; inventing six-state dynamics from experimental procedure alone.

### unknown/generic

- Required states: only those explicitly supported by derivative equations.
- Common inputs/controls/outputs: source-specific only.
- Required parameters/equations: no generic runnable requirements beyond source-observed evidence.
- Required IC/BC: needed for any explicit dynamic ODE.
- Common units: every state and parameter should have source-backed units or be marked missing.
- Common missing requirements: model type, equations, parameter definitions, ICs, units.
- Simulation support: unsupported/scaffold-only.
- Dangerous assumptions: forcing unknown sources into Monod, gas-liquid, or batch templates.

## 4. Pipeline

The future runtime order should be:

```text
provider output
-> explicit evidence merge
-> extraction finalizer
-> ChemE Brain report
-> model assembly
-> export/simulation
```

ChemE Brain should run after final cleanup so it sees the same variables, parameters, equations, raw extraction, and initial conditions that DB rows, exports, and simulation use.

### Reasoning Steps

1. Normalize the model type using the existing canonical model type system.
2. Compare provider model type, classifier result, raw evidence, equations, parameters, and template matches.
3. Assign or recommend corrected roles with evidence status:
   - state only when derivative evidence or explicit state evidence exists.
   - control only when manipulated or operationally set.
   - parameter when numeric assignment or constant definition exists.
   - input/output when source text or equations imply forcing/response variables.
4. Classify each equation as dynamic ODE, algebraic, rate law, stoichiometric, productivity, control law, reporting, or unknown.
5. Apply the selected template checklist.
6. Add missing requirements without inventing values.
7. Add inferred units only when derivable from source-backed equations and compatible units.
8. Detect contradictions such as role mismatch, incompatible units, or conflicting model types.
9. Decide simulation support.
10. Recommend next source types.

## 5. Integration Points

### Backend Extraction Path

ChemE Brain should eventually run after `runExtraction()` has:

- Parsed provider output.
- Merged explicit source-backed evidence.
- Applied extraction finalization.
- Validated the final `ExtractionResult`.

The first runtime version should store or return the report as an audit artifact only. It should not mutate `ExtractionResult`.

### Frontend Model Card

The first UI integration should display ChemE Brain beside model assembly as a read-only audit section. It should show:

- confirmed model type
- simulation support status
- missing requirements
- role/equation corrections
- warnings
- recommended next sources

### Export

Exports can later include:

- `cheme_brain_report.json`
- optional `cheme_brain_summary.md`

This should happen only after the shadow report is stable and covered by tests.

### Simulation

Simulation should remain gated by the existing supported-model logic. ChemE Brain may provide an additional explanation for why simulation is blocked, but it must not make unsupported models runnable.

## 6. Safety Rules

ChemE Brain must obey these rules:

1. Never invent numeric values.
2. Never convert missing values into assumptions.
3. Never mark simulation runnable unless required equations, parameters, units/conventions, and initial conditions are present for a supported model type.
4. Never use generic textbook knowledge as source evidence.
5. Use chemical-engineering knowledge only for validation, inference labels, missing-info detection, and warnings.
6. Keep observed and inferred evidence separate.
7. Preserve provider identity and fallback truthfulness.
8. Preserve missing-information truth, including Henry convention, kinetic constants, light parameters, controller gains, and IC gaps.
9. Treat reported productivity/yield calculations as non-ODE unless they explicitly define a derivative of a state variable.
10. Treat image-only/table-only/figure-only evidence as unavailable unless text extraction captured it.

## 7. Test Plan

The first implementation should use pure unit tests with small fixtures.

### Complete Monod Chemostat

Expected:

- canonical model type `monod_chemostat`
- states `X`, `S`
- `mu` as output/intermediate or rate-law variable, not state
- `D` as control/parameter
- `Sin` as input/parameter
- required equations present
- `X0` and `S0` satisfy IC checklist
- simulation support `runnable`

### Monod Missing Initial Conditions

Expected:

- model type still `monod_chemostat`
- missing IC requirement present
- simulation support `supported_not_ready`
- no invented `X0` or `S0`

### Gas-Liquid Missing Henry Convention

Expected:

- canonical model type `gas_liquid`
- `C_O2` state if `dC_O2/dt` exists
- `X` not state unless `dX/dt` exists
- Henry convention missing remains critical or warning
- simulation support `scaffold_only` or `unsupported`

### Batch Culture Without Dilution Rate

Expected:

- canonical model type `batch_culture`
- absence of `D` is not a missing requirement
- feed/inlet terms are suspicious if present without fed-batch evidence

### Fed-Batch With `V` / `F(t)`

Expected:

- canonical model type `fed_batch`
- volume and feed schedule requirements detected
- scaffold-only unless variable-volume balances and ICs are complete

### Enzyme Kinetics With `Vmax` / `Km`

Expected:

- canonical model type `enzyme_kinetics`
- Michaelis-Menten equation classified as rate law or algebraic
- not treated as dynamic ODE unless state derivatives are present

### Oxygen-Balanced Mixotrophy

Expected:

- model type `oxygen_balanced_mixotrophy` or `microalgae_photobioreactor` depending evidence
- detects PBR, light, DO control, acetate feed, gas transfer, and stoichiometry evidence
- productivity/yield/carbon-balance equations are non-ODE
- missing kinetic/light/Henry/controller/IC requirements present
- simulation support scaffold-only

### Unknown/Generic

Expected:

- model type `unknown`
- no forced Monod/gas/batch template
- states only from explicit derivative or state evidence
- simulation blocked with source-request guidance

## 8. Step-By-Step Implementation Roadmap

### Step 1: Pure Types And Template Fixtures

Create `lib/cheme-brain/` with:

- report types
- evidence status types
- template definitions
- no dependencies on provider SDKs
- no DB writes

### Step 2: Shadow Analyzer

Add a pure analyzer:

```ts
analyzeChemEBrain(input: ChemEBrainInput): ChemEBrainReport
```

It should call existing modules where possible and produce deterministic output.

### Step 3: Unit Tests

Add fixtures for the scenarios in the test plan. Validate role correction, equation classification, missing requirements, inferred units, and simulation support.

### Step 4: Export/Model Card Surface

After tests are stable, expose the report as read-only audit data:

- model card section or tab
- package export JSON/markdown

Do not let it overwrite extraction fields yet.

### Step 5: Model Assembly Parity

Compare ChemE Brain report with existing model assembly over known fixtures. Only after parity is proven should model assembly optionally consume ChemE Brain output.

## 9. Recommended First Implementation Step

Start with a pure `lib/cheme-brain/types.ts` and `lib/cheme-brain/templates.ts` module plus unit tests for template completeness. This gives the project a stable reasoning contract without touching providers, DB schema, UI, or simulation.

## 10. Risks

- Duplicate logic with `model-assembly` if boundaries are unclear.
- Overcorrecting provider output too early could hide extraction problems.
- Treating template expectations as facts could create hallucinated values.
- Adding too many runtime consumers before shadow-mode tests are stable could reintroduce misleading simulation readiness.
- `photobioreactor_light` could be confused with canonical model types unless documented as a specialization only.

## 11. Verification

Creating this document should not affect runtime behavior. Still run:

```bash
pnpm -r typecheck
pnpm test:unit
pnpm -r build
```

If any command fails, the failure should be treated as pre-existing or unrelated unless it points to markdown/doc tooling.
