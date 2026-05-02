/**
 * Unit & Dimension Checking — MVP Heuristic Engine
 *
 * Pure TypeScript, client-side only — no server calls, no AI calls.
 *
 * This is a PRACTICAL HEURISTIC checker, not a full symbolic dimensional-analysis
 * engine. It flags obvious problems: missing units, undefined symbols, suspicious
 * kinetic constants, and mixed time scales. It does not attempt to algebraically
 * balance units across terms.
 *
 * Conservative by design: only fires warnings when evidence is clear.
 */

import type {
  AnalysisEquation,
  AnalysisVariable,
  AnalysisParameter,
  RawExtraction,
} from "./reproducibility";

// ─── Output types ─────────────────────────────────────────────────────────────

export type UnitWarnSeverity = "low" | "medium" | "high";

export interface UnitWarning {
  severity: UnitWarnSeverity;
  message: string;
  equation_or_symbol: string;
  suggestion: string;
}

export interface UnitCheckReport {
  unit_check_status: "pass" | "warning" | "fail";
  warnings: UnitWarning[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function safeStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function hasStr(v: unknown): boolean {
  return safeStr(v) !== "";
}

/** Normalise a time-unit token to a canonical label, or null if not a time unit. */
function normalizeTimeToken(token: string): string | null {
  const t = token.toLowerCase().trim();
  if (t === "h" || t === "hr" || t === "hrs" || t.startsWith("hour")) return "hour";
  if (t === "min" || t === "mins" || t.startsWith("minute")) return "minute";
  if (t === "d" || t === "day" || t === "days") return "day";
  if (t === "s" || t === "sec" || t === "secs" || t.startsWith("second")) return "second";
  return null;
}

/** Extract the time-denominator token from a unit string like "g/L/h" → "h". */
function extractTimeDenominator(unit: string): string | null {
  const m = unit.match(
    /\/\s*(h|hr|hrs?|hours?|min|mins?|minutes?|d|days?|s|secs?|seconds?)\b/i
  );
  return m ? m[1].toLowerCase() : null;
}

/** True if a unit string looks like a first-order rate (1/time). */
function looksLikeRate(unit: string): boolean {
  const u = unit.toLowerCase();
  return (
    /^1\s*\//.test(u) ||
    /^per[-\s]?(h|day|hour|min|d)\b/.test(u) ||
    /\/\s*(h|hr|d|day|min|s)\s*$/.test(u) ||
    /[({](h|d|day|min|s|hr)[^)]*\s*\^?\s*-\s*1/.test(u)
  );
}

/** True if a unit string looks like a concentration. */
function looksLikeConcentration(unit: string): boolean {
  return /g\s*\/\s*(l|m3|dm3)|mol\s*\/\s*l|kg\s*\/\s*m3|mg\s*\/\s*l|mmol\s*\/\s*l|g\s*cdw/i.test(
    unit
  );
}

/** True if a unit string looks dimensionless / a mass ratio. */
function looksLikeRatio(unit: string): boolean {
  const u = unit.toLowerCase().trim();
  return (
    u === "" ||
    u === "-" ||
    u === "—" ||
    u === "dimensionless" ||
    u === "1" ||
    /^g\s*\/\s*g/.test(u) ||
    /^mol\s*\/\s*mol/.test(u) ||
    /^kg\s*\/\s*kg/.test(u)
  );
}

/** ODE patterns: dX/dt, d[X]/dt, dx/dt, etc. Returns the state symbol. */
function detectOdeStateSymbol(text: string): string | null {
  const m = text.match(/d\[?([A-Za-z_][A-Za-z0-9_]*)\]?\s*\/\s*dt\b/);
  return m ? m[1] : null;
}

/** LaTeX command names to skip when extracting symbol tokens. */
const LATEX_CMDS = new Set([
  "frac", "cdot", "times", "left", "right", "text", "mathrm", "mathbf",
  "min", "max", "exp", "ln", "log", "sin", "cos", "tan", "sqrt",
  "sum", "int", "infty", "Delta", "partial", "nabla", "quad", "qquad",
  "pm", "mp", "over", "div", "hat", "bar", "dot", "vec",
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta",
  "theta", "lambda", "xi", "pi", "rho", "sigma", "tau", "phi", "chi", "psi", "omega",
  "Gamma", "Lambda", "Sigma", "Phi", "Psi", "Omega",
  "dt", "in", "notin", "to", "and", "or", "not", "if", "else",
]);

/**
 * Extract bare identifier tokens from a LaTeX/math expression.
 * Returns unique symbols only.
 */
function extractLatexSymbols(latex: string): string[] {
  const raw = [...latex.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)].map(
    (m) => m[1]
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    if (!LATEX_CMDS.has(s) && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

// ─── Kinetic symbol classifiers ───────────────────────────────────────────────

/** Symbols that almost always represent first-order rate constants (1/time). */
const RATE_SYMBOL_PATTERNS = [
  /^mu$/i,
  /^mu_?max$/i,
  /^[dD]$/, // dilution rate
  /^k_?[dD]$/,
  /^k_?[lL][aA]$/, // volumetric mass transfer
  /^q_?[oO]2$/,
  /^[kK]_?[hH]$/,
  /^[kK]_?[sS]$/i, // sometimes rate-like in simplified models
];

/** Symbols that almost always represent concentrations. */
const CONCENTRATION_SYMBOL_PATTERNS = [
  /^[XSCPNO]$/, // single-letter biomass, substrate, etc.
  /^X_?[a-z]+$/,
  /^S_?[a-z]+$/,
  /^C_?[a-z]+$/,
];

/** Symbols that almost always represent yield / dimensionless ratios. */
const RATIO_SYMBOL_PATTERNS = [
  /^Y[a-z]{0,4}$/i, // Yxs, Yps, Y
  /^yield$/i,
];

function matchesAny(sym: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(sym));
}

// ─── GAS-TRANSFER KEYWORD DETECTOR ───────────────────────────────────────────

const GAS_TRANSFER_KEYWORDS = [
  "oxygen", "o2", "co2", "carbon dioxide", "henry", "gas-liquid",
  "gas transfer", "kla", "k_la", "equilibrium concentration",
];

function mentionsGasTransfer(texts: string[]): boolean {
  const joined = texts.join(" ").toLowerCase();
  return GAS_TRANSFER_KEYWORDS.some((kw) => joined.includes(kw));
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function runUnitCheck(
  equations: AnalysisEquation[],
  variables: AnalysisVariable[],
  parameters: AnalysisParameter[],
  raw: RawExtraction | null
): UnitCheckReport {
  const warnings: UnitWarning[] = [];

  // Build lookup maps from normalized tables (both tables contribute symbols)
  const allSymbolMap = new Map<string, { unit: string | null | undefined; role?: string }>();
  for (const v of variables) {
    allSymbolMap.set(v.symbol, { unit: v.unit, role: v.role });
  }
  for (const p of parameters) {
    if (!allSymbolMap.has(p.symbol)) {
      allSymbolMap.set(p.symbol, { unit: p.unit, role: "parameter" });
    }
  }

  const stateVariables = variables.filter((v) => v.role === "state");

  // Concatenate all equation text for full-text checks
  const allEquationText = equations.map((e) => e.latex + " " + e.description).join(" ");

  // ── Check 3: Every state variable should have a unit ──────────────────────
  for (const sv of stateVariables) {
    if (!hasStr(sv.unit)) {
      warnings.push({
        severity: "high",
        message: `State variable "${sv.symbol}" has no unit.`,
        equation_or_symbol: sv.symbol,
        suggestion: `Add a physical unit (e.g. g/L, mol/L) to "${sv.symbol}". ODE derivative units cannot be inferred without it.`,
      });
    }
  }

  // ── Check 4: Every parameter should have a unit ────────────────────────────
  for (const p of parameters) {
    if (!hasStr(p.unit)) {
      warnings.push({
        severity: "medium",
        message: `Parameter "${p.symbol}" has no unit.`,
        equation_or_symbol: p.symbol,
        suggestion: `Specify a unit for "${p.symbol}" or explicitly mark it "dimensionless" / "unknown".`,
      });
    }
  }

  // ── Raw-equation-based checks (need raw JSON) ─────────────────────────────
  if (raw?.equations) {
    for (const eq of raw.equations) {
      const label = safeStr(eq.label) || safeStr(eq.equation_latex) || "(unlabelled equation)";
      const latex = safeStr(eq.equation_latex) || safeStr(eq.equation_plaintext);

      // Check 1: variables_involved present?
      if (!eq.variables_involved || eq.variables_involved.length === 0) {
        warnings.push({
          severity: "low",
          message: `Equation "${label}" has no variables_involved list.`,
          equation_or_symbol: label,
          suggestion: "List all symbols used in this equation under variables_involved so the checker can verify them.",
        });
      } else {
        // Check 2: every symbol in variables_involved must exist in tables
        for (const sym of eq.variables_involved) {
          const s = safeStr(sym);
          if (s && !allSymbolMap.has(s)) {
            warnings.push({
              severity: "high",
              message: `Symbol "${s}" listed in equation "${label}" variables_involved but not found in variables or parameters tables.`,
              equation_or_symbol: s,
              suggestion: `Add "${s}" to the variables or parameters table with its unit and description.`,
            });
          }
        }
      }

      // Check 5: ODE derivative unit inference
      if (latex) {
        const odeSym = detectOdeStateSymbol(latex);
        if (odeSym) {
          const entry = allSymbolMap.get(odeSym);
          if (!entry || !hasStr(entry.unit)) {
            warnings.push({
              severity: "medium",
              message: `ODE equation "${label}" contains d${odeSym}/dt but "${odeSym}" has no unit — derivative unit cannot be inferred.`,
              equation_or_symbol: `d${odeSym}/dt`,
              suggestion: `Define the unit for state variable "${odeSym}" so the expected d${odeSym}/dt unit (state_unit / time_unit) can be verified.`,
            });
          } else {
            const stateUnit = safeStr(entry.unit);
            const timeDenom = extractTimeDenominator(stateUnit);
            if (!timeDenom) {
              // Unit doesn't already contain a time denominator — check if dt unit is knowable
              const timeVarEntry = allSymbolMap.get("t");
              if (!timeVarEntry || !hasStr(timeVarEntry.unit)) {
                warnings.push({
                  severity: "low",
                  message: `d${odeSym}/dt: time unit is not specified anywhere (variable "t" has no unit or is absent).`,
                  equation_or_symbol: `d${odeSym}/dt`,
                  suggestion: `Add the time variable "t" with its unit (e.g. h, min, d) to the variables table so the derivative unit is unambiguous.`,
                });
              }
            }
          }
        }
      }

      // Check 10: symbols in LaTeX not in tables (conservative — only explicit-looking identifiers)
      if (latex) {
        for (const sym of extractLatexSymbols(latex)) {
          // Skip very short tokens (d, t, e) and numerics — too many false positives
          if (sym.length <= 1 && sym !== "X" && sym !== "S" && sym !== "D") continue;
          // Skip "mu" as it appears as \mu — it maps to Greek letter used as mu_max
          if (sym === "mu") continue;
          if (!allSymbolMap.has(sym)) {
            warnings.push({
              severity: "medium",
              message: `Symbol "${sym}" appears in equation "${label}" but is not defined in variables or parameters.`,
              equation_or_symbol: sym,
              suggestion: `If "${sym}" is a model symbol, add it to variables or parameters. If it is a mathematical constant or operator, it can be ignored.`,
            });
          }
        }
      }
    }
  } else {
    // No raw JSON — fall back to normalized equation text
    for (const eq of equations) {
      const label = eq.description || eq.latex.substring(0, 40) || "(equation)";

      // Check 5 from normalized data
      const odeSym = detectOdeStateSymbol(eq.latex);
      if (odeSym) {
        const entry = allSymbolMap.get(odeSym);
        if (!entry || !hasStr(entry.unit)) {
          warnings.push({
            severity: "medium",
            message: `ODE "${label}" contains d${odeSym}/dt but "${odeSym}" has no unit.`,
            equation_or_symbol: `d${odeSym}/dt`,
            suggestion: `Define the unit for "${odeSym}" (e.g. g/L) so the derivative unit (g/L/h) can be determined.`,
          });
        }
      }
    }
  }

  // ── Check 6: Kinetic unit conventions ────────────────────────────────────────
  for (const [sym, entry] of allSymbolMap) {
    const unit = safeStr(entry.unit);
    if (!unit) continue; // already caught in checks 3 & 4

    if (matchesAny(sym, RATE_SYMBOL_PATTERNS)) {
      if (!looksLikeRate(unit)) {
        warnings.push({
          severity: "medium",
          message: `"${sym}" is typically a first-order rate constant but its unit "${unit}" does not look like 1/time.`,
          equation_or_symbol: sym,
          suggestion: `Common rate units: 1/h, h⁻¹, /d, /min. Verify that "${sym}" is correctly classified.`,
        });
      }
    } else if (matchesAny(sym, CONCENTRATION_SYMBOL_PATTERNS)) {
      if (!looksLikeConcentration(unit)) {
        warnings.push({
          severity: "low",
          message: `"${sym}" is often a concentration (biomass/substrate) but its unit "${unit}" does not look like g/L or mol/L.`,
          equation_or_symbol: sym,
          suggestion: `Expected concentration units: g/L, g CDW/L, mol/L, kg/m³. Double-check "${sym}".`,
        });
      }
    } else if (matchesAny(sym, RATIO_SYMBOL_PATTERNS)) {
      if (!looksLikeRatio(unit)) {
        warnings.push({
          severity: "low",
          message: `"${sym}" is typically a yield coefficient (dimensionless or g/g) but its unit is "${unit}".`,
          equation_or_symbol: sym,
          suggestion: `Yield coefficients are usually dimensionless (g biomass / g substrate). Verify the unit for "${sym}".`,
        });
      }
    }
  }

  // ── Check 7: Mixed time units ─────────────────────────────────────────────
  {
    const timeUnitsFound = new Map<string, string>(); // canonical → raw token
    const allUnits = [
      ...variables.map((v) => safeStr(v.unit)),
      ...parameters.map((p) => safeStr(p.unit)),
    ];
    for (const u of allUnits) {
      // Look for explicit time-denominator tokens
      const denom = extractTimeDenominator(u);
      if (denom) {
        const canonical = normalizeTimeToken(denom) ?? denom;
        timeUnitsFound.set(canonical, denom);
      }
      // Also look for standalone time units (e.g. "h" alone for time variable)
      const standAlone = normalizeTimeToken(u.toLowerCase());
      if (standAlone) {
        timeUnitsFound.set(standAlone, u);
      }
    }
    if (timeUnitsFound.size > 1) {
      const mixed = [...timeUnitsFound.keys()].join(", ");
      warnings.push({
        severity: "medium",
        message: `Multiple time scales detected across variables and parameters: ${mixed}.`,
        equation_or_symbol: "(time units)",
        suggestion: "Standardise all time units to a single base (e.g. hours). Mixed time units cause silent scaling errors in ODE solvers.",
      });
    }
  }

  // ── Check 8: Gas-transfer / Henry-law details ─────────────────────────────
  {
    const allTexts = [
      ...equations.map((e) => e.latex + " " + e.description),
      ...variables.map((v) => v.name),
      ...parameters.map((p) => p.symbol),
    ];
    if (mentionsGasTransfer(allTexts)) {
      const hasKla = [...allSymbolMap.keys()].some((s) =>
        /^k_?[lL][aA]$/.test(s)
      );
      if (!hasKla) {
        warnings.push({
          severity: "medium",
          message: "Gas-transfer keywords (O₂, CO₂, Henry, kLa) appear in the model but no kLa parameter is defined.",
          equation_or_symbol: "kLa",
          suggestion: "Add kLa (volumetric mass-transfer coefficient, unit 1/h) and Henry's constant (if applicable) to the parameters table.",
        });
      }
    }
  }

  // ── Check 9: Parameters not referenced in any equation ───────────────────
  {
    const allEqText = [
      ...equations.map((e) => e.latex + " " + e.description),
      ...(raw?.equations ?? []).map((e) => safeStr(e.equation_latex) + " " + safeStr(e.equation_plaintext)),
    ].join(" ");

    for (const p of parameters) {
      // Use word-boundary match to avoid false positives (e.g. "D" inside "CDW")
      const pattern = new RegExp(`\\b${escapeRegex(p.symbol)}\\b`);
      if (!pattern.test(allEqText)) {
        warnings.push({
          severity: "low",
          message: `Parameter "${p.symbol}" does not appear in any extracted equation.`,
          equation_or_symbol: p.symbol,
          suggestion: `Verify that "${p.symbol}" is used in the model. If it is implicit (e.g. a physical constant), note its role in the description.`,
        });
      }
    }
  }

  // ── Determine overall status ──────────────────────────────────────────────
  const hasHigh = warnings.some((w) => w.severity === "high");
  const hasMedium = warnings.some((w) => w.severity === "medium");

  const unit_check_status: UnitCheckReport["unit_check_status"] = hasHigh
    ? "fail"
    : hasMedium
    ? "warning"
    : "pass";

  // Sort: high → medium → low
  const SEVERITY_ORDER: Record<UnitWarnSeverity, number> = { high: 0, medium: 1, low: 2 };
  warnings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return { unit_check_status, warnings };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
