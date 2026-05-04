import { normalizeModelType } from "@workspace/domain-classifier";

export const SIMULATION_UNSUPPORTED_MESSAGE =
  "Simulation for this model type is not yet supported. Use the scaffold/export instead.";

export type SupportedSimulationModelType = "monod_chemostat" | "batch_culture";

export type SimulationParameterLike = {
  symbol?: string | null;
  value?: string | number | null;
};

export type SimulationSupportInput = {
  rawModelType?: string | null;
  modelCardModelType?: string | null;
  modelType?: string | null;
  modelTypeOverride?: string | null;
  modelCardTitle?: string | null;
  systemType?: string | null;
  domain?: string | null;
  parameters?: SimulationParameterLike[] | null;
};

const EXPLICIT_UNSUPPORTED = new Set([
  "gas_liquid",
  "oxygen_balanced_mixotrophy",
  "microalgae_photobioreactor",
  "fed_batch",
  "pfr",
  "cstr",
  "enzyme_kinetics",
  "unknown",
]);

function normalize(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, "_");
}

function hasNumericParameter(
  parameters: SimulationParameterLike[] | null | undefined,
  aliases: string[],
): boolean {
  const normalizedAliases = aliases.map(normalize);
  return (parameters ?? []).some((parameter) => {
    const symbol = normalize(parameter.symbol);
    if (!normalizedAliases.includes(symbol)) return false;
    const value = Number(parameter.value);
    return Number.isFinite(value);
  });
}

export function hasRequiredBatchCultureParameters(
  parameters: SimulationParameterLike[] | null | undefined,
): boolean {
  return (
    hasNumericParameter(parameters, ["mumax", "mu_max", "mu_maximum"]) &&
    hasNumericParameter(parameters, ["ks"]) &&
    hasNumericParameter(parameters, ["yxs", "yx_s", "y_xs", "yield"])
  );
}

export function getSupportedSimulationModelType(
  model: SimulationSupportInput | null | undefined,
): SupportedSimulationModelType | null {
  if (!model) return null;
  const candidates = [
    model.rawModelType,
    model.modelCardModelType,
    model.modelTypeOverride,
    model.modelType,
    model.systemType,
  ].map(normalizeModelType);

  if (candidates.includes("monod_chemostat")) return "monod_chemostat";
  if (candidates.includes("batch_culture")) {
    return hasRequiredBatchCultureParameters(model.parameters) ? "batch_culture" : null;
  }
  if (candidates.some((candidate) => EXPLICIT_UNSUPPORTED.has(candidate))) return null;

  return null;
}

export function isSupportedSimulationModel(
  model: SimulationSupportInput | null | undefined,
): boolean {
  return getSupportedSimulationModelType(model) !== null;
}
