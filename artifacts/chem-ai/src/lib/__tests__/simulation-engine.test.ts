import { describe, expect, it } from "vitest";
import {
  batchCultureODE,
  monodChemostatODE,
  rk4,
} from "../simulation-engine";

describe("simulation-engine", () => {
  it("integrates a simple exponential ODE with generic RK4", () => {
    const result = rk4(
      (state) => ({ X: state.X }),
      {
        initialState: { X: 1 },
        params: {},
        tFinal: 1,
        dt: 0.01,
      },
    );

    const final = result.points.at(-1);
    expect(final?.X).toBeCloseTo(Math.E, 2);
    expect(result.clampedNegative).toBe(false);
  });

  it("computes Monod chemostat derivatives", () => {
    const derivatives = monodChemostatODE(
      { X: 0.5, S: 5 },
      { mumax: 0.4, Ks: 0.1, D: 0.2, Sin: 10, Yxs: 0.5 },
    );

    expect(derivatives.X).toBeGreaterThan(0);
    expect(derivatives.S).toBeGreaterThan(0);
  });

  it("computes batch culture derivatives without dilution terms", () => {
    const derivatives = batchCultureODE(
      { X: 0.5, S: 5 },
      { mumax: 0.4, Ks: 0.1, Yxs: 0.5 },
    );

    expect(derivatives.X).toBeGreaterThan(0);
    expect(derivatives.S).toBeLessThan(0);
  });
});
