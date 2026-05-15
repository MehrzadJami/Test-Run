/**
 * Reproducible Model Package Generator — M9
 *
 * Pure TypeScript, client-side only. Produces a Record<filename, content>
 * for every file in the model_package/ ZIP.
 *
 * Design contract:
 *  - Every generated file is honest: no hallucinated values or equations.
 *  - simulate.py is a safe scaffold (reuses python-generator output).
 *  - README explains what is extracted, what is missing, and how to run.
 *  - All scores, warnings, and gaps are embedded in the human-readable files.
 */

import type {
  AnalysisEquation,
  AnalysisVariable,
  AnalysisParameter,
  AnalysisAssumption,
  RawExtraction,
  ReproducibilityReport,
} from "./reproducibility";
import { analyzeReproducibility } from "./reproducibility";
import type { ModelAssemblyReport } from "./model-assembly";
import type { UnitCheckReport } from "./unit-checker";
import { runUnitCheck } from "./unit-checker";
import { generateJupyterNotebook } from "./notebook-generator";
import { MODEL_TYPE_DISPLAY_NAMES } from "@workspace/domain-classifier";
import {
  analyzeChemEModel,
  compareAssemblyWithChemEBrain,
  type AssemblyChemEBrainComparison,
  type AssemblyReportLike,
  type ChemEBrainInput,
  type ChemEBrainReport,
} from "@workspace/cheme-brain";
import {
  getParameterDisplayValue,
  hasKnownParameterValue,
} from "./parameter-values";

// ─── Public input type ─────────────────────────────────────────────────────────

export interface ModelPackageInput {
  title: string;
  projectName: string;
  providerUsed: string;
  domain: string;
  systemType?: string | null;
  systemDescription?: string | null;
  problemStatement?: string | null;
  equations: AnalysisEquation[];
  variables: AnalysisVariable[];
  parameters: AnalysisParameter[];
  assumptionItems: AnalysisAssumption[];
  limitationItems: AnalysisAssumption[];
  raw: RawExtraction | null;
  report: ReproducibilityReport;
  assemblyReport?: ModelAssemblyReport;
  unitReport: UnitCheckReport;
  pythonCode: string;
  review?: {
    status: "extracted" | "needs_review" | "reviewed" | "verified" | "rejected";
    reviewer_name?: string;
    review_notes?: string;
    reviewed_at?: string;
    verification_status?: string;
    issues_found?: string[];
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safe(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function isPlaceholderSymbol(symbol: unknown): boolean {
  const text = safe(symbol).toLowerCase();
  return text === "" || text === "-" || text === "unknown" || text === "n/a";
}

function sanitizeRawExtraction(raw: RawExtraction | null): RawExtraction | null {
  if (!raw) return raw;
  return {
    ...raw,
    state_variables: raw.state_variables?.filter(
      (variable) => !(isPlaceholderSymbol(variable.symbol) && isPlaceholderSymbol(variable.name)),
    ),
    parameters: raw.parameters?.filter((parameter) => !isPlaceholderSymbol(parameter.symbol)),
    equations: raw.equations?.map((equation) => ({
      ...equation,
      variables_involved: equation.variables_involved?.filter((symbol) => !isPlaceholderSymbol(symbol)),
    })),
    model_card: raw.model_card
      ? {
          ...raw.model_card,
          inputs: raw.model_card.inputs?.filter((symbol) => !isPlaceholderSymbol(symbol)),
          outputs: raw.model_card.outputs?.filter((symbol) => !isPlaceholderSymbol(symbol)),
          control_variables: raw.model_card.control_variables?.filter((symbol) => !isPlaceholderSymbol(symbol)),
        }
      : raw.model_card,
  };
}

function isMissingUnit(unit: unknown): boolean {
  const text = safe(unit).toLowerCase();
  return text === "" || text === "-" || text === "unknown" || text === "n/a";
}

function normalizedUnit(unit: unknown): string {
  return safe(unit).toLowerCase().replace(/\s+/g, "");
}

function looksLikeRateUnit(unit: unknown): boolean {
  const text = safe(unit).toLowerCase();
  return /^1\s*\//.test(text) || /\/\s*(h|hr|hour|min|d|day|s)\b/.test(text) || /\^-?1/.test(text);
}

function looksLikeMonodMuEquation(equation: AnalysisEquation): boolean {
  const text = `${equation.latex} ${equation.description}`.replace(/\s+/g, "");
  return /^mu=/.test(text) && /mumax\*?S\/\(Ks\+S\)/.test(text);
}

function appendInferenceNote(sourceQuote: string, note: string): string {
  if (sourceQuote.includes(note)) return sourceQuote;
  return [sourceQuote, note].filter(Boolean).join(" ");
}

function inferMonodMuUnit(
  equations: AnalysisEquation[],
  variables: AnalysisVariable[],
  parameters: AnalysisParameter[],
  raw: RawExtraction | null,
): { variables: AnalysisVariable[]; raw: RawExtraction | null } {
  const hasMuEquation = equations.some(looksLikeMonodMuEquation)
    || (raw?.equations ?? []).some((equation) =>
      looksLikeMonodMuEquation({
        id: 0,
        latex: equation.equation_latex ?? equation.equation_plaintext ?? "",
        description: equation.meaning ?? "",
        sourceQuote: equation.source_context ?? "",
        equationType: equation.equation_type,
      }),
    );
  if (!hasMuEquation) return { variables, raw };

  const mumax = parameters.find((parameter) => safe(parameter.symbol).toLowerCase() === "mumax");
  const sUnit = variables.find((variable) => safe(variable.symbol) === "S")?.unit
    ?? parameters.find((parameter) => safe(parameter.symbol) === "S")?.unit;
  const ksUnit = parameters.find((parameter) => safe(parameter.symbol) === "Ks")?.unit;
  const rateUnit = safe(mumax?.unit);
  if (
    !rateUnit ||
    !looksLikeRateUnit(rateUnit) ||
    normalizedUnit(sUnit) === "" ||
    normalizedUnit(sUnit) !== normalizedUnit(ksUnit)
  ) {
    return { variables, raw };
  }

  const note = "Unit inferred from Monod growth equation and mumax unit.";
  const nextVariables = variables.map((variable) => {
    if (safe(variable.symbol) !== "mu" || !isMissingUnit(variable.unit)) return variable;
    return {
      ...variable,
      unit: rateUnit,
      sourceQuote: appendInferenceNote(variable.sourceQuote, note),
    };
  });

  const nextRaw = raw
    ? {
        ...raw,
        state_variables: raw.state_variables?.map((variable) => {
          if (safe(variable.symbol) !== "mu" || !isMissingUnit(variable.unit)) return variable;
          return {
            ...variable,
            unit: rateUnit,
            source_context: appendInferenceNote(variable.source_context ?? "", note),
          };
        }),
      }
    : raw;

  return { variables: nextVariables, raw: nextRaw };
}

function providerDisclosure(providerUsed: string): string | null {
  if (providerUsed === "mock") {
    return "Demo mode: this export was generated by MockProvider. It is a fixed demonstration and does not reflect source text.";
  }
  if (providerUsed === "rule_based") {
    return "Rule-based local extraction: deterministic flat/local extraction was used. It is not full-paper semantic AI understanding.";
  }
  if (providerUsed === "groq") {
    return "Groq cloud AI was used for paper understanding. AI extraction must be manually verified against the source.";
  }
  return null;
}

const CHEME_BRAIN_DISCLAIMER =
  "This is an advisory engineering audit generated from extracted evidence. It is not validation, certification, or proof of model correctness.";

function numericOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function buildChemEBrainInput(input: ModelPackageInput): ChemEBrainInput {
  const raw = input.raw;
  return {
    extraction: {
      title: input.title,
      project_name: input.projectName,
      provider_used: input.providerUsed,
      domain: input.domain,
      model_type: raw?.model_type ?? raw?.model_card?.model_type,
      system_type: input.systemType ?? raw?.system_type,
      process_description: input.systemDescription ?? raw?.process_description,
      problem_statement: input.problemStatement,
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
        equation_plaintext: equation.latex,
        equation_latex: equation.latex,
        equation_type: equation.equationType,
        meaning: equation.description,
        sourceQuote: equation.sourceQuote,
      })),
      initial_conditions: raw?.initial_conditions,
      assumptions: input.assumptionItems.map((item) => item.text),
      limitations: input.limitationItems.map((item) => item.text),
    },
    assemblyReport: input.assemblyReport,
    reproducibilityReport: input.report,
    unitReport: input.unitReport,
  };
}

function mdCell(value: unknown): string {
  return safe(value).replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function statusLabel(status: string): string {
  return `\`${status}\``;
}

function makeChecklistRows(report: ChemEBrainReport, status: string): string[] {
  const items = report.required_information_checklist.filter((item) => item.evidenceStatus === status);
  if (items.length === 0) return ["_(none)_"];
  const lines = ["| Requirement | Category | Evidence | Why it matters |", "|---|---|---|---|"];
  for (const item of items) {
    lines.push(
      `| ${mdCell(item.label)} | ${statusLabel(item.evidenceStatus)} ${mdCell(item.category)} | ${mdCell((item.evidence ?? []).join("; ") || item.sourceQuote || "not found")} | ${mdCell(item.whyItMatters ?? item.description)} |`,
    );
  }
  return lines;
}

function makeChemEBrainReportMd(report: ChemEBrainReport, comparison: AssemblyChemEBrainComparison): string {
  const lines: string[] = [];

  lines.push("# ChemE Brain Shadow Report");
  lines.push("");
  lines.push(CHEME_BRAIN_DISCLAIMER);
  lines.push("");
  lines.push("> Shadow mode: this report is exported for engineering review only. It does not change model-card values, model assembly, API responses, UI badges, or simulation behavior.");
  lines.push("");

  lines.push("## ChemE Brain verdict");
  lines.push("");
  lines.push(`- Advisory simulation support: ${statusLabel(report.simulation_support.status)}`);
  lines.push(`- Reason: ${report.simulation_support.reason}`);
  lines.push("");

  lines.push("## Assembly vs ChemE Brain — Shadow Comparison");
  lines.push("");
  lines.push("This comparison is advisory and does not change current readiness or simulation behavior.");
  lines.push("");
  lines.push(`- Severity: ${statusLabel(comparison.severity)}`);
  lines.push(`- Recommended action: ${comparison.recommended_action}`);
  lines.push("");
  if (comparison.disagreements.length === 0) {
    lines.push("No shadow disagreement was detected for the checked assembly conditions.");
  } else {
    lines.push("| Severity | Category | Model assembly says | ChemE Brain says | Why it matters | Recommended action |");
    lines.push("|---|---|---|---|---|---|");
    for (const item of comparison.disagreements) {
      lines.push(
        `| ${item.severity} | ${mdCell(item.category)} | ${mdCell(item.assembly_says)} | ${mdCell(item.cheme_brain_says)} | ${mdCell(item.why_it_matters)} | ${mdCell(item.recommended_action)} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Model type and confidence");
  lines.push("");
  lines.push(`- Canonical model type: \`${report.canonical_model_type}\``);
  lines.push(`- Confidence: \`${report.confidence}\``);
  lines.push(`- Matched equations: ${report.confidence_explanation.matchedEquations.join(", ") || "none"}`);
  lines.push(`- Matched parameters: ${report.confidence_explanation.matchedParameters.join(", ") || "none"}`);
  lines.push(`- Matched keywords: ${report.confidence_explanation.matchedKeywords.join(", ") || "none"}`);
  lines.push(`- Matched template requirements: ${report.confidence_explanation.matchedTemplateRequirements.join(", ") || "none"}`);
  lines.push("");

  lines.push("## What was observed");
  lines.push("");
  lines.push(...makeChecklistRows(report, "observed"));
  lines.push("");

  lines.push("## What was inferred");
  lines.push("");
  const inferredRoles = report.corrected_roles.filter((role) => role.evidenceStatus === "inferred");
  const inferredUnits = report.inferred_units.filter((unit) => unit.evidenceStatus === "inferred");
  if (inferredRoles.length === 0 && inferredUnits.length === 0) {
    lines.push("_(none)_");
  } else {
    for (const role of inferredRoles) {
      lines.push(`- ${statusLabel(role.evidenceStatus)} \`${role.symbol}\` → ${role.recommendedRole}: ${role.reason}`);
    }
    for (const unit of inferredUnits) {
      lines.push(`- ${statusLabel(unit.evidenceStatus)} \`${unit.symbol}\` unit expectation \`${unit.expectedUnit}\`: ${unit.note}`);
    }
  }
  lines.push("");

  lines.push("## What is missing");
  lines.push("");
  if (report.missing_requirements.length === 0) {
    lines.push("_(none)_");
  } else {
    lines.push("| Missing item | Category | Severity | Why needed | Suggested sources |");
    lines.push("|---|---|---|---|---|");
    for (const item of report.missing_requirements) {
      lines.push(
        `| ${mdCell(item.item)} | ${statusLabel("missing")} ${mdCell(item.category)} | ${item.severity} | ${mdCell(item.whyNeeded)} | ${mdCell(item.suggestedSources.map((source) => source.sourceType).join(", "))} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Equation classification");
  lines.push("");
  if (report.equation_classification.length === 0) {
    lines.push("_(none)_");
  } else {
    lines.push("| Equation | Classification | Evidence status | Reason |");
    lines.push("|---|---|---|---|");
    for (const equation of report.equation_classification) {
      lines.push(
        `| \`${mdCell(equation.equationPattern)}\` | ${equation.recommendedType} | ${statusLabel(equation.evidenceStatus)} | ${mdCell(equation.reason)} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Variable/parameter role review");
  lines.push("");
  if (report.corrected_roles.length === 0) {
    lines.push("_(none)_");
  } else {
    lines.push("| Symbol | Extracted role | Recommended role | Evidence status | Reason |");
    lines.push("|---|---|---|---|---|");
    for (const role of report.corrected_roles) {
      lines.push(
        `| \`${mdCell(role.symbol)}\` | ${mdCell(role.extractedRole || "not reported")} | ${role.recommendedRole} | ${statusLabel(role.evidenceStatus)} | ${mdCell(role.reason)} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Unit/convention review");
  lines.push("");
  if (report.inferred_units.length === 0 && report.contradictions.length === 0) {
    lines.push("_(no inferred units or contradictions)_");
  } else {
    for (const unit of report.inferred_units) {
      lines.push(`- ${statusLabel(unit.evidenceStatus)} \`${unit.symbol}\`: expected \`${unit.expectedUnit}\`. ${unit.note}`);
    }
    for (const contradiction of report.contradictions) {
      lines.push(`- ${statusLabel("conflicting")} ${contradiction}`);
    }
  }
  lines.push("");

  lines.push("## Simulation support");
  lines.push("");
  lines.push(`- Advisory status: ${statusLabel(report.simulation_support.status)}`);
  lines.push(`- Explanation: ${report.simulation_support.reason}`);
  lines.push("- Runtime behavior: unchanged by this shadow report.");
  lines.push("");

  lines.push("## Recommended next sources");
  lines.push("");
  if (report.recommended_next_sources.length === 0) {
    lines.push("_(none)_");
  } else {
    for (const source of report.recommended_next_sources) {
      lines.push(`- \`${source.sourceType}\`: ${source.reason}`);
    }
  }
  lines.push("");

  lines.push("## Safety notes");
  lines.push("");
  lines.push("| Severity | Message | Safety rule |");
  lines.push("|---|---|---|");
  for (const warning of report.warnings) {
    lines.push(`| ${warning.severity} | ${mdCell(warning.message)} | ${mdCell(warning.safetyRule)} |`);
  }
  lines.push("");
  lines.push("### Audit trail");
  lines.push("");
  for (const item of report.audit_trail) {
    lines.push(`- ${item}`);
  }

  return lines.join("\n");
}

/** Escape a CSV cell: wrap in quotes, double internal quotes, and neutralise
 *  formula-injection prefixes (=, +, @, -) so the value is not executed as a
 *  spreadsheet formula when the CSV is opened in Excel / Google Sheets. */
function csvCell(v: unknown): string {
  const s = safe(v);
  // Prefix neutralisation: a cell starting with =, +, @, or - could be
  // interpreted as a formula by spreadsheet apps. Prepend a tab to defuse it.
  const safe_s = /^[=+@\-]/.test(s) ? `\t${s}` : s;
  if (safe_s.includes(",") || safe_s.includes('"') || safe_s.includes("\n") || safe_s.includes("\t")) {
    return `"${safe_s.replace(/"/g, '""')}"`;
  }
  return safe_s;
}

function csvRow(...cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

function hr(char = "-", len = 72): string {
  return char.repeat(len);
}

function readinessLabel(r: ReproducibilityReport["simulation_readiness"]): string {
  if (r === "ready") return "✅ Simulation Ready";
  if (r === "partial") return "⚠️  Partially Ready (review TODOs)";
  return "❌ Not Ready — critical information missing";
}

function unitStatusLabel(s: UnitCheckReport["unit_check_status"]): string {
  if (s === "pass") return "✅ Pass";
  if (s === "warning") return "⚠️  Warning";
  return "❌ Fail";
}

// ─── File generators ──────────────────────────────────────────────────────────

function makeReadme(input: ModelPackageInput, chemEBrainReport?: ChemEBrainReport): string {
  const {
    title, projectName, providerUsed, systemType,
    systemDescription, problemStatement,
    equations, variables, parameters, assumptionItems, limitationItems,
    report, assemblyReport, unitReport, review,
  } = input;

  const date = new Date().toISOString().slice(0, 10);
  const paramsWithValues = parameters.filter(hasKnownParameterValue).length;
  const criticals = report.missing_items.filter((m) => m.severity === "critical");
  const warnings  = report.missing_items.filter((m) => m.severity === "warning");
  const highUnits = unitReport.warnings.filter((w) => w.severity === "high").length;
  const medUnits  = unitReport.warnings.filter((w) => w.severity === "medium").length;

  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push(`**Project:** ${projectName}`);
  lines.push(`**Generated by:** ChemAI Model Compiler  |  **Provider:** ${providerUsed}  |  **Date:** ${date}`);
  const disclosure = providerDisclosure(providerUsed);
  if (disclosure) lines.push(`**Provider warning:** ${disclosure}`);
  lines.push(`**Review status:** ${review?.status ?? "extracted"}`);
  if (review?.reviewer_name) lines.push(`**Reviewer:** ${review.reviewer_name}`);
  if (review?.reviewed_at) lines.push(`**Reviewed at:** ${review.reviewed_at}`);
  if (systemType) lines.push(`**System type:** ${systemType}`);
  lines.push("");

  lines.push(hr("="));
  lines.push("## Human review notes");
  lines.push(hr("="));
  lines.push("");
  lines.push(
    "Verified means manually checked by the user against the provided source, not experimentally validated.",
  );
  lines.push("");
  lines.push(`Status: ${review?.status ?? "extracted"}`);
  if (review?.review_notes) lines.push(`Notes: ${review.review_notes}`);
  if ((review?.issues_found ?? []).length > 0) {
    lines.push("Issues found:");
    for (const issue of review!.issues_found!) lines.push(`- ${issue}`);
  }
  lines.push("");

  lines.push(hr("="));
  lines.push("## What this model is");
  lines.push(hr("="));
  lines.push("");
  if (systemDescription) {
    lines.push(systemDescription);
  } else {
    lines.push("_(No system description extracted.)_");
  }
  lines.push("");

  if (problemStatement) {
    lines.push("**Problem Statement:**");
    lines.push("");
    lines.push(problemStatement);
    lines.push("");
  }

  lines.push(hr("="));
  lines.push("## What was extracted");
  lines.push(hr("="));
  lines.push("");
  lines.push(`| Item | Count | Notes |`);
  lines.push(`|---|---|---|`);
  lines.push(`| State variables | ${variables.length} | symbols with unit + role |`);
  lines.push(`| Parameters | ${parameters.length} | ${paramsWithValues} have numeric values |`);
  lines.push(`| Equations | ${equations.length} | with LaTeX + source quotes |`);
  lines.push(`| Assumptions | ${assumptionItems.length} | extracted from source text |`);
  lines.push(`| Limitations | ${limitationItems.length} | extracted from source text |`);
  lines.push("");

  if (chemEBrainReport) {
    lines.push(hr("="));
    lines.push("## ChemE Brain readiness advisory");
    lines.push(hr("="));
    lines.push("");
    lines.push(`**Verdict:** ${chemEBrainReport.simulation_support.status}`);
    lines.push(`**Reason:** ${chemEBrainReport.simulation_support.reason}`);
    if (chemEBrainReport.missing_requirements.length > 0) {
      lines.push("");
      lines.push("**Top blockers:**");
      for (const missing of chemEBrainReport.missing_requirements.slice(0, 6)) {
        lines.push(`- ${missing.item}: ${missing.whyNeeded}`);
      }
      lines.push("");
      lines.push("You can still export the scaffold/model package while these blockers are resolved.");
    }
    lines.push("");
  }

  lines.push(hr("="));
  lines.push("## Reproducibility assessment");
  lines.push(hr("="));
  lines.push("");
  lines.push(`**Overall score:** ${report.overall_score}/100`);
  lines.push(`**Simulation readiness:** ${readinessLabel(report.simulation_readiness)}`);
  if (assemblyReport) {
    lines.push(`**Model assembly:** ${assemblyReport.assembly_status}`);
    lines.push(`**Runnable model:** ${assemblyReport.can_generate_runnable_model ? "yes" : "no"}`);
  }
  lines.push("");
  lines.push("| Sub-score | Value |");
  lines.push("|---|---|");
  lines.push(`| Equations completeness | ${report.equations_completeness}/100 |`);
  lines.push(`| Parameters completeness | ${report.parameters_completeness}/100 |`);
  lines.push(`| Units completeness | ${report.units_completeness}/100 |`);
  lines.push(`| Initial conditions | ${report.initial_conditions_completeness}/100 |`);
  lines.push(`| Source traceability | ${report.source_traceability}/100 |`);
  lines.push("");

  lines.push(hr("="));
  lines.push("## What is missing");
  lines.push(hr("="));
  lines.push("");

  if (criticals.length === 0 && warnings.length === 0) {
    lines.push("✅ No critical gaps detected.");
  } else {
    if (criticals.length > 0) {
      lines.push("### ❌ Critical (must resolve before simulation)");
      lines.push("");
      for (const item of criticals) {
        lines.push(`- **[${item.category}]** ${item.description}`);
      }
      lines.push("");
    }
    if (warnings.length > 0) {
      lines.push("### ⚠️  Warnings (should verify)");
      lines.push("");
      for (const item of warnings) {
        lines.push(`- **[${item.category}]** ${item.description}`);
      }
      lines.push("");
    }
  }

  if (report.main_blockers.length > 0) {
    lines.push("**Simulation blockers:**");
    for (const b of report.main_blockers) {
      lines.push(`- ${b}`);
    }
    lines.push("");
  }

  lines.push(hr("="));
  lines.push("## Unit check status");
  lines.push(hr("="));
  lines.push("");
  lines.push(`**Status:** ${unitStatusLabel(unitReport.unit_check_status)}`);
  lines.push(`**Issues:** ${highUnits} high severity · ${medUnits} medium severity`);
  lines.push("");
  if (highUnits > 0) {
    lines.push("High-severity unit issues:");
    for (const w of unitReport.warnings.filter((w) => w.severity === "high")) {
      lines.push(`- ${w.message}`);
      if (w.suggestion) lines.push(`  → ${w.suggestion}`);
    }
    lines.push("");
  }

  lines.push(hr("="));
  lines.push("## How to run the Python template");
  lines.push(hr("="));
  lines.push("");
  lines.push("```bash");
  lines.push("# 1. Install dependencies");
  lines.push("pip install -r requirements.txt");
  lines.push("");
  lines.push("# 2. Open simulate.py and fill in all # TODO comments");
  lines.push("#    - Verify numeric parameter values against the source paper");
  lines.push("#    - Translate each LaTeX equation into Python (shown as comments)");
  lines.push("#    - Set realistic initial conditions for each state variable");
  lines.push("");
  lines.push("# 3. Run the simulation");
  lines.push("python simulate.py");
  lines.push("");
  lines.push("# 4. Output: model_simulation.png (time-series plot)");
  lines.push("```");
  lines.push("");
  lines.push("> **Important:** `simulate.py` is a scaffold, not a finished simulation.");
  lines.push("> All equation implementations are `# TODO` stubs — the LaTeX is shown");
  lines.push("> as a reference comment. Expert review is required before trusting output.");
  lines.push("");

  lines.push(hr("="));
  lines.push("## Files in this package");
  lines.push(hr("="));
  lines.push("");
  lines.push("| File | Description |");
  lines.push("|---|---|");
  lines.push("| `README.md` | This file |");
  lines.push("| `model_card.md` | Full human-readable model card |");
  lines.push("| `variables.csv` | Extracted state variables (symbol, unit, role) |");
  lines.push("| `parameters.csv` | Extracted parameters (symbol, value, unit, confidence) |");
  lines.push("| `equations.md` | Extracted equations with LaTeX and source quotes |");
  lines.push("| `assumptions.md` | Model assumptions from the source |");
  lines.push("| `limitations.md` | Model limitations from the source |");
  lines.push("| `missing_information.md` | Reproducibility gaps and recommended next steps |");
  lines.push("| `cheme_brain_report.json` | ChemE Brain shadow engineering audit (machine-readable) |");
  lines.push("| `cheme_brain_report.md` | ChemE Brain shadow engineering audit (human-readable) |");
  if (assemblyReport) {
    lines.push("| `model_assembly_report.json` | Full model assembly readiness analysis (machine-readable) |");
    lines.push("| `missing_requirements.md` | Source requests and missing model requirements |");
  }
  lines.push("| `reproducibility_report.json` | Full reproducibility analysis (machine-readable) |");
  lines.push("| `unit_check_report.json` | Unit & dimension check results (machine-readable) |");
  lines.push("| `raw_extraction.json` | Raw extraction JSON from the provider |");
  lines.push("| `simulate.py` | Python ODE scaffold (fill in TODOs before running) |");
  lines.push("| `model_notebook.ipynb` | Jupyter notebook export (simulation workflow scaffold) |");
  lines.push("| `requirements.txt` | Python dependencies |");
  lines.push("| `source_excerpt.txt` | Source quotes from the paper used during extraction |");
  lines.push("");

  if (report.recommended_next_steps.length > 0) {
    lines.push(hr("="));
    lines.push("## Recommended next steps");
    lines.push(hr("="));
    lines.push("");
    for (let i = 0; i < report.recommended_next_steps.length; i++) {
      lines.push(`${i + 1}. ${report.recommended_next_steps[i]}`);
    }
    lines.push("");
  }

  if (assemblyReport && assemblyReport.recommended_next_actions.length > 0) {
    lines.push(hr("="));
    lines.push("## Source requests");
    lines.push(hr("="));
    lines.push("");
    for (let i = 0; i < assemblyReport.recommended_next_actions.length; i++) {
      lines.push(`${i + 1}. ${assemblyReport.recommended_next_actions[i]}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function makeModelCard(input: ModelPackageInput): string {
  const {
    title, projectName, providerUsed, domain, systemType,
    systemDescription, problemStatement,
    equations, variables, parameters, assumptionItems, limitationItems,
    raw, report, assemblyReport, unitReport,
  } = input;

  const date = new Date().toISOString().slice(0, 10);
  const mc = raw?.model_card;
  const lines: string[] = [];

  lines.push(`# Model Card: ${title}`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Project | ${projectName} |`);
  lines.push(`| Domain | ${domain} |`);
  if (systemType) lines.push(`| System type | ${systemType} |`);
  lines.push(`| Provider | ${providerUsed} |`);
  const disclosure = providerDisclosure(providerUsed);
  if (disclosure) lines.push(`| Provider warning | ${disclosure} |`);
  lines.push(`| Reproducibility | ${report.overall_score}/100 |`);
  if (assemblyReport) {
    lines.push(`| Assembly status | ${assemblyReport.assembly_status} |`);
    lines.push(`| Runnable from current source | ${assemblyReport.can_generate_runnable_model ? "yes" : "no"} |`);
  }
  lines.push(`| Simulation readiness | ${report.simulation_readiness} |`);
  lines.push(`| Unit check | ${unitReport.unit_check_status} |`);
  lines.push(`| Generated | ${date} |`);
  lines.push("");

  if (mc?.model_type || mc?.short_summary) {
    lines.push("## Model Summary");
    lines.push("");
    if (mc.model_type) lines.push(`**Type:** ${mc.model_type}`);
    if (mc.short_summary) lines.push(`\n${mc.short_summary}`);
    lines.push("");
    if ((mc.inputs ?? []).length > 0) lines.push(`**Inputs:** ${mc.inputs!.join(", ")}`);
    if ((mc.outputs ?? []).length > 0) lines.push(`**Outputs:** ${mc.outputs!.join(", ")}`);
    if ((mc.control_variables ?? []).length > 0) lines.push(`**Control variables:** ${mc.control_variables!.join(", ")}`);
    lines.push("");
  }

  lines.push("## System Description");
  lines.push("");
  lines.push(systemDescription || "_(not extracted)_");
  lines.push("");

  lines.push("## Problem Statement");
  lines.push("");
  lines.push(problemStatement || "_(not extracted)_");
  lines.push("");

  lines.push("## State Variables");
  lines.push("");
  if (variables.length === 0) {
    lines.push("_(none extracted)_");
  } else {
    lines.push("| Symbol | Name | Unit | Role | Source |");
    lines.push("|---|---|---|---|---|");
    for (const v of variables) {
      lines.push(`| \`${v.symbol}\` | ${safe(v.name)} | ${safe(v.unit) || "—"} | ${v.role} | ${safe(v.sourceQuote).slice(0, 80)}… |`);
    }
  }
  lines.push("");

  lines.push("## Parameters");
  lines.push("");
  if (parameters.length === 0) {
    lines.push("_(none extracted)_");
  } else {
    lines.push("| Symbol | Value | Unit | Confidence | Source |");
    lines.push("|---|---|---|---|---|");
    for (const p of parameters) {
      lines.push(`| \`${p.symbol}\` | ${getParameterDisplayValue(p)} | ${safe(p.unit) || "—"} | ${p.confidence} | ${safe(p.sourceQuote).slice(0, 80)}… |`);
    }
  }
  lines.push("");

  lines.push("## Equations");
  lines.push("");
  if (equations.length === 0) {
    lines.push("_(none extracted)_");
  } else {
    for (let i = 0; i < equations.length; i++) {
      const eq = equations[i];
      lines.push(`### Equation ${i + 1}: ${eq.description || "(no description)"}`);
      if (eq.equationType) lines.push(`**Type:** ${eq.equationType}`);
      if (eq.latex) lines.push(`\`${eq.latex}\``);
      if (eq.sourceQuote) lines.push(`\n> ${eq.sourceQuote}`);
      lines.push("");
    }
  }

  lines.push("## Assumptions");
  lines.push("");
  if (assumptionItems.length === 0) {
    lines.push("_(none extracted)_");
  } else {
    for (const a of assumptionItems) lines.push(`- ${a.text}`);
  }
  lines.push("");

  lines.push("## Limitations");
  lines.push("");
  if (limitationItems.length === 0) {
    lines.push("_(none extracted)_");
  } else {
    for (const l of limitationItems) lines.push(`- ${l.text}`);
  }
  lines.push("");

  return lines.join("\n");
}

function makeVariablesCsv(variables: AnalysisVariable[]): string {
  const rows: string[] = [
    csvRow("symbol", "name", "unit", "role", "source_quote"),
  ];
  for (const v of variables) {
    rows.push(csvRow(v.symbol, v.name, v.unit ?? "", v.role, v.sourceQuote));
  }
  return rows.join("\n");
}

function makeParametersCsv(parameters: AnalysisParameter[]): string {
  const rows: string[] = [
    csvRow("symbol", "value", "unit", "confidence", "source_quote"),
  ];
  for (const p of parameters) {
    rows.push(csvRow(p.symbol, getParameterDisplayValue(p), p.unit ?? "", p.confidence, p.sourceQuote));
  }
  return rows.join("\n");
}

function makeEquationsMd(equations: AnalysisEquation[], raw: RawExtraction | null): string {
  const rawEqs = raw?.equations ?? [];
  const lines: string[] = ["# Extracted Equations", ""];

  if (equations.length === 0 && rawEqs.length === 0) {
    lines.push("_(No equations were extracted.)_");
    return lines.join("\n");
  }

  // Prefer raw entries (richer) over normalized
  if (rawEqs.length > 0) {
    for (let i = 0; i < rawEqs.length; i++) {
      const eq = rawEqs[i];
      const label = safe(eq.label) || `Equation ${i + 1}`;
      lines.push(`## ${i + 1}. ${label}`);
      lines.push("");
      if (eq.equation_latex) {
        lines.push("**LaTeX:**");
        lines.push("```");
        lines.push(eq.equation_latex);
        lines.push("```");
      }
      if (eq.equation_plaintext && eq.equation_plaintext !== eq.equation_latex) {
        lines.push(`**Plain text:** ${eq.equation_plaintext}`);
      }
      if (eq.meaning) lines.push(`**Meaning:** ${eq.meaning}`);
      if (eq.equation_type) lines.push(`**Type:** ${eq.equation_type}`);
      if ((eq.variables_involved ?? []).length > 0) {
        lines.push(`**Symbols involved:** ${eq.variables_involved!.join(", ")}`);
      }
      if (eq.confidence) lines.push(`**Confidence:** ${eq.confidence}`);
      if (eq.source_context) {
        lines.push("");
        lines.push(`> ${eq.source_context}`);
      }
      lines.push("");
    }
  } else {
    for (let i = 0; i < equations.length; i++) {
      const eq = equations[i];
      lines.push(`## ${i + 1}. ${eq.description || "(no description)"}`);
      lines.push("");
      if (eq.latex) {
        lines.push("```");
        lines.push(eq.latex);
        lines.push("```");
      }
      if (eq.equationType) lines.push(`**Type:** ${eq.equationType}`);
      if (eq.sourceQuote) {
        lines.push("");
        lines.push(`> ${eq.sourceQuote}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function makeAssumptionsMd(items: AnalysisAssumption[]): string {
  const lines: string[] = ["# Model Assumptions", ""];
  if (items.length === 0) {
    lines.push("_(No assumptions were extracted.)_");
  } else {
    for (let i = 0; i < items.length; i++) {
      lines.push(`${i + 1}. ${items[i].text}`);
    }
  }
  return lines.join("\n");
}

function makeLimitationsMd(items: AnalysisAssumption[]): string {
  const lines: string[] = ["# Model Limitations", ""];
  if (items.length === 0) {
    lines.push("_(No limitations were extracted.)_");
  } else {
    for (let i = 0; i < items.length; i++) {
      lines.push(`${i + 1}. ${items[i].text}`);
    }
  }
  return lines.join("\n");
}

function makeMissingInfoMd(report: ReproducibilityReport): string {
  const lines: string[] = ["# Missing Information Report", ""];
  lines.push(`_Generated by ChemAI Model Compiler reproducibility engine — ${new Date().toISOString().slice(0, 10)}_`);
  lines.push("");
  lines.push(`**Overall reproducibility score:** ${report.overall_score}/100`);
  lines.push("_Heuristic estimate — not a peer-reviewed metric._");
  lines.push(`**Simulation readiness:** ${report.simulation_readiness}`);
  lines.push("");

  const criticals = report.missing_items.filter((m) => m.severity === "critical");
  const warnings  = report.missing_items.filter((m) => m.severity === "warning");
  const infos     = report.missing_items.filter((m) => m.severity === "info");

  if (criticals.length === 0 && warnings.length === 0 && infos.length === 0) {
    lines.push("✅ No issues detected.");
  } else {
    if (criticals.length > 0) {
      lines.push("## ❌ Critical Issues");
      lines.push("_Must resolve before attempting simulation._");
      lines.push("");
      for (const item of criticals) {
        lines.push(`- **[${item.category}]** ${item.description}`);
      }
      lines.push("");
    }
    if (warnings.length > 0) {
      lines.push("## ⚠️  Warnings");
      lines.push("_Should verify before trusting simulation output._");
      lines.push("");
      for (const item of warnings) {
        lines.push(`- **[${item.category}]** ${item.description}`);
      }
      lines.push("");
    }
    if (infos.length > 0) {
      lines.push("## ℹ️  Informational");
      lines.push("");
      for (const item of infos) {
        lines.push(`- **[${item.category}]** ${item.description}`);
      }
      lines.push("");
    }
  }

  if (report.main_blockers.length > 0) {
    lines.push("## Simulation Blockers");
    lines.push("");
    for (const b of report.main_blockers) lines.push(`- ${b}`);
    lines.push("");
  }

  if (report.recommended_next_steps.length > 0) {
    lines.push("## Recommended Next Steps");
    lines.push("");
    for (let i = 0; i < report.recommended_next_steps.length; i++) {
      lines.push(`${i + 1}. ${report.recommended_next_steps[i]}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function makeAssemblyMissingRequirementsMd(report: ModelAssemblyReport): string {
  const lines: string[] = ["# Missing Requirements", ""];
  lines.push("This report lists model assembly gaps detected from the current source only.");
  lines.push("No missing values are invented here; provide another source, assumptions, code, or calibration data before treating the model as runnable.");
  lines.push("");
  lines.push(`**Assembly status:** ${report.assembly_status}`);
  lines.push(
    `**Target model type:** ${MODEL_TYPE_DISPLAY_NAMES[report.target_model_type]} (${report.target_model_type})`,
  );
  lines.push(`**Runnable model can be generated:** ${report.can_generate_runnable_model ? "yes" : "no"}`);
  lines.push(`**Scaffold can be generated:** ${report.can_generate_scaffold ? "yes" : "no"}`);
  lines.push("");

  const critical = report.missing_requirements.filter((item) => item.severity === "critical");
  if (critical.length > 0) {
    lines.push("## Critical Missing Requirements");
    lines.push("");
    for (const item of critical) {
      lines.push(`- **${item.item}**`);
      lines.push(`  - Category: ${item.category}`);
      lines.push(`  - Why needed: ${item.why_needed}`);
      lines.push(`  - Suggested source: ${item.suggested_source}`);
    }
    lines.push("");
  }

  lines.push("## All Missing Items");
  lines.push("");
  if (report.missing_requirements.length === 0) {
    lines.push("No missing assembly requirements detected.");
  } else {
    lines.push("| Severity | Category | Item | Why needed | Suggested source |");
    lines.push("|---|---|---|---|---|");
    for (const item of report.missing_requirements) {
      lines.push(
        `| ${item.severity} | ${item.category} | ${item.item} | ${item.why_needed} | ${item.suggested_source} |`,
      );
    }
  }
  lines.push("");

  if (report.recommended_next_actions.length > 0) {
    lines.push("## Recommended Next Actions");
    lines.push("");
    for (let i = 0; i < report.recommended_next_actions.length; i++) {
      lines.push(`${i + 1}. ${report.recommended_next_actions[i]}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function makeRequirementsTxt(): string {
  return [
    "# Python dependencies for ChemAI Model Compiler simulation template",
    "# Install with: pip install -r requirements.txt",
    "",
    "numpy>=1.24",
    "scipy>=1.10",
    "matplotlib>=3.7",
    "",
  ].join("\n");
}

function makeSourceExcerpt(
  equations: AnalysisEquation[],
  variables: AnalysisVariable[],
  parameters: AnalysisParameter[],
  raw: RawExtraction | null
): string {
  const lines: string[] = [
    "Source Quotes Extracted from the Paper",
    "=" .repeat(60),
    "Generated by ChemAI Model Compiler — these are verbatim excerpts used",
    "to extract model data. They serve as the traceability record.",
    "",
  ];

  const seen = new Set<string>();
  function addQuote(category: string, symbol: string, quote: string) {
    const q = quote.trim();
    if (!q || seen.has(q)) return;
    seen.add(q);
    lines.push(`[${category}] ${symbol}`);
    lines.push(hr("-", 40));
    lines.push(q);
    lines.push("");
  }

  lines.push("EQUATIONS");
  lines.push(hr("=", 40));
  lines.push("");
  for (const eq of equations) {
    addQuote("Equation", eq.description || eq.latex.slice(0, 40), eq.sourceQuote);
  }
  // Also check raw equations for source_context
  for (const eq of raw?.equations ?? []) {
    if (eq.source_context) {
      addQuote("Equation (raw)", safe(eq.label) || safe(eq.equation_latex).slice(0, 40), eq.source_context);
    }
  }

  lines.push("VARIABLES");
  lines.push(hr("=", 40));
  lines.push("");
  for (const v of variables) {
    addQuote("Variable", v.symbol, v.sourceQuote);
  }
  for (const v of raw?.state_variables ?? []) {
    if (v.source_context) {
      addQuote("Variable (raw)", safe(v.symbol), v.source_context);
    }
  }

  lines.push("PARAMETERS");
  lines.push(hr("=", 40));
  lines.push("");
  for (const p of parameters) {
    addQuote("Parameter", p.symbol, p.sourceQuote);
  }
  for (const p of raw?.parameters ?? []) {
    if (p.source_context) {
      addQuote("Parameter (raw)", safe(p.symbol), p.source_context);
    }
  }

  if (seen.size === 0) {
    lines.push("(No source quotes were extracted for this model.)");
  }

  return lines.join("\n");
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Generate all files for the model package.
 * Returns a flat Record<filename, content> — the caller wraps these in a ZIP.
 */
export function generateModelPackage(
  input: ModelPackageInput
): Record<string, string> {
  const sanitizedRaw = sanitizeRawExtraction(input.raw);
  const sanitizedVariables = input.variables.filter(
    (variable) => !(isPlaceholderSymbol(variable.symbol) && isPlaceholderSymbol(variable.name)),
  );
  const sanitizedParameters = input.parameters.filter((parameter) => !isPlaceholderSymbol(parameter.symbol));
  const inferred = inferMonodMuUnit(input.equations, sanitizedVariables, sanitizedParameters, sanitizedRaw);
  const recomputedReport = analyzeReproducibility(
    input.equations,
    inferred.variables,
    sanitizedParameters,
    [...input.assumptionItems, ...input.limitationItems],
    inferred.raw,
    input.systemDescription ?? "",
    input.problemStatement ?? "",
    input.pythonCode,
  );
  const recomputedUnitReport = runUnitCheck(input.equations, inferred.variables, sanitizedParameters, inferred.raw);
  const cleanInput: ModelPackageInput = {
    ...input,
    variables: inferred.variables,
    parameters: sanitizedParameters,
    raw: inferred.raw,
    report: recomputedReport,
    unitReport: recomputedUnitReport,
  };
  const { equations, variables, parameters, assumptionItems, limitationItems, raw, report, assemblyReport, unitReport, pythonCode } = cleanInput;
  let chemEBrainReport: ChemEBrainReport;
  try {
    chemEBrainReport = analyzeChemEModel(buildChemEBrainInput(cleanInput));
  } catch {
    chemEBrainReport = {
      canonical_model_type: "unknown",
      confidence: "low",
      confidence_explanation: { matchedEquations: [], matchedParameters: [], matchedKeywords: [], matchedTemplateRequirements: [] },
      simulation_support: { status: "not_ready", reason: "ChemE Brain analysis failed during export generation." },
      missing_requirements: [],
      available_from_current_source: [],
      role_assignment_warnings: [],
    } as unknown as ChemEBrainReport;
  }
  const assemblyComparison = compareAssemblyWithChemEBrain(
    assemblyReport as AssemblyReportLike | null | undefined,
    chemEBrainReport,
  );

  const files: Record<string, string> = {};

  files["README.md"]                   = makeReadme(cleanInput, chemEBrainReport);
  files["model_card.md"]               = makeModelCard(cleanInput);
  files["variables.csv"]               = makeVariablesCsv(variables);
  files["parameters.csv"]              = makeParametersCsv(parameters);
  files["equations.md"]                = makeEquationsMd(equations, raw);
  files["assumptions.md"]              = makeAssumptionsMd(assumptionItems);
  files["limitations.md"]              = makeLimitationsMd(limitationItems);
  files["missing_information.md"]      = makeMissingInfoMd(report);
  files["cheme_brain_report.json"]     = JSON.stringify({ ...chemEBrainReport, assembly_comparison: assemblyComparison }, null, 2);
  files["cheme_brain_report.md"]       = makeChemEBrainReportMd(chemEBrainReport, assemblyComparison);
  if (assemblyReport) {
    files["model_assembly_report.json"] = JSON.stringify(assemblyReport, null, 2);
    files["missing_requirements.md"]    = makeAssemblyMissingRequirementsMd(assemblyReport);
  }
  files["reproducibility_report.json"] = JSON.stringify(report, null, 2);
  files["unit_check_report.json"]      = JSON.stringify(unitReport, null, 2);
  files["raw_extraction.json"]         = raw != null
    ? JSON.stringify(raw, null, 2)
    : '{\n  "_note": "No raw extraction JSON available for this record."\n}';
  files["simulate.py"]                 = pythonCode;
  files["model_notebook.ipynb"]        = generateJupyterNotebook({
    title: cleanInput.title,
    projectName: cleanInput.projectName,
    providerUsed: cleanInput.providerUsed,
    systemType: cleanInput.systemType,
    systemDescription: cleanInput.systemDescription ?? null,
    equations,
    variables,
    parameters,
    assumptions: [...assumptionItems, ...limitationItems],
    raw,
    report,
    unitReport,
    pythonCode,
  });
  files["requirements.txt"]            = makeRequirementsTxt();
  files["source_excerpt.txt"]          = makeSourceExcerpt(equations, variables, parameters, raw);

  return files;
}
