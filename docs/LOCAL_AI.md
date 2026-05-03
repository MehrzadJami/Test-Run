# Local AI With Ollama

ChemAI can use a local Ollama model for paper-understanding extraction. Ollama is optional: the app starts without it, and Auto mode falls back to Rule-based extraction if local Ollama is unavailable.

## Install Ollama

1. Install Ollama from https://ollama.com/download.
2. Start the local server:

```bash
ollama serve
```

3. Pull a model:

```bash
ollama pull llama3.1
```

## Run The App With Ollama

Set the local provider environment variables before starting the API:

```bash
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=llama3.1
pnpm --filter @workspace/api-server run dev
```

In the New Extraction page, select `Ollama (local free)` or use Auto mode with `OLLAMA_BASE_URL` configured. If Ollama is down in Auto mode, extraction falls back to Rule-based local mode. If you explicitly select Ollama and it is unavailable, the API returns a clear provider error.

## Local Model Limitations

Local models are useful for private, offline experiments, but they can still hallucinate equations, miss units, or confuse reported calculations with dynamic balances. Treat local output as a draft. Verify variables, units, parameter values, assumptions, and source context against the paper.

Large PDFs may exceed a local model context window. Prefer targeted methodology, equations, tables, nomenclature, and supporting-information chunks when results look incomplete.

## Gated Integration Tests

Real-provider integration tests are skipped by default. They only run when `INTEGRATION=true` and at least one real provider is configured:

```bash
INTEGRATION=true OLLAMA_BASE_URL=http://localhost:11434 pnpm --filter @workspace/api-server run test:unit
```

You can also force a provider:

```bash
INTEGRATION=true EXTRACTION_PROVIDER=ollama OLLAMA_BASE_URL=http://localhost:11434 pnpm --filter @workspace/api-server run test:unit
```

## OpenAI/Gemini Verification

Unit tests do not require OpenAI or Gemini keys. To run a manual real-provider verification table when keys are available:

```bash
OPENAI_API_KEY=... pnpm --filter @workspace/scripts run verify-real-extraction
GEMINI_API_KEY=... pnpm --filter @workspace/scripts run verify-real-extraction
```

For Ollama:

```bash
OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_MODEL=llama3.1 pnpm --filter @workspace/scripts run verify-real-extraction
```

The script skips providers with no configured key/base URL and prints pass/fail rows for small Monod and gas-transfer examples.
