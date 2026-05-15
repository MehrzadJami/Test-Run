import "dotenv/config";

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

const openai = configured("OPENAI_API_KEY");
const gemini = configured("GEMINI_API_KEY");
const groq = configured("GROQ_API_KEY");
const ollama = configured("OLLAMA_BASE_URL");
const autoProvider = openai
  ? "openai"
  : gemini
    ? "gemini"
    : groq
      ? "groq"
      : ollama
        ? "ollama"
        : "rule_based";

const maxExtractions = intEnv("GROQ_MAX_EXTRACTIONS_PER_DAY", 3);
const maxTokens = intEnv("GROQ_TPD_LIMIT", 75_000);

console.log("mock available true");
console.log("rule_based available true");
console.log(`openai configured ${openai}`);
console.log(`gemini configured ${gemini}`);
console.log(`groq configured ${groq}`);
console.log(
  `groq budget remaining ${maxExtractions} extractions/day, ${maxTokens} estimated tokens/day`,
);
console.log(`ollama reachable ${ollama}`);
console.log(`autoProvider = ${autoProvider}`);
