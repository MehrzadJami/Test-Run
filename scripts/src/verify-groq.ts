import { existsSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

const localEnvPath = path.resolve(process.cwd(), ".env");
const parentEnvPath = path.resolve(process.cwd(), "..", ".env");
config({ path: existsSync(localEnvPath) ? localEnvPath : parentEnvPath });

const key = process.env.GROQ_API_KEY?.trim();
const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

if (!key) {
  console.log("GROQ_API_KEY missing; skipping Groq verification.");
  process.exit(0);
}

const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({
    model,
    temperature: 0,
    max_tokens: 250,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Return strict JSON only with keys paper_title, model_type, parameters, equations.",
      },
      {
        role: "user",
        content:
          "Monod chemostat text: mu = mumax*S/(Ks+S), dX/dt=(mu-D)*X, mumax=0.8 1/h.",
      },
    ],
  }),
});

if (!response.ok) {
  const text = await response.text();
  console.error(`Groq verification failed: HTTP ${response.status}`);
  console.error(text.slice(0, 500));
  process.exit(1);
}

const data = (await response.json()) as {
  choices?: Array<{ message?: { content?: string } }>;
};
const content = data.choices?.[0]?.message?.content ?? "";
try {
  JSON.parse(content);
  console.log(`Groq verification passed with model ${model}.`);
} catch {
  console.error("Groq returned non-JSON content.");
  console.error(content.slice(0, 500));
  process.exit(1);
}
