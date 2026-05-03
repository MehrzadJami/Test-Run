import { describe, expect, it } from "vitest";
import {
  isSupportedSimulationModel,
  SIMULATION_UNSUPPORTED_MESSAGE,
} from "@/lib/simulation-support";

describe("simulation support detection", () => {
  it("supports chemostat and Monod model metadata", () => {
    expect(isSupportedSimulationModel({ modelType: "chemostat" })).toBe(true);
    expect(isSupportedSimulationModel({ modelCardTitle: "Monod chemostat model" })).toBe(true);
    expect(isSupportedSimulationModel({ systemType: "Monod growth kinetics" })).toBe(true);
  });

  it("does not support non-chemostat models", () => {
    expect(isSupportedSimulationModel({ modelType: "gas_liquid_transfer" })).toBe(false);
    expect(isSupportedSimulationModel({ modelCardTitle: "Batch reactor first order" })).toBe(false);
    expect(isSupportedSimulationModel(null)).toBe(false);
  });

  it("exposes the unsupported simulation message", () => {
    expect(SIMULATION_UNSUPPORTED_MESSAGE).toBe(
      "Simulation is currently available only for supported Monod/batch chemostat models. Download the scaffold instead.",
    );
  });
});
