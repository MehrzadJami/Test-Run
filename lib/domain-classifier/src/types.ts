/**
 * Domain classifier types for M19 — Domain Templates and Model Type Classifier.
 *
 * All types are plain data structures with no external dependencies so they
 * can be imported in both the Node.js API server and the React/Vite frontend.
 */

// ── Model type enum ──────────────────────────────────────────────────────────

export type ModelType =
  | "chemostat"
  | "batch_reactor"
  | "fed_batch"
  | "cstr"
  | "gas_liquid_transfer"
  | "microalgae_pbr"
  | "generic_ode";

export const MODEL_TYPES: ModelType[] = [
  "chemostat",
  "batch_reactor",
  "fed_batch",
  "cstr",
  "gas_liquid_transfer",
  "microalgae_pbr",
  "generic_ode",
];

export const MODEL_TYPE_DISPLAY_NAMES: Record<ModelType, string> = {
  chemostat: "Chemostat / CSTBR",
  batch_reactor: "Batch Reactor",
  fed_batch: "Fed-Batch Reactor",
  cstr: "CSTR (Chemical)",
  gas_liquid_transfer: "Gas-Liquid / O₂ Transfer",
  microalgae_pbr: "Microalgae / PBR",
  generic_ode: "Generic ODE Model",
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
  /** Winning model type. "generic_ode" is used as the safe default. */
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
