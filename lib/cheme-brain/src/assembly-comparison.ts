import type {
  ChemEBrainReport,
  CorrectedRole,
  MissingRequirement,
} from "./types";

export type AssemblyChemEBrainComparisonSeverity = "none" | "info" | "warning" | "critical";

export type AssemblyChemEBrainDisagreementCategory =
  | "readiness"
  | "missing_requirement"
  | "role"
  | "model_type"
  | "support"
  | "traceability";

export interface AssemblyChemEBrainDisagreement {
  id: string;
  severity: Exclude<AssemblyChemEBrainComparisonSeverity, "none">;
  category: AssemblyChemEBrainDisagreementCategory;
  assembly_says: string;
  cheme_brain_says: string;
  why_it_matters: string;
  recommended_action: string;
}

export interface AssemblyChemEBrainComparison {
  agrees: boolean;
  severity: AssemblyChemEBrainComparisonSeverity;
  disagreements: AssemblyChemEBrainDisagreement[];
  recommended_action: string;
}

export interface AssemblyReportLike {
  assembly_status?: string;
  target_model_type?: string;
  can_generate_runnable_model?: boolean;
  can_generate_scaffold?: boolean;
  missing_requirements?: unknown;
  available_from_current_source?: unknown;
  recommended_next_actions?: unknown;
}

const CRITICAL_MISSING_CATEGORIES = new Set([
  "initial_condition",
  "kinetic_parameter",
  "stoichiometric_yield",
  "model_structure",
  "control_parameter",
  "controller",
  "physical_constant",
  "light_model",
  "gas_transfer",
]);

const CONVENTION_MISSING_PATTERN = /\b(henry|convention|unit convention|equilibrium|saturation)\b/i;

export function compareAssemblyWithChemEBrain(
  modelAssemblyReport: AssemblyReportLike | null | undefined,
  chemEBrainReport: ChemEBrainReport,
): AssemblyChemEBrainComparison {
  const assembly = normalizeAssemblyReport(modelAssemblyReport);
  const disagreements: AssemblyChemEBrainDisagreement[] = [];
  const assemblyRunnable = assembly.can_generate_runnable_model === true;
  const assemblyComplete = assembly.assembly_status === "complete";
  const brainStatus = chemEBrainReport.simulation_support.status;

  if (assemblyRunnable && brainStatus !== "runnable") {
    disagreements.push({
      id: "readiness-runnable-mismatch",
      severity: "critical",
      category: "readiness",
      assembly_says: `Model assembly says runnable (${assemblyStatusSummary(assembly)}).`,
      cheme_brain_says: `ChemE Brain says ${brainStatus}: ${chemEBrainReport.simulation_support.reason}`,
      why_it_matters:
        "A runnable package should not be treated as ready when an independent engineering audit still finds required evidence missing or unsupported.",
      recommended_action:
        "Review the ChemE Brain missing requirements before relying on the generated simulation.",
    });
  }

  if (assemblyRunnable && brainStatus === "unsupported") {
    disagreements.push({
      id: "unsupported-model-runnable",
      severity: "critical",
      category: "support",
      assembly_says: `Model assembly says runnable for ${assembly.target_model_type || "unknown model type"}.`,
      cheme_brain_says: `ChemE Brain says the model type is unsupported (${chemEBrainReport.canonical_model_type}).`,
      why_it_matters:
        "The current simulator should not be treated as authoritative for a model type ChemE Brain marks unsupported.",
      recommended_action:
        "Keep simulation advisory only until a supported template and required evidence are confirmed.",
    });
  }

  const criticalMissing = chemEBrainReport.missing_requirements.filter(isCriticalMissingForRunnableModel);
  if ((assemblyRunnable || assemblyComplete) && criticalMissing.length > 0) {
    for (const missing of criticalMissing) {
      disagreements.push(missingRequirementDisagreement(missing, assemblyRunnable, "critical"));
    }
  } else {
    for (const missing of chemEBrainReport.missing_requirements.filter(isConventionOrTraceabilityMissing)) {
      disagreements.push(missingRequirementDisagreement(missing, assemblyRunnable, "warning"));
    }
  }

  const modelTypeDisagreement = compareModelTypes(assembly, chemEBrainReport);
  if (modelTypeDisagreement) disagreements.push(modelTypeDisagreement);

  for (const role of chemEBrainReport.corrected_roles.filter(isRoleDisagreement)) {
    disagreements.push(roleDisagreement(role));
  }

  if (!assemblyRunnable && brainStatus !== "runnable" && disagreements.length === 0) {
    disagreements.push({
      id: "both-partial-or-not-ready",
      severity: "info",
      category: "readiness",
      assembly_says: `Model assembly says ${assemblyStatusSummary(assembly)}.`,
      cheme_brain_says: `ChemE Brain says ${brainStatus}.`,
      why_it_matters:
        "Both systems indicate this should be reviewed as incomplete or advisory rather than treated as ready.",
      recommended_action:
        "Use the missing-requirement lists to decide what source or assumption is needed next.",
    });
  }

  const inferredNote = inferredRoleOrUnitNote(chemEBrainReport, disagreements);
  if (inferredNote) disagreements.push(inferredNote);

  const deduped = dedupeDisagreements(disagreements);
  const severity = highestSeverity(deduped);
  return {
    agrees: deduped.length === 0,
    severity,
    disagreements: deduped,
    recommended_action: recommendedActionForSeverity(severity),
  };
}

function normalizeAssemblyReport(report: AssemblyReportLike | null | undefined): Required<AssemblyReportLike> {
  const source = report ?? {};
  return {
    assembly_status: safe(source.assembly_status) || "unknown",
    target_model_type: safe(source.target_model_type) || "unknown",
    can_generate_runnable_model: source.can_generate_runnable_model === true,
    can_generate_scaffold: source.can_generate_scaffold === true,
    missing_requirements: source.missing_requirements ?? [],
    available_from_current_source: source.available_from_current_source ?? [],
    recommended_next_actions: source.recommended_next_actions ?? [],
  };
}

function isCriticalMissingForRunnableModel(missing: MissingRequirement): boolean {
  return missing.severity === "critical" || CRITICAL_MISSING_CATEGORIES.has(missing.category);
}

function isConventionOrTraceabilityMissing(missing: MissingRequirement): boolean {
  return (
    missing.severity === "warning" ||
    missing.category === "physical_constant" ||
    missing.category === "source_document" ||
    CONVENTION_MISSING_PATTERN.test(`${missing.item} ${missing.whyNeeded} ${missing.requiredFor}`)
  );
}

function missingRequirementDisagreement(
  missing: MissingRequirement,
  assemblyRunnable: boolean,
  severity: "warning" | "critical",
): AssemblyChemEBrainDisagreement {
  return {
    id: `missing-${missing.id}`,
    severity,
    category: missing.category === "source_document" ? "traceability" : "missing_requirement",
    assembly_says: assemblyRunnable
      ? "Model assembly says the model is runnable."
      : "Model assembly has not blocked this specific ChemE Brain requirement.",
    cheme_brain_says: `ChemE Brain reports missing ${missing.item}.`,
    why_it_matters: missing.whyNeeded,
    recommended_action: `${missing.requiredFor} Suggested source: ${missing.suggestedSources[0]?.sourceType ?? "current_source_review"}.`,
  };
}

function compareModelTypes(
  assembly: Required<AssemblyReportLike>,
  report: ChemEBrainReport,
): AssemblyChemEBrainDisagreement | null {
  const assemblyType = normalizeType(assembly.target_model_type);
  const brainType = normalizeType(report.canonical_model_type);
  if (assembly.can_generate_runnable_model && brainType === "unknown") {
    return {
      id: "unknown-brain-type-runnable",
      severity: "critical",
      category: "model_type",
      assembly_says: `Model assembly says runnable for ${assembly.target_model_type || "unknown model type"}.`,
      cheme_brain_says: "ChemE Brain could not identify a supported canonical model type.",
      why_it_matters:
        "A runnable simulation should have a supported model type with source-backed equations and requirements.",
      recommended_action:
        "Review model type evidence before treating the generated simulation as ready.",
    };
  }
  if (!assemblyType || !brainType || assemblyType === "unknown" || brainType === "unknown" || assemblyType === brainType) {
    return null;
  }
  return {
    id: "model-type-disagreement",
    severity: report.confidence === "high" ? "warning" : "info",
    category: "model_type",
    assembly_says: `Model assembly targets ${assembly.target_model_type}.`,
    cheme_brain_says: `ChemE Brain identifies ${report.canonical_model_type} with ${report.confidence} confidence.`,
    why_it_matters:
      "Different model types imply different required equations, parameters, units, and initial conditions.",
    recommended_action:
      "Compare source evidence and template requirements before using either classification as authority.",
  };
}

function isRoleDisagreement(role: CorrectedRole): boolean {
  if (!role.extractedRole) return false;
  if (role.extractedRole === "not reported") return false;
  if (role.evidenceStatus !== "conflicting") return false;
  return normalizeType(role.extractedRole) !== normalizeType(role.recommendedRole);
}

function roleDisagreement(role: CorrectedRole): AssemblyChemEBrainDisagreement {
  return {
    id: `role-${role.symbol}`,
    severity: "warning",
    category: "role",
    assembly_says: `Extracted/model-card role for ${role.symbol} is ${role.extractedRole}.`,
    cheme_brain_says: `ChemE Brain recommends ${role.recommendedRole}.`,
    why_it_matters: role.reason,
    recommended_action:
      "Review the source equation context before using this variable role in simulation setup or interpretation.",
  };
}

function inferredRoleOrUnitNote(
  report: ChemEBrainReport,
  existing: AssemblyChemEBrainDisagreement[],
): AssemblyChemEBrainDisagreement | null {
  if (existing.length > 0) return null;
  const inferredRole = report.corrected_roles.find((role) => role.evidenceStatus === "inferred");
  const inferredUnit = report.inferred_units.find((unit) => unit.evidenceStatus === "inferred");
  if (!inferredRole && !inferredUnit) return null;
  const item = inferredRole
    ? `${inferredRole.symbol} role ${inferredRole.recommendedRole}`
    : `${inferredUnit?.symbol} unit ${inferredUnit?.expectedUnit}`;
  const reason = inferredRole?.reason ?? inferredUnit?.note ?? "ChemE Brain inferred extra review context.";
  return {
    id: "inferred-extra-review-context",
    severity: "info",
    category: inferredRole ? "role" : "traceability",
    assembly_says: "Model assembly does not represent this ChemE Brain inference directly.",
    cheme_brain_says: `ChemE Brain inferred ${item}.`,
    why_it_matters: reason,
    recommended_action:
      "Treat the inference as advisory unless it is supported by explicit source evidence or user review.",
  };
}

function highestSeverity(disagreements: AssemblyChemEBrainDisagreement[]): AssemblyChemEBrainComparisonSeverity {
  if (disagreements.some((item) => item.severity === "critical")) return "critical";
  if (disagreements.some((item) => item.severity === "warning")) return "warning";
  if (disagreements.some((item) => item.severity === "info")) return "info";
  return "none";
}

function recommendedActionForSeverity(severity: AssemblyChemEBrainComparisonSeverity): string {
  if (severity === "critical") {
    return "Do not treat current assembly as authoritative; review the ChemE Brain disagreement before relying on simulation.";
  }
  if (severity === "warning") {
    return "Review highlighted differences; current readiness and simulation behavior remain unchanged.";
  }
  if (severity === "info") {
    return "No blocking disagreement was detected; use ChemE Brain notes for engineering review.";
  }
  return "Assembly and ChemE Brain are aligned for the checked shadow conditions.";
}

function assemblyStatusSummary(assembly: Required<AssemblyReportLike>): string {
  const runnable = assembly.can_generate_runnable_model ? "runnable" : "not runnable";
  return `${assembly.assembly_status || "unknown"}, ${runnable}`;
}

function dedupeDisagreements(disagreements: AssemblyChemEBrainDisagreement[]): AssemblyChemEBrainDisagreement[] {
  const seen = new Set<string>();
  const result: AssemblyChemEBrainDisagreement[] = [];
  for (const item of disagreements) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function normalizeType(value: unknown): string {
  return safe(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function safe(value: unknown): string {
  return value == null ? "" : String(value).trim();
}
