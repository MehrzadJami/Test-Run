export type ConflictType =
  | "parameter_value"
  | "parameter_unit"
  | "variable_definition"
  | "equation"
  | "missing_across_sources";

export type ConflictSeverity = "low" | "medium" | "high";

export interface ConflictItem {
  type: ConflictType;
  symbol_or_label: string;
  severity: ConflictSeverity;
  sources: string[];
  details: string;
  recommendation: string;
}

export interface AggregatedModelCard {
  variables: Array<{ symbol: string; units: string[]; meanings: string[]; sources: string[] }>;
  parameters: Array<{ symbol: string; values: string[]; units: string[]; sources: string[] }>;
  equations: Array<{ key: string; equations: string[]; labels: string[]; sources: string[] }>;
  assumptions: string[];
  limitations: string[];
}

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function sourceName(extraction: any): string {
  if (extraction.modelCardTitle) return String(extraction.modelCardTitle);
  const id = extraction.id ?? extraction.extractionId;
  return id != null ? `Extraction ${id}` : "Unknown extraction";
}

export function buildAggregatedModelCard(extractions: any[]): AggregatedModelCard {
  const varMap = new Map<string, { symbol: string; units: Set<string>; meanings: Set<string>; sources: Set<string> }>();
  const paramMap = new Map<string, { symbol: string; values: Set<string>; units: Set<string>; sources: Set<string> }>();
  const eqMap = new Map<string, { key: string; equations: Set<string>; labels: Set<string>; sources: Set<string> }>();
  const assumptions = new Set<string>();
  const limitations = new Set<string>();

  for (const ex of extractions) {
    const src = sourceName(ex);
    const raw = (ex.rawExtractionJson ?? {}) as any;

    for (const v of raw.state_variables ?? []) {
      const key = norm(v.symbol);
      if (!key) continue;
      const row = varMap.get(key) ?? { symbol: String(v.symbol), units: new Set(), meanings: new Set(), sources: new Set() };
      if (v.unit) row.units.add(String(v.unit));
      if (v.meaning) row.meanings.add(String(v.meaning));
      row.sources.add(src);
      varMap.set(key, row);
    }

    for (const p of raw.parameters ?? []) {
      const key = norm(p.symbol);
      if (!key) continue;
      const row = paramMap.get(key) ?? { symbol: String(p.symbol), values: new Set(), units: new Set(), sources: new Set() };
      if (p.value != null && String(p.value).trim() !== "") row.values.add(String(p.value));
      if (p.unit) row.units.add(String(p.unit));
      row.sources.add(src);
      paramMap.set(key, row);
    }

    for (const eq of raw.equations ?? []) {
      const key = norm(eq.label) || norm(eq.equation_plaintext) || norm(eq.equation_latex);
      if (!key) continue;
      const row = eqMap.get(key) ?? { key: String(eq.label ?? key), equations: new Set(), labels: new Set(), sources: new Set() };
      if (eq.equation_plaintext) row.equations.add(String(eq.equation_plaintext));
      else if (eq.equation_latex) row.equations.add(String(eq.equation_latex));
      if (eq.label) row.labels.add(String(eq.label));
      row.sources.add(src);
      eqMap.set(key, row);
    }

    for (const a of raw.assumptions ?? []) if (a.assumption) assumptions.add(String(a.assumption));
    for (const l of raw.limitations ?? []) if (l.limitation) limitations.add(String(l.limitation));
  }

  // Sort all output arrays for deterministic ordering regardless of input call order.
  return {
    variables: Array.from(varMap.values()).sort((a, b) => a.symbol.localeCompare(b.symbol)).map((r) => ({ symbol: r.symbol, units: Array.from(r.units).sort(), meanings: Array.from(r.meanings).sort(), sources: Array.from(r.sources).sort() })),
    parameters: Array.from(paramMap.values()).sort((a, b) => a.symbol.localeCompare(b.symbol)).map((r) => ({ symbol: r.symbol, values: Array.from(r.values).sort(), units: Array.from(r.units).sort(), sources: Array.from(r.sources).sort() })),
    equations: Array.from(eqMap.values()).sort((a, b) => a.key.localeCompare(b.key)).map((r) => ({ key: r.key, equations: Array.from(r.equations).sort(), labels: Array.from(r.labels).sort(), sources: Array.from(r.sources).sort() })),
    assumptions: Array.from(assumptions).sort(),
    limitations: Array.from(limitations).sort(),
  };
}

export function detectConflicts(extractions: any[]): ConflictItem[] {
  const agg = buildAggregatedModelCard(extractions);
  const conflicts: ConflictItem[] = [];

  for (const p of agg.parameters) {
    if (p.values.length > 1) {
      conflicts.push({ type: "parameter_value", symbol_or_label: p.symbol, severity: "high", sources: p.sources, details: `Conflicting values: ${p.values.join(", ")}`, recommendation: "Review source equations/tables and choose a canonical value with citation." });
    }
    if (p.units.length > 1) {
      conflicts.push({ type: "parameter_unit", symbol_or_label: p.symbol, severity: "high", sources: p.sources, details: `Conflicting units: ${p.units.join(", ")}`, recommendation: "Normalize units and convert values to a project standard." });
    }
  }

  for (const v of agg.variables) {
    if (v.units.length > 1 || v.meanings.length > 1) {
      conflicts.push({ type: "variable_definition", symbol_or_label: v.symbol, severity: "medium", sources: v.sources, details: `Units: ${v.units.join(", ")} | Meanings: ${v.meanings.join(" | ")}`, recommendation: "Confirm symbol definitions per source and rename ambiguous symbols if needed." });
    }
  }

  for (const eq of agg.equations) {
    if (eq.equations.length > 1) {
      conflicts.push({ type: "equation", symbol_or_label: eq.key, severity: "medium", sources: eq.sources, details: `Different equation forms detected (${eq.equations.length}).`, recommendation: "Pick one equation form or keep variants with explicit assumptions." });
    }
  }

  const sourceNames = extractions.map(sourceName);
  const perSourceParams = new Map<string, Set<string>>();
  for (const ex of extractions) {
    const set = new Set<string>();
    for (const p of ex.rawExtractionJson?.parameters ?? []) set.add(norm(p.symbol));
    perSourceParams.set(sourceName(ex), set);
  }
  for (const p of agg.parameters) {
    const key = norm(p.symbol);
    const missing = sourceNames.filter((s) => !perSourceParams.get(s)?.has(key));
    if (missing.length > 0 && missing.length < sourceNames.length) {
      conflicts.push({ type: "missing_across_sources", symbol_or_label: p.symbol, severity: "low", sources: missing, details: `Missing in sources: ${missing.join(", ")}`, recommendation: "Check whether parameter is intentionally omitted or reported under an alias." });
    }
  }

  return conflicts;
}
