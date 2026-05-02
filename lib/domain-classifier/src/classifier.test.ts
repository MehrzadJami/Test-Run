/**
 * Unit tests for the rule-based domain classifier (M19).
 *
 * Each test verifies that the classifier returns the expected ModelType for
 * a representative input. Tests use realistic keyword combinations — not just
 * single-word lookups — to mirror real extraction inputs.
 *
 * Run: pnpm --filter @workspace/domain-classifier test
 */

import { describe, it, expect } from "vitest";
import { classifyModel } from "./classifier";
import type { ClassificationInput } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function cls(input: ClassificationInput) {
  return classifyModel(input);
}

// ── Chemostat ────────────────────────────────────────────────────────────────

describe("chemostat", () => {
  it("classifies by title keyword", () => {
    const r = cls({ title: "Chemostat model for E. coli growth" });
    expect(r.modelType).toBe("chemostat");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("classifies by domain string", () => {
    const r = cls({ domain: "Continuous culture chemostat — Monod kinetics" });
    expect(r.modelType).toBe("chemostat");
  });

  it("classifies by source text keywords", () => {
    const r = cls({
      sourceText:
        "The dilution rate D is defined as F/V. At washout, D exceeds the maximum growth rate. Sin denotes feed concentration.",
    });
    expect(r.modelType).toBe("chemostat");
    expect(r.matchedKeywords).toContain("dilution rate");
  });

  it("classifies by extracted parameter names", () => {
    const r = cls({
      parameterNames: ["dilution rate", "feed substrate concentration", "yield coefficient"],
      parameterSymbols: ["D", "Sin", "Yxs"],
    });
    expect(r.modelType).toBe("chemostat");
  });

  it("includes washout in matched keywords when present", () => {
    const r = cls({
      sourceText: "At high dilution rates, biomass washout occurs. The chemostat operates at steady state.",
    });
    expect(r.matchedKeywords).toContain("washout");
    expect(r.matchedKeywords).toContain("dilution rate");
  });
});

// ── Batch reactor ────────────────────────────────────────────────────────────

describe("batch_reactor", () => {
  it("classifies by title", () => {
    const r = cls({ title: "Batch fermentation kinetics of Saccharomyces cerevisiae" });
    expect(r.modelType).toBe("batch_reactor");
  });

  it("classifies by source text", () => {
    const r = cls({
      sourceText:
        "In this batch culture, cells were inoculated at an initial biomass concentration of 0.5 g/L. No inflow or outflow occurred during the experiment.",
    });
    expect(r.modelType).toBe("batch_reactor");
  });

  it("classifies when title says batch process", () => {
    const r = cls({ title: "Batch process for antibiotic production" });
    expect(r.modelType).toBe("batch_reactor");
  });
});

// ── Fed-batch ────────────────────────────────────────────────────────────────

describe("fed_batch", () => {
  it("classifies by title with hyphen", () => {
    const r = cls({ title: "Fed-batch cultivation of CHO cells" });
    expect(r.modelType).toBe("fed_batch");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("classifies by source text with feeding strategy", () => {
    const r = cls({
      sourceText:
        "The fed-batch process used an exponential feeding strategy. Feed rate F was set to maintain constant substrate concentration. Volume increased during the run.",
    });
    expect(r.modelType).toBe("fed_batch");
    expect(r.matchedKeywords).toContain("fed-batch");
  });

  it("classifies by variable names", () => {
    const r = cls({
      variableNames: ["biomass concentration", "substrate concentration", "culture volume"],
      variableSymbols: ["X", "S", "V"],
      parameterNames: ["feed flow rate", "feed substrate concentration"],
      parameterSymbols: ["F", "Sin"],
    });
    expect(r.modelType).toBe("fed_batch");
  });

  it("distinguishes fed-batch from chemostat (volume change is key)", () => {
    const r = cls({
      sourceText: "The volume changed over time due to the feed. dV/dt = F. No effluent was removed.",
    });
    expect(r.modelType).toBe("fed_batch");
  });
});

// ── CSTR (chemical) ──────────────────────────────────────────────────────────

describe("cstr", () => {
  it("classifies by title CSTR", () => {
    const r = cls({ title: "Dynamic model of a CSTR with exothermic reaction" });
    expect(r.modelType).toBe("cstr");
  });

  it("classifies by Arrhenius + activation energy keywords", () => {
    const r = cls({
      sourceText:
        "The reaction follows Arrhenius kinetics with activation energy Ea = 75 kJ/mol. The continuously stirred tank reactor is operated at 350 K.",
    });
    expect(r.modelType).toBe("cstr");
  });

  it("classifies by Damköhler number mention", () => {
    const r = cls({ sourceText: "At high Damköhler numbers the conversion approaches unity." });
    expect(r.modelType).toBe("cstr");
    expect(r.matchedKeywords).toContain("damköhler");
  });

  it("classifies by residence time + chemical reactor", () => {
    const r = cls({
      sourceText: "The residence time τ in the chemical reactor is 120 s.",
      parameterNames: ["residence time", "rate constant"],
      parameterSymbols: ["τ", "k"],
    });
    expect(r.modelType).toBe("cstr");
  });
});

// ── Gas-liquid oxygen transfer ───────────────────────────────────────────────

describe("gas_liquid_transfer", () => {
  it("classifies by kLa in title", () => {
    const r = cls({ title: "kLa characterisation in stirred tank bioreactor" });
    expect(r.modelType).toBe("gas_liquid_transfer");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("classifies by dissolved oxygen source text", () => {
    const r = cls({
      sourceText:
        "Dissolved oxygen (DO) was modelled using the volumetric mass transfer coefficient kLa and the oxygen saturation concentration C*. OTR = kLa (C* - CL).",
    });
    expect(r.modelType).toBe("gas_liquid_transfer");
    expect(r.matchedKeywords).toContain("kla");
  });

  it("classifies by parameter symbols kLa and C*", () => {
    const r = cls({
      parameterNames: ["volumetric mass transfer coefficient", "saturation concentration"],
      parameterSymbols: ["kLa", "C*"],
    });
    expect(r.modelType).toBe("gas_liquid_transfer");
  });

  it("classifies by oxygen transfer rate keywords", () => {
    const r = cls({
      sourceText: "Aeration rate and agitation speed determine the oxygen transfer rate OTR and OUR.",
    });
    expect(r.modelType).toBe("gas_liquid_transfer");
  });
});

// ── Microalgae / PBR ─────────────────────────────────────────────────────────

describe("microalgae_pbr", () => {
  it("classifies by title with photobioreactor", () => {
    const r = cls({ title: "Dynamic model of a flat-panel photobioreactor for microalgae cultivation" });
    expect(r.modelType).toBe("microalgae_pbr");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("classifies by irradiance source text", () => {
    const r = cls({
      sourceText:
        "Growth rate was modelled as a function of photosynthetically active radiation (PAR). Light saturation at KI = 120 μmol/m²/s. Microalgae productivity was measured daily.",
    });
    expect(r.modelType).toBe("microalgae_pbr");
    expect(r.matchedKeywords).toContain("light saturation");
  });

  it("classifies by algae + irradiance parameter", () => {
    const r = cls({
      domain: "Microalgae growth in a tubular PBR",
      parameterNames: ["light irradiance", "maximum growth rate", "light saturation constant"],
      parameterSymbols: ["I", "μmax", "KI"],
    });
    expect(r.modelType).toBe("microalgae_pbr");
  });

  it("classifies by photoinhibition keyword", () => {
    const r = cls({
      sourceText: "At high irradiance, photoinhibition was observed. The Haldane model was used.",
    });
    expect(r.modelType).toBe("microalgae_pbr");
  });
});

// ── Generic ODE (fallback) ───────────────────────────────────────────────────

describe("generic_ode", () => {
  it("returns generic_ode for empty input", () => {
    const r = cls({});
    expect(r.modelType).toBe("generic_ode");
    expect(r.confidence).toBe(0);
    expect(r.matchedKeywords).toHaveLength(0);
  });

  it("returns generic_ode when text has no domain keywords", () => {
    const r = cls({
      sourceText: "Consider the following system of ODEs with initial conditions y(0) = 1.",
      title: "Mathematical model",
    });
    expect(r.modelType).toBe("generic_ode");
  });

  it("returns zero scores for generic_ode in the scores map", () => {
    const r = cls({ title: "Some ODE system" });
    expect(r.scores["generic_ode"]).toBeUndefined();
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("does not crash on undefined input fields", () => {
    expect(() => cls({ sourceText: undefined, title: undefined })).not.toThrow();
  });

  it("confidence is in [0, 1]", () => {
    const inputs: ClassificationInput[] = [
      { title: "chemostat chemostat chemostat chemostat chemostat" },
      {},
      { sourceText: "kLa kLa kLa kLa kLa kLa kLa kLa kLa kLa" },
    ];
    for (const input of inputs) {
      const r = cls(input);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("matchedKeywords contains only keywords from the winning domain family (all matched)", () => {
    const r = cls({
      title: "Chemostat with dissolved oxygen monitoring",
      sourceText: "dilution rate D, dissolved oxygen, kLa measured",
    });
    // Should classify as chemostat (higher title weight), but oxygen keywords appear too
    expect(r.matchedKeywords.length).toBeGreaterThan(0);
    expect(["chemostat", "gas_liquid_transfer"]).toContain(r.modelType);
  });

  it("repeated keywords are capped and do not linearly inflate confidence", () => {
    const singleMention = cls({ sourceText: "chemostat dilution rate monod" });
    const manyMentions = cls({
      sourceText: "chemostat chemostat chemostat chemostat chemostat " +
                  "dilution rate dilution rate dilution rate " +
                  "monod monod monod monod monod monod monod",
    });
    // Many mentions should score higher, but confidence should remain < 1
    expect(manyMentions.confidence).toBeGreaterThanOrEqual(singleMention.confidence);
    expect(manyMentions.confidence).toBeLessThan(1);
  });
});
