import { describe, expect, it } from "vitest";
import {
  generateLiteratureSearchSuggestions,
  type LiteratureSearchSuggestion,
} from "../literature-search-assistant";
import type { MissingRequirement, ModelAssemblyReport } from "../model-assembly";

function missing(overrides: Partial<MissingRequirement>): MissingRequirement {
  return {
    item: "Missing item",
    category: "source_document",
    required_for: "model assembly",
    why_needed: "The current source does not define this requirement.",
    suggested_source: "supporting_information",
    severity: "critical",
    ...overrides,
  };
}

function report(missingRequirements: MissingRequirement[]): ModelAssemblyReport {
  return {
    assembly_status: "partial",
    target_model_type: "oxygen_balanced_mixotrophy",
    can_generate_runnable_model: false,
    can_generate_scaffold: true,
    available_from_current_source: [],
    missing_requirements: missingRequirements,
    recommended_next_actions: [],
  };
}

function findSuggestion(
  suggestions: LiteratureSearchSuggestion[],
  item: string,
): LiteratureSearchSuggestion {
  const suggestion = suggestions.find((entry) => entry.missing_item === item);
  expect(suggestion).toBeDefined();
  return suggestion!;
}

describe("generateLiteratureSearchSuggestions", () => {
  it("generates sensible Abiusi-like kinetic queries", () => {
    const suggestions = generateLiteratureSearchSuggestions(
      report([
        missing({
          item: "Kinetic constants for growth and uptake",
          category: "kinetic_parameter",
          required_for: "closed ODE right-hand-side rates",
          why_needed: "Dynamic rates need growth, acetate uptake, and gas consumption kinetic constants.",
          suggested_source: "supporting_information",
        }),
      ]),
      { organismOrMaterial: "Chlorella sorokiniana" },
    );

    const kinetic = findSuggestion(suggestions, "Kinetic constants for growth and uptake");
    expect(kinetic.likely_source_type).toBe("supporting_information");
    expect(kinetic.suggested_queries).toEqual(
      expect.arrayContaining([
        "Chlorella sorokiniana acetate Monod constant",
        "Chlorella sorokiniana CO2 Monod constant",
      ]),
    );
    expect(kinetic.warning).toBe("Candidate values must be verified before use.");
  });

  it("generates a databook-style Henry-law query", () => {
    const suggestions = generateLiteratureSearchSuggestions(
      report([
        missing({
          item: "Henry-law convention",
          category: "gas_transfer",
          required_for: "gas-liquid O2/CO2 equilibrium and transfer calculations",
          why_needed: "Different Henry-law conventions invert or rescale equilibrium expressions.",
          suggested_source: "user_assumption",
          severity: "warning",
        }),
      ]),
      { temperatureC: 37 },
    );

    const henry = findSuggestion(suggestions, "Henry-law convention");
    expect(henry.likely_source_type).toBe("databook");
    expect(henry.suggested_queries).toContain(
      "Henry constant oxygen carbon dioxide water 37 C",
    );
  });

  it("generates cited-paper light-model queries", () => {
    const suggestions = generateLiteratureSearchSuggestions(
      report([
        missing({
          item: "Light attenuation parameters",
          category: "light_model",
          required_for: "spatially averaged or effective light model",
          why_needed: "PFD alone is not enough to compute light-limited growth.",
          suggested_source: "supporting_information",
        }),
      ]),
      { organismOrMaterial: "Chlorella sorokiniana" },
    );

    const light = findSuggestion(suggestions, "Light attenuation parameters");
    expect(light.likely_source_type).toBe("cited_paper");
    expect(light.suggested_queries).toContain(
      "Evers cylindrical photobioreactor light model",
    );
  });

  it("does not insert parameter values or candidate assignments", () => {
    const suggestions = generateLiteratureSearchSuggestions(
      report([
        missing({
          item: "O2 and CO2 yield/stoichiometry",
          category: "stoichiometric_yield",
          required_for: "oxygen and carbon source terms",
          why_needed: "Stoichiometry is needed to convert rates into balance terms.",
          suggested_source: "current paper",
        }),
      ]),
      { organismOrMaterial: "Chlorella sorokiniana" },
    );

    for (const suggestion of suggestions) {
      expect(suggestion).not.toHaveProperty("candidate_value");
      expect(suggestion.warning).toBe("Candidate values must be verified before use.");
      for (const query of suggestion.suggested_queries) {
        expect(query).not.toMatch(/[A-Za-z_][A-Za-z0-9_]*\s*=\s*-?\d/);
      }
    }
  });
});
