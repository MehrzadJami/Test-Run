import type { MissingRequirement, ModelAssemblyReport } from "./model-assembly";
import { MODEL_TYPE_DISPLAY_NAMES } from "@workspace/domain-classifier";

export type LiteratureSourceType =
  | "supporting_information"
  | "cited_paper"
  | "databook"
  | "review"
  | "user_assumption"
  | "calibration";

export interface LiteratureSearchContext {
  organismOrMaterial?: string | null;
  temperatureC?: number | null;
  processTerms?: string[];
}

export interface LiteratureSearchSuggestion {
  missing_item: string;
  suggested_queries: string[];
  likely_source_type: LiteratureSourceType;
  warning: "Candidate values must be verified before use.";
}

const WARNING = "Candidate values must be verified before use." as const;

function safe(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function lower(value: unknown): string {
  return safe(value).toLowerCase();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    out.push(trimmed);
  }
  return out;
}

function contextSubject(report: ModelAssemblyReport, context?: LiteratureSearchContext): string {
  if (safe(context?.organismOrMaterial)) return safe(context?.organismOrMaterial);
  if (
    report.target_model_type === "microalgae_photobioreactor" ||
    report.target_model_type === "oxygen_balanced_mixotrophy"
  ) {
    return "microalgae";
  }
  if (
    report.target_model_type === "monod_chemostat" ||
    report.target_model_type === "gas_liquid"
  ) {
    return "bioreactor";
  }
  return "chemical engineering model";
}

function inferSourceType(missing: MissingRequirement): LiteratureSourceType {
  if (missing.category === "gas_transfer" || missing.category === "physical_constant") {
    return "databook";
  }
  if (missing.category === "light_model") return "cited_paper";
  if (missing.category === "calibration_required") return "calibration";
  if (missing.suggested_source === "supporting_information") return "supporting_information";
  if (missing.suggested_source === "cited_paper") return "cited_paper";
  if (missing.suggested_source === "user_assumption") return "user_assumption";
  if (missing.suggested_source === "calibration") return "calibration";
  if (missing.suggested_source === "databook") return "databook";

  if (missing.category === "kinetic_parameter" || missing.category === "stoichiometric_yield") {
    return "review";
  }
  return "supporting_information";
}

function genericSourceQuery(report: ModelAssemblyReport, missing: MissingRequirement): string {
  const model = MODEL_TYPE_DISPLAY_NAMES[report.target_model_type];
  return `${model} ${missing.item} ${missing.suggested_source.replace(/_/g, " ")}`;
}

function queriesForMissing(
  report: ModelAssemblyReport,
  missing: MissingRequirement,
  context?: LiteratureSearchContext,
): string[] {
  const subject = contextSubject(report, context);
  const item = lower(`${missing.item} ${missing.category} ${missing.required_for} ${missing.why_needed}`);
  const queries: string[] = [];

  if (/\bkco2\b|co2.*monod|carbon dioxide.*monod/.test(item)) {
    queries.push(`${subject} CO2 Monod constant`);
  }

  if (/acetate.*(uptake|monod|constant)|heterotrophic acetate/.test(item)) {
    queries.push(`${subject} acetate Monod constant`);
  }

  if (/kinetic/.test(item)) {
    queries.push(
      `${subject} acetate Monod constant`,
      `${subject} CO2 Monod constant`,
      `${subject} oxygen uptake kinetic constants`,
      `${subject} mixotrophic growth kinetic constants`,
    );
  }

  if (/henry|gas.transfer|o2.*co2|oxygen.*carbon/.test(item)) {
    const temperature = Number.isFinite(context?.temperatureC)
      ? ` ${context!.temperatureC} C`
      : "";
    queries.push(
      `Henry constant oxygen carbon dioxide water${temperature}`,
      "oxygen carbon dioxide Henry law convention aqueous bioreactor",
      "gas liquid oxygen carbon dioxide Henry law units convention",
    );
  }

  if (/light|photobioreactor|pfd|attenuation|autotrophic/.test(item)) {
    queries.push(
      "Evers cylindrical photobioreactor light model",
      `${subject} photobioreactor light attenuation coefficient`,
      "microalgae Beer Lambert light attenuation photobioreactor",
    );
  }

  if (/yield|stoichiometr|c-mol|biomass yield/.test(item)) {
    queries.push(
      "microalgae acetate biomass yield C-mol",
      `${subject} oxygen carbon dioxide stoichiometry mixotrophic microalgae`,
      `${subject} acetate biomass yield coefficient`,
    );
  }

  if (/controller|pid|closed.loop|do control|setpoint/.test(item)) {
    queries.push(
      "dissolved oxygen PID controller bioreactor parameters",
      `${subject} photobioreactor DO control setpoint controller`,
    );
  }

  if (/initial condition|state variables/.test(item)) {
    queries.push(
      `${subject} photobioreactor initial conditions supporting information`,
      `${subject} chemostat initial biomass acetate dissolved oxygen`,
    );
  }

  if (/calibration|estimate|estimating/.test(item)) {
    queries.push(
      `${subject} mixotrophic microalgae calibration data acetate oxygen`,
      "microalgae photobioreactor dynamic model calibration dataset",
    );
  }

  if (queries.length === 0) {
    queries.push(genericSourceQuery(report, missing));
  }

  for (const term of context?.processTerms ?? []) {
    const cleanTerm = safe(term);
    if (cleanTerm) queries.push(`${subject} ${cleanTerm} ${missing.item}`);
  }

  return unique(queries).slice(0, 5);
}

export function generateLiteratureSearchSuggestions(
  report: ModelAssemblyReport,
  context?: LiteratureSearchContext,
): LiteratureSearchSuggestion[] {
  return report.missing_requirements.map((missing) => ({
    missing_item: missing.item,
    suggested_queries: queriesForMissing(report, missing, context),
    likely_source_type: inferSourceType(missing),
    warning: WARNING,
  }));
}
