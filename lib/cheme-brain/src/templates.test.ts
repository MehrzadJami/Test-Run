import { describe, expect, it } from "vitest";
import {
  CHEME_MODEL_TEMPLATE_IDS,
  CHEME_MODEL_TEMPLATES,
  getChemEModelTemplate,
  getChemEModelTemplates,
} from "./templates";
import type { ChemEModelTemplate, RequiredInformationItem } from "./types";

function requiredItems(template: ChemEModelTemplate): RequiredInformationItem[] {
  return [
    ...template.requiredStates,
    ...template.commonInputs.filter((item) => item.required),
    ...template.commonOutputs.filter((item) => item.required),
    ...template.commonControls.filter((item) => item.required),
    ...template.requiredParameters,
    ...template.requiredEquations,
    ...template.requiredInitialOrBoundaryConditions,
  ];
}

function allItems(template: ChemEModelTemplate): RequiredInformationItem[] {
  return [
    ...template.requiredStates,
    ...template.commonInputs,
    ...template.commonOutputs,
    ...template.commonControls,
    ...template.requiredParameters,
    ...template.requiredEquations,
    ...template.requiredInitialOrBoundaryConditions,
  ];
}

function allSymbols(template: ChemEModelTemplate): string[] {
  return allItems(template).flatMap((item) => item.symbols);
}

function expectNoNumberValues(value: unknown, path = "template"): void {
  if (typeof value === "number") {
    throw new Error(`Numeric default value found at ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => expectNoNumberValues(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      expectNoNumberValues(entry, `${path}.${key}`);
    }
  }
}

describe("ChemE Brain templates", () => {
  it("loads every declared template", () => {
    expect(getChemEModelTemplates()).toHaveLength(CHEME_MODEL_TEMPLATE_IDS.length);
    for (const id of CHEME_MODEL_TEMPLATE_IDS) {
      expect(CHEME_MODEL_TEMPLATES[id].id).toBe(id);
      expect(getChemEModelTemplate(id).displayName).toBeTruthy();
    }
  });

  it("defines checklist evidence, missing guidance, next-source guidance, and safety warnings for every template", () => {
    for (const template of getChemEModelTemplates()) {
      expect(requiredItems(template).length, `${template.id} required checklist`).toBeGreaterThan(0);
      expect(template.commonMissingRequirements.length, `${template.id} missing requirements`).toBeGreaterThan(0);
      expect(template.recommendedNextSources.length, `${template.id} next sources`).toBeGreaterThan(0);
      expect(template.warnings.length, `${template.id} safety warnings`).toBeGreaterThan(0);

      for (const item of requiredItems(template)) {
        expect(item.id).toBeTruthy();
        expect(item.category).toBeTruthy();
        expect(item.label).toBeTruthy();
        expect(item.description).toBeTruthy();
        expect(item.acceptableEvidence.length).toBeGreaterThan(0);
        expect(item.evidenceStatus).toBe("missing");
      }
    }
  });

  it("documents anti-goals in safety warnings", () => {
    for (const template of getChemEModelTemplates()) {
      const warningText = template.warnings
        .map((warning) => `${warning.message} ${warning.safetyRule}`)
        .join("\n");

      expect(warningText).toMatch(/invent numeric values|invent numerical values|no numeric/i);
      expect(warningText).toMatch(/source evidence/i);
      expect(warningText).toMatch(/provider extraction|checklists and reasoning aids/i);
    }
  });

  it("does not encode numeric default values", () => {
    for (const template of getChemEModelTemplates()) {
      expectNoNumberValues(template, template.id);
    }
  });

  it("does not mark templates runnable by default", () => {
    for (const template of getChemEModelTemplates()) {
      expect(template.simulationSupport).not.toBe("runnable");
    }
    expect(CHEME_MODEL_TEMPLATES.monod_chemostat.simulationSupport).toBe("supported_not_ready");
    expect(CHEME_MODEL_TEMPLATES.oxygen_balanced_mixotrophy.simulationSupport).toBe("scaffold_only");
    expect(CHEME_MODEL_TEMPLATES.unknown.simulationSupport).toBe("unsupported");
  });

  it("keeps photobioreactor_light as a specialization, not a canonical model type", () => {
    const template = CHEME_MODEL_TEMPLATES.photobioreactor_light;
    expect(template.id).toBe("photobioreactor_light");
    expect(template.canonicalModelType).toBe("microalgae_photobioreactor");
  });

  it("monod_chemostat contains the full required evidence set", () => {
    const symbols = allSymbols(CHEME_MODEL_TEMPLATES.monod_chemostat);

    for (const required of [
      "X",
      "S",
      "mu",
      "dX/dt",
      "dS/dt",
      "mumax",
      "Ks",
      "D",
      "Sin",
      "Yxs",
      "X0",
      "S0",
    ]) {
      expect(symbols).toContain(required);
    }
  });

  it("batch_culture does not require dilution rate D", () => {
    const requiredSymbols = requiredItems(CHEME_MODEL_TEMPLATES.batch_culture).flatMap(
      (item) => item.symbols,
    );

    expect(requiredSymbols).not.toContain("D");
  });

  it("fed_batch requires volume or feed evidence", () => {
    const symbols = allSymbols(CHEME_MODEL_TEMPLATES.fed_batch);

    expect(symbols).toContain("V");
    expect(symbols).toContain("dV/dt");
    expect(symbols).toContain("F(t)");
  });

  it("enzyme_kinetics requires Vmax and Km", () => {
    const symbols = allSymbols(CHEME_MODEL_TEMPLATES.enzyme_kinetics);

    expect(symbols).toContain("Vmax");
    expect(symbols).toContain("Km");
  });

  it("gas_liquid includes Henry convention guidance for saturation or equilibrium evidence", () => {
    const gas = CHEME_MODEL_TEMPLATES.gas_liquid;
    const henryRequirement = gas.commonMissingRequirements.find((requirement) =>
      /Henry/i.test(`${requirement.item} ${requirement.whyNeeded}`),
    );

    expect(henryRequirement).toBeDefined();
    expect(henryRequirement?.triggerEvidence).toEqual(
      expect.arrayContaining(["Cstar", "saturation", "equilibrium", "Henry"]),
    );
    expect(henryRequirement?.suggestedSources.map((source) => source.sourceType)).toContain("databook");
  });
});
