/**
 * Equation Template Matcher — M22
 *
 * Matches extracted equations against a small set of supported biochemical
 * ODE templates and generates runnable Python snippets for matched patterns.
 *
 * DESIGN RULES:
 *  - Never claim an equation was handled if it wasn't matched.
 *  - Generate runnable code ONLY when all required symbols are present.
 *  - If any required symbol is missing, produce a TODO stub with the missing
 *    symbol listed — not a silently broken expression.
 *  - Do not execute or evaluate generated code on the server or client.
 *
 * SUPPORTED TEMPLATES (v1):
 *  1. monod_kinetics          μ = μmax · S / (Ks + S)
 *  2. chemostat_biomass        dX/dt = (μ − D) · X
 *  3. chemostat_substrate      dS/dt = D·(Sin − S) − (1/Yxs)·μ·X
 *  4. first_order_decay        dC/dt = −k · C
 *  5. gas_liquid_transfer      dC/dt = kLa · (C* − C)
 *
 * UNSUPPORTED (scaffold only):
 *  - Power-law kinetics, Haldane / Andrews inhibition
 *  - Fed-batch variable-volume balances
 *  - Multi-species competitive kinetics
 *  - Any equation with unrecognised structure
 */

import { normalizeEqText } from "./dimensional-analysis";
import type { AnalysisEquation, AnalysisVariable, AnalysisParameter } from "./reproducibility";
import { hasKnownParameterValue } from "./parameter-values";
import { isExplicitlyNonDynamicEquation } from "./equation-types";

// ─── Public types ─────────────────────────────────────────────────────────────

export type TemplateName =
  | "monod_kinetics"
  | "chemostat_biomass"
  | "chemostat_substrate"
  | "first_order_decay"
  | "gas_liquid_transfer";

export type RunnableTemplateStatus = "full" | "partial" | "scaffold_only";

/** A non-ODE equation (intermediate calculation) that was matched. */
export interface MatchedEquation {
  templateName: TemplateName;
  templateLabel: string;
  originalEquation: string;
  pythonCode: string;
  missingSymbols: string[];
  isRunnable: boolean;
}

/** A derivative equation (dX/dt = …) that was matched or attempted. */
export interface DerivativePart {
  stateSym: string;          // original-case state variable name
  derivName: string;         // "dXdt"
  pythonLine: string | null; // "dXdt = (mu - D) * X"  or  null → scaffold
  comment: string;           // original equation text (for reference comment)
  templateLabel: string;
  missingSymbols: string[];
  isRunnable: boolean;
}

/** An equation that did not match any supported template. */
export interface UnmatchedEquation {
  originalEquation: string;
  note: string;
}

export interface TemplateScanResult {
  status: RunnableTemplateStatus;
  matched: MatchedEquation[];       // non-ODE intermediate calculations
  derivatives: DerivativePart[];    // ODE derivative equations
  unmatched: UnmatchedEquation[];   // equations with no recognised pattern
  runnableCount: number;            // equations with fully runnable Python
  totalEquations: number;
}

// ─── Symbol lookup ────────────────────────────────────────────────────────────

interface SymInfo {
  original: string;   // original case-preserved symbol name
  isStateVar: boolean;
  hasNumericValue: boolean;
}

type SymLookup = Map<string, SymInfo>;

function isPlaceholderSymbol(symbol: string | null | undefined): boolean {
  const text = String(symbol ?? "").trim().toLowerCase();
  return text === "" || text === "-" || text === "unknown" || text === "n/a";
}

function buildSymLookup(
  variables: AnalysisVariable[],
  parameters: AnalysisParameter[],
): SymLookup {
  const map: SymLookup = new Map();
  for (const v of variables) {
    if (isPlaceholderSymbol(v.symbol)) continue;
    map.set(v.symbol.toLowerCase(), {
      original: v.symbol,
      isStateVar: v.role === "state",
      hasNumericValue: false,
    });
  }
  for (const p of parameters) {
    if (isPlaceholderSymbol(p.symbol)) continue;
    const lower = p.symbol.toLowerCase();
    if (!map.has(lower)) {
      map.set(lower, {
        original: p.symbol,
        isStateVar: false,
        hasNumericValue: hasKnownParameterValue(p),
      });
    }
  }
  return map;
}

/** Return the original-case symbol name for a lowercased token, or the token itself. */
function orig(lower: string, lookup: SymLookup): string {
  return lookup.get(lower)?.original ?? lower;
}

/** Check whether all provided lowercase tokens exist in the lookup. */
function allPresent(tokens: string[], lookup: SymLookup): boolean {
  return tokens.every((t) => lookup.has(t));
}

function missing(tokens: string[], lookup: SymLookup): string[] {
  return tokens.filter((t) => !lookup.has(t)).map((t) => orig(t, lookup));
}

// ─── Template 1: Monod kinetics ───────────────────────────────────────────────

function tryMonodKinetics(
  norm: string,
  original: string,
  lookup: SymLookup,
): MatchedEquation | null {
  // Match: rate = rateMax * sub / (ksat + sub)  — must be the WHOLE equation
  // The trailing \s*$ prevents partial matches such as Haldane extensions
  const m = norm.match(
    /^([a-z_]\w*)\s*=\s*([a-z_]\w*)\s*\*\s*([a-z_]\w*)\s*\/\s*\(\s*([a-z_]\w*)\s*\+\s*([a-z_]\w*)\s*\)\s*$/,
  );
  if (!m) return null;

  const [, rateLow, rateMaxLow, sub1Low, den1Low, den2Low] = m;
  // The substrate appears in both numerator and denominator sum
  const ksatLow = den1Low === sub1Low ? den2Low : den1Low;
  const subsLow = sub1Low;

  // The LHS (rateLow) is the computed value — it is NOT expected to exist in
  // the variables/parameters tables before this equation computes it.
  const required = [rateMaxLow, subsLow, ksatLow];
  const miss = missing(required, lookup);

  const rate = orig(rateLow, lookup);
  const rateMax = orig(rateMaxLow, lookup);
  const sub = orig(subsLow, lookup);
  const ksat = orig(ksatLow, lookup);

  const pythonCode = miss.length === 0
    ? `${rate} = ${rateMax} * ${sub} / (${ksat} + ${sub})`
    : `${rate} = ${rateMax} * ${sub} / (${ksat} + ${sub})  # TODO: missing symbols: ${miss.join(", ")}`;

  return {
    templateName: "monod_kinetics",
    templateLabel: "Monod growth kinetics",
    originalEquation: original,
    pythonCode,
    missingSymbols: miss,
    isRunnable: miss.length === 0,
  };
}

// ─── Template 2: Chemostat biomass ODE ───────────────────────────────────────

function tryBiomassOde(
  norm: string,
  original: string,
  lookup: SymLookup,
): DerivativePart | null {
  // dX/dt = (mu - D) * X   OR   dX/dt = mu*X - D*X
  const m1 = norm.match(
    /d([a-z_]\w*)\/dt\s*=\s*\(?\s*([a-z_]\w*)\s*-\s*([a-z_]\w*)\s*\)?\s*\*?\s*\1/,
  );
  const m2 = norm.match(
    /d([a-z_]\w*)\/dt\s*=\s*([a-z_]\w*)\s*\*\s*\1\s*-\s*([a-z_]\w*)\s*\*\s*\1/,
  );
  const m = m1 ?? m2;
  if (!m) return null;

  const [, stateLow, rate1Low, rate2Low] = m;

  // One of the two rate symbols is often a computed intermediate (e.g. mu from
  // a Monod equation) rather than a raw extraction parameter.  Only flag both
  // rates as missing if NEITHER appears in the extraction tables — if at least
  // one is present, the absent one is treated as a computed local variable.
  const stateMissing = !lookup.has(stateLow);
  const bothRatesMissing = !lookup.has(rate1Low) && !lookup.has(rate2Low);
  const miss: string[] = [];
  if (stateMissing) miss.push(orig(stateLow, lookup));
  if (bothRatesMissing) {
    miss.push(orig(rate1Low, lookup));
    miss.push(orig(rate2Low, lookup));
  }

  const state = orig(stateLow, lookup);
  const rate1 = orig(rate1Low, lookup);
  const rate2 = orig(rate2Low, lookup);

  return {
    stateSym: state,
    derivName: `d${state}dt`,
    pythonLine: miss.length === 0
      ? `d${state}dt = (${rate1} - ${rate2}) * ${state}`
      : null,
    comment: original,
    templateLabel: "Chemostat biomass ODE",
    missingSymbols: miss,
    isRunnable: miss.length === 0,
  };
}

// ─── Template 3: Chemostat substrate ODE ─────────────────────────────────────

function trySubstrateOde(
  norm: string,
  original: string,
  lookup: SymLookup,
  variables: AnalysisVariable[],
): DerivativePart | null {
  const stateM = norm.match(/d([a-z_]\w*)\/dt\s*=/);
  if (!stateM) return null;
  const stateLow = stateM[1];

  // Signature: ODE that contains a yield-type symbol
  const yieldM = norm.match(/\b(y[a-z_0-9]*)\b/);
  if (!yieldM) return null;
  const yieldLow = yieldM[1];

  // Must also contain a dilution-rate-like symbol (D)
  // Look for D * ( pattern in RHS
  if (!/\bd\s*\*\s*\(/.test(norm) && !/\bd\b/.test(norm)) return null;
  // Ensure there is actually a dilution symbol in lookup
  const dLow = lookup.has("d") ? "d" : null;
  if (!dLow) return null;

  // Find an "input concentration" symbol — look for common patterns: sin, s0, s_in, sf, ...
  // Try to find a concentration-type parameter that isn't the state variable
  const sinM = norm.match(/\b(s(?:in|0|_?in|_?0|feed|f)?)\b/);
  const sinLow = sinM ? sinM[1] : null;

  // Find the biomass state variable (the "other" state variable that isn't the substrate)
  const stateVars = variables.filter((v) => v.role === "state" && !isPlaceholderSymbol(v.symbol));
  const otherStateVar =
    stateVars.find((v) => v.symbol.toLowerCase() === "x" && v.symbol.toLowerCase() !== stateLow) ??
    stateVars.find((v) => v.symbol.toLowerCase() !== stateLow);
  const bioLow = otherStateVar?.symbol.toLowerCase() ?? null;

  // Find growth rate symbol used in the equation (mu)
  // It appears after the yield term: ... * mu * X  or  * rate *
  const muM = norm.match(/\/([\s\w_]+)\)\s*\*\s*([a-z_]\w*)\s*\*\s*([a-z_]\w*)/);
  const muLow = muM ? muM[2] : (lookup.has("mu") ? "mu" : null);

  // Required symbols that must exist in the extraction's variables/parameters.
  // NOTE: mu (growth rate) is intentionally excluded — it is a computed
  // intermediate value that the Monod equation above produces as a local
  // variable. Requiring it in the tables would cause false "missing" flags.
  const miss = missing(
    [
      stateLow,
      yieldLow,
      dLow,
      ...(sinLow ? [sinLow] : []),
      ...(bioLow ? [bioLow] : []),
    ],
    lookup,
  );

  const state = orig(stateLow, lookup);
  const yield_ = orig(yieldLow, lookup);
  const D = orig(dLow, lookup);
  const Sin = sinLow ? orig(sinLow, lookup) : "Sin  # TODO: add feed concentration";
  const mu = muLow ? orig(muLow, lookup) : "mu";
  const X = bioLow ? orig(bioLow, lookup) : "X  # TODO: add biomass state variable";

  const pythonLine = miss.length === 0
    ? `d${state}dt = ${D} * (${Sin} - ${state}) - (1.0 / ${yield_}) * ${mu} * ${X}`
    : null;

  return {
    stateSym: state,
    derivName: `d${state}dt`,
    pythonLine,
    comment: original,
    templateLabel: "Chemostat substrate ODE",
    missingSymbols: miss,
    isRunnable: miss.length === 0,
  };
}

// ─── Template 4: First-order decay ───────────────────────────────────────────

function tryFirstOrderDecay(
  norm: string,
  original: string,
  lookup: SymLookup,
): DerivativePart | null {
  // dC/dt = -k * C   (the minus must be present)
  const m = norm.match(/d([a-z_]\w*)\/dt\s*=\s*-\s*([a-z_]\w*)\s*\*\s*\1/)
    ?? norm.match(/d([a-z_]\w*)\/dt\s*=\s*-([a-z_]\w*)\s*\*\s*\1/);
  if (!m) return null;

  const [, stateLow, kLow] = m;
  const required = [stateLow, kLow];
  const miss = missing(required, lookup);

  const state = orig(stateLow, lookup);
  const k = orig(kLow, lookup);

  return {
    stateSym: state,
    derivName: `d${state}dt`,
    pythonLine: miss.length === 0 ? `d${state}dt = -${k} * ${state}` : null,
    comment: original,
    templateLabel: "First-order decay ODE",
    missingSymbols: miss,
    isRunnable: miss.length === 0,
  };
}

// ─── Template 5: Gas–liquid transfer ─────────────────────────────────────────

function tryGasLiquidTransfer(
  norm: string,
  original: string,
  lookup: SymLookup,
): DerivativePart | MatchedEquation | null {
  // Must mention kla in some form
  if (!/\bkla\b|\bk_la\b|\bkl_a\b/.test(norm)) return null;

  // Find kLa symbol in lookup (case-insensitive already handled by lookup)
  let klaLow: string | null = null;
  for (const candidate of ["kla", "k_la", "kl_a"]) {
    if (lookup.has(candidate)) { klaLow = candidate; break; }
  }

  // Pattern A (full oxygen balance): dC/dt = kLa*(Cstar - C) - qO2*X [- D*C]
  // Correct form: transfer - consumption [- dilution]
  const fullOdeM = norm.match(
    /d([a-z_]\w*)\/dt\s*=\s*([a-z_]\w*)\s*\*\s*\(\s*([a-z_]\w*)\s*-\s*\1\s*\)\s*-\s*([a-z_]\w*)\s*\*\s*([a-z_]\w*)((?:\s*-\s*[a-z_]\w*\s*\*\s*\1)?)/,
  );

  // Pattern B (simple transfer only): dC/dt = kLa*(Cstar - C)
  const odeM = !fullOdeM
    ? norm.match(/d([a-z_]\w*)\/dt\s*=\s*([a-z_]\w*)\s*\*\s*\(\s*([a-z_]\w*)\s*-\s*\1\s*\)/)
    : null;

  const algM = !fullOdeM && !odeM
    ? norm.match(/^([a-z_]\w*)\s*=\s*([a-z_]\w*)\s*\*\s*\(\s*([a-z_]\w*)\s*-\s*([a-z_]\w*)\s*\)/)
    : null;

  if (fullOdeM) {
    const [, stateLow, klaToken, cstarLow, coeff1Low, coeff2Low, dilutionPart] = fullOdeM;
    const klaKey = klaLow ?? klaToken;
    const required = [stateLow, klaKey, cstarLow, coeff1Low, coeff2Low];
    const miss = missing(required, lookup);

    const state = orig(stateLow, lookup);
    const kla = orig(klaKey, lookup);
    const cstar = orig(cstarLow, lookup);
    const coeff1 = orig(coeff1Low, lookup);
    const coeff2 = orig(coeff2Low, lookup);

    let pythonRhs = `${kla} * (${cstar} - ${state}) - ${coeff1} * ${coeff2}`;
    // Include dilution term if present: - D * C
    if (dilutionPart) {
      const dilM = dilutionPart.trim().match(/-\s*([a-z_]\w*)\s*\*\s*([a-z_]\w*)/);
      if (dilM) {
        const dSym = orig(dilM[1], lookup);
        pythonRhs += ` - ${dSym} * ${state}`;
      }
    }

    return {
      stateSym: state,
      derivName: `d${state}dt`,
      pythonLine: miss.length === 0 ? `d${state}dt = ${pythonRhs}` : null,
      comment: original,
      templateLabel: "Gas–liquid O₂ transfer ODE (with consumption)",
      missingSymbols: miss,
      isRunnable: miss.length === 0,
    } satisfies DerivativePart;
  }

  if (odeM) {
    const [, stateLow, klaToken, cstarLow] = odeM;
    const klaKey = klaLow ?? klaToken;
    const required = [stateLow, klaKey, cstarLow];
    const miss = missing(required, lookup);

    const state = orig(stateLow, lookup);
    const kla = orig(klaKey, lookup);
    const cstar = orig(cstarLow, lookup);

    return {
      stateSym: state,
      derivName: `d${state}dt`,
      pythonLine: miss.length === 0 ? `d${state}dt = ${kla} * (${cstar} - ${state})` : null,
      comment: original,
      templateLabel: "Gas–liquid O₂ transfer ODE",
      missingSymbols: miss,
      isRunnable: miss.length === 0,
    } satisfies DerivativePart;
  }

  if (algM) {
    const [, lhsLow, klaToken, hi1Low, hi2Low] = algM;
    const klaKey = klaLow ?? klaToken;
    // cstar is the higher of the two (saturation), conc is the lower
    const required = [lhsLow, klaKey, hi1Low, hi2Low];
    const miss = missing(required, lookup);

    const lhs = orig(lhsLow, lookup);
    const kla = orig(klaKey, lookup);
    const sat = orig(hi1Low, lookup);
    const conc = orig(hi2Low, lookup);

    return {
      templateName: "gas_liquid_transfer",
      templateLabel: "Gas–liquid O₂ transfer",
      originalEquation: original,
      pythonCode: miss.length === 0
        ? `${lhs} = ${kla} * (${sat} - ${conc})`
        : `${lhs} = ${kla} * (${sat} - ${conc})  # TODO: missing: ${miss.join(", ")}`,
      missingSymbols: miss,
      isRunnable: miss.length === 0,
    } satisfies MatchedEquation;
  }

  return null;
}

// ─── Helpers to detect whether result is derivative or intermediate ───────────

function isDerivativePart(r: DerivativePart | MatchedEquation): r is DerivativePart {
  return "stateSym" in r;
}

// ─── Main function ────────────────────────────────────────────────────────────

export function matchTemplates(
  equations: AnalysisEquation[],
  variables: AnalysisVariable[],
  parameters: AnalysisParameter[],
): TemplateScanResult {
  const lookup = buildSymLookup(variables, parameters);

  const matched: MatchedEquation[] = [];
  const derivatives: DerivativePart[] = [];
  const unmatched: UnmatchedEquation[] = [];

  // Track which state variables already have a derivative matched
  const coveredStateVars = new Set<string>();

  for (const eq of equations) {
    const text = eq.latex?.trim() || eq.description?.trim() || "";
    if (!text) continue;

    const norm = normalizeEqText(text);

    // ── Try templates in priority order ──────────────────────────────────────

    // Monod (intermediate, non-ODE). Keep this even when the equation type is
    // explicitly algebraic, because the Python ODE needs mu before derivatives.
    const monod = tryMonodKinetics(norm, text, lookup);
    if (monod) {
      matched.push(monod);
      continue;
    }

    if (isExplicitlyNonDynamicEquation(eq)) continue;

    // Biomass ODE
    const biomass = tryBiomassOde(norm, text, lookup);
    if (biomass) {
      if (!coveredStateVars.has(biomass.stateSym.toLowerCase())) {
        derivatives.push(biomass);
        coveredStateVars.add(biomass.stateSym.toLowerCase());
      }
      continue;
    }

    // Substrate ODE (requires yield symbol)
    const substrate = trySubstrateOde(norm, text, lookup, variables);
    if (substrate) {
      if (!coveredStateVars.has(substrate.stateSym.toLowerCase())) {
        derivatives.push(substrate);
        coveredStateVars.add(substrate.stateSym.toLowerCase());
      }
      continue;
    }

    // First-order decay ODE
    const decay = tryFirstOrderDecay(norm, text, lookup);
    if (decay) {
      if (!coveredStateVars.has(decay.stateSym.toLowerCase())) {
        derivatives.push(decay);
        coveredStateVars.add(decay.stateSym.toLowerCase());
      }
      continue;
    }

    // Gas–liquid transfer (ODE or algebraic)
    const kla = tryGasLiquidTransfer(norm, text, lookup);
    if (kla) {
      if (isDerivativePart(kla)) {
        if (!coveredStateVars.has(kla.stateSym.toLowerCase())) {
          derivatives.push(kla);
          coveredStateVars.add(kla.stateSym.toLowerCase());
        }
      } else {
        matched.push(kla);
      }
      continue;
    }

    // Nothing matched
    unmatched.push({
      originalEquation: text,
      note: "no supported pattern recognised",
    });
  }

  // ── Determine overall status ──────────────────────────────────────────────

  const totalMatched = matched.length + derivatives.length;
  const runnableCount = matched.filter((m) => m.isRunnable).length
    + derivatives.filter((d) => d.isRunnable).length;

  const hasAnyMatch = totalMatched > 0;
  const hasAnyNonRunnable =
    matched.some((m) => !m.isRunnable) ||
    derivatives.some((d) => !d.isRunnable) ||
    unmatched.length > 0;

  const status: RunnableTemplateStatus = !hasAnyMatch
    ? "scaffold_only"
    : hasAnyNonRunnable
    ? "partial"
    : "full";

  return {
    status,
    matched,
    derivatives,
    unmatched,
    runnableCount,
    totalEquations: totalMatched + unmatched.length,
  };
}
