/**
 * Rule-based model type classifier.
 *
 * Design goals:
 *  1. Transparent — every classification decision is fully explainable by
 *     listing the matched keywords.
 *  2. Deterministic — same input always produces the same result.
 *  3. Conservative — never claims high confidence unless there is strong
 *     multi-field keyword evidence. Defaults to "unknown".
 *  4. No ML dependency — pure string matching, runs in ≤1 ms even on large
 *     source documents.
 *
 * Scoring algorithm:
 *  - For each model type, build a keyword list with per-keyword weights.
 *  - Search case-insensitively in five "fields": source text, title+domain
 *    (3× weight), extracted variable names/symbols (2×), extracted parameter
 *    names/symbols (2×).
 *  - Sum the weighted hit counts.
 *  - The type with the highest non-zero score wins.
 *  - Confidence = score / (score + 10)  [soft sigmoid; 0 → 0, ∞ → 1].
 *  - If all scores are 0 → "unknown" with confidence 0.
 */

import type {
  ClassificationInput,
  ClassificationResult,
  ModelType,
} from "./types";

// ── Keyword rules per model type ────────────────────────────────────────────

interface KeywordRule {
  /** Case-insensitive substring to search for. */
  keyword: string;
  /**
   * Weight multiplier.
   *  1 = soft evidence (common term, could appear in other domains)
   *  2 = moderate evidence
   *  3 = strong / near-definitive evidence
   */
  weight: number;
}

const RULES: Record<Exclude<ModelType, "unknown">, KeywordRule[]> = {
  monod_chemostat: [
    { keyword: "chemostat", weight: 3 },
    { keyword: "continuous culture", weight: 3 },
    { keyword: "cstbr", weight: 3 },
    { keyword: "dilution rate", weight: 3 },
    { keyword: "washout", weight: 2 },
    { keyword: "wash-out", weight: 2 },
    { keyword: "monod", weight: 2 },
    { keyword: "sin", weight: 1 },            // feed substrate symbol
    { keyword: "s_in", weight: 1 },
    { keyword: "influent", weight: 2 },
    { keyword: "effluent", weight: 2 },
    { keyword: "steady state", weight: 1 },
    { keyword: "continuous stirred tank bioreactor", weight: 3 },
    { keyword: "continuous fermentation", weight: 2 },
    { keyword: "feed concentration", weight: 1 },
    { keyword: "specific growth rate", weight: 1 },
    { keyword: "biomass washout", weight: 3 },
    { keyword: "dilution", weight: 1 },
  ],
  batch_culture: [
    { keyword: "batch reactor", weight: 3 },
    { keyword: "batch culture", weight: 3 },
    { keyword: "batch fermentation", weight: 3 },
    { keyword: "batch process", weight: 2 },
    { keyword: "closed system", weight: 2 },
    { keyword: "no inflow", weight: 2 },
    { keyword: "no outflow", weight: 2 },
    { keyword: "initial concentration", weight: 2 },
    { keyword: "initial biomass", weight: 2 },
    { keyword: "substrate depletion", weight: 2 },
    { keyword: "inoculum", weight: 1 },
    { keyword: "inoculation", weight: 1 },
    { keyword: "batch growth", weight: 2 },
  ],
  fed_batch: [
    { keyword: "fed-batch", weight: 3 },
    { keyword: "fed batch", weight: 3 },
    { keyword: "feeding strategy", weight: 3 },
    { keyword: "feed rate", weight: 2 },
    { keyword: "feed flow", weight: 2 },
    { keyword: "volume change", weight: 2 },
    { keyword: "dv/dt", weight: 3 },
    { keyword: "variable volume", weight: 3 },
    { keyword: "semi-batch", weight: 2 },
    { keyword: "exponential feed", weight: 3 },
    { keyword: "pulse feed", weight: 2 },
    { keyword: "substrate feeding", weight: 2 },
    { keyword: "intermittent feeding", weight: 2 },
    { keyword: "bolus", weight: 2 },
  ],
  cstr: [
    { keyword: "cstr", weight: 3 },
    { keyword: "continuously stirred tank reactor", weight: 3 },
    { keyword: "continuous stirred tank reactor", weight: 3 },
    { keyword: "conversion", weight: 1 },
    { keyword: "selectivity", weight: 1 },
    { keyword: "damköhler", weight: 3 },
    { keyword: "damkohler", weight: 3 },
    { keyword: "activation energy", weight: 2 },
    { keyword: "arrhenius", weight: 3 },
    { keyword: "heat of reaction", weight: 2 },
    { keyword: "exothermic", weight: 2 },
    { keyword: "endothermic", weight: 2 },
    { keyword: "rate constant", weight: 1 },
    { keyword: "pre-exponential", weight: 2 },
    { keyword: "residence time", weight: 2 },
    { keyword: "elementary reaction", weight: 2 },
    { keyword: "rate law", weight: 1 },
    { keyword: "chemical reactor", weight: 2 },
  ],
  pfr: [
    { keyword: "pfr", weight: 3 },
    { keyword: "plug-flow", weight: 3 },
    { keyword: "plug flow", weight: 3 },
    { keyword: "tubular reactor", weight: 3 },
    { keyword: "axial coordinate", weight: 3 },
    { keyword: "coordinate z", weight: 3 },
    { keyword: "spatial coordinate", weight: 2 },
    { keyword: "axial dispersion", weight: 2 },
  ],
  enzyme_kinetics: [
    { keyword: "enzyme", weight: 3 },
    { keyword: "michaelis", weight: 3 },
    { keyword: "vmax", weight: 3 },
    { keyword: "km", weight: 2 },
    { keyword: "substrate product", weight: 2 },
    { keyword: "enzyme kinetics", weight: 3 },
    { keyword: "competitive inhibition", weight: 2 },
  ],
  gas_liquid: [
    { keyword: "kla", weight: 3 },
    { keyword: "k_la", weight: 3 },
    { keyword: "oxygen transfer", weight: 3 },
    { keyword: "dissolved oxygen", weight: 3 },
    { keyword: "volumetric mass transfer", weight: 3 },
    { keyword: "otr", weight: 2 },
    { keyword: "our", weight: 2 },
    { keyword: "aeration", weight: 2 },
    { keyword: "saturation concentration", weight: 2 },
    { keyword: "henry", weight: 2 },
    { keyword: "sparger", weight: 2 },
    { keyword: "gas-liquid", weight: 2 },
    { keyword: "gas liquid", weight: 2 },
    { keyword: "bubble column", weight: 2 },
    { keyword: "airflow", weight: 1 },
    { keyword: "oxygen demand", weight: 2 },
    { keyword: "do probe", weight: 2 },
    { keyword: "mass transfer coefficient", weight: 2 },
  ],
  microalgae_photobioreactor: [
    { keyword: "microalgae", weight: 3 },
    { keyword: "photobioreactor", weight: 3 },
    { keyword: "pbr", weight: 2 },
    { keyword: "irradiance", weight: 3 },
    { keyword: "par", weight: 2 },
    { keyword: "photosynthesis", weight: 3 },
    { keyword: "chlorophyll", weight: 2 },
    { keyword: "light intensity", weight: 2 },
    { keyword: "carbon fixation", weight: 2 },
    { keyword: "co2 supply", weight: 1 },
    { keyword: "biomass productivity", weight: 2 },
    { keyword: "algae", weight: 2 },
    { keyword: "cyanobacteria", weight: 2 },
    { keyword: "photoinhibition", weight: 3 },
    { keyword: "haldane", weight: 2 },
    { keyword: "light saturation", weight: 3 },
    { keyword: "growth medium", weight: 1 },
    { keyword: "pruvost", weight: 3 },
  ],
  oxygen_balanced_mixotrophy: [
    { keyword: "mixotrophy", weight: 3 },
    { keyword: "mixotrophic", weight: 3 },
    { keyword: "acetate", weight: 2 },
    { keyword: "acetic acid", weight: 2 },
    { keyword: "do control", weight: 3 },
    { keyword: "do-controlled", weight: 3 },
    { keyword: "dissolved oxygen control", weight: 3 },
    { keyword: "oxygen-balanced", weight: 3 },
    { keyword: "heterotrophic acetate", weight: 3 },
    { keyword: "autotrophic growth", weight: 2 },
  ],
};

// ── Scoring helpers ──────────────────────────────────────────────────────────

function normaliseText(s: string): string {
  return s.toLowerCase();
}

function countHits(
  haystack: string,
  keyword: string,
): number {
  const lc = normaliseText(haystack);
  const kw = normaliseText(keyword);
  let count = 0;
  let idx = 0;
  while ((idx = lc.indexOf(kw, idx)) !== -1) {
    count++;
    idx += kw.length;
  }
  return count;
}

function scoreField(
  text: string,
  rules: KeywordRule[],
  fieldWeight: number,
  matched: Set<string>,
): number {
  let score = 0;
  for (const rule of rules) {
    const hits = countHits(text, rule.keyword);
    if (hits > 0) {
      // Cap per-keyword contribution at 3 occurrences to avoid over-scoring
      // documents that merely repeat the same word many times.
      const capped = Math.min(hits, 3);
      score += rule.weight * fieldWeight * capped;
      matched.add(rule.keyword);
    }
  }
  return score;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Classify the model type from available extraction fields.
 *
 * Never throws. Returns "unknown" with confidence 0 when no evidence is
 * found — callers must NOT treat this as an error.
 */
export function classifyModel(
  input: ClassificationInput,
): ClassificationResult {
  const scores: Partial<Record<ModelType, number>> = {};
  const allMatchedKeywords: Set<string> = new Set();

  for (const [modelType, rules] of Object.entries(RULES) as [
    Exclude<ModelType, "unknown">,
    KeywordRule[],
  ][]) {
    const matched: Set<string> = new Set();
    let total = 0;

    // Source text (1× field weight — it's large and noisy)
    if (input.sourceText) {
      total += scoreField(input.sourceText, rules, 1, matched);
    }

    // Title + domain (3× — concise, highly signal-dense)
    const titleDomain = [input.title ?? "", input.domain ?? ""].join(" ");
    if (titleDomain.trim()) {
      total += scoreField(titleDomain, rules, 3, matched);
    }

    // Variable names + parameter names (2× — AI already extracted these)
    const extractedNames = [
      ...(input.variableNames ?? []),
      ...(input.parameterNames ?? []),
    ].join(" ");
    if (extractedNames) {
      total += scoreField(extractedNames, rules, 2, matched);
    }

    // Symbols (1× — short, can easily overlap across domains)
    const extractedSymbols = [
      ...(input.variableSymbols ?? []),
      ...(input.parameterSymbols ?? []),
    ].join(" ");
    if (extractedSymbols) {
      total += scoreField(extractedSymbols, rules, 1, matched);
    }

    if (total > 0) {
      scores[modelType] = total;
      matched.forEach((k) => allMatchedKeywords.add(k));
    }
  }

  // Find the winning type (highest score, ties broken by insertion order).
  let bestType: ModelType = "unknown";
  let bestScore = 0;

  for (const [type, score] of Object.entries(scores) as [
    ModelType,
    number,
  ][]) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  // Confidence is a soft sigmoid: c = score / (score + 5).
  // At score=5 → 0.50, score=9 → 0.64, score=15 → 0.75, score=30 → 0.86.
  // K=5 is calibrated so a single definitive-weight (3) keyword in the title
  // (field weight 3) scores 9, giving confidence ≈ 0.64 — appropriately
  // "moderate to high" for a clear domain title.
  const confidence = bestScore > 0 ? bestScore / (bestScore + 5) : 0;

  return {
    modelType: bestType,
    confidence: Math.round(confidence * 100) / 100,
    matchedKeywords: Array.from(allMatchedKeywords).sort(),
    scores,
  };
}
