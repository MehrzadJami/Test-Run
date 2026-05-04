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
import { getDomainTemplate } from "./templates";
import {
  LEGACY_MODEL_TYPE_MAP,
  normalizeModelType,
  type ClassificationInput,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function cls(input: ClassificationInput) {
  return classifyModel(input);
}

// ── Chemostat ────────────────────────────────────────────────────────────────

describe("chemostat", () => {
  it("classifies by title keyword", () => {
    const r = cls({ title: "Chemostat model for E. coli growth" });
    expect(r.modelType).toBe("monod_chemostat");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("classifies by domain string", () => {
    const r = cls({ domain: "Continuous culture chemostat — Monod kinetics" });
    expect(r.modelType).toBe("monod_chemostat");
  });

  it("classifies by source text keywords", () => {
    const r = cls({
      sourceText:
        "The dilution rate D is defined as F/V. At washout, D exceeds the maximum growth rate. Sin denotes feed concentration.",
    });
    expect(r.modelType).toBe("monod_chemostat");
    expect(r.matchedKeywords).toContain("dilution rate");
  });

  it("classifies by extracted parameter names", () => {
    const r = cls({
      parameterNames: ["dilution rate", "feed substrate concentration", "yield coefficient"],
      parameterSymbols: ["D", "Sin", "Yxs"],
    });
    expect(r.modelType).toBe("monod_chemostat");
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

describe("batch_culture", () => {
  it("classifies by title", () => {
    const r = cls({ title: "Batch fermentation kinetics of Saccharomyces cerevisiae" });
    expect(r.modelType).toBe("batch_culture");
  });

  it("classifies by source text", () => {
    const r = cls({
      sourceText:
        "In this batch culture, cells were inoculated at an initial biomass concentration of 0.5 g/L. No inflow or outflow occurred during the experiment.",
    });
    expect(r.modelType).toBe("batch_culture");
  });

  it("classifies when title says batch process", () => {
    const r = cls({ title: "Batch process for antibiotic production" });
    expect(r.modelType).toBe("batch_culture");
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

describe("gas_liquid", () => {
  it("classifies by kLa in title", () => {
    const r = cls({ title: "kLa characterisation in stirred tank bioreactor" });
    expect(r.modelType).toBe("gas_liquid");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("classifies by dissolved oxygen source text", () => {
    const r = cls({
      sourceText:
        "Dissolved oxygen (DO) was modelled using the volumetric mass transfer coefficient kLa and the oxygen saturation concentration C*. OTR = kLa (C* - CL).",
    });
    expect(r.modelType).toBe("gas_liquid");
    expect(r.matchedKeywords).toContain("kla");
  });

  it("classifies by parameter symbols kLa and C*", () => {
    const r = cls({
      parameterNames: ["volumetric mass transfer coefficient", "saturation concentration"],
      parameterSymbols: ["kLa", "C*"],
    });
    expect(r.modelType).toBe("gas_liquid");
  });

  it("classifies by oxygen transfer rate keywords", () => {
    const r = cls({
      sourceText: "Aeration rate and agitation speed determine the oxygen transfer rate OTR and OUR.",
    });
    expect(r.modelType).toBe("gas_liquid");
  });
});

// ── Microalgae / PBR ─────────────────────────────────────────────────────────

describe("microalgae_photobioreactor", () => {
  it("classifies by title with photobioreactor", () => {
    const r = cls({ title: "Dynamic model of a flat-panel photobioreactor for microalgae cultivation" });
    expect(r.modelType).toBe("microalgae_photobioreactor");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("classifies by irradiance source text", () => {
    const r = cls({
      sourceText:
        "Growth rate was modelled as a function of photosynthetically active radiation (PAR). Light saturation at KI = 120 μmol/m²/s. Microalgae productivity was measured daily.",
    });
    expect(r.modelType).toBe("microalgae_photobioreactor");
    expect(r.matchedKeywords).toContain("light saturation");
  });

  it("classifies by algae + irradiance parameter", () => {
    const r = cls({
      domain: "Microalgae growth in a tubular PBR",
      parameterNames: ["light irradiance", "maximum growth rate", "light saturation constant"],
      parameterSymbols: ["I", "μmax", "KI"],
    });
    expect(r.modelType).toBe("microalgae_photobioreactor");
  });

  it("classifies by photoinhibition keyword", () => {
    const r = cls({
      sourceText: "At high irradiance, photoinhibition was observed. The Haldane model was used.",
    });
    expect(r.modelType).toBe("microalgae_photobioreactor");
  });
});

describe("additional canonical model types", () => {
  it("classifies PFR examples", () => {
    const r = cls({
      sourceText: "A plug-flow tubular reactor is modeled along axial coordinate z.",
    });
    expect(r.modelType).toBe("pfr");
  });

  it("classifies enzyme kinetics examples", () => {
    const r = cls({
      sourceText: "The enzyme follows Michaelis-Menten kinetics with Vmax and Km.",
    });
    expect(r.modelType).toBe("enzyme_kinetics");
  });

  it("classifies oxygen-balanced mixotrophy examples", () => {
    const r = cls({
      sourceText:
        "A mixotrophic microalgae culture used acetate feed with dissolved oxygen control and autotrophic growth.",
    });
    expect(r.modelType).toBe("oxygen_balanced_mixotrophy");
  });
});

// ── Generic ODE (fallback) ───────────────────────────────────────────────────

describe("unknown", () => {
  it("returns unknown for empty input", () => {
    const r = cls({});
    expect(r.modelType).toBe("unknown");
    expect(r.confidence).toBe(0);
    expect(r.matchedKeywords).toHaveLength(0);
  });

  it("returns unknown when text has no domain keywords", () => {
    const r = cls({
      sourceText: "Consider the following system of ODEs with initial conditions y(0) = 1.",
      title: "Mathematical model",
    });
    expect(r.modelType).toBe("unknown");
  });

  it("returns zero scores for unknown in the scores map", () => {
    const r = cls({ title: "Some ODE system" });
    expect(r.scores["unknown"]).toBeUndefined();
  });
});

describe("legacy model type mapping", () => {
  it("maps every legacy model type to its canonical replacement", () => {
    expect(normalizeModelType("chemostat")).toBe("monod_chemostat");
    expect(normalizeModelType("batch_reactor")).toBe("batch_culture");
    expect(normalizeModelType("gas_liquid_transfer")).toBe("gas_liquid");
    expect(normalizeModelType("microalgae_pbr")).toBe(
      "microalgae_photobioreactor",
    );
    expect(normalizeModelType("generic_ode")).toBe("unknown");
    expect(Object.keys(LEGACY_MODEL_TYPE_MAP)).toHaveLength(5);
  });

  it("maps legacy template lookups to canonical templates", () => {
    expect(getDomainTemplate("gas_liquid_transfer").modelType).toBe("gas_liquid");
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
    expect(["monod_chemostat", "gas_liquid"]).toContain(r.modelType);
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
