import { getGroqBudgetStatus } from "./providers/groq-budget";

export type ProviderStatus = ReturnType<typeof getProviderStatus>;

export function getProviderStatus() {
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const groq = getGroqBudgetStatus();
  const groqBudgetAvailable =
    groq.available &&
    groq.usageToday.extractions < groq.limits.maxExtractionsPerDay &&
    groq.usageToday.requests < groq.limits.rpd &&
    groq.usageToday.estimatedTokens < groq.limits.tpd;
  const ollamaConfigured = Boolean(process.env.OLLAMA_BASE_URL);
  const autoProvider = openaiConfigured
    ? "openai"
    : geminiConfigured
      ? "gemini"
      : groqBudgetAvailable
        ? "groq"
        : ollamaConfigured
          ? "ollama"
          : "rule_based";

  return {
    mock: {
      available: true,
      reason: "Mock demo provider is always available",
    },
    rule_based: {
      available: true,
      reason: "RuleBasedProvider is deterministic local extraction",
    },
    openai: {
      available: openaiConfigured,
      reason: openaiConfigured
        ? "OPENAI_API_KEY configured"
        : "OPENAI_API_KEY missing",
    },
    gemini: {
      available: geminiConfigured,
      reason: geminiConfigured
        ? "GEMINI_API_KEY configured"
        : "GEMINI_API_KEY missing",
    },
    groq,
    groqBudgetAvailable,
    ollama: {
      available: ollamaConfigured,
      reason: ollamaConfigured
        ? "OLLAMA_BASE_URL configured"
        : "OLLAMA_BASE_URL missing or not checked",
    },
    autoProvider,
  };
}
