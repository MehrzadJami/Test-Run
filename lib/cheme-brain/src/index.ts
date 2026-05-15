/**
 * ChemE Brain v1 pure contract.
 *
 * Anti-goals:
 * - Templates must not invent numerical values.
 * - Templates must not mark models runnable by default.
 * - Templates must not treat textbook defaults as source evidence.
 * - Templates must not replace provider extraction.
 * - Templates are checklists and reasoning aids only.
 *
 * Intended future collaborators, not wired here:
 * domain-classifier, template-matcher, unit-checker, model-assembly,
 * reproducibility, extraction-finalizer, explicit extraction,
 * PaperUnderstanding providers, python-generator, and package-generator.
 */

export type {
  ChemEBrainInput,
  ChemEBrainReport,
  ChemECanonicalModelType,
  ChemEModelTemplate,
  ChemEModelTemplateId,
  ChemEWarning,
  ConfidenceExplanation,
  CorrectedRole,
  EquationClassification,
  EvidenceStatus,
  EvidenceStatusSummary,
  MissingRequirement,
  RecommendedNextSource,
  RequiredInformationItem,
  SimulationSupport,
  UnitExpectation,
} from "./types";

export { analyzeChemEModel } from "./analyzer";
export { compareAssemblyWithChemEBrain } from "./assembly-comparison";
export type {
  AssemblyChemEBrainComparison,
  AssemblyChemEBrainComparisonSeverity,
  AssemblyChemEBrainDisagreement,
  AssemblyChemEBrainDisagreementCategory,
  AssemblyReportLike,
} from "./assembly-comparison";

export {
  CHEME_MODEL_TEMPLATE_IDS,
  CHEME_MODEL_TEMPLATES,
  getChemEModelTemplate,
  getChemEModelTemplates,
} from "./templates";
