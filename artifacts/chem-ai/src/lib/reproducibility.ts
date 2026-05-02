/**
 * Reproducibility Analysis Engine
 *
 * Pure TypeScript, client-side only — no server calls, no AI calls.
 * Analyzes already-extracted model data and returns a structured report.
 *
 * Conservative by design: marks items as missing/uncertain unless they are
 * explicitly present. Does not hallucinate values.
 */

// ─── Input types (mirrors normalized DB rows + raw_extraction_json shape) ────

export interface AnalysisEquation {
  id: number;
  latex: string;
  description: string;
  sourceQuote: string;
}

export interface AnalysisVariable {
  id: number;
  symbol: string;
  name: string;
  unit?: string | null | undefined;
  role: string;
  sourceQuote: string;
}

export interface AnalysisParameter {
  id: number;
  symbol: string;
  value?: string | null | undefined;
  unit?: string | null | undefined;
  confidence: string;
  sourceQuote: string;
}

export interface AnalysisAssumption {
  id: number;
  text: string;
  kind: string;
}

export interface RawEqEntry {
  label?: string;
  equation_latex?: string;
  equation_plaintext?: string;
  meaning?: string;
  variables_involved?: string[];
  source_context?: string;
  confidence?: string;
}

export interface RawVarEntry {
  symbol?: string;
  name?: string;
  unit?: string;
  role?: string;
  source_context?: string;
  confidence?: string;
}

export interface RawParamEntry {
  symbol?: string;
  name?: string;
  value?: string;
  unit?: string;
  source_context?: string;
  confidence?: string;
}

export interface RawAssumptionEntry {
  assumption?: string;
  source_context?: string;
  confidence?: string;
}

export interface RawLimitationEntry {
  limitation?: string;
  source_context?: string;
  confidence?: string;
}

export interface RawModelCardEntry {
  short_summary?: string;
  model_type?: string;
  inputs?: string[];
  outputs?: string[];
  control_variables?: string[];
  missing_information?: string[];
  can_generate_ode_template?: boolean;
}

export interface RawExtractionInput {
  paper_title_or_topic?: string;
  system_type?: string;
  process_description?: string;
  state_variables?: RawVarEntry[];
  parameters?: RawParamEntry[];
  equations?: RawEqEntry[];
  assumptions?: RawAssumptionEntry[];
  limitations?: RawLimitationEntry[];
  model_card?: RawModelCardEntry;
}

/** Alias so consumer modules can import a single `RawExtraction` type. */
export type RawExtraction = RawExtractionInput;

// ─── Output types ─────────────────────────────────────────────────────────────

export type MissingSeverity = "critical" | "warning" | "info";

export interface MissingItem {
  severity: MissingSeverity;
  category: string;
  description: string;
}

export interface ReproducibilityReport {
  overall_score: number;
  equations_completeness: number;
  parameters_completeness: number;
  units_completeness: number;
  initial_conditions_completeness: number;
  source_traceability: number;
  simulation_readiness: "ready" | "partial" | "not_ready";
  main_blockers: string[];
  recommended_next_steps: string[];
  missing_items: MissingItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(count: number, total: number): number {
  if (total === 0) return 0;
  return (count / total) * 100;
}

/** Returns true only if the value is a non-empty, non-placeholder string.
 *  Accepts `unknown` so it is safe against runtime non-string API values. */
function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const t = String(v).trim().toLowerCase();
  return (
    t !== "" &&
    t !== "unknown" &&
    t !== "n/a" &&
    t !== "—" &&
    t !== "-" &&
    t !== "null" &&
    t !== "none"
  );
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

// ─── Main analysis function ───────────────────────────────────────────────────

export function analyzeReproducibility(
  equations: AnalysisEquation[],
  variables: AnalysisVariable[],
  parameters: AnalysisParameter[],
  assumptions: AnalysisAssumption[],
  raw: RawExtractionInput | null | undefined,
  systemDescription: string,
  problemStatement: string,
  odeTemplate: string
): ReproducibilityReport {
  const missing: MissingItem[] = [];
  const blockers: string[] = [];
  const nextSteps: string[] = [];

  // Build a single corpus of all text for keyword checks
  const corpus = [
    systemDescription,
    problemStatement,
    odeTemplate,
    JSON.stringify(raw ?? {}),
  ]
    .join(" ")
    .toLowerCase();

  // ═══════════════════════════════════════════════════════
  // 1. EQUATIONS COMPLETENESS (0-100)
  // ═══════════════════════════════════════════════════════
  let eqScore = 0;

  if (equations.length === 0) {
    missing.push({
      severity: "critical",
      category: "Equations",
      description:
        "No governing equations were extracted from the source material.",
    });
    blockers.push("No governing equations extracted");
  } else {
    // 30 pts for having any equations
    eqScore += 30;

    const withLatex = equations.filter((e) => hasValue(e.latex));
    const withDesc = equations.filter((e) => hasValue(e.description));
    const withSource = equations.filter((e) => hasValue(e.sourceQuote));

    eqScore += pct(withLatex.length, equations.length) * 0.35;
    eqScore += pct(withDesc.length, equations.length) * 0.20;
    eqScore += pct(withSource.length, equations.length) * 0.15;

    const noLatex = equations.length - withLatex.length;
    if (noLatex > 0) {
      missing.push({
        severity: "warning",
        category: "Equations",
        description: `${noLatex} equation(s) are missing LaTeX notation — may be unreadable for simulation.`,
      });
    }
    const noDesc = equations.length - withDesc.length;
    if (noDesc > 0) {
      missing.push({
        severity: "info",
        category: "Equations",
        description: `${noDesc} equation(s) are missing a descriptive meaning.`,
      });
    }
    const noSource = equations.length - withSource.length;
    if (noSource > 0) {
      missing.push({
        severity: "info",
        category: "Equations",
        description: `${noSource} equation(s) lack a source quote — traceability reduced.`,
      });
    }
  }
  eqScore = Math.min(100, Math.round(eqScore));

  // ═══════════════════════════════════════════════════════
  // 2. PARAMETERS COMPLETENESS (0-100)
  // ═══════════════════════════════════════════════════════
  let paramScore = 0;

  if (parameters.length === 0) {
    missing.push({
      severity: "critical",
      category: "Parameters",
      description: "No model parameters were extracted from the source.",
    });
    blockers.push("No model parameters extracted");
  } else {
    // 20 pts for having any parameters
    paramScore += 20;

    const withValue = parameters.filter((p) => hasValue(p.value));
    const withUnit = parameters.filter((p) => hasValue(p.unit));
    const withSource = parameters.filter((p) => hasValue(p.sourceQuote));

    paramScore += pct(withValue.length, parameters.length) * 0.40;
    paramScore += pct(withUnit.length, parameters.length) * 0.25;
    paramScore += pct(withSource.length, parameters.length) * 0.15;

    const noValue = parameters.filter((p) => !hasValue(p.value));
    if (noValue.length > 0) {
      missing.push({
        severity: "critical",
        category: "Parameters",
        description: `${noValue.length} parameter(s) have no numerical value: ${noValue.map((p) => p.symbol).join(", ")}.`,
      });
      blockers.push(
        `${noValue.length} parameter(s) missing numerical values (${noValue.map((p) => p.symbol).join(", ")})`
      );
    }

    const noUnit = parameters.filter((p) => !hasValue(p.unit));
    if (noUnit.length > 0) {
      missing.push({
        severity: "warning",
        category: "Parameters",
        description: `${noUnit.length} parameter(s) have no unit: ${noUnit.map((p) => p.symbol).join(", ")}.`,
      });
    }

    const lowConf = parameters.filter((p) => p.confidence === "low");
    if (lowConf.length > 0) {
      missing.push({
        severity: "info",
        category: "Parameters",
        description: `${lowConf.length} parameter(s) have low extraction confidence: ${lowConf.map((p) => p.symbol).join(", ")}. Verify against source.`,
      });
    }
  }
  paramScore = Math.min(100, Math.round(paramScore));

  // ═══════════════════════════════════════════════════════
  // 3. UNITS COMPLETENESS (0-100)
  // ═══════════════════════════════════════════════════════
  let unitsScore = 0;

  const varsWithUnit = variables.filter((v) => hasValue(v.unit));
  const paramsWithUnit = parameters.filter((p) => hasValue(p.unit));

  if (variables.length > 0) {
    unitsScore += pct(varsWithUnit.length, variables.length) * 0.5;
    const missing_var_syms = variables
      .filter((v) => !hasValue(v.unit))
      .map((v) => v.symbol);
    if (missing_var_syms.length > 0) {
      missing.push({
        severity: "warning",
        category: "Units",
        description: `${missing_var_syms.length} variable(s) have no unit: ${missing_var_syms.join(", ")}.`,
      });
    }
  } else {
    // No variables means units cannot be verified
    unitsScore += 0;
  }

  if (parameters.length > 0) {
    unitsScore += pct(paramsWithUnit.length, parameters.length) * 0.5;
  }

  // Time unit check
  const mentionsTime = /\b(time|hour|day|minute|second|t\s*=|d\/dt|dxdt)\b/.test(corpus);
  const hasTimeUnit = /\b(h\b|hr\b|hours?\b|days?\b|min\b|seconds?\b|s\b)/.test(corpus);
  if (mentionsTime && !hasTimeUnit) {
    missing.push({
      severity: "warning",
      category: "Units",
      description:
        "Time is referenced but explicit time units (h, min, days) were not found. The d/dt dimension is ambiguous.",
    });
    unitsScore = Math.max(0, unitsScore - 10);
  }

  unitsScore = Math.min(100, Math.round(unitsScore));

  // ═══════════════════════════════════════════════════════
  // 4. INITIAL CONDITIONS COMPLETENESS (0-100)
  // ═══════════════════════════════════════════════════════
  let icScore = 0;

  const stateVars = variables.filter((v) => v.role === "state");

  // Patterns that indicate initial conditions are documented
  const icPattern =
    /\b(initial\s*(condition|value|concentration|biomass|substrate|state|population)|x_?0|s_?0|c_?0|x\(0\)|s\(0\)|at\s*t\s*=\s*0|t0\s*=)\b/;
  const mentionsIC = icPattern.test(corpus);

  // Patterns for boundary / input conditions
  const boundaryPattern =
    /\b(boundary|inlet|feed|dilution|influent|input\s*concentration|D\s*=|s_?in\b|sin\b|c_?in\b|cin\b)\b/;
  const mentionsBoundary = boundaryPattern.test(corpus);

  if (stateVars.length === 0 && variables.length === 0) {
    missing.push({
      severity: "critical",
      category: "Initial Conditions",
      description:
        "No state variables were identified. Initial conditions cannot be determined or verified.",
    });
    blockers.push("No state variables identified — initial conditions unknown");
  } else {
    icScore += 25; // partial credit for having state variables

    if (mentionsIC) {
      icScore += 45;
    } else {
      missing.push({
        severity: "critical",
        category: "Initial Conditions",
        description:
          "Initial values for state variables (e.g. X₀, S₀) were not found in the source. Simulation requires explicit starting conditions.",
      });
      blockers.push("Initial conditions (X₀, S₀, …) not explicitly stated");
    }

    if (mentionsBoundary) {
      icScore += 30;
    } else {
      missing.push({
        severity: "warning",
        category: "Initial Conditions",
        description:
          "Input / boundary conditions (feed concentration, dilution rate, inlet flows) are not clearly stated in the extracted text.",
      });
    }
  }

  icScore = Math.min(100, Math.round(icScore));

  // ═══════════════════════════════════════════════════════
  // 5. SOURCE TRACEABILITY (0-100)
  // ═══════════════════════════════════════════════════════
  let traceScore = 0;

  if (equations.length > 0) {
    const eqTrace = equations.filter((e) => hasValue(e.sourceQuote));
    traceScore += pct(eqTrace.length, equations.length) * 35;
  } else {
    traceScore += 0;
  }
  if (variables.length > 0) {
    const varTrace = variables.filter((v) => hasValue(v.sourceQuote));
    traceScore += pct(varTrace.length, variables.length) * 30;
  }
  if (parameters.length > 0) {
    const paramTrace = parameters.filter((p) => hasValue(p.sourceQuote));
    traceScore += pct(paramTrace.length, parameters.length) * 35;
  }

  traceScore = Math.min(100, Math.round(traceScore));

  // ═══════════════════════════════════════════════════════
  // DOMAIN-SPECIFIC CHECKS
  // ═══════════════════════════════════════════════════════

  // Kinetic constants check
  const mentionsKinetics = /\b(monod|michaelis|menten|mu_?max|ks\b|km\b|half.saturation|growth rate)\b/.test(corpus);
  if (mentionsKinetics) {
    const hasKinetic = parameters.some((p) =>
      /mu_?max|mumax|k_?s|k_?m/i.test(p.symbol)
    );
    if (!hasKinetic) {
      missing.push({
        severity: "warning",
        category: "Kinetic Constants",
        description:
          "System mentions Monod / Michaelis-Menten kinetics but no kinetic constants (μmax, Ks) were found in the extracted parameters.",
      });
    }
  }

  // Yield coefficients check
  const mentionsYield = /\b(yield|y_?xs|y_?px|y_?po|yield coefficient|stoichiometr)\b/.test(corpus);
  if (!mentionsYield && equations.length > 0) {
    missing.push({
      severity: "info",
      category: "Stoichiometry",
      description:
        "No yield coefficients (Yxs, Ypx) were identified. Mass balance closure may be incomplete.",
    });
  }

  // Gas transfer parameters
  const mentionsGas = /\b(oxygen|o2|co2|aeration|gas.transfer|kla|k_la|henry|gas.liquid|dissolved oxygen)\b/.test(corpus);
  if (mentionsGas) {
    const hasGasParam = parameters.some((p) =>
      /kla|k_la|henry|kh|h_cc|alpha|o2/i.test(p.symbol)
    );
    if (!hasGasParam) {
      missing.push({
        severity: "warning",
        category: "Gas Transfer",
        description:
          "System mentions gas/liquid interactions (O₂, CO₂, or aeration) but no gas-transfer parameters (kLa, Henry's constant) were extracted.",
      });
    }

    const mentionsHenry = /henry|gas.liquid.equilibrium|h_cc|h_cp/.test(corpus);
    if (mentionsHenry) {
      missing.push({
        severity: "info",
        category: "Gas Transfer",
        description:
          "Henry's law is referenced. Confirm which convention is used (H = p/C or H = C_gas/C_liq) and verify the units match your ODE formulation.",
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // SYMBOL CROSS-REFERENCE CHECKS
  // ═══════════════════════════════════════════════════════

  if (
    equations.length > 0 &&
    (variables.length > 0 || parameters.length > 0)
  ) {
    const knownSymbols = new Set([
      ...variables.map((v) => v.symbol.toLowerCase()),
      ...parameters.map((p) => p.symbol.toLowerCase()),
    ]);

    // Symbols in equations (from raw variables_involved) not in known set
    const rawEqs = raw?.equations ?? [];
    const undefinedSymbols: string[] = [];
    for (const eq of rawEqs) {
      for (const sym of eq.variables_involved ?? []) {
        const s = sym.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (s.length > 0 && !knownSymbols.has(s)) {
          undefinedSymbols.push(sym);
        }
      }
    }
    if (undefinedSymbols.length > 0) {
      const u = unique(undefinedSymbols);
      missing.push({
        severity: "warning",
        category: "Symbol Consistency",
        description: `${u.length} symbol(s) appear in equations but are not defined in the variables or parameters tables: ${u.slice(0, 8).join(", ")}${u.length > 8 ? "…" : ""}.`,
      });
    }

    // Parameters not found in any equation text
    const allEqText = [
      ...equations.map((e) => e.latex),
      ...(raw?.equations ?? []).map(
        (e) => (e.equation_latex ?? "") + " " + (e.equation_plaintext ?? "")
      ),
    ]
      .join(" ")
      .toLowerCase();

    const unusedParams = parameters.filter(
      (p) => !allEqText.includes(p.symbol.toLowerCase())
    );
    if (unusedParams.length > 0 && unusedParams.length <= parameters.length) {
      missing.push({
        severity: "info",
        category: "Symbol Consistency",
        description: `${unusedParams.length} parameter(s) not referenced in any extracted equation: ${unusedParams.map((p) => p.symbol).join(", ")}. They may be used in equations not yet extracted, or may be redundant.`,
      });
    }

    // State variables not found in any equation
    const unusedStateVars = stateVars.filter(
      (v) => !allEqText.includes(v.symbol.toLowerCase())
    );
    if (unusedStateVars.length > 0) {
      missing.push({
        severity: "warning",
        category: "Symbol Consistency",
        description: `${unusedStateVars.length} state variable(s) not referenced in any extracted equation: ${unusedStateVars.map((v) => v.symbol).join(", ")}. The extracted equations may be incomplete.`,
      });
    }
  }

  // Pull AI-identified missing information from the model card
  const providerMissing = raw?.model_card?.missing_information ?? [];
  for (const item of providerMissing) {
    // Avoid duplicate if already captured above
    const alreadyPresent = missing.some((m) =>
      m.description.toLowerCase().includes(item.toLowerCase().slice(0, 30))
    );
    if (!alreadyPresent) {
      missing.push({
        severity: "warning",
        category: "Provider-Identified",
        description: item,
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // OVERALL SCORE
  // ═══════════════════════════════════════════════════════

  const overall = Math.round(
    eqScore * 0.25 +
      paramScore * 0.25 +
      unitsScore * 0.20 +
      icScore * 0.20 +
      traceScore * 0.10
  );

  // ═══════════════════════════════════════════════════════
  // SIMULATION READINESS
  // ═══════════════════════════════════════════════════════

  let readiness: "ready" | "partial" | "not_ready";
  const criticalCount = missing.filter((m) => m.severity === "critical").length;

  if (overall >= 75 && criticalCount === 0) {
    readiness = "ready";
  } else if (overall >= 40 && criticalCount <= 1) {
    readiness = "partial";
  } else {
    readiness = "not_ready";
  }

  // ═══════════════════════════════════════════════════════
  // RECOMMENDED NEXT STEPS
  // ═══════════════════════════════════════════════════════

  if (eqScore < 60) {
    nextSteps.push(
      "Re-extract with more of the paper's methodology section included — particularly the equation listing and derivation."
    );
  }
  if (paramScore < 60) {
    nextSteps.push(
      "Locate the parameter table in the paper and add explicit numerical values and units for all kinetic constants."
    );
  }
  if (unitsScore < 60) {
    nextSteps.push(
      "Add units to all state variables and parameters to make the model dimensionally consistent."
    );
  }
  if (icScore < 60) {
    nextSteps.push(
      "Find the initial conditions section (X₀, S₀, C₀) and boundary conditions (feed, dilution rate) and include them explicitly."
    );
  }
  if (traceScore < 50) {
    nextSteps.push(
      "Add source quotes from the paper for each equation and parameter to improve traceability."
    );
  }
  if (mentionsGas) {
    nextSteps.push(
      "Verify that gas-transfer parameters (kLa, Henry's constant, units) are correctly captured and consistent with the ODE formulation."
    );
  }
  if (nextSteps.length === 0) {
    nextSteps.push(
      "Run the ODE simulation to verify numerical consistency and cross-check steady-state values against reported experimental data."
    );
  }

  // Sort missing items: critical → warning → info
  const severityOrder: Record<MissingSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  missing.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return {
    overall_score: overall,
    equations_completeness: eqScore,
    parameters_completeness: paramScore,
    units_completeness: unitsScore,
    initial_conditions_completeness: icScore,
    source_traceability: traceScore,
    simulation_readiness: readiness,
    main_blockers: blockers,
    recommended_next_steps: nextSteps,
    missing_items: missing,
  };
}
