import { describe, expect, it } from "vitest";
import {
  getSupportedSimulationModelType,
  isSupportedSimulationModel,
  SIMULATION_UNSUPPORTED_MESSAGE,
} from "@/lib/simulation-support";

describe("simulation support detection", () => {
  it("supports explicit Monod chemostat model type", () => {
    expect(isSupportedSimulationModel({ rawModelType: "monod_chemostat" })).toBe(true);
    expect(isSupportedSimulationModel({ rawModelType: "chemostat" })).toBe(true);
    expect(getSupportedSimulationModelType({ rawModelType: "monod_chemostat" })).toBe(
      "monod_chemostat",
    );
  });

  it("supports explicit batch culture only when required parameters exist", () => {
    expect(
      getSupportedSimulationModelType({
        rawModelType: "batch_culture",
        parameters: [
          { symbol: "mumax", value: 0.4 },
          { symbol: "Ks", value: 0.1 },
          { symbol: "Yxs", value: 0.5 },
        ],
      }),
    ).toBe("batch_culture");
    expect(
      getSupportedSimulationModelType({
        rawModelType: "batch_culture",
        parameters: [{ symbol: "mumax", value: 0.4 }],
      }),
    ).toBeNull();
  });

  it("blocks batch simulation when a required parameter has unknown numeric value", () => {
    expect(
      getSupportedSimulationModelType({
        rawModelType: "batch_culture",
        parameters: [
          { symbol: "mumax", value: 0, valueRaw: "unknown", valueNumeric: null },
          { symbol: "Ks", value: 0.1, valueNumeric: 0.1 },
          { symbol: "Yxs", value: 0.5, valueNumeric: 0.5 },
        ],
      }),
    ).toBeNull();
  });

  it("does not support non-v1 or legacy implicit model metadata", () => {
    expect(isSupportedSimulationModel({ rawModelType: "gas_liquid" })).toBe(false);
    expect(isSupportedSimulationModel({ rawModelType: "gas_liquid_transfer" })).toBe(false);
    expect(isSupportedSimulationModel({ rawModelType: "oxygen_balanced_mixotrophy" })).toBe(false);
    expect(isSupportedSimulationModel({ rawModelType: "pfr" })).toBe(false);
    expect(isSupportedSimulationModel({ rawModelType: "cstr" })).toBe(false);
    expect(isSupportedSimulationModel({ rawModelType: "unknown" })).toBe(false);
    expect(isSupportedSimulationModel({ rawModelType: "generic_ode" })).toBe(false);
    expect(isSupportedSimulationModel({ modelCardTitle: "Monod chemostat model" })).toBe(false);
    expect(isSupportedSimulationModel(null)).toBe(false);
  });

  it("exposes the unsupported simulation message", () => {
    expect(SIMULATION_UNSUPPORTED_MESSAGE).toBe(
      "Runnable simulation is not available because required model information is missing. A scaffold can still be exported.",
    );
  });
});
