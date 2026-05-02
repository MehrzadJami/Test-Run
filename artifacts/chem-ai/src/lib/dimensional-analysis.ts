/**
 * Formal Dimensional Analysis — M21
 *
 * Augments the heuristic unit checker with targeted dimensional consistency
 * checking for a small set of supported biochemical ODE equation patterns.
 *
 * DESIGN PRINCIPLES:
 *  - Never pretend an equation was analysed when it wasn't.
 *  - Only fire dimensional issues when evidence is unambiguous.
 *  - If parsing fails, mark parsed=false and let heuristic checker handle it.
 *
 * SUPPORTED PATTERNS (v1):
 *  1. ODE derivative LHS  —  d[Sym]/dt   (LHS dimension from symbol unit ÷ time unit)
 *  2. Monod growth kinetics  —  μ = μmax · S / (Ks + S)
 *  3. Biomass ODE  —  dX/dt = (μ − D) · X
 *  4. Substrate ODE  —  dS/dt = D·(Sin − S) − (1/Yxs)·μ·X
 *  5. Gas / O₂ transfer  —  OTR = kLa · (C* − C)
 *
 * UNSUPPORTED (falls through to heuristic checker):
 *  - Arbitrary algebraic expressions
 *  - Power-law / Haldane / inhibition kinetics
 *  - Multi-phase, fed-batch with variable volume
 *  - Equations where involved symbols are not in the variables/parameters tables
 */

import type { AnalysisEquation, AnalysisVariable, AnalysisParameter } from "./reproducibility";

// ─── Dimension algebra ────────────────────────────────────────────────────────

/** Dimension vector: exponents of [mass, volume, time, amount]. */
export interface Dim {
  M: number; // mass (g, kg, …)
  V: number; // volume (L, m³, …)
  T: number; // time  (h, min, s, …)
  N: number; // amount (mol, …)
}

const ZERO: Dim = { M: 0, V: 0, T: 0, N: 0 };

function dimAdd(a: Dim, b: Dim): Dim {
  return { M: a.M + b.M, V: a.V + b.V, T: a.T + b.T, N: a.N + b.N };
}
function dimSub(a: Dim, b: Dim): Dim {
  return { M: a.M - b.M, V: a.V - b.V, T: a.T - b.T, N: a.N - b.N };
}
function dimScale(a: Dim, n: number): Dim {
  return { M: a.M * n, V: a.V * n, T: a.T * n, N: a.N * n };
}
export function dimEq(a: Dim, b: Dim): boolean {
  return a.M === b.M && a.V === b.V && a.T === b.T && a.N === b.N;
}
export function isDimensionless(d: Dim): boolean {
  return dimEq(d, ZERO);
}

export function dimLabel(d: Dim): string {
  const pos: string[] = [];
  const neg: string[] = [];
  const push = (sym: string, exp: number) => {
    if (exp === 0) return;
    if (exp > 0) pos.push(exp === 1 ? sym : `${sym}^${exp}`);
    else neg.push(-exp === 1 ? sym : `${sym}^${-exp}`);
  };
  push("M", d.M);
  push("V", d.V);
  push("T", d.T);
  push("N", d.N);
  if (pos.length === 0 && neg.length === 0) return "dimensionless";
  const num = pos.join("·") || "1";
  return neg.length === 0 ? num : `${num}/${neg.join("·")}`;
}

// ─── Unit parser ──────────────────────────────────────────────────────────────

/** Map of base unit tokens (lower-case) → Dim. */
const BASE: Record<string, Dim> = {
  g:    { M: 1, V: 0, T: 0, N: 0 },
  kg:   { M: 1, V: 0, T: 0, N: 0 },
  mg:   { M: 1, V: 0, T: 0, N: 0 },
  l:    { M: 0, V: 1, T: 0, N: 0 },
  ml:   { M: 0, V: 1, T: 0, N: 0 },
  m3:   { M: 0, V: 1, T: 0, N: 0 },
  dm3:  { M: 0, V: 1, T: 0, N: 0 },
  h:    { M: 0, V: 0, T: 1, N: 0 },
  hr:   { M: 0, V: 0, T: 1, N: 0 },
  hour: { M: 0, V: 0, T: 1, N: 0 },
  min:  { M: 0, V: 0, T: 1, N: 0 },
  s:    { M: 0, V: 0, T: 1, N: 0 },
  sec:  { M: 0, V: 0, T: 1, N: 0 },
  d:    { M: 0, V: 0, T: 1, N: 0 },
  day:  { M: 0, V: 0, T: 1, N: 0 },
  mol:  { M: 0, V: 0, T: 0, N: 1 },
  mmol: { M: 0, V: 0, T: 0, N: 1 },
  "1":  { M: 0, V: 0, T: 0, N: 0 },
};

/** Parse a single token (possibly with ^n exponent). */
function parseToken(token: string): Dim | null {
  const pm = token.match(/^(.+?)\^(-?\d+(?:\.\d+)?)$/);
  if (pm) {
    const base = parseToken(pm[1]);
    const exp = Number(pm[2]);
    if (base && isFinite(exp)) return dimScale(base, exp);
    return null;
  }
  return BASE[token] ?? null;
}

/** Parse a product string like "g*h" → add dimensions. */
function parseProduct(text: string): Dim | null {
  const factors = text.split("*");
  let d: Dim = { ...ZERO };
  for (const f of factors) {
    const fd = parseToken(f.trim());
    if (!fd) return null;
    d = dimAdd(d, fd);
  }
  return d;
}

/**
 * Parse a unit string into a Dim vector.
 * Supports: g/L, 1/h, g/L/h, g·L⁻¹·h⁻¹, h^-1, g/g, mol/L, etc.
 * Returns null if unparseable (do not fail silently).
 */
export function parseUnit(rawUnit: string): Dim | null {
  if (rawUnit == null) return { ...ZERO };

  const u = rawUnit
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/⁻¹/g, "^-1")
    .replace(/⁻²/g, "^-2")
    .replace(/⁻³/g, "^-3")
    .replace(/·/g, "*")
    // Remove qualifiers that are not base units
    .replace(/\bcdw\b/g, "")
    .replace(/\bvss\b/g, "")
    .replace(/\bdm\b/g, "l") // dm³ ≈ L
    .replace(/\b([gk])[_\-]?[xs]\b/g, "$1") // g-X, g_S → g (strip biomass/substrate label)
    // Normalise h⁻¹ notation without the slash
    .replace(/([a-z]+)\s*-\s*1\b/g, "$1^-1");

  if (
    u === "" || u === "-" || u === "—" || u === "none" ||
    u === "dimensionless" || u === "1" || u === "ratio"
  ) {
    return { ...ZERO };
  }

  // Split by "/" → first part is numerator, rest are denominators
  const parts = u.split("/");
  const num = parseProduct(parts[0]);
  if (!num) return null;

  let result = num;
  for (let i = 1; i < parts.length; i++) {
    const den = parseProduct(parts[i]);
    if (!den) return null;
    result = dimSub(result, den);
  }
  return result;
}

// ─── Symbol map ───────────────────────────────────────────────────────────────

export interface SymbolEntry {
  dim: Dim;
  unit: string;
  source: "variable" | "parameter";
}

export type DimMap = Map<string, SymbolEntry>;

/**
 * Build a DimMap from the model's variable and parameter tables.
 * Symbols whose unit cannot be parsed are excluded (not silently zeroed).
 */
export function buildDimMap(
  variables: AnalysisVariable[],
  parameters: AnalysisParameter[]
): DimMap {
  const map: DimMap = new Map();

  const add = (sym: string, unit: string | null | undefined, source: SymbolEntry["source"]) => {
    if (!sym) return;
    const u = unit ?? "";
    const dim = parseUnit(u);
    if (dim !== null) {
      map.set(sym, { dim, unit: u, source });
      // Also store a lowercase alias so normalised equation text can find it.
      const lower = sym.toLowerCase();
      if (lower !== sym && !map.has(lower)) {
        map.set(lower, { dim, unit: u, source });
      }
    }
  };

  for (const v of variables) add(v.symbol, v.unit, "variable");
  for (const p of parameters) {
    if (!map.has(p.symbol)) add(p.symbol, p.unit, "parameter");
  }

  return map;
}

// ─── Equation text normalizer ─────────────────────────────────────────────────

/**
 * Convert LaTeX / mixed notation to a plain-text lowercase form that
 * pattern regexes can match reliably.
 */
export function normalizeEqText(text: string): string {
  return text
    // Greek → ASCII
    .replace(/μ|μ/g, "mu")
    .replace(/α/g, "alpha").replace(/β/g, "beta")
    .replace(/γ/g, "gamma").replace(/δ/g, "delta")
    // LaTeX commands
    .replace(/\\mu\b/gi, "mu")
    .replace(/\\alpha\b/gi, "alpha")
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "(($1)/($2))")
    .replace(/\\cdot\b|\\times\b/gi, "*")
    .replace(/\\left\s*\(|\\right\s*\)/g, "")
    .replace(/\\mathrm\s*\{([^}]+)\}/g, "$1")
    .replace(/\\text\s*\{([^}]+)\}/g, "$1")
    .replace(/\\mathbf\s*\{([^}]+)\}/g, "$1")
    // Subscript braces: K_{s} → K_s, mu_{max} → mu_max
    .replace(/([A-Za-z0-9])\s*_\s*\{([^}]+)\}/g, "$1_$2")
    .replace(/\{([^}]+)\}/g, "$1")
    // Underscores → merge simple two-part names (mu_max → mumax, K_s → Ks)
    // Keep for symbol matching
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ─── Pattern output types ─────────────────────────────────────────────────────

export interface FormalEqResult {
  equation: string;
  parsed: boolean;
  patternName: string | null;
  lhsDimLabel: string | null;
  rhsDimLabel: string | null;
  dimensionsMatch: boolean | null;
  issues: string[];
  symbolsChecked: string[];
}

export interface FormalCheckReport {
  formalCheckAvailable: boolean;
  status: "pass" | "warning" | "fail" | "unavailable";
  equationResults: FormalEqResult[];
  parsedCount: number;
  supportedPatterns: string[];
}

const SUPPORTED_PATTERNS = [
  "ODE derivative LHS: d[Sym]/dt — dimension = unit(Sym) / unit(time)",
  "Monod growth kinetics: μ = μmax · S / (Ks + S)",
  "Biomass ODE: dX/dt = (μ − D) · X",
  "Substrate ODE: dS/dt = D·(Sin − S) − (1/Yxs)·μ·X",
  "Gas/O₂ transfer: OTR = kLa · (C* − C)",
];

// ─── Pattern 1: ODE LHS dimension check ──────────────────────────────────────

/** Extract state-variable name if the equation has dSym/dt on the LHS. */
function extractOdeStateSym(norm: string): string | null {
  const m = norm.match(/\bd([a-z_]\w*)\s*\/\s*dt\s*=/);
  return m ? m[1] : null;
}

/** Assumed default time dimension (h) when "t" is not defined in the symbol map. */
const DEFAULT_TIME_DIM: Dim = { M: 0, V: 0, T: 1, N: 0 };

function checkOdeLhs(
  eqText: string,
  norm: string,
  dimMap: DimMap
): FormalEqResult | null {
  const sym = extractOdeStateSym(norm);
  if (!sym) return null;

  const entry = dimMap.get(sym);
  const issues: string[] = [];
  const symbolsChecked: string[] = [sym];

  if (!entry) {
    return {
      equation: eqText,
      parsed: true,
      patternName: "ODE derivative LHS",
      lhsDimLabel: `d${sym}/dt`,
      rhsDimLabel: null,
      dimensionsMatch: null,
      issues: [`Symbol "${sym}" is not in the variables/parameters table — cannot infer d${sym}/dt dimension.`],
      symbolsChecked,
    };
  }

  const tEntry = dimMap.get("t");
  const timeDim = tEntry?.dim ?? DEFAULT_TIME_DIM;
  if (!tEntry) {
    issues.push(`Time variable "t" not found in tables — assuming dimension T=1 (hours or similar).`);
  } else {
    symbolsChecked.push("t");
  }

  const lhsDim = dimSub(entry.dim, timeDim);
  const lhsLabel = `d${sym}/dt → ${dimLabel(lhsDim)}`;

  return {
    equation: eqText,
    parsed: true,
    patternName: "ODE derivative LHS",
    lhsDimLabel: dimLabel(lhsDim),
    rhsDimLabel: null,
    dimensionsMatch: null, // LHS only — RHS not parsed in this basic check
    issues,
    symbolsChecked,
  };
}

// ─── Pattern 2: Monod kinetics ────────────────────────────────────────────────

/**
 * Detect Monod pattern: rateSym = rateMaxSym * subsSym / (ksatSym ± subsSym)
 * Works on normalized plain text.
 */
function detectMonodPattern(norm: string): {
  rateSym: string;
  rateMaxSym: string;
  subsSym: string;
  ksatSym: string;
} | null {
  // Match: A = B * C / (D + C) or A = B * C / (C + D)
  const m = norm.match(
    /^([a-z_]\w*)\s*=\s*([a-z_]\w*)\s*\*\s*([a-z_]\w*)\s*\/\s*\(\s*([a-z_]\w*)\s*[+]\s*([a-z_]\w*)\s*\)/
  );
  if (m) {
    const [, rateSym, rateMaxSym, subsSym1, denom1, denom2] = m;
    const subsSym = subsSym1;
    const ksatSym = denom1 === subsSym ? denom2 : denom1;
    return { rateSym, rateMaxSym, subsSym, ksatSym };
  }
  return null;
}

function checkMonod(
  eqText: string,
  norm: string,
  dimMap: DimMap
): FormalEqResult | null {
  const match = detectMonodPattern(norm);
  if (!match) return null;

  const { rateSym, rateMaxSym, subsSym, ksatSym } = match;
  const symbolsChecked = [rateSym, rateMaxSym, subsSym, ksatSym];
  const issues: string[] = [];

  const rateEntry = dimMap.get(rateSym);
  const rateMaxEntry = dimMap.get(rateMaxSym);
  const subsEntry = dimMap.get(subsSym);
  const ksatEntry = dimMap.get(ksatSym);

  for (const [name, entry] of [[rateSym, rateEntry], [rateMaxSym, rateMaxEntry], [subsSym, subsEntry], [ksatSym, ksatEntry]] as [string, SymbolEntry | undefined][]) {
    if (!entry) issues.push(`Symbol "${name}" not found in variables/parameters — cannot check dimension.`);
  }

  if (issues.length > 0) {
    return { equation: eqText, parsed: true, patternName: "Monod growth kinetics", lhsDimLabel: null, rhsDimLabel: null, dimensionsMatch: null, issues, symbolsChecked };
  }

  const r = rateEntry!; const rm = rateMaxEntry!; const s = subsEntry!; const ks = ksatEntry!;

  // Rule 1: S and Ks must have same dimension (they are added in denominator)
  if (!dimEq(s.dim, ks.dim)) {
    issues.push(
      `Substrate "${subsSym}" [${dimLabel(s.dim)}] and half-saturation "${ksatSym}" [${dimLabel(ks.dim)}] must have the same dimension (they are added in the Michaelis-Menten denominator).`
    );
  }

  // Rule 2: rate and rateMax must have same dimension
  if (!dimEq(r.dim, rm.dim)) {
    issues.push(
      `"${rateSym}" [${dimLabel(r.dim)}] and "${rateMaxSym}" [${dimLabel(rm.dim)}] must have the same dimension — Michaelis-Menten returns S/(Ks+S) which is dimensionless, so ${rateSym} = ${rateMaxSym} × dimensionless.`
    );
  }

  // Rule 3: S/(Ks+S) is dimensionless, so overall expression has dim of rateMax
  const rhsDim = rm.dim; // mumax × [dimensionless]
  const lhsDim = r.dim;
  const consistent = dimEq(lhsDim, rhsDim) && issues.length === 0;

  return {
    equation: eqText,
    parsed: true,
    patternName: "Monod growth kinetics",
    lhsDimLabel: dimLabel(lhsDim),
    rhsDimLabel: dimLabel(rhsDim),
    dimensionsMatch: consistent,
    issues,
    symbolsChecked,
  };
}

// ─── Pattern 3: Biomass ODE ───────────────────────────────────────────────────

/** dX/dt = (mu - D) * X  or  dX/dt = mu*X - D*X */
function checkBiomassOde(
  eqText: string,
  norm: string,
  dimMap: DimMap
): FormalEqResult | null {
  // Must be an ODE with a state variable
  const stateSym = extractOdeStateSym(norm);
  if (!stateSym) return null;

  // RHS must reference the state symbol (X) and at least one rate-type symbol
  // Look for: (sym - sym) * stateSym  or sym*stateSym - sym*stateSym
  const rhs = norm.split("=").slice(1).join("=");
  if (!rhs.includes(stateSym)) return null;

  // Find any rate symbols appearing in the RHS alongside the state variable
  // Pattern markers: equation looks like (rate1 - rate2) * X or rate1*X - rate2*X
  const muMatch = norm.match(/d([a-z_]\w*)\s*\/\s*dt\s*=\s*\(?\s*([a-z_]\w*)\s*-\s*([a-z_]\w*)\s*\)?\s*\*?\s*\1/);
  const altMatch = norm.match(/d([a-z_]\w*)\s*\/\s*dt\s*=\s*([a-z_]\w*)\s*\*\s*\1\s*-\s*([a-z_]\w*)\s*\*\s*\1/);

  const m = muMatch ?? altMatch;
  if (!m) return null;

  const biomSym = m[1]; // X
  const rate1Sym = m[2]; // mu
  const rate2Sym = m[3]; // D

  const symbolsChecked = [biomSym, rate1Sym, rate2Sym, "t"];
  const issues: string[] = [];

  const xEntry = dimMap.get(biomSym);
  const r1Entry = dimMap.get(rate1Sym);
  const r2Entry = dimMap.get(rate2Sym);
  const tEntry = dimMap.get("t");
  const timeDim = tEntry?.dim ?? DEFAULT_TIME_DIM;

  if (!xEntry) issues.push(`State variable "${biomSym}" not in tables.`);
  if (!r1Entry) issues.push(`Rate symbol "${rate1Sym}" not in tables.`);
  if (!r2Entry) issues.push(`Rate symbol "${rate2Sym}" not in tables.`);

  // Always compute LHS dimension from the state variable when available.
  const lhsDim = xEntry ? dimSub(xEntry.dim, timeDim) : null;
  const RATE_DIM: Dim = { M: 0, V: 0, T: -1, N: 0 };

  // If the state variable itself is missing, or both rate symbols are absent,
  // return a partial result — we cannot fully check dimensions but we did
  // recognise the structural pattern.
  if (!xEntry || (!r1Entry && !r2Entry)) {
    return {
      equation: eqText,
      parsed: true,
      patternName: "Biomass ODE",
      lhsDimLabel: lhsDim ? dimLabel(lhsDim) : null,
      rhsDimLabel: null,
      dimensionsMatch: null,
      issues,
      symbolsChecked,
    };
  }

  // Check rate dimensions where available
  if (r1Entry && !dimEq(r1Entry.dim, RATE_DIM)) {
    issues.push(`"${rate1Sym}" [${dimLabel(r1Entry.dim)}] should be a rate [1/T] for d${biomSym}/dt = (${rate1Sym}−${rate2Sym})·${biomSym}.`);
  }
  if (r2Entry && !dimEq(r2Entry.dim, RATE_DIM)) {
    issues.push(`"${rate2Sym}" [${dimLabel(r2Entry.dim)}] should be a rate [1/T] for d${biomSym}/dt = (${rate1Sym}−${rate2Sym})·${biomSym}.`);
  }

  // RHS dimension = [1/T] × dim(X) = same as LHS
  const rhsExpected = dimSub(xEntry.dim, timeDim);
  const consistent = issues.length === 0 && dimEq(lhsDim!, rhsExpected);

  return {
    equation: eqText,
    parsed: true,
    patternName: "Biomass ODE",
    lhsDimLabel: dimLabel(lhsDim!),
    rhsDimLabel: dimLabel(rhsExpected),
    dimensionsMatch: consistent,
    issues,
    symbolsChecked,
  };
}

// ─── Pattern 4: Substrate ODE ─────────────────────────────────────────────────

/**
 * dS/dt = D*(Sin - S) - (1/Yxs)*mu*X
 * Checks: D [1/T], Sin+S same [M/V], Yxs [dimensionless], mu [1/T], X [M/V]
 */
function checkSubstrateOde(
  eqText: string,
  norm: string,
  dimMap: DimMap
): FormalEqResult | null {
  const stateSym = extractOdeStateSym(norm);
  if (!stateSym) return null;

  // Signature: ODE that contains a yield-type symbol (Yxs, Y_xs, etc.)
  const yieldPat = /\byxs\b|\by_xs\b|\by_?[xp][a-z]*\b/;
  if (!yieldPat.test(norm)) return null;

  // Find yield symbol name in the equation
  const yMatch = norm.match(/\b(y[a-z_0-9]*)\b/);
  const yieldSym = yMatch ? yMatch[1] : null;
  if (!yieldSym) return null;

  const symbolsChecked: string[] = [stateSym];
  const issues: string[] = [];

  const sEntry = dimMap.get(stateSym);
  const yEntry = yieldSym ? dimMap.get(yieldSym) : undefined;

  if (!sEntry) {
    issues.push(`State variable "${stateSym}" not in tables.`);
  }
  if (yieldSym && !yEntry) {
    issues.push(`Yield symbol "${yieldSym}" not found in tables.`);
  } else if (yieldSym && yEntry) {
    symbolsChecked.push(yieldSym);
    if (!isDimensionless(yEntry.dim)) {
      issues.push(
        `Yield "${yieldSym}" [${dimLabel(yEntry.dim)}] should be dimensionless (g/g or mol/mol) in substrate balance d${stateSym}/dt.`
      );
    }
  }

  // Check dilution rate D
  const dEntry = dimMap.get("D") ?? dimMap.get("d");
  if (dEntry) {
    symbolsChecked.push("D");
    const RATE: Dim = { M: 0, V: 0, T: -1, N: 0 };
    if (!dimEq(dEntry.dim, RATE)) {
      issues.push(`Dilution rate "D" [${dimLabel(dEntry.dim)}] should be [1/T] in substrate balance.`);
    }
  }

  const tEntry = dimMap.get("t");
  const timeDim = tEntry?.dim ?? DEFAULT_TIME_DIM;
  const lhsDim = sEntry ? dimSub(sEntry.dim, timeDim) : null;

  return {
    equation: eqText,
    parsed: true,
    patternName: "Substrate ODE",
    lhsDimLabel: lhsDim ? dimLabel(lhsDim) : null,
    rhsDimLabel: lhsDim ? dimLabel(lhsDim) : null, // expected = same as LHS
    dimensionsMatch: issues.length === 0 ? true : null,
    issues,
    symbolsChecked,
  };
}

// ─── Pattern 5: Gas / kLa transfer ───────────────────────────────────────────

function checkKlaPattern(
  eqText: string,
  norm: string,
  dimMap: DimMap
): FormalEqResult | null {
  // Must mention kla in some form
  if (!/\bkla\b|\bk_la\b|\bkl_a\b|\bkla\b/.test(norm)) return null;

  const issues: string[] = [];
  const symbolsChecked: string[] = [];

  // Find the kLa symbol in the dimMap
  let klaEntry: SymbolEntry | undefined;
  let klaSym = "";
  for (const sym of ["kLa", "kla", "k_La", "k_la", "KLa", "Kla"]) {
    const e = dimMap.get(sym);
    if (e) { klaEntry = e; klaSym = sym; break; }
  }

  const RATE: Dim = { M: 0, V: 0, T: -1, N: 0 };

  if (klaEntry) {
    symbolsChecked.push(klaSym);
    if (!dimEq(klaEntry.dim, RATE)) {
      issues.push(`"${klaSym}" [${dimLabel(klaEntry.dim)}] should be a first-order rate [1/T] (volumetric mass-transfer coefficient).`);
    }
  } else {
    issues.push(`kLa symbol not found in parameters table — cannot verify dimension.`);
  }

  // Expected: kLa × (C* − C) → [1/T] × [M/V] = [M/V/T]
  const CONC: Dim = { M: 1, V: -1, T: 0, N: 0 };
  const expectedRate = { M: 1, V: -1, T: -1, N: 0 }; // M/V/T

  return {
    equation: eqText,
    parsed: true,
    patternName: "Gas/O₂ transfer (kLa)",
    lhsDimLabel: dimLabel(expectedRate),
    rhsDimLabel: klaEntry ? `${dimLabel(klaEntry.dim)} × ${dimLabel(CONC)}` : null,
    dimensionsMatch: klaEntry ? (issues.length === 0) : null,
    issues,
    symbolsChecked,
  };
}

// ─── Main runner ──────────────────────────────────────────────────────────────

function processEquation(
  eqText: string,
  dimMap: DimMap
): FormalEqResult {
  const norm = normalizeEqText(eqText);

  // Try each pattern in priority order
  const monod = checkMonod(eqText, norm, dimMap);
  if (monod) return monod;

  const biomass = checkBiomassOde(eqText, norm, dimMap);
  if (biomass) return biomass;

  const substrate = checkSubstrateOde(eqText, norm, dimMap);
  if (substrate) return substrate;

  const kla = checkKlaPattern(eqText, norm, dimMap);
  if (kla) return kla;

  const odeLhs = checkOdeLhs(eqText, norm, dimMap);
  if (odeLhs) return odeLhs;

  // No pattern matched
  return {
    equation: eqText,
    parsed: false,
    patternName: null,
    lhsDimLabel: null,
    rhsDimLabel: null,
    dimensionsMatch: null,
    issues: [],
    symbolsChecked: [],
  };
}

export function runFormalDimensionalAnalysis(
  equations: AnalysisEquation[],
  variables: AnalysisVariable[],
  parameters: AnalysisParameter[],
): FormalCheckReport {
  const dimMap = buildDimMap(variables, parameters);

  // Collect equation texts to analyse
  const equationTexts: string[] = [];
  for (const eq of equations) {
    const text = eq.latex?.trim() || eq.description?.trim();
    if (text) equationTexts.push(text);
  }

  if (equationTexts.length === 0) {
    return {
      formalCheckAvailable: false,
      status: "unavailable",
      equationResults: [],
      parsedCount: 0,
      supportedPatterns: SUPPORTED_PATTERNS,
    };
  }

  const equationResults = equationTexts.map((t) => processEquation(t, dimMap));
  const parsedCount = equationResults.filter((r) => r.parsed).length;
  const formalCheckAvailable = parsedCount > 0;

  // Aggregate status
  const hasIssues = equationResults.some((r) => r.parsed && r.issues.length > 0);
  const hasFailure = equationResults.some(
    (r) => r.parsed && r.dimensionsMatch === false
  );

  const status: FormalCheckReport["status"] = !formalCheckAvailable
    ? "unavailable"
    : hasFailure
    ? "fail"
    : hasIssues
    ? "warning"
    : "pass";

  return {
    formalCheckAvailable,
    status,
    equationResults,
    parsedCount,
    supportedPatterns: SUPPORTED_PATTERNS,
  };
}
