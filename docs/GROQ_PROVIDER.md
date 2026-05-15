# Groq Provider

Groq is an optional cloud AI provider for professor-style paper understanding.
It is used after OpenAI and Gemini, before Ollama and RuleBased. Mock remains explicit demo mode only.

## Configure

Set these in `.env` on the API server:

```bash
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_FREE_TIER_MODE=true
```

The recommended model is `llama-3.3-70b-versatile` for extraction quality.
For cheaper/faster smoke tests, `llama-3.1-8b-instant` can be used.

## Free-Tier Safety

The app defaults to conservative caps below published free-tier limits:

```bash
GROQ_RPM_LIMIT=20
GROQ_RPD_LIMIT=300
GROQ_TPM_LIMIT=11500
GROQ_TPD_LIMIT=75000
GROQ_MAX_INPUT_TOKENS_PER_REQUEST=7000
GROQ_MAX_OUTPUT_TOKENS_PER_REQUEST=800
GROQ_MAX_CHUNKS_PER_EXTRACTION=3
GROQ_MAX_TOKENS_PER_EXTRACTION=8500
GROQ_MAX_EXTRACTIONS_PER_DAY=3
GROQ_QUEUE_CONCURRENCY=1
```

PDF extraction always ranks and selects chunks before calling Groq, even for
small PDFs. Methods, setup, calculations, nomenclature, equation-like,
table-like, units, controls, setpoints, DO, oxygen, acetate, PFD, light,
yield, productivity, and stoichiometry chunks are prioritized. References and
low-signal chunks are deprioritized.

If a limit is exceeded, Auto mode falls back to Ollama when configured and
reachable, then RuleBasedProvider, and records the reason in the extraction
audit. Explicit Groq mode returns a clear error.

## Structured Output And Debugging

Groq is first called with strict `json_schema` response format using:

- `GROQ_PROFESSOR_PROMPT_VERSION=groq-professor-v2`
- `GROQ_PAPER_SCHEMA_VERSION=groq-paper-understanding-v2`

If the configured Groq model rejects strict schema output, the provider retries
once with JSON object mode and records:

```text
Groq strict schema unsupported; retried with JSON object mode.
```

If validation still fails in development, the API writes a safe debug artifact:

```text
logs/groq-validation-failure-<timestamp>.json
```

The artifact includes selected chunk IDs/page ranges, prompt/schema versions,
validation issues, repaired/normalized JSON, and a raw response snippet. It
does not include API keys or request headers.

## Privacy And Verification

Groq is a cloud provider. Paper text selected from chunks is sent to Groq.
AI extraction must be manually verified against the original paper before use
in simulation, design, publication, or claims about model validity.

Missing kinetic constants, Henry-law conventions, controller gains, light-model
parameters, and initial conditions must not be invented. The provider prompt
asks for additional sources or assumptions instead.

## Verification

Provider status:

```bash
pnpm --filter @workspace/scripts run verify:providers
```

Optional live Groq smoke test:

```bash
pnpm --filter @workspace/scripts run verify:groq
```

The live test runs only when `GROQ_API_KEY` exists. It is not part of unit tests
or CI.

Application-provider smoke test with a short Monod excerpt:

```bash
pnpm --filter @workspace/scripts exec tsx -e "import { config } from 'dotenv'; config({ path: '../.env' }); (async () => { const { runExtraction } = await import('../artifacts/api-server/src/lib/extractor.ts'); const text = 'A continuous chemostat is modeled with biomass X and substrate S. The growth rate is mu = mumax*S/(Ks+S). The biomass balance is dX/dt = (mu - D)*X. The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X. Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, Sin = 10 g/L, and Yxs = 0.5 g/g. The reactor is assumed well-mixed and volume is constant.'; const out = await runExtraction(text, 'groq'); console.log(JSON.stringify({ providerUsed: out.providerName, modelType: out.result.model_type, promptVersion: out.audit.tokenUsage?.professorPromptVersion, schemaVersion: out.audit.tokenUsage?.paperSchemaVersion, responseFormatMode: out.audit.tokenUsage?.responseFormatMode }, null, 2)); })();"
```

## Troubleshooting

- `401`: check `GROQ_API_KEY`.
- `429`: wait for the rate limit window or reduce PDF size/chunk count.
- Malformed JSON: retry with `llama-3.3-70b-versatile` and verify the audit.
- Fallback to RuleBased: Groq was missing, unavailable, budget-limited, or
  returned invalid output.
- PDF too large: the app sends only ranked high-signal chunks; upload SI or
  paste focused methods/equation sections if needed.
