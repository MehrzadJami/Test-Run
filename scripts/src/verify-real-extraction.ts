type VerificationRow = {
  provider: string;
  case: string;
  status: "pass" | "fail" | "skip";
  detail: string;
};

type ProviderConfig = {
  name: "openai" | "gemini" | "ollama";
  model: string;
};

const CASES = [
  {
    name: "monod",
    text:
      "A continuous chemostat is modeled with biomass X and substrate S. " +
      "The growth rate is mu = mumax*S/(Ks+S). The biomass balance is dX/dt = (mu - D)*X. " +
      "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, and D = 0.1 1/h.",
  },
  {
    name: "gas-transfer",
    text:
      "In an aerobic bioreactor, dissolved oxygen C_O2 changes by gas-liquid transfer. " +
      "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X. " +
      "Parameters are kLa = 80 1/h and qO2 = 0.02 gO2/gX/h.",
  },
];

function configuredProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];
  if (process.env["OPENAI_API_KEY"]) {
    providers.push({
      name: "openai",
      model: process.env["OPENAI_MODEL"] ?? "gpt-4o-mini",
    });
  }
  if (process.env["GEMINI_API_KEY"]) {
    providers.push({
      name: "gemini",
      model: process.env["GEMINI_MODEL"] ?? "gemini-1.5-flash",
    });
  }
  if (process.env["OLLAMA_BASE_URL"]) {
    providers.push({
      name: "ollama",
      model: process.env["OLLAMA_MODEL"] ?? "llama3.1",
    });
  }
  return providers;
}

function promptFor(text: string): string {
  return [
    "Extract a chemical/biochemical engineering model from the text.",
    "Return strict JSON only with these fields: paper_title_or_topic, model_type, state_variables, parameters, equations.",
    "Use model_type unknown if unclear. Do not invent missing values.",
    `Text:\n${text}`,
  ].join("\n\n");
}

function validateMinimalJson(text: string): string {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (typeof parsed["paper_title_or_topic"] !== "string") {
    throw new Error("missing paper_title_or_topic");
  }
  if (typeof parsed["model_type"] !== "string") {
    throw new Error("missing model_type");
  }
  if (!Array.isArray(parsed["state_variables"])) {
    throw new Error("missing state_variables array");
  }
  if (!Array.isArray(parsed["parameters"])) {
    throw new Error("missing parameters array");
  }
  if (!Array.isArray(parsed["equations"])) {
    throw new Error("missing equations array");
  }
  return parsed["model_type"];
}

async function callOpenAI(model: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env["OPENAI_API_KEY"]}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return strict JSON only." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGemini(model: string, prompt: string): Promise<string> {
  const key = process.env["GEMINI_API_KEY"];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callOllama(model: string, prompt: string): Promise<string> {
  const baseUrl = (process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, format: "json" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { response?: string };
  return data.response ?? "";
}

async function callProvider(provider: ProviderConfig, prompt: string): Promise<string> {
  if (provider.name === "openai") return callOpenAI(provider.model, prompt);
  if (provider.name === "gemini") return callGemini(provider.model, prompt);
  return callOllama(provider.model, prompt);
}

async function main() {
  const providers = configuredProviders();
  const rows: VerificationRow[] = [];

  if (providers.length === 0) {
    rows.push({
      provider: "all",
      case: "configuration",
      status: "skip",
      detail:
        "No OPENAI_API_KEY, GEMINI_API_KEY, or OLLAMA_BASE_URL configured.",
    });
    console.table(rows);
    return;
  }

  for (const provider of providers) {
    for (const testCase of CASES) {
      try {
        const content = await callProvider(provider, promptFor(testCase.text));
        const modelType = validateMinimalJson(content);
        rows.push({
          provider: `${provider.name}:${provider.model}`,
          case: testCase.name,
          status: "pass",
          detail: `model_type=${modelType}`,
        });
      } catch (err) {
        rows.push({
          provider: `${provider.name}:${provider.model}`,
          case: testCase.name,
          status: "fail",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  console.table(rows);
  if (rows.some((row) => row.status === "fail")) process.exitCode = 1;
}

void main();
