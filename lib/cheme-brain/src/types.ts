/**
 * Pure ChemE Brain types.
 *
 * These types intentionally do not import runtime extraction, DB, UI, or
 * provider modules. They describe a future shadow/audit layer only.
 */

export type EvidenceStatus =
  | "observed"
  | "inferred"
  | "assumed"
  | "missing"
  | "conflicting"
  | "unsupported";

export type SimulationSupport =
  | "unsupported"
  | "scaffold_only"
  | "supported_not_ready"
  | "runnable";

export type ChemECanonicalModelType =
  | "monod_chemostat"
  | "fed_batch"
  | "batch_culture"
  | "cstr"
  | "pfr"
  | "enzyme_kinetics"
  | "gas_liquid"
  | "microalgae_photobioreactor"
  | "oxygen_balanced_mixotrophy"
  | "unknown";

export type ChemEModelTemplateId =
  | "monod_chemostat"
  | "batch_culture"
  | "fed_batch"
  | "gas_liquid"
  | "enzyme_kinetics"
  | "photobioreactor_light"
  | "oxygen_balanced_mixotrophy"
  | "unknown";

export type RequiredInformationCategory =
  | "state"
  | "input"
  | "output"
  | "control"
  | "parameter"
  | "equation"
  | "initial_condition"
  | "boundary_condition"
  | "unit"
  | "assumption"
  | "convention";

export type RequirementSeverity = "critical" | "warning" | "info";

export interface RequiredInformationItem {
  id: string;
  category: RequiredInformationCategory;
  label: string;
  symbols: string[];
  required: boolean;
  evidenceStatus: EvidenceStatus;
  severity: RequirementSeverity;
  description: string;
  acceptableEvidence: string[];
  evidence?: string[];
  sourceQuote?: string;
  whyItMatters?: string;
}

export interface MissingRequirement {
  id: string;
  item: string;
  category:
    | "kinetic_parameter"
    | "stoichiometric_yield"
    | "initial_condition"
    | "boundary_condition"
    | "control_parameter"
    | "physical_constant"
    | "light_model"
    | "gas_transfer"
    | "source_document"
    | "controller"
    | "calibration_required"
    | "model_structure";
  whyNeeded: string;
  requiredFor: string;
  suggestedSources: RecommendedNextSource[];
  severity: RequirementSeverity;
  triggerEvidence?: string[];
}

export interface RecommendedNextSource {
  sourceType:
    | "supporting_information"
    | "parameter_table"
    | "methods_section"
    | "cited_paper"
    | "cited_kinetic_paper"
    | "user_assumption"
    | "existing_code"
    | "calibration_data"
    | "databook"
    | "current_source_review";
  reason: string;
}

export interface CorrectedRole {
  symbol: string;
  extractedRole?: string;
  recommendedRole:
    | "state"
    | "input"
    | "output"
    | "parameter"
    | "control"
    | "intermediate"
    | "unknown";
  evidenceStatus: EvidenceStatus;
  reason: string;
}

export interface EquationClassification {
  equationId?: string;
  equationPattern: string;
  recommendedType:
    | "dynamic_ode"
    | "algebraic"
    | "rate_law"
    | "stoichiometric"
    | "productivity"
    | "yield"
    | "control_law"
    | "reporting"
    | "unknown";
  evidenceStatus: EvidenceStatus;
  reason: string;
}

export interface ChemEWarning {
  id: string;
  severity: RequirementSeverity;
  message: string;
  safetyRule: string;
}

export interface UnitExpectation {
  symbol: string;
  expectedUnit: string;
  evidenceStatus: EvidenceStatus;
  note: string;
}

export interface ChemEModelTemplate {
  id: ChemEModelTemplateId;
  canonicalModelType: ChemECanonicalModelType;
  displayName: string;
  description: string;
  requiredStates: RequiredInformationItem[];
  commonInputs: RequiredInformationItem[];
  commonOutputs: RequiredInformationItem[];
  commonControls: RequiredInformationItem[];
  requiredParameters: RequiredInformationItem[];
  requiredEquations: RequiredInformationItem[];
  requiredInitialOrBoundaryConditions: RequiredInformationItem[];
  commonUnitExpectations: UnitExpectation[];
  commonMissingRequirements: MissingRequirement[];
  simulationSupport: SimulationSupport;
  warnings: ChemEWarning[];
  recommendedNextSources: RecommendedNextSource[];
}

export interface ChemEBrainInput {
  extraction: unknown;
  sourceDiagnostics?: unknown;
  classifierResult?: unknown;
  assemblyReport?: unknown;
  reproducibilityReport?: unknown;
  unitReport?: unknown;
  templateScan?: unknown;
}

export interface EvidenceStatusSummary {
  observed: number;
  inferred: number;
  assumed: number;
  missing: number;
  conflicting: number;
  unsupported: number;
}

export interface ConfidenceExplanation {
  matchedEquations: string[];
  matchedParameters: string[];
  matchedKeywords: string[];
  matchedTemplateRequirements: string[];
  notes: string[];
}

export interface ChemEBrainReport {
  canonical_model_type: ChemECanonicalModelType;
  confidence: "high" | "medium" | "low";
  evidence_status_summary: EvidenceStatusSummary;
  confidence_explanation: ConfidenceExplanation;
  corrected_roles: CorrectedRole[];
  equation_classification: EquationClassification[];
  required_information_checklist: RequiredInformationItem[];
  missing_requirements: MissingRequirement[];
  inferred_units: UnitExpectation[];
  contradictions: string[];
  simulation_support: {
    status: SimulationSupport;
    reason: string;
  };
  recommended_next_sources: RecommendedNextSource[];
  warnings: ChemEWarning[];
  audit_trail: string[];
}
