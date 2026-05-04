import { describe, expect, it } from "vitest";
import { normalizeExtractionModelTypes } from "../model-type-compat";

describe("model-type compatibility normalization", () => {
  it("maps legacy DB extraction values to canonical model types", () => {
    const extraction = normalizeExtractionModelTypes({
      id: 1,
      modelType: "chemostat",
      modelTypeOverride: "gas_liquid_transfer",
      rawExtractionJson: {
        model_type: "microalgae_pbr",
        paper_title_or_topic: "Legacy row",
      },
    });

    expect(extraction.modelType).toBe("monod_chemostat");
    expect(extraction.modelTypeOverride).toBe("gas_liquid");
    expect(extraction.rawExtractionJson).toMatchObject({
      model_type: "microalgae_photobioreactor",
    });
  });

  it("defaults unrecognized model types to unknown", () => {
    const extraction = normalizeExtractionModelTypes({
      modelType: "not-a-model-type",
      modelTypeOverride: null,
      rawExtractionJson: { model_type: "mystery reactor" },
    });

    expect(extraction.modelType).toBe("unknown");
    expect(extraction.modelTypeOverride).toBeNull();
    expect(extraction.rawExtractionJson).toMatchObject({
      model_type: "unknown",
    });
  });
});
