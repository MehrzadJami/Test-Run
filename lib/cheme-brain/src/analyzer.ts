import {
  CHEME_MODEL_TEMPLATES,
  getChemEModelTemplate,
} from "./templates";
import type {
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
  RequiredInformationCategory,
  RequiredInformationItem,
  SimulationSupport,
  UnitExpectation,
} from "./types";

/**
 * Deterministic ChemE Brain v1 shadow analyzer.
 *
 * Scope:
 * - Pure TypeScript only.
 * - No AI calls, no network calls, no randomness.
 * - No runtime app imports. These small heuristics intentionally stay local
 *   until the shadow report stabilizes and can be compared against existing
 *   classifier/template/unit/assembly modules.
 *
 * Evidence discipline:
 * - Template requirements are checklists, never observed evidence.
 * - Observed means present in extraction-like input or supplied source text.
 * - Inferred means derived from observed evidence by the explicit rules below.
 * - Missing means required by the selected template and absent from evidence.
 */

type Confidence = ChemEBrainReport["confidence"];

interface NormalizedVariable {
  symbol: string;
  name: string;
  role: string;
  unit: string;
  source: string;
  sourceLabel: string;
  explicitState: boolean;
}

interface NormalizedParameter {
  symbol: string;
  name: string;
  value: string;
  unit: string;
  source: string;
  sourceLabel: string;
  // AUDIT-3: true if the extraction-finalizer mutated a critical field on
  // this parameter row (status or confidence). When true, evidence supplied
  // by this parameter cannot be claimed as `observed` for readiness decisions.
  finalizerPromoted: boolean;
}

interface NormalizedEquation {
  id: string;
  text: string;
  declaredType: string;
  source: string;
}

interface NormalizedInitialCondition {
  symbol: string;
  stateSymbol: string;
  value: string;
  unit: string;
  source: string;
}

interface NormalizedExtraction {
  explicitModelTypes: ChemECanonicalModelType[];
  variables: NormalizedVariable[];
  parameters: NormalizedParameter[];
  equations: NormalizedEquation[];
  initialConditions: NormalizedInitialCondition[];
  assumptions: string[];
  limitations: string[];
  sourceTexts: string[];
  classifierModelTypes: ChemECanonicalModelType[];
}

interface ModelTypeCandidate {
  type: ChemECanonicalModelType;
  templateId: ChemEModelTemplateId;
  score: number;
  matchedEquations: string[];
  matchedParameters: string[];
  matchedKeywords: string[];
  matchedTemplateRequirements: string[];
}

const MODEL_TYPE_ALIASES: Record<string, ChemECanonicalModelType> = {
  monod_chemostat: "monod_chemostat",
  chemostat: "monod_chemostat",
  monod: "monod_chemostat",
  fed_batch: "fed_batch",
  fedbatch: "fed_batch",
  fed_batch_culture: "fed_batch",
  batch_culture: "batch_culture",
  batch_reactor: "batch_culture",
  batch: "batch_culture",
  cstr: "cstr",
  pfr: "pfr",
  enzyme_kinetics: "enzyme_kinetics",
  michaelis_menten: "enzyme_kinetics",
  enzyme: "enzyme_kinetics",
  gas_liquid: "gas_liquid",
  gas_liquid_transfer: "gas_liquid",
  oxygen_transfer: "gas_liquid",
  microalgae_photobioreactor: "microalgae_photobioreactor",
  microalgae_pbr: "microalgae_photobioreactor",
  photobioreactor_light: "microalgae_photobioreactor",
  oxygen_balanced_mixotrophy: "oxygen_balanced_mixotrophy",
  mixotrophy: "oxygen_balanced_mixotrophy",
  unknown: "unknown",
  generic_ode: "unknown",
};

const TEMPLATE_FOR_MODEL_TYPE: Record<ChemECanonicalModelType, ChemEModelTemplateId> = {
  monod_chemostat: "monod_chemostat",
  fed_batch: "fed_batch",
  batch_culture: "batch_culture",
  cstr: "unknown",
  pfr: "unknown",
  enzyme_kinetics: "enzyme_kinetics",
  gas_liquid: "gas_liquid",
  microalgae_photobioreactor: "photobioreactor_light",
  oxygen_balanced_mixotrophy: "oxygen_balanced_mixotrophy",
  unknown: "unknown",
};

const PARAMETER_TABLE_SOURCE: RecommendedNextSource = {
  sourceType: "parameter_table",
  reason: "A parameter table can provide source-backed symbols, values, and units.",
};

const METHODS_SOURCE: RecommendedNextSource = {
  sourceType: "methods_section",
  reason: "The methods section can confirm operating mode, initial conditions, and boundary conditions.",
};

const DATABOOK_SOURCE: RecommendedNextSource = {
  sourceType: "databook",
  reason: "Convention-dependent physical constants should come from a verified databook.",
};

const USER_ASSUMPTION_SOURCE: RecommendedNextSource = {
  sourceType: "user_assumption",
  reason: "A user assumption can fill a gap only when it is explicitly labelled as assumed.",
};

const SUPPORTING_INFORMATION_SOURCE: RecommendedNextSource = {
  sourceType: "supporting_information",
  reason: "Supporting Information often contains derivations, parameter tables, and operating details.",
};

export function analyzeChemEModel(input: ChemEBrainInput): ChemEBrainReport {
  const normalized = normalizeInput(input);
  const classifiedEquations = classifyEquations(normalized.equations);
  const derivativeStates = collectDerivativeStates(classifiedEquations);
  const modelTypeDecision = chooseCanonicalModelType(normalized, classifiedEquations);
  const template = getChemEModelTemplate(modelTypeDecision.templateId);
  const correctedRoles = buildCorrectedRoles(normalized, classifiedEquations, derivativeStates, modelTypeDecision.type);
  const checklist = buildRequiredInformationChecklist(template, normalized, classifiedEquations, derivativeStates);
  const missingRequirements = buildMissingRequirements(template, checklist, normalized, classifiedEquations);
  const contradictions = buildContradictions(normalized, correctedRoles);
  const inferredUnits = buildInferredUnits(normalized, classifiedEquations);
  const simulationSupport = determineSimulationSupport(
    modelTypeDecision.type,
    checklist,
    missingRequirements,
    normalized,
    classifiedEquations,
  );
  const warnings = buildWarnings(template, correctedRoles, contradictions, simulationSupport);
  const recommendedNextSources = buildRecommendedSources(template, missingRequirements, simulationSupport.status);
  const statusSummary = summarizeEvidence(checklist, correctedRoles, classifiedEquations, missingRequirements, contradictions);
  const auditTrail = buildAuditTrail(modelTypeDecision, simulationSupport);

  return {
    canonical_model_type: modelTypeDecision.type,
    confidence: modelTypeDecision.confidence,
    evidence_status_summary: statusSummary,
    confidence_explanation: modelTypeDecision.explanation,
    corrected_roles: sortCorrectedRoles(correctedRoles),
    equation_classification: classifiedEquations,
    required_information_checklist: checklist,
    missing_requirements: missingRequirements,
    inferred_units: inferredUnits,
    contradictions,
    simulation_support: simulationSupport,
    recommended_next_sources: recommendedNextSources,
    warnings,
    audit_trail: auditTrail,
  };
}

function normalizeInput(input: ChemEBrainInput): NormalizedExtraction {
  const extraction = asRecord(input.extraction);
  const raw = firstRecord(
    extraction.rawExtractionJson,
    extraction.raw_extraction_json,
    extraction.raw,
    extraction.paper_understanding,
    extraction.paperUnderstanding,
  );
  const modelCard = firstRecord(extraction.modelCard, extraction.model_card);
  const classifier = asRecord(input.classifierResult);

  const sourceTexts = uniqueSorted([
    ...collectText(extraction),
    ...collectText(input.sourceDiagnostics),
    ...collectText(input.assemblyReport),
  ]);

  const explicitModelTypes = uniqueModelTypes([
    normalizeModelType(extraction.model_type),
    normalizeModelType(extraction.modelType),
    normalizeModelType(modelCard.model_type),
    normalizeModelType(modelCard.modelType),
    normalizeModelType(raw.model_type),
    normalizeModelType(raw.modelType),
  ]);

  const classifierModelTypes = uniqueModelTypes([
    normalizeModelType(classifier.model_type),
    normalizeModelType(classifier.modelType),
    normalizeModelType(classifier.canonical_model_type),
    normalizeModelType(classifier.canonicalModelType),
  ]);

  return {
    explicitModelTypes,
    variables: normalizeVariables(extraction, raw),
    parameters: normalizeParameters(extraction, raw),
    equations: normalizeEquations(extraction, raw),
    initialConditions: normalizeInitialConditions(extraction, raw),
    assumptions: normalizeStringArray(extraction.assumptions, raw.assumptions),
    limitations: normalizeStringArray(
      extraction.limitations,
      extraction.limitations_or_missing_info,
      raw.limitations,
      raw.limitations_or_missing_info,
    ),
    sourceTexts,
    classifierModelTypes,
  };
}

function normalizeVariables(extraction: Record<string, unknown>, raw: Record<string, unknown>): NormalizedVariable[] {
  const variables: NormalizedVariable[] = [];
  const add = (value: unknown, sourceLabel: string, defaultRole = ""): void => {
    for (const entry of asArray(value)) {
      if (typeof entry === "string") {
        variables.push({
          symbol: entry,
          name: entry,
          role: defaultRole,
          unit: "",
          source: entry,
          sourceLabel,
          explicitState: defaultRole === "state",
        });
        continue;
      }
      const record = asRecord(entry);
      const symbol = textValue(record.symbol, record.id, record.name);
      const name = textValue(record.name, record.meaning, record.description, symbol);
      const role = textValue(record.role, record.type, defaultRole);
      variables.push({
        symbol,
        name,
        role,
        unit: textValue(record.unit, record.units),
        source: sourceEvidence(record, symbol || name),
        sourceLabel,
        explicitState: role.toLowerCase() === "state" || defaultRole === "state",
      });
    }
  };

  add(extraction.variables, "extraction.variables");
  add(extraction.state_variables, "extraction.state_variables", "state");
  add(raw.variables, "raw.variables");
  add(raw.state_variables, "raw.state_variables", "state");
  add(raw.candidate_state_variables, "raw.candidate_state_variables", "state");
  add(raw.candidate_inputs, "raw.candidate_inputs", "input");
  add(raw.candidate_outputs, "raw.candidate_outputs", "output");
  add(raw.candidate_controls, "raw.candidate_controls", "control");

  return dedupeVariables(variables);
}

function normalizeParameters(extraction: Record<string, unknown>, raw: Record<string, unknown>): NormalizedParameter[] {
  const parameters: NormalizedParameter[] = [];
  const add = (value: unknown, sourceLabel: string): void => {
    for (const entry of asArray(value)) {
      if (typeof entry === "string") {
        parameters.push({
          symbol: entry,
          name: entry,
          value: "",
          unit: "",
          source: entry,
          sourceLabel,
          finalizerPromoted: false,
        });
        continue;
      }
      const record = asRecord(entry);
      const symbol = textValue(record.symbol, record.id, record.name);
      const name = textValue(record.name, record.meaning, record.description, symbol);
      parameters.push({
        symbol,
        name,
        value: textValue(record.value_numeric, record.valueNumeric, record.value, record.value_raw, record.valueRaw),
        unit: textValue(record.unit, record.units),
        source: sourceEvidence(record, symbol || name),
        sourceLabel,
        finalizerPromoted: hasFinalizerCriticalChange(record),
      });
    }
  };

  add(extraction.parameters, "extraction.parameters");
  add(raw.parameters, "raw.parameters");
  add(raw.candidate_parameters, "raw.candidate_parameters");
  add(raw.controls_and_setpoints, "raw.controls_and_setpoints");

  return dedupeParameters(parameters);
}

function normalizeEquations(extraction: Record<string, unknown>, raw: Record<string, unknown>): NormalizedEquation[] {
  const equations: NormalizedEquation[] = [];
  const add = (value: unknown, sourceLabel: string): void => {
    let index = 0;
    for (const entry of asArray(value)) {
      index += 1;
      if (typeof entry === "string") {
        equations.push({
          id: `${sourceLabel}:${index}`,
          text: entry,
          declaredType: "",
          source: entry,
        });
        continue;
      }
      const record = asRecord(entry);
      const text = textValue(
        record.equation_plaintext,
        record.equationPlaintext,
        record.equation_latex,
        record.equationLatex,
        record.latex,
        record.equation,
        record.text,
        record.description,
      );
      if (text.length === 0) {
        continue;
      }
      equations.push({
        id: textValue(record.id, record.label, `${sourceLabel}:${index}`),
        text,
        declaredType: textValue(record.equation_type, record.equationType, record.type),
        source: sourceEvidence(record, text),
      });
    }
  };

  add(extraction.equations, "extraction.equations");
  add(raw.equations, "raw.equations");
  add(raw.candidate_equations, "raw.candidate_equations");

  return dedupeEquations(equations);
}

function normalizeInitialConditions(
  extraction: Record<string, unknown>,
  raw: Record<string, unknown>,
): NormalizedInitialCondition[] {
  const initialConditions: NormalizedInitialCondition[] = [];
  const add = (value: unknown, sourceLabel: string): void => {
    for (const entry of asArray(value)) {
      if (typeof entry === "string") {
        const symbol = parseInitialConditionSymbol(entry);
        initialConditions.push({
          symbol: symbol.symbol,
          stateSymbol: symbol.stateSymbol,
          value: "",
          unit: "",
          source: entry,
        });
        continue;
      }
      const record = asRecord(entry);
      const symbol = textValue(record.symbol, record.id, record.name);
      const stateSymbol = textValue(record.state_symbol, record.stateSymbol, inferStateSymbolFromInitialCondition(symbol));
      initialConditions.push({
        symbol,
        stateSymbol,
        value: textValue(record.value_numeric, record.valueNumeric, record.value, record.value_raw, record.valueRaw),
        unit: textValue(record.unit, record.units),
        source: sourceEvidence(record, `${symbol} initial condition`),
      });
    }
  };

  add(extraction.initial_conditions, "extraction.initial_conditions");
  add(extraction.initialConditions, "extraction.initialConditions");
  add(raw.initial_conditions, "raw.initial_conditions");
  add(raw.initialConditions, "raw.initialConditions");

  for (const parameter of normalizeParameters(extraction, raw)) {
    if (isInitialConditionSymbol(parameter.symbol) || /initial condition/i.test(`${parameter.name} ${parameter.source}`)) {
      initialConditions.push({
        symbol: parameter.symbol,
        stateSymbol: inferStateSymbolFromInitialCondition(parameter.symbol),
        value: parameter.value,
        unit: parameter.unit,
        source: parameter.source,
      });
    }
  }

  return dedupeInitialConditions(initialConditions);
}

function classifyEquations(equations: NormalizedEquation[]): EquationClassification[] {
  return equations
    .map((equation, index): EquationClassification => {
      const text = equation.text.trim();
      const lower = text.toLowerCase();
      const dynamicState = derivativeStateFromEquation(text);
      if (dynamicState.length > 0) {
        return {
          equationId: equation.id || `equation-${index + 1}`,
          equationPattern: text,
          recommendedType: "dynamic_ode",
          evidenceStatus: "observed",
          reason: `Left-hand side contains derivative notation for ${dynamicState.join(", ")}.`,
        };
      }
      if (/\b(pid|controller|control law|setpoint|set point|kp|ki|kd)\b/i.test(text)) {
        return {
          equationId: equation.id || `equation-${index + 1}`,
          equationPattern: text,
          recommendedType: "control_law",
          evidenceStatus: "observed",
          reason: "Equation contains controller or setpoint terminology.",
        };
      }
      if (/\bproductiv/i.test(lower)) {
        return {
          equationId: equation.id || `equation-${index + 1}`,
          equationPattern: text,
          recommendedType: "productivity",
          evidenceStatus: "observed",
          reason: "Equation is a productivity calculation, not a state derivative.",
        };
      }
      if (/\byield\b|\by\s*[_a-z0-9]*\s*=/i.test(text)) {
        return {
          equationId: equation.id || `equation-${index + 1}`,
          equationPattern: text,
          recommendedType: "yield",
          evidenceStatus: "observed",
          reason: "Equation defines a yield or ratio metric, not a state derivative.",
        };
      }
      if (/[→⇌]|->|=>/.test(text) || /\bstoichiometric|carbon balance|oxygen balance\b/i.test(text)) {
        return {
          equationId: equation.id || `equation-${index + 1}`,
          equationPattern: text,
          recommendedType: "stoichiometric",
          evidenceStatus: "observed",
          reason: "Equation has reaction/balance semantics rather than an explicit state derivative.",
        };
      }
      if (/^\s*(mu|μ|v|r)\s*=/.test(lower) || /\b(mumax|mu_max|μmax|ks|k_s|monod|haldane|vmax|v_max|km|k_m|michaelis)\b/i.test(text)) {
        return {
          equationId: equation.id || `equation-${index + 1}`,
          equationPattern: text,
          recommendedType: "rate_law",
          evidenceStatus: "observed",
          reason: "Equation defines a growth or kinetic rate relation.",
        };
      }
      if (/\breported|calculated|ratio|fraction|conversion\b/i.test(text)) {
        return {
          equationId: equation.id || `equation-${index + 1}`,
          equationPattern: text,
          recommendedType: "reporting",
          evidenceStatus: "observed",
          reason: "Equation appears to define a reported metric.",
        };
      }
      return {
        equationId: equation.id || `equation-${index + 1}`,
        equationPattern: text,
        recommendedType: text.includes("=") ? "algebraic" : "unknown",
        evidenceStatus: text.includes("=") ? "observed" : "unsupported",
        reason: text.includes("=") ? "Equation contains an algebraic equality without derivative evidence." : "No equation semantics were recognized.",
      };
    })
    .sort((a, b) => stableCompare(a.equationPattern, b.equationPattern));
}

function chooseCanonicalModelType(
  normalized: NormalizedExtraction,
  classifiedEquations: EquationClassification[],
): ModelTypeCandidate & { confidence: Confidence; explanation: ConfidenceExplanation } {
  const candidates = [
    scoreMonod(normalized, classifiedEquations),
    scoreGasLiquid(normalized, classifiedEquations),
    scoreEnzyme(normalized, classifiedEquations),
    scoreFedBatch(normalized, classifiedEquations),
    scoreBatch(normalized, classifiedEquations),
    scoreOxygenMixotrophy(normalized, classifiedEquations),
    scorePhotobioreactor(normalized, classifiedEquations),
  ].sort((a, b) => b.score - a.score || stableCompare(a.type, b.type));

  const explicit = normalized.explicitModelTypes.find((type) => type !== "unknown");
  const classifier = normalized.classifierModelTypes.find((type) => type !== "unknown");
  const best = candidates[0] ?? unknownCandidate();
  let selected: ModelTypeCandidate = best.score >= 3 ? best : unknownCandidate();
  const notes: string[] = [];

  if (explicit) {
    const explicitCandidate = candidates.find((candidate) => candidate.type === explicit);
    if (best.type === explicit && best.score >= 1) {
      selected = {
        ...best,
        matchedKeywords: uniqueSorted([...best.matchedKeywords, `explicit:${explicit}`]),
      };
      notes.push(`Extraction reported ${explicit}; evidence was consistent.`);
    } else if (explicitCandidate && explicitCandidate.score >= 2) {
      selected = {
        ...explicitCandidate,
        matchedKeywords: uniqueSorted([...explicitCandidate.matchedKeywords, `explicit:${explicit}`]),
      };
      notes.push(`Extraction reported ${explicit}; local evidence was sufficient to preserve it in shadow mode.`);
    } else if (best.score < 3) {
      selected = {
        ...unknownCandidate(),
        type: explicit,
        templateId: TEMPLATE_FOR_MODEL_TYPE[explicit],
        score: 2,
        matchedKeywords: [`explicit:${explicit}`],
      };
      notes.push(`Extraction reported ${explicit}; ChemE Brain found limited supporting evidence.`);
    }
  } else if (classifier && best.score >= 2 && classifier === best.type) {
    selected = {
      ...best,
      matchedKeywords: uniqueSorted([...best.matchedKeywords, `classifier:${classifier}`]),
    };
    notes.push(`Classifier and extraction evidence both support ${classifier}.`);
  } else if (selected.type !== "unknown") {
    notes.push(`Model type inferred from matched equations, parameters, keywords, and template requirements.`);
  } else {
    notes.push("No supported model template had enough observed evidence for a safe inference.");
  }

  const confidence = selected.score >= 8 ? "high" : selected.score >= 4 ? "medium" : "low";
  return {
    ...selected,
    confidence,
    explanation: {
      matchedEquations: uniqueSorted(selected.matchedEquations),
      matchedParameters: uniqueSorted(selected.matchedParameters),
      matchedKeywords: uniqueSorted(selected.matchedKeywords),
      matchedTemplateRequirements: uniqueSorted(selected.matchedTemplateRequirements),
      notes: uniqueSorted(notes),
    },
  };
}

function scoreMonod(normalized: NormalizedExtraction, classifiedEquations: EquationClassification[]): ModelTypeCandidate {
  const matchedEquations: string[] = [];
  const matchedParameters: string[] = [];
  const matchedKeywords: string[] = [];
  const matchedTemplateRequirements: string[] = [];
  let score = 0;
  if (hasDynamicEquationFor(classifiedEquations, "X")) {
    score += 2;
    matchedEquations.push("dX/dt");
    matchedTemplateRequirements.push("monod-eq-dxdt");
  }
  if (hasDynamicEquationFor(classifiedEquations, "S")) {
    score += 2;
    matchedEquations.push("dS/dt");
    matchedTemplateRequirements.push("monod-eq-dsdt");
  }
  if (classifiedEquations.some((equation) => equation.recommendedType === "rate_law" && /mu|μ|mumax|ks/i.test(equation.equationPattern))) {
    score += 2;
    matchedEquations.push("mu rate law");
    matchedTemplateRequirements.push("monod-eq-mu");
  }
  for (const symbol of ["mumax", "Ks", "D", "Sin", "Yxs"]) {
    if (hasParameter(normalized, symbol)) {
      score += 1;
      matchedParameters.push(symbol);
      matchedTemplateRequirements.push(`monod-param-${normalizeId(symbol)}`);
    }
  }
  const text = joinedText(normalized);
  for (const keyword of ["chemostat", "monod", "dilution", "continuous"]) {
    if (text.includes(keyword)) {
      score += 1;
      matchedKeywords.push(keyword);
    }
  }
  return {
    type: "monod_chemostat",
    templateId: "monod_chemostat",
    score,
    matchedEquations,
    matchedParameters,
    matchedKeywords,
    matchedTemplateRequirements,
  };
}

function scoreGasLiquid(normalized: NormalizedExtraction, classifiedEquations: EquationClassification[]): ModelTypeCandidate {
  const matchedEquations: string[] = [];
  const matchedParameters: string[] = [];
  const matchedKeywords: string[] = [];
  const matchedTemplateRequirements: string[] = [];
  let score = 0;
  if (classifiedEquations.some((equation) => /dc[_ ]?o?2?\/dt|dC_O2\/dt|dc_o2\/dt/i.test(equation.equationPattern))) {
    score += 3;
    matchedEquations.push("dC_O2/dt");
    matchedTemplateRequirements.push("gas-eq-transfer");
  }
  for (const symbol of ["kLa", "Cstar_O2", "Cstar", "qO2"]) {
    if (hasParameter(normalized, symbol) || hasSymbolInEquations(classifiedEquations, symbol)) {
      score += 1;
      matchedParameters.push(symbol);
    }
  }
  const text = joinedText(normalized);
  for (const keyword of ["gas-liquid", "oxygen", "dissolved oxygen", "henry", "saturation", "equilibrium", "aerobic"]) {
    if (text.includes(keyword)) {
      score += 1;
      matchedKeywords.push(keyword);
    }
  }
  return {
    type: "gas_liquid",
    templateId: "gas_liquid",
    score,
    matchedEquations,
    matchedParameters,
    matchedKeywords,
    matchedTemplateRequirements,
  };
}

function scoreEnzyme(normalized: NormalizedExtraction, classifiedEquations: EquationClassification[]): ModelTypeCandidate {
  const matchedEquations: string[] = [];
  const matchedParameters: string[] = [];
  const matchedKeywords: string[] = [];
  let score = 0;
  if (hasParameter(normalized, "Vmax")) {
    score += 2;
    matchedParameters.push("Vmax");
  }
  if (hasParameter(normalized, "Km")) {
    score += 2;
    matchedParameters.push("Km");
  }
  if (classifiedEquations.some((equation) => /v\s*=|vmax|km|michaelis/i.test(equation.equationPattern))) {
    score += 2;
    matchedEquations.push("Michaelis-Menten rate law");
  }
  const text = joinedText(normalized);
  for (const keyword of ["enzyme", "michaelis", "menten"]) {
    if (text.includes(keyword)) {
      score += 1;
      matchedKeywords.push(keyword);
    }
  }
  return {
    type: "enzyme_kinetics",
    templateId: "enzyme_kinetics",
    score,
    matchedEquations,
    matchedParameters,
    matchedKeywords,
    matchedTemplateRequirements: matchedParameters.map((symbol) => `enzyme-param-${normalizeId(symbol)}`),
  };
}

function scoreFedBatch(normalized: NormalizedExtraction, classifiedEquations: EquationClassification[]): ModelTypeCandidate {
  const matchedEquations: string[] = [];
  const matchedParameters: string[] = [];
  const matchedKeywords: string[] = [];
  let score = 0;
  const text = joinedText(normalized);
  if (/\bfed[- ]?batch\b/.test(text)) {
    score += 3;
    matchedKeywords.push("fed-batch");
  }
  if (hasParameter(normalized, "F") || text.includes("feed profile") || text.includes("f(t)")) {
    score += 2;
    matchedParameters.push("F(t)");
  }
  if (hasParameter(normalized, "V") || hasSymbolInEquations(classifiedEquations, "V") || /dv\s*\/\s*dt/i.test(text)) {
    score += 2;
    matchedEquations.push("volume/feed evidence");
  }
  return {
    type: "fed_batch",
    templateId: "fed_batch",
    score,
    matchedEquations,
    matchedParameters,
    matchedKeywords,
    matchedTemplateRequirements: ["fed-input-feed", "fed-state-v"].filter((_, index) => score > index),
  };
}

function scoreBatch(normalized: NormalizedExtraction, classifiedEquations: EquationClassification[]): ModelTypeCandidate {
  const matchedEquations: string[] = [];
  const matchedParameters: string[] = [];
  const matchedKeywords: string[] = [];
  let score = 0;
  const text = joinedText(normalized);
  if (/\bbatch\b/.test(text) && !/\bfed[- ]?batch\b/.test(text)) {
    score += 3;
    matchedKeywords.push("batch");
  }
  if (hasDynamicEquationFor(classifiedEquations, "X")) {
    score += 1;
    matchedEquations.push("dX/dt");
  }
  if (hasDynamicEquationFor(classifiedEquations, "S")) {
    score += 1;
    matchedEquations.push("dS/dt");
  }
  if (!hasParameter(normalized, "D")) {
    matchedKeywords.push("no dilution requirement");
  }
  return {
    type: "batch_culture",
    templateId: "batch_culture",
    score,
    matchedEquations,
    matchedParameters,
    matchedKeywords,
    matchedTemplateRequirements: matchedEquations,
  };
}

function scoreOxygenMixotrophy(normalized: NormalizedExtraction, classifiedEquations: EquationClassification[]): ModelTypeCandidate {
  const matchedEquations: string[] = [];
  const matchedParameters: string[] = [];
  const matchedKeywords: string[] = [];
  let score = 0;
  const text = joinedText(normalized);
  for (const keyword of ["mixotrophy", "mixotrophic", "acetate", "do control", "dissolved oxygen control", "oxygen-balanced"]) {
    if (text.includes(keyword)) {
      score += 2;
      matchedKeywords.push(keyword);
    }
  }
  for (const keyword of ["pfd", "light", "photobioreactor", "microalgae"]) {
    if (text.includes(keyword)) {
      score += 1;
      matchedKeywords.push(keyword);
    }
  }
  if (classifiedEquations.some((equation) => /yield|productiv|carbon balance|oxygen balance/i.test(equation.equationPattern))) {
    score += 1;
    matchedEquations.push("reported productivity/yield/carbon/oxygen balance");
  }
  return {
    type: "oxygen_balanced_mixotrophy",
    templateId: "oxygen_balanced_mixotrophy",
    score,
    matchedEquations,
    matchedParameters,
    matchedKeywords,
    matchedTemplateRequirements: matchedKeywords,
  };
}

function scorePhotobioreactor(normalized: NormalizedExtraction, classifiedEquations: EquationClassification[]): ModelTypeCandidate {
  const matchedEquations: string[] = [];
  const matchedParameters: string[] = [];
  const matchedKeywords: string[] = [];
  let score = 0;
  const text = joinedText(normalized);
  for (const keyword of ["photobioreactor", "pbr", "pfd", "irradiance", "light attenuation", "microalgae"]) {
    if (text.includes(keyword)) {
      score += 1;
      matchedKeywords.push(keyword);
    }
  }
  if (classifiedEquations.some((equation) => /light|irradiance|pfd/i.test(equation.equationPattern))) {
    score += 1;
    matchedEquations.push("light relation");
  }
  return {
    type: "microalgae_photobioreactor",
    templateId: "photobioreactor_light",
    score,
    matchedEquations,
    matchedParameters,
    matchedKeywords,
    matchedTemplateRequirements: matchedKeywords,
  };
}

function unknownCandidate(): ModelTypeCandidate {
  return {
    type: "unknown",
    templateId: "unknown",
    score: 0,
    matchedEquations: [],
    matchedParameters: [],
    matchedKeywords: [],
    matchedTemplateRequirements: [],
  };
}

function buildCorrectedRoles(
  normalized: NormalizedExtraction,
  classifiedEquations: EquationClassification[],
  derivativeStates: Set<string>,
  modelType: ChemECanonicalModelType,
): CorrectedRole[] {
  const roles = new Map<string, CorrectedRole>();
  const add = (role: CorrectedRole): void => {
    const key = normalizeSymbol(role.symbol);
    if (!key) {
      return;
    }
    const existing = roles.get(key);
    if (!existing || rolePriority(role.evidenceStatus) > rolePriority(existing.evidenceStatus)) {
      roles.set(key, role);
    }
  };

  for (const variable of normalized.variables) {
    const normalizedSymbol = normalizeSymbol(variable.symbol);
    if (!normalizedSymbol) {
      continue;
    }
    const derivative = derivativeStates.has(normalizedSymbol);
    if (derivative) {
      add({
        symbol: variable.symbol,
        extractedRole: variable.role,
        recommendedRole: "state",
        evidenceStatus: variable.role.toLowerCase() === "state" ? "observed" : "inferred",
        reason: `${variable.symbol} has an explicit derivative equation.`,
      });
      continue;
    }
    if (normalizedSymbol === "mu") {
      add({
        symbol: variable.symbol,
        extractedRole: variable.role,
        recommendedRole: "intermediate",
        evidenceStatus: variable.role.toLowerCase() === "control" ? "conflicting" : "inferred",
        reason: "mu is a rate/output/intermediate relation, not a manipulated control variable.",
      });
      continue;
    }
    if (normalizedSymbol === "kla") {
      const controlled = sourceMentionsControl(variable.source, "kLa");
      add({
        symbol: variable.symbol,
        extractedRole: variable.role,
        recommendedRole: controlled ? "control" : "parameter",
        evidenceStatus: controlled ? "observed" : variable.role.toLowerCase() === "control" ? "conflicting" : "inferred",
        reason: controlled ? "Source explicitly mentions kLa as manipulated or controlled." : "kLa is a mass-transfer parameter unless source evidence says it is manipulated.",
      });
      continue;
    }
    if (modelType === "monod_chemostat" && normalizedSymbol === "d") {
      add({
        symbol: variable.symbol,
        extractedRole: variable.role,
        recommendedRole: "control",
        evidenceStatus: "inferred",
        reason: "Chemostat dilution rate D is an operating variable and may also have a numeric parameter value.",
      });
      continue;
    }
    if (["sin", "sf", "sfeed"].includes(normalizedSymbol)) {
      add({
        symbol: variable.symbol,
        extractedRole: variable.role,
        recommendedRole: "input",
        evidenceStatus: "inferred",
        reason: "Feed concentration symbols are input/forcing variables and may also appear as numeric parameters.",
      });
      continue;
    }
    if (normalizedSymbol.startsWith("cstar") || normalizedSymbol === "c") {
      add({
        symbol: variable.symbol,
        extractedRole: variable.role,
        recommendedRole: normalizedSymbol.startsWith("cstar") ? "input" : "unknown",
        evidenceStatus: normalizedSymbol.startsWith("cstar") ? "inferred" : "observed",
        reason: normalizedSymbol.startsWith("cstar") ? "Saturation/equilibrium concentration is an input/parameter, not a dynamic state." : "No role correction rule applied.",
      });
      continue;
    }
    if (modelType === "gas_liquid" && normalizedSymbol === "x" && !derivative) {
      add({
        symbol: variable.symbol,
        extractedRole: variable.role,
        recommendedRole: "input",
        evidenceStatus: variable.role.toLowerCase() === "state" ? "conflicting" : "inferred",
        reason: "In an oxygen-only gas-liquid balance, biomass X is forcing/input unless dX/dt exists.",
      });
      continue;
    }
    add({
      symbol: variable.symbol,
      extractedRole: variable.role,
      recommendedRole: roleFromString(variable.role),
      evidenceStatus: variable.role ? "observed" : "unsupported",
      reason: variable.role ? "Role preserved from extraction evidence." : "No role evidence was available.",
    });
  }

  for (const state of derivativeStates) {
    if (!roles.has(state)) {
      add({
        symbol: state,
        recommendedRole: "state",
        evidenceStatus: "inferred",
        reason: `${state} has derivative evidence in an extracted equation.`,
      });
    }
  }

  for (const parameter of normalized.parameters) {
    const normalizedSymbol = normalizeSymbol(parameter.symbol);
    if (!normalizedSymbol || roles.has(normalizedSymbol)) {
      continue;
    }
    add({
      symbol: parameter.symbol,
      recommendedRole: "parameter",
      evidenceStatus: "observed",
      reason: "Symbol appears in extracted parameter evidence.",
    });
  }

  return [...roles.values()].sort((a, b) => stableCompare(a.symbol, b.symbol));
}

function buildRequiredInformationChecklist(
  template: ChemEModelTemplate,
  normalized: NormalizedExtraction,
  classifiedEquations: EquationClassification[],
  derivativeStates: Set<string>,
): RequiredInformationItem[] {
  const items = [
    ...template.requiredStates,
    ...template.commonInputs,
    ...template.commonOutputs,
    ...template.commonControls,
    ...template.requiredParameters,
    ...template.requiredEquations,
    ...template.requiredInitialOrBoundaryConditions,
  ];

  return items.map((item) => {
    const evidence = findEvidenceForItem(item, normalized, classifiedEquations, derivativeStates);
    return {
      ...item,
      evidenceStatus: evidence.status,
      evidence: evidence.evidence,
      sourceQuote: evidence.evidence[0] ?? undefined,
      whyItMatters: item.description,
    };
  });
}

function findEvidenceForItem(
  item: RequiredInformationItem,
  normalized: NormalizedExtraction,
  classifiedEquations: EquationClassification[],
  derivativeStates: Set<string>,
): { status: EvidenceStatus; evidence: string[] } {
  if (!item.required && item.symbols.length === 0) {
    return { status: "unsupported", evidence: [] };
  }

  const evidence: string[] = [];
  const aliases = item.symbols.map(normalizeSymbol).filter(Boolean);

  if (item.category === "state") {
    for (const variable of normalized.variables) {
      if (aliases.includes(normalizeSymbol(variable.symbol)) && (variable.explicitState || derivativeStates.has(normalizeSymbol(variable.symbol)))) {
        evidence.push(variable.source || `${variable.symbol} state evidence`);
      }
    }
    for (const alias of aliases) {
      if (derivativeStates.has(alias)) {
        evidence.push(`Derivative equation for ${alias}`);
      }
    }
  }

  if (item.category === "parameter") {
    // AUDIT-3: track whether *every* matching parameter was finalizer-promoted.
    // If so, the evidence is "inferred", not "observed", because the finalizer
    // promoted weak provider output to look explicit.
    let allPromoted = true;
    let anyMatch = false;
    for (const parameter of normalized.parameters) {
      if (aliases.includes(normalizeSymbol(parameter.symbol))) {
        evidence.push(parameter.source || `${parameter.symbol} parameter evidence`);
        anyMatch = true;
        if (!parameter.finalizerPromoted) allPromoted = false;
      }
    }
    if (anyMatch && allPromoted) {
      const uniqueEvidence = uniqueSorted(evidence);
      return { status: "inferred", evidence: uniqueEvidence };
    }
  }

  if (["input", "output", "control"].includes(item.category)) {
    for (const variable of normalized.variables) {
      if (aliases.includes(normalizeSymbol(variable.symbol))) {
        const role = variable.role.toLowerCase();
        if (role === item.category || item.category === "input" || item.category === "output") {
          evidence.push(variable.source || `${variable.symbol} ${item.category} evidence`);
        }
      }
    }
    for (const parameter of normalized.parameters) {
      if (aliases.includes(normalizeSymbol(parameter.symbol))) {
        evidence.push(parameter.source || `${parameter.symbol} numeric assignment`);
      }
    }
  }

  if (item.category === "equation") {
    for (const equation of classifiedEquations) {
      if (equationMatchesRequirement(item, equation)) {
        evidence.push(equation.equationPattern);
      }
    }
  }

  if (item.category === "initial_condition") {
    for (const ic of normalized.initialConditions) {
      if (
        aliases.includes(normalizeSymbol(ic.symbol)) ||
        aliases.includes(normalizeSymbol(`${ic.stateSymbol}0`)) ||
        aliases.includes(normalizeSymbol(`${ic.stateSymbol}_0`))
      ) {
        evidence.push(ic.source || `${ic.symbol} initial condition`);
      }
    }
  }

  if (item.category === "boundary_condition") {
    for (const alias of aliases) {
      if (joinedText(normalized).includes(alias.toLowerCase()) || hasParameter(normalized, alias)) {
        evidence.push(`${item.label} evidence found for ${alias}`);
      }
    }
  }

  if (item.category === "convention") {
    const text = joinedText(normalized);
    if (item.id === "gas-bc-equilibrium") {
      if (/(henry|saturation|equilibrium)/i.test(text) && !/(not specified|unspecified|missing|not reported)/i.test(text)) {
        evidence.push("Henry-law or saturation convention was explicitly mentioned.");
      }
    } else if (item.symbols.some((symbol) => text.includes(symbol.toLowerCase()))) {
      evidence.push(`${item.label} convention evidence found.`);
    }
  }

  const uniqueEvidence = uniqueSorted(evidence);
  if (uniqueEvidence.length > 0) {
    return { status: "observed", evidence: uniqueEvidence };
  }
  if (!item.required) {
    return { status: "unsupported", evidence: [] };
  }
  return { status: "missing", evidence: [] };
}

function equationMatchesRequirement(item: RequiredInformationItem, equation: EquationClassification): boolean {
  const text = equation.equationPattern;
  const lower = text.toLowerCase();
  if (item.id.includes("dxdt")) {
    return hasDerivativeForText(text, "X");
  }
  if (item.id.includes("dsdt")) {
    return hasDerivativeForText(text, "S");
  }
  if (item.id === "monod-eq-mu") {
    return equation.recommendedType === "rate_law" && /mu|μ/i.test(text);
  }
  if (item.id === "gas-eq-transfer") {
    return equation.recommendedType === "dynamic_ode" && /(kla|cstar|c\*)/i.test(text);
  }
  if (item.id === "fed-eq-volume") {
    return /dv\s*\/\s*dt|dV\s*\/\s*dt|F\(t\)|\bfeed\b/i.test(text);
  }
  if (item.id === "enzyme-eq-mm") {
    return /vmax|km|michaelis/i.test(text);
  }
  if (item.symbols.length === 0) {
    return false;
  }
  return item.symbols.some((symbol) => lower.includes(symbol.toLowerCase()));
}

function buildMissingRequirements(
  template: ChemEModelTemplate,
  checklist: RequiredInformationItem[],
  normalized: NormalizedExtraction,
  classifiedEquations: EquationClassification[],
): MissingRequirement[] {
  const missingItems = checklist.filter((item) => item.required && item.evidenceStatus === "missing");
  const requirements: MissingRequirement[] = [];

  for (const item of missingItems) {
    requirements.push({
      id: `${item.id}-missing`,
      item: item.label,
      category: missingCategoryForItem(item),
      whyNeeded: item.description,
      requiredFor: item.category,
      suggestedSources: sourcesForMissingItem(item),
      severity: item.severity,
      triggerEvidence: item.symbols,
    });
  }

  for (const requirement of template.commonMissingRequirements) {
    if (templateMissingApplies(template.id, requirement, missingItems, normalized, classifiedEquations)) {
      requirements.push(requirement);
    }
  }

  return dedupeMissing(requirements).sort((a, b) => stableCompare(a.id, b.id));
}

function templateMissingApplies(
  templateId: ChemEModelTemplateId,
  requirement: MissingRequirement,
  missingItems: RequiredInformationItem[],
  normalized: NormalizedExtraction,
  classifiedEquations: EquationClassification[],
): boolean {
  const missingIds = new Set(missingItems.map((item) => item.id));
  if (templateId === "monod_chemostat") {
    if (requirement.id === "monod-missing-ics") {
      return missingIds.has("monod-ic-x0") || missingIds.has("monod-ic-s0");
    }
    if (requirement.id === "monod-missing-yxs") {
      return missingIds.has("monod-param-yxs");
    }
  }
  if (templateId === "gas_liquid") {
    if (requirement.id === "gas-missing-henry") {
      return !hasHenryConvention(normalized);
    }
    if (requirement.id === "gas-missing-ic") {
      return missingIds.has("gas-ic-c");
    }
  }
  if (templateId === "fed_batch") {
    return missingIds.has("fed-input-feed") || missingIds.has("fed-state-v") || missingIds.has("fed-eq-volume") || missingIds.has("fed-bc-feed");
  }
  if (templateId === "enzyme_kinetics") {
    return missingIds.has("enzyme-param-vmax") || missingIds.has("enzyme-param-km");
  }
  if (templateId === "oxygen_balanced_mixotrophy") {
    return true;
  }
  if (templateId === "photobioreactor_light") {
    return requirement.id === "pbr-missing-light-model" && !classifiedEquations.some((equation) => /light|pfd|irradiance/i.test(equation.equationPattern));
  }
  if (templateId === "unknown") {
    return true;
  }
  return missingItems.length > 0;
}

function buildContradictions(normalized: NormalizedExtraction, roles: CorrectedRole[]): string[] {
  const contradictions: string[] = [];
  const bySymbol = new Map<string, NormalizedParameter[]>();
  for (const parameter of normalized.parameters) {
    const key = normalizeSymbol(parameter.symbol);
    if (!key || !parameter.value) {
      continue;
    }
    bySymbol.set(key, [...(bySymbol.get(key) ?? []), parameter]);
  }
  for (const [key, parameters] of bySymbol) {
    const values = uniqueSorted(parameters.map((parameter) => normalizeValue(parameter.value)).filter(Boolean));
    if (values.length > 1) {
      contradictions.push(`Parameter ${parameters[0]?.symbol || key} has conflicting values: ${values.join(", ")}.`);
    }
  }
  for (const role of roles) {
    if (role.evidenceStatus === "conflicting") {
      contradictions.push(`${role.symbol} role conflict: ${role.reason}`);
    }
  }
  return uniqueSorted(contradictions);
}

function buildInferredUnits(
  normalized: NormalizedExtraction,
  classifiedEquations: EquationClassification[],
): UnitExpectation[] {
  const inferred: UnitExpectation[] = [];
  const mumax = findParameter(normalized, "mumax");
  const s = findVariable(normalized, "S");
  const ks = findParameter(normalized, "Ks");
  if (
    mumax?.unit &&
    unitsCompatible(s?.unit ?? "", ks?.unit ?? "") &&
    classifiedEquations.some((equation) => equation.recommendedType === "rate_law" && /mu|μ/i.test(equation.equationPattern))
  ) {
    inferred.push({
      symbol: "mu",
      expectedUnit: mumax.unit,
      evidenceStatus: "inferred",
      note: "Unit inferred from Monod growth equation and mumax unit.",
    });
  }

  for (const ic of normalized.initialConditions) {
    if (ic.unit && ic.stateSymbol) {
      inferred.push({
        symbol: ic.stateSymbol,
        expectedUnit: ic.unit,
        evidenceStatus: "inferred",
        note: "Unit inferred from initial condition.",
      });
    }
  }

  return dedupeUnits(inferred).sort((a, b) => stableCompare(a.symbol, b.symbol));
}

function determineSimulationSupport(
  modelType: ChemECanonicalModelType,
  checklist: RequiredInformationItem[],
  missingRequirements: MissingRequirement[],
  normalized: NormalizedExtraction,
  classifiedEquations: EquationClassification[],
): ChemEBrainReport["simulation_support"] {
  if (modelType === "monod_chemostat") {
    if (hasCompleteMonodEvidence(checklist, normalized, classifiedEquations)) {
      return {
        status: "runnable",
        reason: "Monod chemostat evidence includes X/S states, mu relation, dX/dt, dS/dt, required numeric parameters, and X0/S0 initial conditions.",
      };
    }
    return {
      status: "supported_not_ready",
      reason: "Monod chemostat template is supported, but one or more required equations, parameters, or initial conditions are missing.",
    };
  }
  if (modelType === "batch_culture") {
    return missingRequirements.some((requirement) => requirement.severity === "critical")
      ? {
          status: "supported_not_ready",
          reason: "Batch culture is a supported style, but required source-backed evidence is incomplete.",
        }
      : {
          status: "runnable",
          reason: "Batch culture evidence is complete enough for advisory runnable status.",
        };
  }
  if (modelType === "unknown" || modelType === "cstr" || modelType === "pfr") {
    return {
      status: "unsupported",
      reason: "ChemE Brain v1 does not have enough supported model evidence for advisory simulation.",
    };
  }
  return {
    status: modelType === "enzyme_kinetics" || modelType === "gas_liquid" || modelType === "fed_batch" || modelType === "oxygen_balanced_mixotrophy" || modelType === "microalgae_photobioreactor" ? "scaffold_only" : "unsupported",
    reason: "Evidence may support a scaffold or audit, but ChemE Brain v1 does not mark this model type runnable.",
  };
}

function hasCompleteMonodEvidence(
  checklist: RequiredInformationItem[],
  normalized: NormalizedExtraction,
  classifiedEquations: EquationClassification[],
): boolean {
  const observedIds = new Set(checklist.filter((item) => item.evidenceStatus === "observed").map((item) => item.id));
  const requiredIds = [
    "monod-state-x",
    "monod-state-s",
    "monod-eq-mu",
    "monod-eq-dxdt",
    "monod-eq-dsdt",
    "monod-param-mumax",
    "monod-param-ks",
    "monod-param-d",
    "monod-param-sin",
    "monod-param-yxs",
    "monod-ic-x0",
    "monod-ic-s0",
  ];
  return (
    requiredIds.every((id) => observedIds.has(id)) &&
    hasDynamicEquationFor(classifiedEquations, "X") &&
    hasDynamicEquationFor(classifiedEquations, "S") &&
    hasParameter(normalized, "mumax") &&
    hasParameter(normalized, "Ks") &&
    hasParameter(normalized, "D") &&
    hasParameter(normalized, "Sin") &&
    hasParameter(normalized, "Yxs") &&
    hasInitialConditionFor(normalized, "X") &&
    hasInitialConditionFor(normalized, "S")
  );
}

function buildWarnings(
  template: ChemEModelTemplate,
  roles: CorrectedRole[],
  contradictions: string[],
  simulationSupport: ChemEBrainReport["simulation_support"],
): ChemEWarning[] {
  const warnings = [...template.warnings];
  for (const role of roles) {
    if (role.evidenceStatus === "conflicting") {
      warnings.push({
        id: `role-conflict-${normalizeId(role.symbol)}`,
        severity: "warning",
        message: role.reason,
        safetyRule: "Preserve evidence status and do not silently choose a conflicting role.",
      });
    }
  }
  for (const contradiction of contradictions) {
    warnings.push({
      id: `conflict-${normalizeId(contradiction).slice(0, 40)}`,
      severity: "warning",
      message: contradiction,
      safetyRule: "Conflicting evidence must be reported, not silently resolved.",
    });
  }
  if (simulationSupport.status !== "runnable") {
    warnings.push({
      id: "simulation-advisory-only",
      severity: "warning",
      message: simulationSupport.reason,
      safetyRule: "Never mark unsupported or incomplete models runnable.",
    });
  }
  return dedupeWarnings(warnings).sort((a, b) => stableCompare(a.id, b.id));
}

function buildRecommendedSources(
  template: ChemEModelTemplate,
  missingRequirements: MissingRequirement[],
  support: SimulationSupport,
): RecommendedNextSource[] {
  const sources = [
    ...missingRequirements.flatMap((requirement) => requirement.suggestedSources),
    ...(support === "runnable" ? [] : template.recommendedNextSources),
  ];
  return dedupeSources(sources).sort((a, b) => stableCompare(a.sourceType, b.sourceType));
}

function summarizeEvidence(
  checklist: RequiredInformationItem[],
  roles: CorrectedRole[],
  equations: EquationClassification[],
  missingRequirements: MissingRequirement[],
  contradictions: string[],
): EvidenceStatusSummary {
  const summary: EvidenceStatusSummary = {
    observed: 0,
    inferred: 0,
    assumed: 0,
    missing: 0,
    conflicting: 0,
    unsupported: 0,
  };
  const add = (status: EvidenceStatus): void => {
    summary[status] += 1;
  };
  for (const item of checklist) {
    add(item.evidenceStatus);
  }
  for (const role of roles) {
    add(role.evidenceStatus);
  }
  for (const equation of equations) {
    add(equation.evidenceStatus);
  }
  summary.missing += missingRequirements.length;
  summary.conflicting += contradictions.length;
  return summary;
}

function buildAuditTrail(
  decision: ModelTypeCandidate & { confidence: Confidence; explanation: ConfidenceExplanation },
  support: ChemEBrainReport["simulation_support"],
): string[] {
  return [
    "ChemE Brain analyzer ran in deterministic pure shadow mode.",
    "No extraction rows, model cards, exports, or simulation decisions were changed.",
    `Canonical model type reported by ChemE Brain: ${decision.type} (${decision.confidence} confidence).`,
    `Simulation support is advisory only: ${support.status}.`,
  ];
}

function missingCategoryForItem(item: RequiredInformationItem): MissingRequirement["category"] {
  if (item.category === "initial_condition") {
    return "initial_condition";
  }
  if (item.category === "boundary_condition") {
    return "boundary_condition";
  }
  if (item.category === "control") {
    return "control_parameter";
  }
  if (item.category === "convention") {
    return "physical_constant";
  }
  if (item.category === "equation") {
    return "model_structure";
  }
  if (item.category === "parameter" && /yield/i.test(item.label)) {
    return "stoichiometric_yield";
  }
  if (item.category === "parameter") {
    return "kinetic_parameter";
  }
  return "model_structure";
}

function sourcesForMissingItem(item: RequiredInformationItem): RecommendedNextSource[] {
  if (item.category === "convention" || /henry|saturation|equilibrium/i.test(item.label)) {
    return [DATABOOK_SOURCE, SUPPORTING_INFORMATION_SOURCE, USER_ASSUMPTION_SOURCE];
  }
  if (item.category === "parameter") {
    return [PARAMETER_TABLE_SOURCE, SUPPORTING_INFORMATION_SOURCE];
  }
  if (item.category === "equation") {
    return [METHODS_SOURCE, SUPPORTING_INFORMATION_SOURCE];
  }
  if (item.category === "initial_condition" || item.category === "boundary_condition") {
    return [METHODS_SOURCE, USER_ASSUMPTION_SOURCE];
  }
  return [METHODS_SOURCE, SUPPORTING_INFORMATION_SOURCE];
}

function collectDerivativeStates(equations: EquationClassification[]): Set<string> {
  const states = new Set<string>();
  for (const equation of equations) {
    for (const state of derivativeStateFromEquation(equation.equationPattern)) {
      states.add(normalizeSymbol(state));
    }
  }
  return states;
}

function derivativeStateFromEquation(equation: string): string[] {
  const states: string[] = [];
  const patterns = [
    /d\s*([A-Za-z][A-Za-z0-9_]*)\s*\/\s*dt\s*=/g,
    /d\(([A-Za-z][A-Za-z0-9_]*)\)\s*\/\s*dt\s*=/g,
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(equation);
    while (match) {
      states.push(match[1] ?? "");
      match = pattern.exec(equation);
    }
  }
  return uniqueSorted(states.filter(Boolean));
}

function hasDerivativeForText(text: string, state: string): boolean {
  const escaped = escapeRegExp(state);
  return new RegExp(`d\\s*${escaped}\\s*\\/\\s*dt\\s*=`, "i").test(text);
}

function hasDynamicEquationFor(equations: EquationClassification[], state: string): boolean {
  return equations.some((equation) => equation.recommendedType === "dynamic_ode" && hasDerivativeForText(equation.equationPattern, state));
}

function hasSymbolInEquations(equations: EquationClassification[], symbol: string): boolean {
  const normalized = normalizeSymbol(symbol);
  return equations.some((equation) => normalizeTextForSymbolSearch(equation.equationPattern).includes(normalized));
}

function hasParameter(normalized: NormalizedExtraction, symbol: string): boolean {
  return Boolean(findParameter(normalized, symbol));
}

function findParameter(normalized: NormalizedExtraction, symbol: string): NormalizedParameter | undefined {
  const normalizedSymbol = normalizeSymbol(symbol);
  return normalized.parameters.find((parameter) => normalizeSymbol(parameter.symbol) === normalizedSymbol);
}

function findVariable(normalized: NormalizedExtraction, symbol: string): NormalizedVariable | undefined {
  const normalizedSymbol = normalizeSymbol(symbol);
  return normalized.variables.find((variable) => normalizeSymbol(variable.symbol) === normalizedSymbol);
}

function hasInitialConditionFor(normalized: NormalizedExtraction, state: string): boolean {
  const normalizedState = normalizeSymbol(state);
  return normalized.initialConditions.some((ic) => normalizeSymbol(ic.stateSymbol) === normalizedState || normalizeSymbol(ic.symbol) === `${normalizedState}0`);
}

function hasHenryConvention(normalized: NormalizedExtraction): boolean {
  const text = joinedText(normalized);
  return /(henry|saturation|equilibrium)/i.test(text) && !/(not specified|unspecified|missing|not reported)/i.test(text);
}

function unitsCompatible(unitA: string, unitB: string): boolean {
  if (!unitA || !unitB) {
    return false;
  }
  return normalizeUnit(unitA) === normalizeUnit(unitB);
}

function normalizeUnit(unit: string): string {
  return unit.toLowerCase().replace(/\s+/g, "").replace(/grams?/g, "g").replace(/liters?|litres?/g, "l");
}

function normalizeModelType(value: unknown): ChemECanonicalModelType | undefined {
  const key = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!key) {
    return undefined;
  }
  return MODEL_TYPE_ALIASES[key];
}

function uniqueModelTypes(values: Array<ChemECanonicalModelType | undefined>): ChemECanonicalModelType[] {
  return uniqueSorted(values.filter((value): value is ChemECanonicalModelType => Boolean(value)));
}

function roleFromString(role: string): CorrectedRole["recommendedRole"] {
  const key = role.toLowerCase();
  if (key === "state" || key === "input" || key === "output" || key === "parameter" || key === "control" || key === "intermediate") {
    return key;
  }
  return "unknown";
}

function rolePriority(status: EvidenceStatus): number {
  if (status === "observed") {
    return 4;
  }
  if (status === "conflicting") {
    return 3;
  }
  if (status === "inferred") {
    return 2;
  }
  return 1;
}

function sourceMentionsControl(source: string, symbol: string): boolean {
  const lower = source.toLowerCase();
  return lower.includes(symbol.toLowerCase()) && /\b(control|controlled|manipulated|setpoint|set point)\b/i.test(source);
}

function joinedText(normalized: NormalizedExtraction): string {
  return [
    ...normalized.sourceTexts,
    ...normalized.assumptions,
    ...normalized.limitations,
    ...normalized.equations.map((equation) => equation.text),
    ...normalized.variables.map((variable) => `${variable.symbol} ${variable.name} ${variable.role} ${variable.source}`),
    ...normalized.parameters.map((parameter) => `${parameter.symbol} ${parameter.name} ${parameter.value} ${parameter.unit} ${parameter.source}`),
  ]
    .join(" ")
    .toLowerCase();
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstRecord(...values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length > 0) {
      return record;
    }
  }
  return {};
}

function textValue(...values: unknown[]): string {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function normalizeStringArray(...values: unknown[]): string[] {
  return uniqueSorted(values.flatMap((value) => asArray(value).map((entry) => (typeof entry === "string" ? entry : sourceEvidence(asRecord(entry), ""))).filter(Boolean)));
}

function collectText(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    return value.trim().length > 0 ? [value.trim()] : [];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectText(entry, depth + 1));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort(stableCompare)
      .flatMap((key) => collectText(record[key], depth + 1));
  }
  return [];
}

// AUDIT-3: detect whether the extraction-finalizer mutated a critical field
// (status, confidence, role, unit) on this record. Returns true if the row's
// `finalizer_changes` array contains any such mutation. Used to downgrade
// readiness from "observed" to "inferred" so finalizer-promoted parameters
// cannot silently fulfil a runnable gate.
function hasFinalizerCriticalChange(record: Record<string, unknown>): boolean {
  const changes = record["finalizer_changes"];
  if (!Array.isArray(changes)) return false;
  const criticalFields = new Set(["status", "confidence", "role", "unit"]);
  for (const change of changes) {
    if (change && typeof change === "object") {
      const field = (change as { field?: unknown }).field;
      if (typeof field === "string" && criticalFields.has(field)) {
        return true;
      }
    }
  }
  return false;
}

function sourceEvidence(record: Record<string, unknown>, fallback: string): string {
  const source = firstRecord(record.source_evidence, record.sourceEvidence, record.source_context, record.sourceContext, record.originalValue);
  return textValue(
    source.quote,
    source.text,
    source.section_heading,
    source.sectionHeading,
    record.source_quote,
    record.sourceQuote,
    record.quote,
    record.context,
    fallback,
  );
}

function dedupeVariables(variables: NormalizedVariable[]): NormalizedVariable[] {
  const seen = new Map<string, NormalizedVariable>();
  for (const variable of variables) {
    const key = `${normalizeSymbol(variable.symbol)}:${variable.role.toLowerCase()}`;
    if (!normalizeSymbol(variable.symbol) && !variable.name) {
      continue;
    }
    if (!seen.has(key)) {
      seen.set(key, variable);
    }
  }
  return [...seen.values()].sort((a, b) => stableCompare(a.symbol, b.symbol) || stableCompare(a.role, b.role));
}

function dedupeParameters(parameters: NormalizedParameter[]): NormalizedParameter[] {
  const seen = new Map<string, NormalizedParameter>();
  for (const parameter of parameters) {
    const key = `${normalizeSymbol(parameter.symbol)}:${normalizeValue(parameter.value)}:${normalizeUnit(parameter.unit)}`;
    if (!normalizeSymbol(parameter.symbol)) {
      continue;
    }
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, parameter);
    } else if (parameter.finalizerPromoted && !existing.finalizerPromoted) {
      // AUDIT-3: preserve the finalizer-promoted signal across duplicate
      // appearances (e.g. extraction.parameters vs raw.parameters). If any
      // duplicate carries it, the deduped entry must inherit it so readiness
      // can downgrade correctly.
      seen.set(key, { ...existing, finalizerPromoted: true });
    }
  }
  return [...seen.values()].sort((a, b) => stableCompare(a.symbol, b.symbol));
}

function dedupeEquations(equations: NormalizedEquation[]): NormalizedEquation[] {
  const seen = new Map<string, NormalizedEquation>();
  for (const equation of equations) {
    const key = equation.text.replace(/\s+/g, "");
    if (!seen.has(key)) {
      seen.set(key, equation);
    }
  }
  return [...seen.values()].sort((a, b) => stableCompare(a.text, b.text));
}

function dedupeInitialConditions(initialConditions: NormalizedInitialCondition[]): NormalizedInitialCondition[] {
  const seen = new Map<string, NormalizedInitialCondition>();
  for (const ic of initialConditions) {
    const key = `${normalizeSymbol(ic.symbol)}:${normalizeSymbol(ic.stateSymbol)}:${normalizeValue(ic.value)}`;
    if (!normalizeSymbol(ic.symbol) && !normalizeSymbol(ic.stateSymbol)) {
      continue;
    }
    if (!seen.has(key)) {
      seen.set(key, ic);
    }
  }
  return [...seen.values()].sort((a, b) => stableCompare(a.symbol, b.symbol));
}

function dedupeMissing(requirements: MissingRequirement[]): MissingRequirement[] {
  const seen = new Map<string, MissingRequirement>();
  for (const requirement of requirements) {
    if (!seen.has(requirement.id)) {
      seen.set(requirement.id, requirement);
    }
  }
  return [...seen.values()];
}

function dedupeWarnings(warnings: ChemEWarning[]): ChemEWarning[] {
  const seen = new Map<string, ChemEWarning>();
  for (const warning of warnings) {
    if (!seen.has(warning.id)) {
      seen.set(warning.id, warning);
    }
  }
  return [...seen.values()];
}

function dedupeSources(sources: RecommendedNextSource[]): RecommendedNextSource[] {
  const seen = new Map<string, RecommendedNextSource>();
  for (const source of sources) {
    const key = `${source.sourceType}:${source.reason}`;
    if (!seen.has(key)) {
      seen.set(key, source);
    }
  }
  return [...seen.values()];
}

function dedupeUnits(units: UnitExpectation[]): UnitExpectation[] {
  const seen = new Map<string, UnitExpectation>();
  for (const unit of units) {
    const key = `${normalizeSymbol(unit.symbol)}:${unit.expectedUnit}:${unit.note}`;
    if (!seen.has(key)) {
      seen.set(key, unit);
    }
  }
  return [...seen.values()];
}

function sortCorrectedRoles(roles: CorrectedRole[]): CorrectedRole[] {
  return roles.sort((a, b) => stableCompare(a.symbol, b.symbol) || stableCompare(a.recommendedRole, b.recommendedRole));
}

function parseInitialConditionSymbol(text: string): { symbol: string; stateSymbol: string } {
  const match = /([A-Za-z][A-Za-z0-9_]*0|[A-Za-z][A-Za-z0-9_]*_0|[A-Za-z][A-Za-z0-9_]*\(0\))/.exec(text);
  const symbol = match?.[1] ?? text;
  return { symbol, stateSymbol: inferStateSymbolFromInitialCondition(symbol) };
}

function inferStateSymbolFromInitialCondition(symbol: string): string {
  const trimmed = symbol.trim();
  if (/\(0\)$/.test(trimmed)) {
    return trimmed.replace(/\(0\)$/, "");
  }
  if (/_0$/.test(trimmed)) {
    return trimmed.replace(/_0$/, "");
  }
  if (/0$/.test(trimmed)) {
    return trimmed.replace(/0$/, "");
  }
  return trimmed;
}

function isInitialConditionSymbol(symbol: string): boolean {
  return /(^[A-Za-z][A-Za-z0-9_]*0$|^[A-Za-z][A-Za-z0-9_]*_0$|^[A-Za-z][A-Za-z0-9_]*\(0\)$)/.test(symbol.trim());
}

function normalizeSymbol(symbol: string): string {
  return symbol
    .replace(/[μµ]/g, "mu")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeTextForSymbolSearch(text: string): string {
  return text.replace(/[μµ]/g, "mu").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort(stableCompare);
}

function stableCompare(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
