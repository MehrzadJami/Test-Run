/**
 * Python ODE Template Generator
 *
 * Pure TypeScript, client-side only — produces a Python source string from
 * already-loaded model card data. No server calls, no AI calls.
 *
 * Design contract:
 *  - Honest: only inserts numeric values that were explicitly extracted.
 *    Every uncertain value is replaced with a TODO comment.
 *  - Useful: the generated scaffold compiles and can be filled in incrementally.
 *  - Transparent: reproducibility score, unit warnings, and missing info are
 *    embedded as comments so the downstream engineer knows what to fix.
 */

import type { AnalysisEquation, AnalysisVariable, AnalysisParameter, AnalysisAssumption, RawExtraction, ReproducibilityReport } from "./reproducibility";
import type { UnitCheckReport } from "./unit-checker";
import { normalizeEqText } from "./dimensional-analysis";
import type { TemplateScanResult } from "./template-matcher";

// ─── Public input / output types ──────────────────────────────────────────────

export interface PythonGeneratorInput {
  title: string;
  projectName: string;
  providerUsed: string;
  systemType?: string | null;
  systemDescription?: string | null;
  equations: AnalysisEquation[];
  variables: AnalysisVariable[];
  parameters: AnalysisParameter[];
  assumptions: AnalysisAssumption[];
  raw: RawExtraction | null;
  report: ReproducibilityReport;
  unitReport: UnitCheckReport;
  /** M22 template scan result — when provided, replaces TODO stubs with runnable code */
  templateResult?: TemplateScanResult;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Parse a value to a Python-safe number literal, or return null. */
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Return a Python repr of a number, or a TODO placeholder string. */
function pyValue(v: unknown, fallback: string): string {
  const n = toNumber(v);
  if (n !== null) {
    // Use exponential for very small/large numbers
    if (Math.abs(n) > 0 && (Math.abs(n) < 0.001 || Math.abs(n) > 1e6)) {
      return n.toExponential();
    }
    return String(n);
  }
  return fallback;
}

/** Pad a string to at least `width` characters. */
function pad(s: string, width: number): string {
  return s.padEnd(width, " ");
}

/** Wrap text at `width` chars, indenting continuation lines with `indent`. */
function wrapComment(text: string, prefix: string, width = 88): string {
  if (!text) return "";
  const words = text.split(" ");
  const lines: string[] = [];
  let line = prefix;
  for (const word of words) {
    if (line.length + word.length + 1 > width && line !== prefix) {
      lines.push(line);
      line = prefix + word;
    } else {
      line = line === prefix ? prefix + word : line + " " + word;
    }
  }
  if (line !== prefix) lines.push(line);
  return lines.join("\n");
}

const DIVIDER = "# " + "=".repeat(76);
const THIN    = "# " + "-".repeat(76);

function section(title: string): string {
  return `${DIVIDER}\n# ${title}\n${DIVIDER}`;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generatePythonOdeTemplate(input: PythonGeneratorInput): string {
  const {
    title,
    projectName,
    providerUsed,
    systemType,
    equations,
    variables,
    parameters,
    assumptions,
    raw,
    report,
    unitReport,
    templateResult,
  } = input;

  const stateVars   = variables.filter((v) => v.role === "state");
  const otherVars   = variables.filter((v) => v.role !== "state");
  const dateStr     = new Date().toISOString().slice(0, 10);
  const readiness   = report.simulation_readiness;
  const readyLabel  = readiness === "ready" ? "Simulation Ready" : readiness === "partial" ? "Partial — review TODOs" : "Not Ready — see warnings";
  const highCount   = unitReport.warnings.filter((w) => w.severity === "high").length;
  const medCount    = unitReport.warnings.filter((w) => w.severity === "medium").length;

  const parts: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  const tmplStatusLabel = templateResult
    ? templateResult.status === "full"
      ? "full — all equations runnable"
      : templateResult.status === "partial"
      ? `partial — ${templateResult.runnableCount}/${templateResult.totalEquations} equations runnable`
      : "scaffold only — no equations matched a supported template"
    : "not computed";

  parts.push(`${DIVIDER}
# ChemAI Model Compiler — Generated Python ODE Template
${DIVIDER}
# Title       : ${title}
# Project     : ${projectName}
# System type : ${safeStr(systemType) || "unspecified"}
# Provider    : ${providerUsed}
# Generated   : ${dateStr}
#
# Reproducibility score   : ${report.overall_score}/100  (${readyLabel})
# Unit check status       : ${unitReport.unit_check_status}  (${highCount} high, ${medCount} medium)
# Runnable template status: ${tmplStatusLabel}
${DIVIDER}
#
# IMPORTANT: This template was auto-generated from extracted model data.
#   - Review ALL TODO comments before running.
#   - Equations marked "# TODO: implement" were not matched to a supported
#     template and must be translated manually.
#   - Parameter values come from the source document — verify units.
#   - Do NOT treat this as a verified simulation without expert review.
#`);

  // Readiness warning banner
  if (readiness !== "ready") {
    parts.push(`#
# ⚠  WARNING — simulation readiness: ${readiness.toUpperCase()}
#   The following blockers were identified:`);
    for (const b of report.main_blockers.slice(0, 6)) {
      parts.push(wrapComment(b, "#     • "));
    }
    parts.push(`#
# Fix the above before trusting simulation output.
#`);
  }
  if (highCount > 0) {
    parts.push(`#
# ⚠  ${highCount} HIGH-SEVERITY UNIT ISSUE(S) DETECTED — check Unit Check tab.
#`);
  }
  parts.push(DIVIDER);

  // ── Imports ───────────────────────────────────────────────────────────────
  parts.push(`
${section("IMPORTS")}

import numpy as np
from scipy.integrate import solve_ivp
import matplotlib.pyplot as plt
`);

  // ── Parameters dict ───────────────────────────────────────────────────────
  parts.push(section("PARAMETERS"));
  parts.push(`# Source: ${projectName}`);
  parts.push(`# Verify each value against the source document before simulation.\n`);
  parts.push(`params = {`);

  // Build a width-aligned table inside the dict
  const maxSymLen = Math.max(4, ...parameters.map((p) => p.symbol.length)) + 2;

  const hasMissing = parameters.some((p) => toNumber(p.value) === null);
  if (hasMissing) {
    parts.push(`    # ── Extracted values (from source) ──────────────────────────────`);
  }

  for (const p of parameters) {
    const sym  = `"${p.symbol}"`;
    const val  = pyValue(p.value, "None  # TODO: specify numeric value");
    const unit = p.unit ? `[${p.unit}]` : "[unit unknown — TODO]";
    const conf = p.confidence ? ` confidence: ${p.confidence}` : "";
    parts.push(`    ${pad(sym + ":", maxSymLen + 3)} ${pad(val + ",", 12)} # ${unit}${conf}`);
  }

  if (hasMissing) {
    parts.push(`    # ── TODO: add any missing parameters from the source document ──`);
  }
  parts.push(`}\n`);

  // ── State variables & initial conditions ─────────────────────────────────
  parts.push(section("STATE VARIABLES & INITIAL CONDITIONS"));
  parts.push(`#`);
  parts.push(`# ${pad("Symbol", 10)} ${pad("Name", 30)} ${pad("Unit", 12)} Role`);
  parts.push(`# ${"-".repeat(68)}`);
  for (const v of stateVars) {
    const unit = v.unit ? v.unit : "TODO";
    parts.push(`# ${pad(v.symbol, 10)} ${pad(v.name ?? v.symbol, 30)} ${pad(unit, 12)} state`);
  }
  for (const v of otherVars) {
    const unit = v.unit ? v.unit : "TODO";
    parts.push(`# ${pad(v.symbol, 10)} ${pad(v.name ?? v.symbol, 30)} ${pad(unit, 12)} ${v.role}`);
  }
  parts.push(`#\n`);

  parts.push(`# Initial state vector: [${stateVars.map((v) => v.symbol).join(", ")}]`);
  parts.push(`y0 = [`);
  for (let i = 0; i < stateVars.length; i++) {
    const v    = stateVars[i];
    const unit = v.unit ? `[${v.unit}]` : "[unit unknown]";
    // Look for an initial condition value in raw state_variables
    const rawSv = raw?.state_variables?.find(
      (r) => safeStr(r.symbol).toLowerCase() === v.symbol.toLowerCase()
    );
    const ic = rawSv ? pyValue((rawSv as Record<string, unknown>)["initial_condition"], "None") : "None";
    const icStr = ic !== "None" ? ic : "0.0  # TODO: set from experiment";
    const comma = i < stateVars.length - 1 ? "," : "";
    parts.push(`    ${icStr}${comma}  # ${v.symbol} ${unit}`);
  }
  if (stateVars.length === 0) {
    parts.push(`    # TODO: no state variables extracted — add initial conditions`);
  }
  parts.push(`]\n`);

  // ── Extracted equations (as comments) ────────────────────────────────────
  parts.push(section("EXTRACTED EQUATIONS  (shown as reference comments)"));
  parts.push(`# Translate each equation to Python in the ode_model() function below.`);
  parts.push(`# Do NOT assume the LaTeX notation maps directly to Python operators.\n`);

  const rawEqs = raw?.equations ?? [];
  for (let i = 0; i < rawEqs.length; i++) {
    const eq = rawEqs[i];
    const label = safeStr(eq.label) || `Equation ${i + 1}`;
    const latex = safeStr(eq.equation_latex);
    const plain = safeStr(eq.equation_plaintext);
    const syms  = eq.variables_involved?.filter(Boolean) ?? [];
    const src   = safeStr(eq.source_context);
    parts.push(`# Eq ${i + 1} — ${label}`);
    if (latex) parts.push(`#   LaTeX : ${latex}`);
    if (plain && plain !== latex) parts.push(`#   Plain : ${plain}`);
    if (syms.length) parts.push(`#   Symbols: ${syms.join(", ")}`);
    if (src) {
      parts.push(wrapComment(src, "#   Source: "));
    }
    parts.push(`#`);
  }

  // Fall back to normalized equations if no raw data
  if (rawEqs.length === 0) {
    for (let i = 0; i < equations.length; i++) {
      const eq = equations[i];
      parts.push(`# Eq ${i + 1} — ${eq.description || "(no description)"}`);
      if (eq.latex) parts.push(`#   LaTeX: ${eq.latex}`);
      parts.push(`#`);
    }
    if (equations.length === 0) {
      parts.push(`# TODO: no equations were extracted — add equation details.\n`);
    }
  }
  parts.push(``);

  // ── ODE function ──────────────────────────────────────────────────────────
  parts.push(section("ODE FUNCTION"));

  const stateArgList = stateVars.map((v, i) => `y[${i}]  # ${v.symbol}`).join(", ");
  const funcArgs = stateVars.length > 0 ? stateArgList : "# TODO: unpack state";

  parts.push(`def ode_model(t: float, y: list, params: dict) -> list:`);
  parts.push(`    """
    ODE model: ${title}
    System type: ${safeStr(systemType) || "unspecified"}

    State vector (${stateVars.length} variable${stateVars.length !== 1 ? "s" : ""}):`);
  for (let i = 0; i < stateVars.length; i++) {
    const v = stateVars[i];
    const unit = v.unit ? `[${v.unit}]` : "[unit unknown]";
    parts.push(`      y[${i}] = ${pad(v.symbol, 6)} ${unit}  ${v.name ?? ""}`);
  }
  if (stateVars.length === 0) {
    parts.push(`      (none extracted — add state variables)`);
  }
  parts.push(`
    Parameters: see \`params\` dict above.
    """`);

  // Unpack state vector
  if (stateVars.length > 0) {
    parts.push(`\n    # ── Unpack state vector ────────────────────────────────────────────`);
    for (let i = 0; i < stateVars.length; i++) {
      const v    = stateVars[i];
      const unit = v.unit ? `# [${v.unit}]` : "# [unit unknown]";
      parts.push(`    ${v.symbol} = y[${i}]  ${unit}`);
    }
  }

  // Unpack parameters
  if (parameters.length > 0) {
    parts.push(`\n    # ── Unpack parameters ──────────────────────────────────────────────`);
    for (const p of parameters) {
      const unit = p.unit ? `# [${p.unit}]` : "# [unit unknown]";
      parts.push(`    ${pad(p.symbol, maxSymLen)} = params["${p.symbol}"]  ${unit}`);
    }
  }

  // Equation stubs
  const eqsToShow = rawEqs.length > 0 ? rawEqs : equations.map((e) => ({
    label: e.description,
    equation_latex: e.latex,
    equation_plaintext: "",
    variables_involved: [] as string[],
  }));

  if (eqsToShow.length > 0) {
    parts.push(`\n    # ── Intermediate calculations ──────────────────────────────────────`);
    for (let i = 0; i < eqsToShow.length; i++) {
      const eq = eqsToShow[i];
      const latex = safeStr(eq.equation_latex);
      const plain = safeStr(eq.equation_plaintext);
      const isDerivative = /d[A-Za-z]+\s*\/\s*dt/.test(latex) || /d[A-Za-z]+\s*\/\s*dt/.test(plain);
      if (!isDerivative) {
        const label = safeStr(eq.label) || `Eq ${i + 1}`;
        // Check if this equation was matched by a template
        const eqNorm = normalizeEqText(latex || plain);
        const tmplMatch = templateResult?.matched.find(
          (m) => normalizeEqText(m.originalEquation) === eqNorm,
        );
        parts.push(`    # ${THIN.replace("# ", "")} `);
        parts.push(`    # Eq ${i + 1} — ${label}`);
        if (tmplMatch && tmplMatch.isRunnable) {
          parts.push(`    # Template: ${tmplMatch.templateLabel}`);
          parts.push(`    ${tmplMatch.pythonCode}`);
        } else if (tmplMatch && !tmplMatch.isRunnable) {
          parts.push(`    # Template: ${tmplMatch.templateLabel}  (missing: ${tmplMatch.missingSymbols.join(", ")})`);
          if (latex) parts.push(`    # TODO: implement: ${latex}`);
          const lhs = extractLhsSymbol(latex || plain);
          parts.push(`    ${lhs ?? "result"} = 0.0  # TODO: add missing symbols first`);
        } else {
          if (latex) parts.push(`    # TODO: implement: ${latex}`);
          const lhs = extractLhsSymbol(latex || plain);
          parts.push(`    ${lhs ?? "result"} = 0.0  # TODO: translate from equation above`);
        }
      }
    }

    parts.push(`\n    # ── Derivatives ─────────────────────────────────────────────────────`);
    for (let i = 0; i < stateVars.length; i++) {
      const v     = stateVars[i];
      const dname = `d${v.symbol}dt`;
      // Check if template matcher provided a runnable derivative for this state var
      const tmplDeriv = templateResult?.derivatives.find(
        (d) => d.stateSym.toLowerCase() === v.symbol.toLowerCase(),
      );
      if (tmplDeriv && tmplDeriv.isRunnable && tmplDeriv.pythonLine) {
        const refEq = tmplDeriv.comment.length > 80
          ? tmplDeriv.comment.slice(0, 80) + "…"
          : tmplDeriv.comment;
        parts.push(`    # d${v.symbol}/dt — ${tmplDeriv.templateLabel}`);
        parts.push(`    # Equation: ${refEq}`);
        parts.push(`    ${tmplDeriv.pythonLine}`);
      } else if (tmplDeriv && !tmplDeriv.isRunnable) {
        // Matched but incomplete — show partial info
        const matchEq = eqsToShow.find((eq) => {
          const text = safeStr(eq.equation_latex) + " " + safeStr(eq.equation_plaintext);
          return new RegExp(`d${v.symbol}\\s*\\/\\s*dt`, "i").test(text);
        });
        parts.push(`    # d${v.symbol}/dt — ${tmplDeriv.templateLabel}  (missing: ${tmplDeriv.missingSymbols.join(", ")})`);
        if (matchEq) parts.push(`    # Equation: ${safeStr(matchEq.equation_latex) || safeStr(matchEq.label)}`);
        parts.push(`    ${dname} = 0.0  # TODO: add missing symbols: ${tmplDeriv.missingSymbols.join(", ")}`);
      } else {
        // No template matched — honest scaffold
        const matchEq = eqsToShow.find((eq) => {
          const text = safeStr(eq.equation_latex) + " " + safeStr(eq.equation_plaintext);
          return new RegExp(`d${v.symbol}\\s*\\/\\s*dt`, "i").test(text);
        });
        const comment = matchEq
          ? `# d${v.symbol}/dt — see Eq: ${safeStr(matchEq.equation_latex) || safeStr(matchEq.label)}`
          : `# d${v.symbol}/dt — TODO: no matching equation found`;
        parts.push(`    ${comment}`);
        parts.push(`    ${dname} = 0.0  # TODO: implement`);
      }
    }
    if (stateVars.length === 0) {
      parts.push(`    # TODO: add derivative calculations for each state variable`);
      parts.push(`    d_dt = [0.0]  # TODO`);
    }
  } else {
    parts.push(`\n    # TODO: No equations extracted. Add intermediate calculations here.\n`);
    parts.push(`    # TODO: No state variables extracted. Add derivative calculations here.`);
    parts.push(`    d_dt = []  # TODO`);
  }

  parts.push(``);
  const returnVal = stateVars.length > 0
    ? `[${stateVars.map((v) => `d${v.symbol}dt`).join(", ")}]`
    : `d_dt  # TODO`;
  parts.push(`    return ${returnVal}\n`);

  // ── Simulation ────────────────────────────────────────────────────────────
  parts.push(section("SIMULATION"));
  const timeUnit = inferTimeUnit(parameters, variables);
  parts.push(`
# Adjust t_span to match your experimental duration.
t_span = (0, 100)   # (start, end) in ${timeUnit}
t_eval = np.linspace(*t_span, 500)

sol = solve_ivp(
    ode_model,
    t_span,
    y0,
    args=(params,),
    t_eval=t_eval,
    method="RK45",
    rtol=1e-6,
    atol=1e-9,
    dense_output=False,
)

if not sol.success:
    raise RuntimeError(f"ODE solver failed: {sol.message}")

print(f"Simulation complete. t = {sol.t[0]:.2f} → {sol.t[-1]:.2f} {timeUnit} ({len(sol.t)} points)")
`);

  // ── Plotting ──────────────────────────────────────────────────────────────
  parts.push(section("PLOTTING"));
  const colors = ["'#0d9488'", "'#f97316'", "'#3b82f6'", "'#ef4444'", "'#8b5cf6'"];
  const nVars = stateVars.length || 1;

  parts.push(`
fig, axes = plt.subplots(${nVars}, 1, figsize=(10, ${3 * nVars + 1}), sharex=True)
axes = [axes] if ${nVars} == 1 else list(axes)
`);
  for (let i = 0; i < stateVars.length; i++) {
    const v     = stateVars[i];
    const unit  = v.unit ? ` [{v.unit}]` : "";
    const color = colors[i % colors.length];
    parts.push(`axes[${i}].plot(sol.t, sol.y[${i}], color=${color}, linewidth=2, label="${v.symbol}")`);
    parts.push(`axes[${i}].set_ylabel("${v.symbol}${unit}")`);
    parts.push(`axes[${i}].legend(loc="upper right")`);
    parts.push(`axes[${i}].grid(True, alpha=0.3)`);
  }
  if (stateVars.length === 0) {
    parts.push(`# TODO: plot sol.y[i] for each state variable`);
    parts.push(`axes[0].plot(sol.t, sol.y[0], color='teal', label='State 0')`);
    parts.push(`axes[0].set_ylabel("State [unit]")`);
  }
  parts.push(``);
  parts.push(`axes[-1].set_xlabel("Time [${timeUnit}]")`);
  parts.push(`fig.suptitle("${title.replace(/"/g, '\\"')}", fontsize=13, fontweight="bold")`);
  parts.push(`plt.tight_layout()`);
  parts.push(`plt.savefig("model_simulation.png", dpi=150, bbox_inches="tight")`);
  parts.push(`plt.show()`);
  parts.push(``);

  // ── Missing information notes ─────────────────────────────────────────────
  const criticalItems = report.missing_items.filter((m) => m.severity === "critical");
  const warnItems     = report.missing_items.filter((m) => m.severity === "warning");
  if (criticalItems.length > 0 || warnItems.length > 0 || report.recommended_next_steps.length > 0) {
    parts.push(section("MISSING INFORMATION NOTES  (from reproducibility analysis)"));
    if (criticalItems.length > 0) {
      parts.push(`# CRITICAL — must resolve before simulation:`);
      for (const item of criticalItems) {
        parts.push(wrapComment(`[${item.category}] ${item.description}`, "#   • "));
      }
    }
    if (warnItems.length > 0) {
      parts.push(`#\n# WARNINGS:`);
      for (const item of warnItems.slice(0, 5)) {
        parts.push(wrapComment(`[${item.category}] ${item.description}`, "#   • "));
      }
    }
    if (report.recommended_next_steps.length > 0) {
      parts.push(`#\n# Recommended next steps:`);
      for (const step of report.recommended_next_steps) {
        parts.push(wrapComment(step, "#   • "));
      }
    }
    parts.push(``);
  }

  // ── Unit check warnings ───────────────────────────────────────────────────
  const importantWarnings = unitReport.warnings.filter(
    (w) => w.severity === "high" || w.severity === "medium"
  );
  if (importantWarnings.length > 0) {
    parts.push(section("UNIT CHECK WARNINGS  (heuristic — verify manually)"));
    for (const w of importantWarnings) {
      const tag = w.severity === "high" ? "HIGH  " : "MEDIUM";
      parts.push(`# [${tag}] ${w.message}`);
      if (w.suggestion) {
        parts.push(wrapComment(w.suggestion, "#         ↳ "));
      }
    }
    parts.push(``);
  }

  // ── Assumptions ───────────────────────────────────────────────────────────
  if (assumptions.filter((a) => a.kind === "assumption").length > 0) {
    parts.push(section("MODEL ASSUMPTIONS  (extracted from source)"));
    for (const a of assumptions.filter((a2) => a2.kind === "assumption")) {
      parts.push(wrapComment(a.text, "# • "));
    }
    parts.push(``);
  }

  return parts.join("\n");
}

// ─── Utility: extract likely LHS symbol from a LaTeX/plain equation ──────────

function extractLhsSymbol(expr: string): string | null {
  if (!expr) return null;
  // Match "symbol = ..." or "symbol: ..."
  const m = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[=:]/);
  if (m) return m[1];
  // Match "\frac{dX}{dt}" → skip — this is a derivative
  if (/d[A-Za-z]+\s*\/\s*dt/.test(expr)) return null;
  return null;
}

// ─── Utility: infer the dominant time unit across params & variables ──────────

function inferTimeUnit(params: AnalysisParameter[], vars: AnalysisVariable[]): string {
  const all = [...params.map((p) => safeStr(p.unit)), ...vars.map((v) => safeStr(v.unit))];
  const joined = all.join(" ");
  if (/\/h\b|per.h\b|h\^{?-1}|1\/h/.test(joined)) return "h";
  if (/\/d\b|per.d\b|\/day/.test(joined)) return "d";
  if (/\/min\b|per.min/.test(joined)) return "min";
  if (/\/s\b|per.s\b|1\/s/.test(joined)) return "s";
  return "h";  // sensible default for bioengineering models
}
