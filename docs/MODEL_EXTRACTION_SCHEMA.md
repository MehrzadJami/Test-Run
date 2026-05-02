# Model Extraction Schema

This document describes `ExtractionResultSchema` — the canonical data contract that every extraction provider must satisfy. It is defined in `artifacts/api-server/src/lib/extraction-schema.ts` using Zod.

Every provider response is validated against this schema before being persisted. Providers cannot bypass validation.

---

## Top-Level Shape

```typescript
ExtractionResultSchema = z.object({
  paper_title_or_topic:  string           // required, min length 1
  system_type:           string
  process_description:   string
  state_variables:       StateVariable[]
  parameters:            Parameter[]
  equations:             Equation[]
  assumptions:           Assumption[]
  limitations:           Limitation[]
  model_card:            ModelCardMeta
})
```

---

## Shared Enumerations

### `ConfidenceLevel`

Reflects how certain the provider is that a field value is correct, based on evidence in the source text.

| Value | Meaning |
|---|---|
| `"high"` | Explicitly stated in the source with clear context |
| `"medium"` | Inferred or partially supported by the source |
| `"low"` | Guessed or absent from the source |

### `ExtendedRole` (state variables)

| Value | Meaning |
|---|---|
| `"state"` | A differential state variable (governed by an ODE) |
| `"input"` | An external input to the system (operator-set) |
| `"output"` | An observed or computed output |
| `"parameter"` | A constant within the model |
| `"control"` | A control variable (manipulated by a controller) |

> Note: The database `variables.role` column uses a reduced enum: `"state" | "input" | "output"`. Extended roles `"parameter"` and `"control"` are mapped to `"input"` during `mapExtractionToDb()`.

---

## `StateVariable`

Represents a time-varying quantity in the model.

```typescript
StateVariableSchema = z.object({
  symbol:         string              // required, e.g. "X", "S", "CL"
  name:           string              // human name, e.g. "Biomass concentration"
  meaning:        string              // longer description
  unit:           string              // e.g. "g/L", "mg-O2/L"
  role:           ExtendedRole
  source_context: string              // verbatim quote from the source text
  confidence:     ConfidenceLevel
})
```

**DB mapping** (`variables` table):

| Schema field | DB column | Notes |
|---|---|---|
| `symbol` | `symbol` | |
| `name` | `name` | |
| `unit` | `unit` | |
| `role` | `role` | `"parameter"` and `"control"` mapped to `"input"` |
| `source_context` | `source_quote` | |
| `meaning` | — | Not persisted (dropped during mapping) |
| `confidence` | — | Not persisted |
| — | `ordinal` | Set by insertion order |

---

## `Parameter`

A numeric constant in the model with a known or estimated value.

```typescript
ParameterSchema = z.object({
  symbol:         string              // required, e.g. "mumax", "Ks", "kLa"
  name:           string              // e.g. "Maximum specific growth rate"
  value:          string              // string representation, e.g. "0.40"
  unit:           string              // e.g. "h⁻¹", "g/L"
  source_context: string              // verbatim quote
  confidence:     ConfidenceLevel
})
```

> `value` is a string in the schema to accommodate ranges, expressions, and approximations (e.g. `"~0.1"`, `"0.35–0.50"`). The DB column `parameters.value` is `doublePrecision`, so the mapping layer attempts `parseFloat()`.

**DB mapping** (`parameters` table):

| Schema field | DB column | Notes |
|---|---|---|
| `symbol` | `symbol` | |
| `value` | `value` | `parseFloat()` applied; non-numeric values become 0 |
| `unit` | `unit` | |
| `confidence` | `confidence` | `"high" | "medium" | "low"` |
| `source_context` | `source_quote` | |
| `name` | — | Not persisted |
| — | `ordinal` | Set by insertion order |

---

## `Equation`

A governing relationship in the model (ODE, algebraic, or constitutive).

```typescript
EquationSchema = z.object({
  label:               string          // e.g. "Monod growth rate"
  equation_latex:      string          // required, LaTeX string, e.g. "\\mu = \\mu_{max} \\cdot \\frac{S}{K_s + S}"
  equation_plaintext:  string          // e.g. "mu = mumax * S / (Ks + S)"
  meaning:             string          // description of what the equation represents
  variables_involved:  string[]        // symbols used, e.g. ["mu", "mumax", "S", "Ks"]
  source_context:      string          // verbatim quote
  confidence:          ConfidenceLevel
})
```

**DB mapping** (`equations` table):

| Schema field | DB column | Notes |
|---|---|---|
| `label` | `description` | |
| `equation_latex` | `latex` | |
| `source_context` | `source_quote` | |
| `equation_plaintext` | — | Not persisted |
| `meaning` | — | Not persisted |
| `variables_involved` | — | Not persisted |
| `confidence` | — | Not persisted |
| — | `ordinal` | Set by insertion order |

---

## `Assumption`

A modelling assumption explicitly or implicitly stated in the source.

```typescript
AssumptionSchema = z.object({
  assumption:     string              // required, e.g. "Perfect mixing (CSTR)"
  source_context: string              // verbatim quote or "" if implicit
  confidence:     ConfidenceLevel
})
```

**DB mapping** (`assumptions` table, `kind = "assumption"`):

| Schema field | DB column | Notes |
|---|---|---|
| `assumption` | `text` | |
| `confidence` | — | Not persisted |
| `source_context` | — | Not persisted |
| — | `kind` | Fixed value `"assumption"` |
| — | `ordinal` | Set by insertion order |

---

## `Limitation`

A stated limitation of the model's applicability or scope.

```typescript
LimitationSchema = z.object({
  limitation:     string              // required
  source_context: string
  confidence:     ConfidenceLevel
})
```

**DB mapping** (`assumptions` table, `kind = "limitation"`):

Same column mapping as `Assumption` above, with `kind = "limitation"`.

---

## `ModelCardMeta`

Structured metadata about the model as a whole.

```typescript
ModelCardMetaSchema = z.object({
  short_summary:            string    // one-paragraph plain-text summary
  model_type:               string    // e.g. "Continuous chemostat", "CSTR"
  inputs:                   string[]  // e.g. ["D", "Sin"]
  outputs:                  string[]  // e.g. ["X", "S"]
  control_variables:        string[]  // e.g. ["D"]
  missing_information:      string[]  // list of gaps, e.g. ["Initial conditions for X not stated"]
  can_generate_ode_template: boolean  // true if enough info to write an ODE scaffold
})
```

**DB mapping**: All fields of `model_card` are stored as part of `rawExtractionJson` in the `extractions` table. `missing_information` is surfaced in the Missing Information tab. `can_generate_ode_template` controls the ODE Template generation banner.

---

## Full `rawExtractionJson` Column

The complete, validated `ExtractionResult` is stored verbatim in `extractions.raw_extraction_json` (JSONB). This column is the single source of truth for:

- The ODE Template tab (reads `model_card` + `equations`)
- The Unit Check analysis (reads `equations` + `state_variables` + `parameters`)
- The Reproducibility scoring (reads all sub-arrays)
- The Model Package ZIP (`model_card.missing_information`, `model_card.short_summary`, etc.)
- The JSON export button on the model card

The normalized tables (`equations`, `variables`, `parameters`, `assumptions`) exist for relational queries and the structured data tabs. They are derived from `rawExtractionJson` at insertion time; if they conflict with the raw JSON, the raw JSON takes precedence for client-side analysis.

---

## Adding a New Provider

A new extraction provider must:

1. Implement the `ExtractionProvider` interface in `artifacts/api-server/src/lib/extractor.ts`
2. Return data that satisfies `ExtractionResultSchema` (validation is mandatory — the orchestrator will throw `ExtractionProviderError` if the schema parse fails)
3. Be registered in `getActiveProvider()` with an appropriate env-var check
4. Include the provider name as a `ProviderName` literal (`"mock" | "openai" | "gemini"`)

The DB column `extractions.provider_used` accepts `"mock"`, `"openai"`, or `"gemini"`. Adding a new provider name requires a schema migration.
