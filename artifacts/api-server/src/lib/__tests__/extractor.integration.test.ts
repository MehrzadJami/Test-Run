import { describe, expect, it } from "vitest";
import {
  ExtractionProviderError,
  runExtraction,
  type ProviderPreference,
} from "../extractor";
import { ExtractionResultSchema } from "../extraction-schema";

const hasRealProvider =
  !!process.env["OPENAI_API_KEY"] ||
  !!process.env["GEMINI_API_KEY"] ||
  !!process.env["OLLAMA_BASE_URL"];

const describeIntegration =
  process.env["INTEGRATION"] === "true" && hasRealProvider
    ? describe
    : describe.skip;

const provider =
  (process.env["EXTRACTION_PROVIDER"] as ProviderPreference | undefined) ?? "auto";

describeIntegration("real extraction provider integration", () => {
  it("validates a Monod excerpt", async () => {
    const { result } = await runExtraction(
      "A continuous chemostat is modeled with biomass X and substrate S. " +
        "The growth rate is mu = mumax*S/(Ks+S). The biomass balance is " +
        "dX/dt = (mu - D)*X. Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, " +
        "and D = 0.1 1/h.",
      provider,
    );

    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });

  it("validates a gas-transfer and fed-batch excerpt", async () => {
    const { result } = await runExtraction(
      "A fed-batch aerobic bioreactor has feed F(t), variable volume V, " +
        "and dissolved oxygen transfer dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X. " +
        "Parameters include kLa = 80 1/h and qO2 = 0.02 gO2/gX/h.",
      provider,
    );

    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });

  it("handles garbage input gracefully", async () => {
    try {
      const { result } = await runExtraction(
        "not a scientific model ??? ".repeat(20),
        provider,
      );
      expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
      expect(result.model_type).toBe("unknown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractionProviderError);
    }
  });
});
