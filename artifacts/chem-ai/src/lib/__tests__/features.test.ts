import { describe, it, expect } from "vitest";
import { features } from "../features";

describe("feature flags defaults", () => {
  it("keeps stable demo defaults", () => {
    expect(features.auth).toBe(false);
    expect(features.multisource).toBe(false);
    expect(features.realAI).toBe(false);
    expect(features.experimentalFitting).toBe(false);
  });
});
