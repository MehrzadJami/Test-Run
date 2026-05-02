/** Compact representation of what we expect from a good extraction for a given fixture. */
export interface ExpectedExtraction {
  /** Display name for this fixture */
  fixture_name: string;
  /** State variable symbols that should be extracted (lowercase for matching) */
  expected_variable_symbols: string[];
  /** Expected units for each variable symbol (keyed by lowercase symbol) */
  expected_variable_units: Record<string, string>;
  /** Parameter symbols that should be extracted (lowercase for matching) */
  expected_parameter_symbols: string[];
  /** Expected units for each parameter symbol (keyed by lowercase symbol) */
  expected_parameter_units: Record<string, string>;
  /** Each entry is a set of symbols that should appear together in one extracted equation */
  expected_equation_symbol_sets: string[][];
}

/** A single row in the benchmark result table */
export interface BenchmarkResult {
  fixture: string;
  provider: string;
  schemaValid: boolean;
  /** Jaccard similarity of extracted vs expected variable symbols */
  variableScore: number;
  /** Jaccard similarity of extracted vs expected parameter symbols */
  parameterScore: number;
  /** Recall: fraction of expected equation symbol-sets covered by extracted equations */
  equationScore: number;
  /** Fraction of expected symbols whose extracted unit matches */
  unitScore: number;
  /** 1 if model card lists missing information, 0.5 if only assumptions, 0 otherwise */
  missingInfoScore: number;
  /** Weighted aggregate score */
  overallScore: number;
  /** Short human-readable explanation of any failures */
  notes: string[];
}

/** Full JSON report written to benchmark/reports/ */
export interface BenchmarkReport {
  runAt: string;
  provider: string;
  baseUrl: string;
  results: BenchmarkResult[];
  summary: {
    meanVariableScore: number;
    meanParameterScore: number;
    meanEquationScore: number;
    meanUnitScore: number;
    meanMissingInfoScore: number;
    meanOverallScore: number;
    schemaPassRate: number;
  };
}

/** Raw model card response from GET /api/projects/:id/model-card */
export interface ApiModelCard {
  extraction: {
    id: number;
    modelCardTitle: string;
    modelCardShortSummary: string;
    modelCardMissingInformation: string[] | null;
    rawExtractionJson: Record<string, unknown> | null;
    [key: string]: unknown;
  };
  variables: Array<{ symbol: string; unit: string; name: string }>;
  parameters: Array<{ symbol: string; unit: string; value: string; name: string }>;
  equations: Array<{
    label: string;
    equationLatex: string;
    equationPlaintext: string;
    variablesInvolved: string | string[];
  }>;
  assumptions: Array<{ assumption: string }>;
}
