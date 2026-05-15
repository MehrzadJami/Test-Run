import {
  analyzeChemEModel,
  compareAssemblyWithChemEBrain,
  type AssemblyChemEBrainComparison,
  type AssemblyReportLike,
  type ChemEBrainInput,
  type ChemEBrainReport,
  type CorrectedRole,
  type EquationClassification,
  type MissingRequirement,
  type RequiredInformationItem,
  type UnitExpectation,
} from "@workspace/cheme-brain";

type RawModelCard = {
  model_type?: string;
};

type RawExtractionLike = {
  model_type?: string;
  system_type?: string;
  process_description?: string;
  model_card?: RawModelCard;
  initial_conditions?: unknown;
};

export type ChemEBrainEvidenceLabel =
  | "Observed in source"
  | "Inferred by ChemE rules"
  | "Missing for simulation"
  | "Unsupported by current simulator"
  | "Conflicting evidence"
  | "Assumed by source/user";

export interface ChemEBrainModelCardInput {
  extraction: {
    modelCardTitle: string;
    providerUsed: string;
    domain: string;
    systemDescription?: string | null;
    problemStatement?: string | null;
    modelType?: string | null;
    modelTypeOverride?: string | null;
  };
  equations: Array<{
    id: number;
    latex: string;
    plaintext?: string;
    meaning?: string;
    description?: string;
    equationType?: string | null;
    sourceQuote?: string;
  }>;
  variables: Array<{
    symbol: string;
    name?: string;
    role?: string;
    unit?: string | null;
    sourceQuote?: string;
    originalValue?: Record<string, unknown> | null;
  }>;
  parameters: Array<{
    symbol: string;
    name?: string;
    value?: number | string | null;
    valueRaw?: string | null;
    valueNumeric?: number | null;
    unit?: string | null;
    confidence?: string;
    sourceQuote?: string;
    originalValue?: Record<string, unknown> | null;
  }>;
  assumptionItems: Array<{ text: string; sourceQuote?: string; confidence?: string }>;
  limitationItems: Array<{ text: string; sourceQuote?: string; confidence?: string }>;
  raw?: RawExtractionLike | null;
  assemblyReport?: unknown;
  reproducibilityReport?: unknown;
  unitReport?: unknown;
}

export interface ChemEBrainEvidenceRow {
  label: string;
  status: ChemEBrainEvidenceLabel;
  category?: string;
  severity?: string;
  detail: string;
  reason?: string;
}

export interface ChemEBrainRoleRow {
  symbol: string;
  extractedRole: string;
  recommendedRole: string;
  status: ChemEBrainEvidenceLabel;
  reason: string;
}

export interface ChemEBrainEquationRow {
  equation: string;
  classification: string;
  status: ChemEBrainEvidenceLabel;
  reason: string;
}

export interface ChemEBrainUnitRow {
  symbol: string;
  expectedUnit: string;
  status: ChemEBrainEvidenceLabel;
  note: string;
}

export interface ChemEBrainSourceRow {
  sourceType: string;
  reason: string;
}

export interface ChemEBrainDisplayModel {
  report: ChemEBrainReport;
  assemblyComparison: AssemblyChemEBrainComparison;
  verdict: ChemEBrainReport["simulation_support"]["status"];
  verdictReason: string;
  extractedModelType: string;
  canonicalModelType: string;
  confidence: ChemEBrainReport["confidence"];
  confidenceNotes: string[];
  observedRows: ChemEBrainEvidenceRow[];
  inferredRows: ChemEBrainEvidenceRow[];
  missingRows: ChemEBrainEvidenceRow[];
  conflictingRows: ChemEBrainEvidenceRow[];
  unsupportedRows: ChemEBrainEvidenceRow[];
  roleRows: ChemEBrainRoleRow[];
  equationRows: ChemEBrainEquationRow[];
  unitRows: ChemEBrainUnitRow[];
  recommendedSources: ChemEBrainSourceRow[];
  safetyNotes: string[];
  auditTrail: string[];
  copyStrings: string[];
}

export const CHEME_BRAIN_SHADOW_NOTICE =
  "This is advisory and does not change model-card values, assembly, API responses, UI badges, or simulation behavior.";

export const CHEME_BRAIN_COMPARISON_NOTICE =
  "This comparison is advisory and does not change current readiness or simulation behavior.";

export const CHEME_BRAIN_COPY = {
  observed: "Observed in source",
  inferred: "Inferred by ChemE rules",
  missing: "Missing for simulation",
  unsupported: "Unsupported by current simulator",
  conflicting: "Conflicting evidence",
  assumed: "Assumed by source/user",
} as const;

export function buildChemEBrainInputForModelCard(input: ChemEBrainModelCardInput): ChemEBrainInput {
  const raw = input.raw ?? null;
  return {
    extraction: {
      title: input.extraction.modelCardTitle,
      provider_used: input.extraction.providerUsed,
      domain: input.extraction.domain,
      model_type: input.extraction.modelTypeOverride ?? input.extraction.modelType ?? raw?.model_type ?? raw?.model_card?.model_type,
      system_type: raw?.system_type ?? input.extraction.domain,
      process_description: input.extraction.systemDescription ?? raw?.process_description,
      problem_statement: input.extraction.problemStatement,
      model_card: raw?.model_card,
      rawExtractionJson: raw,
      variables: input.variables.map((variable) => ({
        symbol: variable.symbol,
        name: variable.name,
        role: variable.role,
        unit: variable.unit,
        sourceQuote: variable.sourceQuote,
        originalValue: variable.originalValue,
      })),
      parameters: input.parameters.map((parameter) => ({
        symbol: parameter.symbol,
        name: parameter.name,
        value: parameter.value,
        value_raw: parameter.valueRaw ?? safe(parameter.value),
        value_numeric: parameter.valueNumeric ?? numericOrNull(parameter.value),
        unit: parameter.unit,
        confidence: parameter.confidence,
        sourceQuote: parameter.sourceQuote,
        originalValue: parameter.originalValue,
      })),
      equations: input.equations.map((equation) => ({
        id: equation.id,
        equation_plaintext: equation.plaintext || equation.latex,
        equation_latex: equation.latex,
        equation_type: equation.equationType,
        meaning: equation.meaning || equation.description,
        sourceQuote: equation.sourceQuote,
      })),
      initial_conditions: raw?.initial_conditions,
      assumptions: input.assumptionItems.map((item) => item.text),
      limitations: input.limitationItems.map((item) => item.text),
    },
    assemblyReport: input.assemblyReport,
    reproducibilityReport: input.reproducibilityReport,
    unitReport: input.unitReport,
  };
}

export function buildChemEBrainDisplayModel(input: ChemEBrainModelCardInput): ChemEBrainDisplayModel {
  const report = analyzeChemEModel(buildChemEBrainInputForModelCard(input));
  const assemblyComparison = compareAssemblyWithChemEBrain(
    input.assemblyReport as AssemblyReportLike | null | undefined,
    report,
  );
  const extractedModelType =
    input.extraction.modelTypeOverride ??
    input.extraction.modelType ??
    input.raw?.model_type ??
    input.raw?.model_card?.model_type ??
    "unknown";

  const observedRows = report.required_information_checklist
    .filter((item) => item.evidenceStatus === "observed")
    .map(requirementToRow);
  const inferredRows = [
    ...report.required_information_checklist
      .filter((item) => item.evidenceStatus === "inferred")
      .map(requirementToRow),
    ...report.corrected_roles
      .filter((role) => role.evidenceStatus === "inferred")
      .map(roleToEvidenceRow),
    ...report.inferred_units
      .filter((unit) => unit.evidenceStatus === "inferred")
      .map(unitToEvidenceRow),
  ];
  const missingRows = report.missing_requirements.map(missingToRow);
  const conflictingRows = [
    ...report.required_information_checklist
      .filter((item) => item.evidenceStatus === "conflicting")
      .map(requirementToRow),
    ...report.corrected_roles
      .filter((role) => role.evidenceStatus === "conflicting")
      .map(roleToEvidenceRow),
    ...report.contradictions.map((contradiction) => ({
      label: "Contradiction",
      status: CHEME_BRAIN_COPY.conflicting,
      detail: contradiction,
    })),
  ];
  const unsupportedRows = report.required_information_checklist
    .filter((item) => item.evidenceStatus === "unsupported")
    .map(requirementToRow);

  const display: ChemEBrainDisplayModel = {
    report,
    assemblyComparison,
    verdict: report.simulation_support.status,
    verdictReason: report.simulation_support.reason,
    extractedModelType,
    canonicalModelType: report.canonical_model_type,
    confidence: report.confidence,
    confidenceNotes: report.confidence_explanation.notes,
    observedRows,
    inferredRows,
    missingRows,
    conflictingRows,
    unsupportedRows,
    roleRows: report.corrected_roles.map(roleToRow),
    equationRows: report.equation_classification.map(equationToRow),
    unitRows: report.inferred_units.map(unitToRow),
    recommendedSources: report.recommended_next_sources.map((source) => ({
      sourceType: source.sourceType,
      reason: source.reason,
    })),
    safetyNotes: report.warnings.map((warning) => `${warning.message} ${warning.safetyRule}`),
    auditTrail: report.audit_trail,
    copyStrings: [],
  };

  display.copyStrings = collectDisplayStrings(display);
  return display;
}

function requirementToRow(item: RequiredInformationItem): ChemEBrainEvidenceRow {
  return {
    label: item.label,
    status: labelForStatus(item.evidenceStatus),
    category: item.category,
    severity: item.severity,
    detail: (item.evidence ?? []).join("; ") || item.sourceQuote || item.description,
    reason: item.whyItMatters ?? item.description,
  };
}

function missingToRow(item: MissingRequirement): ChemEBrainEvidenceRow {
  return {
    label: item.item,
    status: CHEME_BRAIN_COPY.missing,
    category: item.category,
    severity: item.severity,
    detail: item.whyNeeded,
    reason: item.requiredFor,
  };
}

function roleToEvidenceRow(role: CorrectedRole): ChemEBrainEvidenceRow {
  return {
    label: role.symbol,
    status: labelForStatus(role.evidenceStatus),
    category: "role",
    detail: `${role.extractedRole || "not reported"} -> ${role.recommendedRole}`,
    reason: role.reason,
  };
}

function unitToEvidenceRow(unit: UnitExpectation): ChemEBrainEvidenceRow {
  return {
    label: unit.symbol,
    status: labelForStatus(unit.evidenceStatus),
    category: "unit",
    detail: unit.expectedUnit,
    reason: unit.note,
  };
}

function roleToRow(role: CorrectedRole): ChemEBrainRoleRow {
  return {
    symbol: role.symbol,
    extractedRole: role.extractedRole || "not reported",
    recommendedRole: role.recommendedRole,
    status: labelForStatus(role.evidenceStatus),
    reason: role.reason,
  };
}

function equationToRow(equation: EquationClassification): ChemEBrainEquationRow {
  return {
    equation: equation.equationPattern,
    classification: equation.recommendedType,
    status: labelForStatus(equation.evidenceStatus),
    reason: equation.reason,
  };
}

function unitToRow(unit: UnitExpectation): ChemEBrainUnitRow {
  return {
    symbol: unit.symbol,
    expectedUnit: unit.expectedUnit,
    status: labelForStatus(unit.evidenceStatus),
    note: unit.note,
  };
}

function labelForStatus(status: string): ChemEBrainEvidenceLabel {
  if (status === "observed") return CHEME_BRAIN_COPY.observed;
  if (status === "inferred") return CHEME_BRAIN_COPY.inferred;
  if (status === "missing") return CHEME_BRAIN_COPY.missing;
  if (status === "unsupported") return CHEME_BRAIN_COPY.unsupported;
  if (status === "conflicting") return CHEME_BRAIN_COPY.conflicting;
  return CHEME_BRAIN_COPY.assumed;
}

function safe(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function numericOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function collectDisplayStrings(display: Omit<ChemEBrainDisplayModel, "copyStrings">): string[] {
  return [
    CHEME_BRAIN_SHADOW_NOTICE,
    CHEME_BRAIN_COMPARISON_NOTICE,
    CHEME_BRAIN_COPY.observed,
    CHEME_BRAIN_COPY.inferred,
    CHEME_BRAIN_COPY.missing,
    CHEME_BRAIN_COPY.unsupported,
    CHEME_BRAIN_COPY.conflicting,
    display.verdict,
    display.verdictReason,
    display.extractedModelType,
    display.canonicalModelType,
    display.confidence,
    ...display.confidenceNotes,
    ...display.observedRows.flatMap(rowStrings),
    ...display.inferredRows.flatMap(rowStrings),
    ...display.missingRows.flatMap(rowStrings),
    ...display.conflictingRows.flatMap(rowStrings),
    ...display.unsupportedRows.flatMap(rowStrings),
    ...display.roleRows.flatMap((row) => [
      row.symbol,
      row.extractedRole,
      row.recommendedRole,
      row.status,
      row.reason,
    ]),
    ...display.equationRows.flatMap((row) => [
      row.equation,
      row.classification,
      row.status,
      row.reason,
    ]),
    ...display.unitRows.flatMap((row) => [
      row.symbol,
      row.expectedUnit,
      row.status,
      row.note,
    ]),
    ...display.recommendedSources.flatMap((row) => [row.sourceType, row.reason]),
    ...display.safetyNotes,
    ...display.auditTrail,
    display.assemblyComparison.severity,
    display.assemblyComparison.recommended_action,
    ...display.assemblyComparison.disagreements.flatMap((item) => [
      item.severity,
      item.category,
      item.assembly_says,
      item.cheme_brain_says,
      item.why_it_matters,
      item.recommended_action,
    ]),
  ];
}

function rowStrings(row: ChemEBrainEvidenceRow): string[] {
  return [
    row.label,
    row.status,
    row.category ?? "",
    row.severity ?? "",
    row.detail,
    row.reason ?? "",
  ];
}
