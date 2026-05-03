export const SIMULATION_UNSUPPORTED_MESSAGE =
  "Simulation is currently available only for Monod chemostat demo models.";

export type SimulationSupportInput = {
  modelType?: string | null;
  modelTypeOverride?: string | null;
  modelCardTitle?: string | null;
  systemType?: string | null;
  domain?: string | null;
};

export function isSupportedSimulationModel(
  model: SimulationSupportInput | null | undefined,
): boolean {
  if (!model) return false;
  const haystack = [
    model.modelTypeOverride,
    model.modelType,
    model.modelCardTitle,
    model.systemType,
    model.domain,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return haystack.includes("chemostat") || haystack.includes("monod");
}
