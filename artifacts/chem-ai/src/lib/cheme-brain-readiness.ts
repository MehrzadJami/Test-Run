import type { ChemEBrainReport, SimulationSupport } from "@workspace/cheme-brain";
import { getParameterNumericValue } from "./parameter-values";
import type { SupportedSimulationModelType } from "./simulation-support";

export interface ChemEBrainReadinessParameter {
  symbol?: string | null;
  name?: string | null;
  value?: string | number | null;
  valueRaw?: string | null;
  valueNumeric?: number | null;
  value_numeric?: number | null;
  originalValue?: Record<string, unknown> | null;
}

export interface ChemEBrainReadinessEquation {
  latex?: string | null;
  plaintext?: string | null;
  equation_plaintext?: string | null;
  equation_latex?: string | null;
}

export interface ChemEBrainReadinessVariable {
  symbol?: string | null;
  name?: string | null;
  role?: string | null;
  sourceQuote?: string | null;
  originalValue?: Record<string, unknown> | null;
}

export interface ChemEBrainReadinessRaw {
  initial_conditions?: Array<{
    symbol?: string | null;
    state_symbol?: string | null;
    value?: string | number | null;
    value_numeric?: number | null;
  }>;
  state_variables?: Array<{
    symbol?: string | null;
    initial_condition?: unknown;
  }>;
}

export interface ChemEBrainReadinessInput {
  featureEnabled: boolean;
  report: ChemEBrainReport | null | undefined;
  legacySupportedModelType: SupportedSimulationModelType | null;
  parameters?: ChemEBrainReadinessParameter[] | null;
  equations?: ChemEBrainReadinessEquation[] | null;
  variables?: ChemEBrainReadinessVariable[] | null;
  raw?: ChemEBrainReadinessRaw | null;
}

export interface ChemEBrainReadinessDecision {
  authorityEnabled: boolean;
  verdict: SimulationSupport;
  canRunSimulation: boolean;
  canExportScaffold: boolean;
  runtimeModelType: SupportedSimulationModelType | null;
  reason: string;
  blockers: string[];
  whyItMatters: string;
  message: string;
}

const MONOD_REQUIRED_PARAMETERS = ["mumax", "Ks", "D", "Sin", "Yxs"] as const;
const MONOD_REQUIRED_EQUATIONS = ["mu", "dX/dt", "dS/dt"] as const;

export function decideChemEBrainSimulationReadiness(
  input: ChemEBrainReadinessInput,
): ChemEBrainReadinessDecision {
  const legacyDecision = legacyReadiness(input);
  if (!input.featureEnabled || !input.report) return legacyDecision;

  const report = input.report;
  const blockers = collectBlockers(report);
  const scaffoldAllowed = report.simulation_support.status !== "unsupported";

  if (report.canonical_model_type === "monod_chemostat") {
    const missing = missingMonodRuntimeEvidence(input);
    if (
      report.simulation_support.status === "runnable" &&
      input.legacySupportedModelType === "monod_chemostat" &&
      missing.length === 0
    ) {
      return {
        authorityEnabled: true,
        verdict: "runnable",
        canRunSimulation: true,
        canExportScaffold: true,
        runtimeModelType: "monod_chemostat",
        reason: report.simulation_support.reason,
        blockers: [],
        whyItMatters: "ChemE Brain found the source-backed Monod equations, parameters, and initial conditions required by the current simulator.",
        message: "ChemE Brain marks this Monod chemostat runnable with the current simulator.",
      };
    }
    return blockedDecision({
      report,
      verdict: report.simulation_support.status === "runnable" ? "supported_not_ready" : report.simulation_support.status,
      blockers: [...blockers, ...missing],
      canExportScaffold: true,
      reason: missing.length > 0
        ? "ChemE Brain found Monod evidence, but the current simulator cannot bind every required value/equation."
        : report.simulation_support.reason,
    });
  }

  if (report.canonical_model_type === "batch_culture") {
    if (
      report.simulation_support.status === "runnable" &&
      input.legacySupportedModelType === "batch_culture"
    ) {
      return {
        authorityEnabled: true,
        verdict: "runnable",
        canRunSimulation: true,
        canExportScaffold: true,
        runtimeModelType: "batch_culture",
        reason: report.simulation_support.reason,
        blockers: [],
        whyItMatters: "ChemE Brain and the existing tested batch solver both indicate the project can run.",
        message: "ChemE Brain marks this batch culture runnable with the current simulator.",
      };
    }
    return blockedDecision({
      report,
      verdict: report.simulation_support.status === "runnable" ? "supported_not_ready" : report.simulation_support.status,
      blockers,
      canExportScaffold: true,
      reason: "Batch culture simulation is blocked unless ChemE Brain and the existing tested solver both mark it runnable.",
    });
  }

  return blockedDecision({
    report,
    verdict: report.simulation_support.status,
    blockers,
    canExportScaffold: scaffoldAllowed,
    reason: report.simulation_support.reason,
  });
}

function legacyReadiness(input: ChemEBrainReadinessInput): ChemEBrainReadinessDecision {
  const canRun = input.legacySupportedModelType !== null;
  return {
    authorityEnabled: false,
    verdict: canRun ? "runnable" : "unsupported",
    canRunSimulation: canRun,
    canExportScaffold: true,
    runtimeModelType: input.legacySupportedModelType,
    reason: canRun
      ? "ChemE Brain readiness authority is disabled; using previous simulation-support behavior."
      : "ChemE Brain readiness authority is disabled and the previous simulation-support check did not find a supported runtime model.",
    blockers: canRun ? [] : ["Unsupported model type for the current simulator."],
    whyItMatters: "Feature flag is off, so ChemE Brain does not affect current readiness or simulation behavior.",
    message: canRun
      ? "Simulation is allowed by the previous simulation-support behavior."
      : "Runnable simulation is not available because the current simulator does not support this project-backed model.",
  };
}

function blockedDecision({
  report,
  verdict,
  blockers,
  canExportScaffold,
  reason,
}: {
  report: ChemEBrainReport;
  verdict: SimulationSupport;
  blockers: string[];
  canExportScaffold: boolean;
  reason: string;
}): ChemEBrainReadinessDecision {
  const uniqueBlockers = unique(blockers).slice(0, 6);
  const blockerText = uniqueBlockers.length > 0
    ? uniqueBlockers.join("; ")
    : reason;
  return {
    authorityEnabled: true,
    verdict,
    canRunSimulation: false,
    canExportScaffold,
    runtimeModelType: null,
    reason,
    blockers: uniqueBlockers,
    whyItMatters: "The current simulator should only run when source-backed equations, parameters, conventions, and initial conditions satisfy a supported template.",
    message: `Simulation is blocked because ${blockerText}. You can still export the scaffold/model package.`,
  };
}

function collectBlockers(report: ChemEBrainReport): string[] {
  const missing = report.missing_requirements
    .filter((item) => item.severity === "critical" || item.category === "initial_condition")
    .map((item) => item.item);
  if (missing.length > 0) return missing;
  if (report.simulation_support.status !== "runnable") return [report.simulation_support.reason];
  return [];
}

function missingMonodRuntimeEvidence(input: ChemEBrainReadinessInput): string[] {
  const missing: string[] = [];
  for (const symbol of MONOD_REQUIRED_PARAMETERS) {
    if (!hasNumericParameter(input.parameters, [symbol])) missing.push(`${symbol} numeric value`);
  }
  if (!hasInitialCondition(input, "X")) missing.push("X0 initial condition");
  if (!hasInitialCondition(input, "S")) missing.push("S0 initial condition");
  for (const equation of MONOD_REQUIRED_EQUATIONS) {
    if (!hasEquation(input.equations, equation)) missing.push(`${equation} equation`);
  }
  return missing;
}

function hasNumericParameter(
  parameters: ChemEBrainReadinessParameter[] | null | undefined,
  aliases: readonly string[],
): boolean {
  const normalizedAliases = aliases.map(normalizeSymbol);
  return (parameters ?? []).some((parameter) => {
    if (!normalizedAliases.includes(normalizeSymbol(parameter.symbol))) return false;
    return parameterNumericValue(parameter) !== null;
  });
}

function hasInitialCondition(input: ChemEBrainReadinessInput, stateSymbol: "X" | "S"): boolean {
  const target = normalizeSymbol(stateSymbol);
  const parameterAlias = `${target}0`;
  if (hasNumericParameter(input.parameters, [parameterAlias])) return true;
  for (const parameter of input.parameters ?? []) {
    const symbol = normalizeSymbol(parameter.symbol);
    const name = normalizeText(parameter.name);
    const originalKind = normalizeText(parameter.originalValue?.kind);
    const originalStatus = normalizeText(parameter.originalValue?.status);
    if (
      symbol === parameterAlias ||
      (name.includes("initial condition") && name.includes(target)) ||
      ((originalKind === "initial_condition" || originalStatus === "initial_condition") &&
        (symbol === parameterAlias || name.includes(target)))
    ) {
      if (parameterNumericValue(parameter) !== null) return true;
    }
  }
  for (const initial of input.raw?.initial_conditions ?? []) {
    const state = normalizeSymbol(initial.state_symbol);
    const symbol = normalizeSymbol(initial.symbol);
    if ((state === target || symbol === parameterAlias) && numericValue(initial.value_numeric ?? initial.value) !== null) {
      return true;
    }
  }
  for (const variable of input.raw?.state_variables ?? []) {
    if (normalizeSymbol(variable.symbol) !== target) continue;
    if (numericValue(variable.initial_condition) !== null) return true;
  }
  return false;
}

function hasEquation(
  equations: ChemEBrainReadinessEquation[] | null | undefined,
  required: (typeof MONOD_REQUIRED_EQUATIONS)[number],
): boolean {
  const texts = (equations ?? []).map((equation) =>
    normalizeEquationText(equation.plaintext ?? equation.latex ?? equation.equation_plaintext ?? equation.equation_latex),
  );
  if (required === "mu") return texts.some((text) => /\bmu\s*=/.test(text));
  if (required === "dX/dt") return texts.some((text) => /dx\/dt\s*=|dxdt\s*=/.test(text));
  return texts.some((text) => /ds\/dt\s*=|dsdt\s*=/.test(text));
}

function normalizeEquationText(value: unknown): string {
  return String(value ?? "")
    .replace(/[μµ]/g, "mu")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function normalizeSymbol(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[μµ]/g, "mu")
    .replace(/[₀]/g, "0")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = String(value ?? "").match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parameterNumericValue(parameter: ChemEBrainReadinessParameter): number | null {
  return getParameterNumericValue(parameter) ?? numericValue(parameter.value_numeric);
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter((item) => item.trim().length > 0)));
}
