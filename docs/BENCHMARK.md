# ChemAI Extraction Benchmark

A developer benchmark for evaluating and comparing extraction quality across Mock,
OpenAI, and Gemini providers. Designed to catch regressions and surface systematic
differences in how each provider handles chemical engineering text.

---

## What Is Evaluated

For each fixture file, the benchmark runs a full extraction through the live API
server and scores the result against an expected answer file on five dimensions:

| Dimension | Weight | Metric |
|---|---|---|
| **Variable symbols** | 25% | Jaccard similarity of extracted vs expected state variable symbols |
| **Parameter symbols** | 25% | Jaccard similarity of extracted vs expected parameter symbols |
| **Equation coverage** | 25% | Recall: fraction of expected equation symbol-sets covered by extracted equations |
| **Unit accuracy** | 15% | Fraction of expected symbols whose extracted unit matches |
| **Missing information** | 10% | 1.0 if model card lists missing info, 0.5 if only assumptions, 0.0 if none |

**Overall score** = weighted average of all five dimensions (0–100%).

### Jaccard Similarity (Variables & Parameters)

Jaccard = |extracted ∩ expected| / |extracted ∪ expected|

- Penalises both missing expected symbols **and** spurious extra symbols
- Symbols are compared case-insensitively after normalisation
- Score of 1.0 means extracted symbols exactly match expected; 0 means no overlap

### Equation Coverage (Recall)

For each expected equation (defined as a set of key symbols), the benchmark checks
whether at least one extracted equation contains ≥50% of those symbols.

Coverage = matched equations / total expected equations

This rewards extractors that find the right equations even if they phrase them
differently, while penalising those that miss key relationships entirely.

### Unit Accuracy

For each expected symbol, the benchmark looks up the extracted unit and compares
it leniently (case-insensitive, normalised separators, common aliases).

Matching examples: `1/h` ≈ `h⁻¹` ≈ `h^-1`, `g/L` ≈ `g·L⁻¹`.

---

## Fixtures

Five synthetic, non-copyrighted text excerpts in `benchmark/fixtures/`:

| File | System | Key symbols |
|---|---|---|
| `chemostat_monod.txt` | Continuous chemostat, Monod kinetics | X, S, mumax, Ks, Yxs, D, Sin |
| `gas_liquid_transfer.txt` | Oxygen transfer in aerobic bioreactor | C, X, kLa, Cstar, qO2 |
| `batch_reactor_first_order.txt` | First-order batch reaction/degradation | C, k, C0 |
| `fed_batch_growth.txt` | Fed-batch bioreactor, variable volume | X, S, V, mumax, Ks, F, Sin |
| `photobioreactor_light.txt` | Photobioreactor with Haldane light kinetics | X, mumax, KI, KiI, I |

Each fixture includes: system description, state variables, parameters (with values
and units), governing equations, assumptions, and limitations.

---

## How to Run

### Prerequisites

The API server must be running:

```bash
pnpm --filter @workspace/api-server run dev
```

### Run with Mock provider (no API keys required)

```bash
pnpm benchmark
# equivalent to:
pnpm benchmark --provider mock
```

### Run with a real AI provider

```bash
pnpm benchmark --provider openai   # requires OPENAI_API_KEY
pnpm benchmark --provider gemini   # requires GEMINI_API_KEY
```

### Run all three providers and compare

```bash
pnpm benchmark --provider all
```

### Run a single fixture

```bash
pnpm benchmark --fixture chemostat_monod
pnpm benchmark --fixture batch_reactor
```

### Custom API base URL (e.g. against a deployed instance)

```bash
pnpm benchmark --base-url https://your-app.replit.app
```

---

## Comparing Providers

Run with `--provider all` and then compare the `benchmark/reports/*.json` files.
Each report contains per-fixture scores and a summary section with mean scores.

Example comparison workflow:

```bash
# Run all three
pnpm benchmark --provider all

# The reports directory will contain:
#   benchmark/reports/mock_2024-01-15T10-30-00.json
#   benchmark/reports/openai_2024-01-15T10-30-01.json
#   benchmark/reports/gemini_2024-01-15T10-30-02.json
```

Key things to look for:

- **Overall score**: Does OpenAI/Gemini significantly beat Mock?
- **Unit accuracy**: Real providers should pick up explicit units better
- **Equation coverage**: Does the provider find all three chemostat equations?
- **Missing info score**: Do real providers identify limitations in the text?

---

## Understanding Mock Provider Scores

The Mock provider returns a fixed deterministic response (Andrews 1968 chemostat).
It will score well on `chemostat_monod` (since that's what it mimics) but poorly
on the other fixtures. Use Mock scores as a **lower bound / regression baseline**,
not as meaningful accuracy measurements.

---

## Limitations

This benchmark is a **developer tool**, not a scientific validation dataset:

- Fixtures are synthetic; real paper text is messier and more ambiguous
- Expected answers reflect one reasonable interpretation; others may be equally valid
- Scoring is heuristic — a score of 80% does not mean the extraction is 80% correct
- Unit matching is lenient; some legitimate unit variants may not be covered
- Equation coverage uses symbol overlap, not semantic equation equivalence
- The Mock provider will score high on chemostat fixtures because it mimics that model

---

## How to Add New Fixtures

1. **Write a fixture** in `benchmark/fixtures/your_model.txt`:
   - Describe a synthetic or public-domain chemical engineering system
   - Include: system description, state variables (with units), parameters (with
     values + units), explicit equations, assumptions, and limitations
   - Minimum ~100 words; longer is better for testing real providers
   - Do **not** use text from copyrighted papers

2. **Create an expected file** in `benchmark/expected/your_model.json`:
   ```json
   {
     "fixture_name": "Your Model Display Name",
     "expected_variable_symbols": ["X", "S"],
     "expected_variable_units": { "x": "g/L", "s": "g/L" },
     "expected_parameter_symbols": ["k", "K0"],
     "expected_parameter_units": { "k": "1/h", "k0": "g/L" },
     "expected_equation_symbol_sets": [
       ["X", "k", "S"],
       ["S", "K0"]
     ]
   }
   ```
   - Symbol keys in unit maps are **lowercase** (they are normalised before matching)
   - `expected_equation_symbol_sets`: each inner array is a set of symbols that
     should all appear in at least one extracted equation

3. **Verify** by running:
   ```bash
   pnpm benchmark --fixture your_model --provider mock
   ```

---

## Report Format

Each run saves a JSON report to `benchmark/reports/`:

```jsonc
{
  "runAt": "2024-01-15T10:30:00.000Z",
  "provider": "mock",
  "baseUrl": "http://localhost:80",
  "results": [
    {
      "fixture": "chemostat_monod",
      "provider": "mock",
      "schemaValid": true,
      "variableScore": 0.67,
      "parameterScore": 0.57,
      "equationScore": 1.00,
      "unitScore": 0.60,
      "missingInfoScore": 1.00,
      "overallScore": 0.74,
      "notes": ["Low parameter match (57%): extracted [...]"]
    }
  ],
  "summary": {
    "meanVariableScore": 0.67,
    "meanParameterScore": 0.57,
    "meanEquationScore": 0.80,
    "meanUnitScore": 0.60,
    "meanMissingInfoScore": 0.90,
    "meanOverallScore": 0.70,
    "schemaPassRate": 1.00
  }
}
```

Reports are **not** committed to git (add `benchmark/reports/` to `.gitignore` if needed).
