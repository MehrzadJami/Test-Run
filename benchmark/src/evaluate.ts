import type { BenchmarkResult, ExpectedExtraction, ApiModelCard } from "./types.js";

// Score weights — must sum to 1.0
const WEIGHTS = {
  variable: 0.25,
  parameter: 0.25,
  equation: 0.25,
  unit: 0.15,
  missingInfo: 0.10,
};

/** Normalise a symbol for comparison: lowercase, trim, collapse whitespace. */
function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, "");
}

/**
 * Jaccard similarity between two symbol sets after normalisation.
 * Returns 1.0 when both sets are empty (vacuously true).
 */
function jaccard(extracted: string[], expected: string[]): number {
  if (expected.length === 0) return 1.0;
  const extSet = new Set(extracted.map(norm));
  const expSet = new Set(expected.map(norm));
  let intersect = 0;
  for (const s of expSet) if (extSet.has(s)) intersect++;
  const union = new Set([...extSet, ...expSet]).size;
  return union === 0 ? 1.0 : intersect / union;
}

/**
 * For each expected equation symbol-set, check whether at least one extracted
 * equation covers a majority (>= threshold) of those symbols.
 * Returns recall: fraction of expected equation sets that are "covered".
 */
function equationRecall(
  extractedEquations: ApiModelCard["equations"],
  expectedSets: string[][],
  threshold = 0.5,
): number {
  if (expectedSets.length === 0) return 1.0;
  let covered = 0;
  for (const expSymbols of expectedSets) {
    const expNorm = expSymbols.map(norm);
    const matched = extractedEquations.some((eq) => {
      const involved = parseVariablesInvolved(eq.variablesInvolved);
      const involvedNorm = new Set(involved.map(norm));
      // Also include symbols mentioned in the plaintext equation label
      const textSyms = tokeniseEquationText(
        eq.equationPlaintext + " " + eq.label,
      );
      for (const ts of textSyms) involvedNorm.add(norm(ts));
      const hits = expNorm.filter((s) => involvedNorm.has(s)).length;
      return hits / expNorm.length >= threshold;
    });
    if (matched) covered++;
  }
  return covered / expectedSets.length;
}

/**
 * Unit match score: for each expected symbol, check whether the extracted
 * version has a "close enough" unit. Matching is case-insensitive and
 * ignores common formatting differences (spaces, dots, superscript notation).
 */
function unitScore(
  extracted: Array<{ symbol: string; unit: string }>,
  expectedUnits: Record<string, string>,
): number {
  const entries = Object.entries(expectedUnits);
  if (entries.length === 0) return 1.0;
  const extMap = new Map<string, string>();
  for (const item of extracted) extMap.set(norm(item.symbol), norm(item.unit));
  let matches = 0;
  for (const [sym, expectedUnit] of entries) {
    const extUnit = extMap.get(norm(sym));
    if (extUnit !== undefined && unitsMatch(extUnit, norm(expectedUnit)))
      matches++;
  }
  return matches / entries.length;
}

/** Lenient unit comparison: normalise separators and ignore case. */
function unitsMatch(a: string, b: string): boolean {
  const clean = (u: string) =>
    u
      .replace(/[·•\s]+/g, "")
      .replace(/\^?(-?\d+)/g, "$1")
      .replace(/[⁻¹]/g, "-1")
      .replace(/[²]/g, "2")
      .replace(/[³]/g, "3")
      .toLowerCase();
  if (clean(a) === clean(b)) return true;
  // Alias pairs
  const aliases: [string, string][] = [
    ["g/l", "g·l-1"],
    ["1/h", "h-1"],
    ["l/h", "l·h-1"],
    ["mol/l", "mol·l-1"],
    ["µmol/m2/s", "µmol·m-2·s-1"],
    ["umol/m2/s", "µmol·m-2·s-1"],
  ];
  const ca = clean(a);
  const cb = clean(b);
  return aliases.some(
    ([x, y]) =>
      (ca.includes(x) && cb.includes(y)) ||
      (ca.includes(y) && cb.includes(x)),
  );
}

/** Missing-information quality: does the model communicate its limits? */
function missingInfoScore(card: ApiModelCard): number {
  const missing = card.extraction.modelCardMissingInformation;
  if (Array.isArray(missing) && missing.length > 0) return 1.0;
  // Fallback: check raw extraction JSON
  const raw = card.extraction.rawExtractionJson as Record<string, unknown> | null;
  if (raw) {
    const lims = raw["limitations"];
    if (Array.isArray(lims) && lims.length > 0) return 1.0;
    const asmp = raw["assumptions"];
    if (Array.isArray(asmp) && asmp.length > 0) return 0.5;
  }
  if (card.assumptions.length > 0) return 0.5;
  return 0.0;
}

/** Parse variablesInvolved regardless of whether the API returned a JSON string or array. */
export function parseVariablesInvolved(val: string | string[]): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        // fall through to comma split
      }
    }
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Extract alpha-numeric tokens from equation text (for equation coverage matching). */
function tokeniseEquationText(text: string): string[] {
  return (text.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? []).filter(
    (t) => t.length >= 1,
  );
}

/** Main evaluation entry point. */
export function evaluate(
  fixture: string,
  provider: string,
  card: ApiModelCard | null,
  expected: ExpectedExtraction,
): BenchmarkResult {
  const notes: string[] = [];

  if (!card) {
    notes.push("Extraction failed or returned no model card");
    return {
      fixture,
      provider,
      schemaValid: false,
      variableScore: 0,
      parameterScore: 0,
      equationScore: 0,
      unitScore: 0,
      missingInfoScore: 0,
      overallScore: 0,
      notes,
    };
  }

  // Schema validity: must have at least some variables, parameters, equations
  const schemaValid =
    card.variables.length > 0 ||
    card.parameters.length > 0 ||
    card.equations.length > 0;
  if (!schemaValid) notes.push("No variables, parameters, or equations extracted");

  const varScore = jaccard(
    card.variables.map((v) => v.symbol),
    expected.expected_variable_symbols,
  );
  if (varScore < 0.5)
    notes.push(
      `Low variable match (${(varScore * 100).toFixed(0)}%): extracted [${card.variables.map((v) => v.symbol).join(", ")}]`,
    );

  const paramScore = jaccard(
    card.parameters.map((p) => p.symbol),
    expected.expected_parameter_symbols,
  );
  if (paramScore < 0.5)
    notes.push(
      `Low parameter match (${(paramScore * 100).toFixed(0)}%): extracted [${card.parameters.map((p) => p.symbol).join(", ")}]`,
    );

  const eqScore = equationRecall(
    card.equations,
    expected.expected_equation_symbol_sets,
  );
  if (eqScore < 0.5)
    notes.push(`Low equation coverage (${(eqScore * 100).toFixed(0)}%)`);

  const allExtracted = [
    ...card.variables.map((v) => ({ symbol: v.symbol, unit: v.unit })),
    ...card.parameters.map((p) => ({ symbol: p.symbol, unit: p.unit })),
  ];
  const allExpectedUnits = {
    ...expected.expected_variable_units,
    ...expected.expected_parameter_units,
  };
  const unitSc = unitScore(allExtracted, allExpectedUnits);
  if (unitSc < 0.5)
    notes.push(`Low unit match (${(unitSc * 100).toFixed(0)}%)`);

  const missSc = missingInfoScore(card);
  if (missSc === 0)
    notes.push("Model card missing_information and assumptions are both empty");

  const overall =
    WEIGHTS.variable * varScore +
    WEIGHTS.parameter * paramScore +
    WEIGHTS.equation * eqScore +
    WEIGHTS.unit * unitSc +
    WEIGHTS.missingInfo * missSc;

  return {
    fixture,
    provider,
    schemaValid,
    variableScore: round2(varScore),
    parameterScore: round2(paramScore),
    equationScore: round2(eqScore),
    unitScore: round2(unitSc),
    missingInfoScore: round2(missSc),
    overallScore: round2(overall),
    notes,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
