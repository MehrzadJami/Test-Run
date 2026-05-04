/**
 * Domain classifier types for M19 — Domain Templates and Model Type Classifier.
 *
 * All types are plain data structures with no external dependencies so they
 * can be imported in both the Node.js API server and the React/Vite frontend.
 */

// ── Model type enum ──────────────────────────────────────────────────────────

export type ModelType =
  | "monod_chemostat"
  | "fed_batch"
  | "batch_culture"
  | "cstr"
  | "pfr"
  | "enzyme_kinetics"
  | "gas_liquid"
  | "microalgae_photobioreactor"
  | "oxygen_balanced_mixotrophy"
  | "unknown";

export const MODEL_TYPES = [
  "monod_chemostat",
  "fed_batch",
  "batch_culture",
  "cstr",
  "pfr",
  "enzyme_kinetics",
  "gas_liquid",
  "microalgae_photobioreactor",
  "oxygen_balanced_mixotrophy",
  "unknown",
] as const satisfies readonly ModelType[];

export type LegacyModelType =
  | "chemostat"
  | "batch_reactor"
  | "gas_liquid_transfer"
  | "microalgae_pbr"
  | "generic_ode";

export const LEGACY_MODEL_TYPE_MAP: Record<LegacyModelType, ModelType> = {
  chemostat: "monod_chemostat",
  batch_reactor: "batch_culture",
  gas_liquid_transfer: "gas_liquid",
  microalgae_pbr: "microalgae_photobioreactor",
  generic_ode: "unknown",
};

export function normalizeModelType(value: unknown): ModelType {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, "_");

  if ((MODEL_TYPES as readonly string[]).includes(normalized)) {
    return normalized as ModelType;
  }
  if (normalized in LEGACY_MODEL_TYPE_MAP) {
    return LEGACY_MODEL_TYPE_MAP[normalized as LegacyModelType];
  }
  return "unknown";
}

export const MODEL_TYPE_DISPLAY_NAMES: Record<ModelType, string> = {
  monod_chemostat: "Monod Chemostat",
  fed_batch: "Fed-Batch Reactor",
  batch_culture: "Batch Culture",
  cstr: "CSTR",
  pfr: "PFR",
  enzyme_kinetics: "Enzyme Kinetics",
  gas_liquid: "Gas-Liquid",
  microalgae_photobioreactor: "Microalgae Photobioreactor",
  oxygen_balanced_mixotrophy: "Oxygen-Balanced Mixotrophy",
  unknown: "Unknown Model Type",
};

// ── Classifier I/O ───────────────────────────────────────────────────────────

/**
 * Input to the classifier. All fields are optional; use whatever is available.
 * More fields → higher quality classification.
 */
export interface ClassificationInput {
  /** Raw source text (full paper, abstract, etc.). May be long. */
  sourceText?: string;
  /** Extracted model card title from the AI. */
  title?: string;
  /** Extracted system type / domain string from the AI. */
  domain?: string;
  /** Human-readable names of extracted state variables. */
  variableNames?: string[];
  /** Symbols of extracted state variables (e.g. ["X", "S", "D"]). */
  variableSymbols?: string[];
  /** Human-readable names of extracted parameters. */
  parameterNames?: string[];
  /** Symbols of extracted parameters. */
  parameterSymbols?: string[];
}

export interface ClassificationResult {
  /** Winning canonical model type. "unknown" is the safe default. */
  modelType: ModelType;
  /**
   * Normalised confidence in [0, 1]. Computed as score / (score + 10).
   * 0 means no keyword evidence was found; 1 is asymptotically unreachable.
   */
  confidence: number;
  /** Exact keywords / phrases from the input that contributed to the score. */
  matchedKeywords: string[];
  /** Raw scores for each non-generic model type (only non-zero entries). */
  scores: Partial<Record<ModelType, number>>;
}

// ── Domain template types ────────────────────────────────────────────────────

export interface ExpectedItem {
  symbol: string;
  name: string;
  /** Canonical expected unit string. Display-only — not used for computation. */
  unit: string;
  required: boolean;
  description?: string;
  /** Alternative symbols that map to this item (e.g. ["μmax", "mu_max"]). */
  aliases?: string[];
}

export interface ChecklistItem {
  id: string;
  category: "variable" | "parameter" | "unit" | "equation" | "assumption";
  description: string;
  /** Symbol hint for matching against extracted items. */
  symbol?: string;
  /** Expected unit (display). */
  expectedUnit?: string;
  severity: "critical" | "warning" | "info";
}

export interface OdeHint {
  description: string;
  /** Example equation in plain-text or LaTeX. */
  example?: string;
}

export interface UnitRule {
  symbol: string;
  expectedUnit: string;
  /** Acceptable alternative unit strings (case-insensitive). */
  alternatives?: string[];
}

export interface DomainTemplate {
  modelType: ModelType;
  displayName: string;
  description: string;
  expectedVariables: ExpectedItem[];
  expectedParameters: ExpectedItem[];
  checklistItems: ChecklistItem[];
  odeHints: OdeHint[];
  unitRules: UnitRule[];
}
