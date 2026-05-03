/**
 * Model Assembly Readiness
 *
 * Pure client-side analysis over already extracted model-card data. This layer
 * does not search the web, execute ODEs, or infer numeric parameter values. It
 * answers a narrower question: is the extracted information enough to assemble
 * a runnable dynamic model, or only a scaffold that needs more sources?
 */

import type {
  AnalysisAssumption,
  AnalysisEquation,
  AnalysisParameter,
  AnalysisVariable,
  RawExtraction,
} from "./reproducibility";

export type AssemblyStatus = "complete" | "partial" | "insufficient";
export type AssemblyItemType =
  | "equation"
  | "parameter"
  | "state"
  | "control"
  | "assumption";
export type AssemblyConfidence = "high" | "medium" | "low";

export type MissingRequirementCategory =
  | "kinetic_parameter"
  | "stoichiometric_yield"
  | "initial_condition"
  | "control_parameter"
  | "physical_constant"
  | "light_model"
  | "gas_transfer"
  | "source_document";

export type SuggestedSource =
  | "current paper"
  | "supporting_information"
  | "cited_paper"
  | "user_assumption"
  | "calibration"
  | "databook";

export type MissingRequirementSeverity = "critical" | "warning" | "info";

export interface AvailableAssemblyItem {
  item: string;
  type: AssemblyItemType;
  source_context: string;
  confidence: AssemblyConfidence;
}

export interface MissingRequirement {
  item: string;
  category: MissingRequirementCategory;
  required_for: string;
  why_needed: string;
  suggested_source: SuggestedSource;
  severity: MissingRequirementSeverity;
}

export interface ModelAssemblyReport {
  assembly_status: AssemblyStatus;
  target_model_type: string;
  can_generate_runnable_model: boolean;
  can_generate_scaffold: boolean;
  available_from_current_source: AvailableAssemblyItem[];
  missing_requirements: MissingRequirement[];
  recommended_next_actions: string[];
}

export interface ModelAssemblyInput {
  equations: AnalysisEquation[];
  variables: AnalysisVariable[];
  parameters: AnalysisParameter[];
  assumptions: AnalysisAssumption[];
  raw: RawExtraction | null | undefined;
  systemDescription?: string | null | undefined;
  problemStatement?: string | null | undefined;
}

type EvidenceRow = {
  item: string;
  type: AssemblyItemType;
  source_context: string;
  confidence: AssemblyConfidence;
};

function safe(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function lower(value: unknown): string {
  return safe(value).toLowerCase();
}

function confidence(value: unknown): AssemblyConfidence {
  return value === "high" || value === "low" ? value : "medium";
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function contextFromTexts(texts: string[], patterns: RegExp[], fallback: string): string {
  return texts.find((text) => hasAny(lower(text), patterns) && safe(text)) ?? fallback;
}

function isPlaceholder(value: unknown): boolean {
  const text = lower(value);
  return (
    text === "" ||
    text === "-" ||
    text === "—" ||
    text === "unknown" ||
    text === "n/a" ||
    text === "none" ||
    text === "null"
  );
}

function parameterLabel(parameter: AnalysisParameter): string {
  const value = safe(parameter.value);
  const unit = safe(parameter.unit);
  if (!isPlaceholder(value) && !isPlaceholder(unit)) {
    return `${parameter.symbol} = ${value} ${unit}`;
  }
  if (!isPlaceholder(value)) return `${parameter.symbol} = ${value}`;
  return parameter.symbol;
}

function addAvailable(
  out: EvidenceRow[],
  seen: Set<string>,
  item: string,
  type: AssemblyItemType,
  source_context: string,
  itemConfidence: AssemblyConfidence,
): void {
  const key = `${type}:${item.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    item,
    type,
    source_context: source_context || "Detected in extracted model data.",
    confidence: itemConfidence,
  });
}

function addMissing(
  out: MissingRequirement[],
  seen: Set<string>,
  requirement: MissingRequirement,
): void {
  const key = `${requirement.category}:${requirement.item.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(requirement);
}

function rawTextParts(raw: RawExtraction | null | undefined): string[] {
  if (!raw) return [];
  return [
    raw.paper_title_or_topic,
    raw.system_type,
    raw.process_description,
    raw.model_card?.short_summary,
    raw.model_card?.model_type,
    ...(raw.model_card?.inputs ?? []),
    ...(raw.model_card?.outputs ?? []),
    ...(raw.model_card?.control_variables ?? []),
    ...(raw.model_card?.missing_information ?? []),
    ...(raw.equations ?? []).flatMap((eq) => [
      eq.equation_latex,
      eq.equation_plaintext,
      eq.meaning,
      eq.source_context,
      ...(eq.variables_involved ?? []),
    ]),
    ...(raw.state_variables ?? []).flatMap((variable) => [
      variable.symbol,
      variable.name,
      variable.role,
      variable.source_context,
    ]),
    ...(raw.parameters ?? []).flatMap((parameter) => [
      parameter.symbol,
      parameter.name,
      parameter.value,
      parameter.unit,
      parameter.source_context,
    ]),
    ...(raw.assumptions ?? []).flatMap((assumption) => [
      assumption.assumption,
      assumption.source_context,
    ]),
    ...(raw.limitations ?? []).flatMap((limitation) => [
      limitation.limitation,
      limitation.source_context,
    ]),
  ].map(safe);
}

function buildTextParts(input: ModelAssemblyInput): string[] {
  return [
    input.systemDescription,
    input.problemStatement,
    ...input.equations.flatMap((eq) => [
      eq.latex,
      eq.description,
      eq.sourceQuote,
    ]),
    ...input.variables.flatMap((variable) => [
      variable.symbol,
      variable.name,
      variable.role,
      variable.unit,
      variable.sourceQuote,
    ]),
    ...input.parameters.flatMap((parameter) => [
      parameter.symbol,
      parameter.value,
      parameter.unit,
      parameter.sourceQuote,
    ]),
    ...input.assumptions.flatMap((assumption) => [
      assumption.text,
      assumption.kind,
    ]),
    ...rawTextParts(input.raw),
  ].map(safe);
}

function buildCorpus(input: ModelAssemblyInput): string {
  return buildTextParts(input).join(" ").toLowerCase();
}

function missingInfoCorpus(input: ModelAssemblyInput): string {
  return [
    ...(input.raw?.model_card?.missing_information ?? []),
    ...(input.raw?.limitations ?? []).map((limitation) => limitation.limitation ?? ""),
    ...input.assumptions
      .filter((assumption) => lower(assumption.kind) === "limitation")
      .map((assumption) => assumption.text),
  ]
    .join(" ")
    .toLowerCase();
}

function detectTargetModelType(corpus: string): string {
  const hasOxygenBalance = /\b(do|dissolved oxygen|o2|oxygen)\b/.test(corpus);
  const hasAcetate = /\bacetate\b|\bac[-_ ]?in\b|\bch3coo/.test(corpus);
  const hasPhoto = /\bphoto|photobioreactor|microalgae|light|pfd|irradiance|autotroph/.test(
    corpus,
  );
  const hasMixotrophy = /\bmixotroph|heterotroph|autotroph/.test(corpus);

  if (hasOxygenBalance && hasAcetate && hasPhoto && hasMixotrophy) {
    return "Oxygen-balanced mixotrophic photobioreactor model";
  }
  if (hasPhoto) return "Microalgae / photobioreactor model";
  if (/\bkla\b|\bhenry\b|\bgas[- ]?liquid\b|\bo2\b|\bco2\b/.test(corpus)) {
    return "Gas-liquid O2/CO2 transfer model";
  }
  if (hasAcetate || hasMixotrophy) {
    return "Acetate-fed heterotrophy/autotrophy model";
  }
  if (/\bchemostat\b|\bcontinuous\b|\bdilution rate\b|\bd\s*=/.test(corpus)) {
    return "Chemostat / continuous bioreactor model";
  }
  return "Generic dynamic model";
}

function symbolText(symbol: string): string {
  return symbol.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasVariable(input: ModelAssemblyInput, patterns: RegExp[]): boolean {
  const rows = [
    ...input.variables.map((variable) =>
      `${variable.symbol} ${variable.name} ${variable.role} ${variable.sourceQuote}`,
    ),
    ...(input.raw?.state_variables ?? []).map((variable) =>
      `${variable.symbol ?? ""} ${variable.name ?? ""} ${variable.role ?? ""} ${variable.source_context ?? ""}`,
    ),
  ];
  return rows.some((row) => hasAny(lower(row), patterns));
}

function hasState(input: ModelAssemblyInput, patterns: RegExp[]): boolean {
  const normalized = input.variables
    .filter((variable) => lower(variable.role) === "state")
    .map((variable) => `${variable.symbol} ${variable.name} ${variable.sourceQuote}`);
  const raw = (input.raw?.state_variables ?? [])
    .filter((variable) => lower(variable.role) === "state")
    .map((variable) => `${variable.symbol ?? ""} ${variable.name ?? ""} ${variable.source_context ?? ""}`);
  return [...normalized, ...raw].some((row) => hasAny(lower(row), patterns));
}

function hasParameter(input: ModelAssemblyInput, patterns: RegExp[]): boolean {
  const rows = [
    ...input.parameters.map((parameter) =>
      `${parameter.symbol} ${symbolText(parameter.symbol)} ${parameter.value ?? ""} ${parameter.unit ?? ""} ${parameter.sourceQuote}`,
    ),
    ...(input.raw?.parameters ?? []).map((parameter) =>
      `${parameter.symbol ?? ""} ${symbolText(parameter.symbol ?? "")} ${parameter.value ?? ""} ${parameter.unit ?? ""} ${parameter.source_context ?? ""}`,
    ),
  ];
  return rows.some((row) => hasAny(lower(row), patterns));
}

function hasEquation(input: ModelAssemblyInput, patterns: RegExp[]): boolean {
  const rows = [
    ...input.equations.map((equation) =>
      `${equation.latex} ${equation.description} ${equation.sourceQuote}`,
    ),
    ...(input.raw?.equations ?? []).map((equation) =>
      `${equation.equation_latex ?? ""} ${equation.equation_plaintext ?? ""} ${equation.meaning ?? ""} ${equation.source_context ?? ""}`,
    ),
  ];
  return rows.some((row) => hasAny(lower(row), patterns));
}

function hasInitialConditions(input: ModelAssemblyInput, corpus: string): boolean {
  if (/\binitial conditions?\b/.test(missingInfoCorpus(input))) {
    return false;
  }
  if (/\binitial conditions?\b.*\b(not specified|not reported|missing|not included|unknown)\b/.test(corpus)) {
    return false;
  }
  if (/\binitial\b|\bat\s+t\s*=\s*0\b|\binoculum\b/.test(corpus)) return true;
  return input.parameters.some((parameter) => /(^|_)(x0|s0|c0|do0|ic)$/i.test(parameter.symbol));
}

function hasControllerParameters(input: ModelAssemblyInput, corpus: string): boolean {
  if (hasParameter(input, [/\bkp\b|\bki\b|\bkd\b|\bpid\b|\bcontroller\b/])) {
    return true;
  }
  return /\bproportional\b.*\bintegral\b|\bcontroller gain\b|\bpid parameters\b/.test(
    corpus,
  );
}

function closedLoopControlClaimed(corpus: string): boolean {
  return /\bdo\b.*\b(control|controlled|setpoint)|\bclosed[- ]loop\b|\bpid\b|\bcontroller\b/.test(
    corpus,
  );
}

function gasEquilibriumClaimed(corpus: string): boolean {
  return /\bkla\b|\bhenry\b|\bgas[- ]?liquid\b|\bmass transfer\b|\bo2\b|\bco2\b/.test(
    corpus,
  );
}

function henryConventionSpecified(corpus: string): boolean {
  if (/\bhenry[- ]?law convention\b.*\bnot specified\b/.test(corpus)) return false;
  if (/\bhenry\b.*\bnot specified\b/.test(corpus)) return false;
  return /\bhenry\b.*\b(constant|law|coefficient|convention|h=|h\s*=)/.test(corpus);
}

function lightAttenuationSpecified(input: ModelAssemblyInput, corpus: string): boolean {
  if (/\blight attenuation\b/.test(missingInfoCorpus(input))) {
    return false;
  }
  if (
    /\blight attenuation\b.*\b(not specified|not reported|missing|not included|unknown)\b/.test(
      corpus,
    )
  ) {
    return false;
  }
  return (
    hasParameter(input, [
      /\blight attenuation\b/,
      /\battenuation coefficient\b/,
      /\babsorption\b/,
      /\bextinction\b/,
      /\bbeer[- ]?lambert\b/,
      /\bi0\b/,
      /\bkd\b/,
    ]) || /\bbeer[- ]?lambert\b|\blight attenuation\b|\bextinction coefficient\b/.test(corpus)
  );
}

function buildAvailableItems(input: ModelAssemblyInput): AvailableAssemblyItem[] {
  const out: EvidenceRow[] = [];
  const seen = new Set<string>();
  const textParts = buildTextParts(input);
  const corpus = textParts.join(" ").toLowerCase();

  for (const variable of input.variables) {
    if (!safe(variable.symbol)) continue;
    addAvailable(
      out,
      seen,
      `${variable.role === "state" ? "State variable" : "Variable"} ${variable.symbol}`,
      variable.role === "state" ? "state" : "control",
      variable.sourceQuote,
      "medium",
    );
  }

  for (const rawVariable of input.raw?.state_variables ?? []) {
    if (!safe(rawVariable.symbol)) continue;
    addAvailable(
      out,
      seen,
      `${rawVariable.role === "state" ? "State variable" : "Variable"} ${rawVariable.symbol}`,
      rawVariable.role === "state" ? "state" : "control",
      rawVariable.source_context ?? "",
      confidence(rawVariable.confidence),
    );
  }

  for (const parameter of input.parameters) {
    if (!safe(parameter.symbol)) continue;
    const symbol = symbolText(parameter.symbol);
    const isControl =
      symbol === "d" ||
      symbol === "doset" ||
      symbol === "dosp" ||
      symbol === "kla" ||
      /setpoint|control/i.test(parameter.sourceQuote);
    addAvailable(
      out,
      seen,
      parameterLabel(parameter),
      isControl ? "control" : "parameter",
      parameter.sourceQuote,
      confidence(parameter.confidence),
    );
  }

  for (const equation of input.equations) {
    const label = safe(equation.description) || safe(equation.latex);
    if (!label) continue;
    addAvailable(
      out,
      seen,
      label,
      "equation",
      equation.sourceQuote,
      "high",
    );
  }

  for (const assumption of input.assumptions) {
    if (!safe(assumption.text)) continue;
    addAvailable(out, seen, assumption.text, "assumption", assumption.text, "low");
  }

  if (/\bdo\b.*\b(control|controlled|setpoint)/.test(corpus)) {
    addAvailable(
      out,
      seen,
      "DO setpoint/control variable",
      "control",
      contextFromTexts(textParts, [/\bdo\b.*\b(control|controlled|setpoint)/], "DO control mentioned in source text."),
      "high",
    );
  }
  if (/\bpfd\b|\bphoton flux density\b|\birradiance\b/.test(corpus)) {
    addAvailable(
      out,
      seen,
      "PFD / incident light intensity",
      "parameter",
      contextFromTexts(textParts, [/\bpfd\b|\bphoton flux density\b|\birradiance\b/], "Light intensity mentioned in source text."),
      "high",
    );
  }
  if (/\breactor volume\b|\bworking volume\b|\bvolume\b/.test(corpus)) {
    addAvailable(
      out,
      seen,
      "Reactor volume",
      "parameter",
      contextFromTexts(textParts, [/\breactor volume\b|\bworking volume\b|\bvolume\b/], "Reactor volume mentioned in source text."),
      "high",
    );
  }

  return out;
}

function addChemostatChecks(
  input: ModelAssemblyInput,
  missing: MissingRequirement[],
  seen: Set<string>,
): void {
  if (!hasState(input, [/\bx\b|\bbiomass\b|cell density|dry weight/])) {
    addMissing(missing, seen, {
      item: "Biomass state variable",
      category: "source_document",
      required_for: "continuous bioreactor mass balances",
      why_needed: "A dynamic chemostat model needs at least one biomass inventory state.",
      suggested_source: "current paper",
      severity: "critical",
    });
  }
  if (!hasParameter(input, [/\bd\b|\bdilution rate\b/])) {
    addMissing(missing, seen, {
      item: "Dilution rate D",
      category: "control_parameter",
      required_for: "continuous-flow dilution terms",
      why_needed: "Chemostat balances require a dilution or flow-rate term.",
      suggested_source: "current paper",
      severity: "critical",
    });
  }
  if (!hasParameter(input, [/\bsin\b|\bfeed\b.*\b(substrate|acetate)|\bacetate feed\b/])) {
    addMissing(missing, seen, {
      item: "Feed substrate or acetate concentration",
      category: "control_parameter",
      required_for: "substrate inlet balance",
      why_needed: "The inlet concentration or feed rate sets the forcing term for substrate dynamics.",
      suggested_source: "current paper",
      severity: "critical",
    });
  }
}

function addPhotobioreactorChecks(
  input: ModelAssemblyInput,
  corpus: string,
  missing: MissingRequirement[],
  seen: Set<string>,
): void {
  if (!hasEquation(input, [/\blight\b.*\bgrowth\b|\bphoto\w*\b.*\bgrowth\b|\bphotosynthesis\b/])) {
    addMissing(missing, seen, {
      item: "Autotrophic growth/light relation",
      category: "light_model",
      required_for: "phototrophic biomass growth term",
      why_needed: "A photobioreactor ODE needs a relation connecting light availability to autotrophic growth.",
      suggested_source: "cited_paper",
      severity: "critical",
    });
  }
  if (!lightAttenuationSpecified(input, corpus)) {
    addMissing(missing, seen, {
      item: "Light attenuation parameters",
      category: "light_model",
      required_for: "spatially averaged or effective light model",
      why_needed: "Incident light or PFD alone is not enough to compute light-limited growth through a dense culture.",
      suggested_source: "supporting_information",
      severity: "critical",
    });
  }
}

function addGasTransferChecks(
  corpus: string,
  missing: MissingRequirement[],
  seen: Set<string>,
): void {
  if (gasEquilibriumClaimed(corpus) && !henryConventionSpecified(corpus)) {
    addMissing(missing, seen, {
      item: "Henry-law convention",
      category: "gas_transfer",
      required_for: "gas-liquid O2/CO2 equilibrium and transfer calculations",
      why_needed: "Different Henry-law conventions invert or rescale the gas-liquid equilibrium expression.",
      suggested_source: "user_assumption",
      severity: "warning",
    });
  }
}

function addAcetateMetabolismChecks(
  input: ModelAssemblyInput,
  missing: MissingRequirement[],
  seen: Set<string>,
): void {
  if (!hasState(input, [/\bacetate\b|\bs_ac\b|\bac\b|\bsubstrate\b/])) {
    addMissing(missing, seen, {
      item: "Acetate/substrate state",
      category: "source_document",
      required_for: "acetate uptake and substrate balance",
      why_needed: "Acetate-fed models need an acetate inventory state or an explicitly fixed acetate input.",
      suggested_source: "current paper",
      severity: "critical",
    });
  }
  if (!hasEquation(input, [/\bacetate\b.*\buptake\b|\bqac\b|\bheterotroph\w*\b.*\bacetate\b/])) {
    addMissing(missing, seen, {
      item: "Heterotrophic acetate uptake relation",
      category: "kinetic_parameter",
      required_for: "heterotrophic growth and acetate consumption",
      why_needed: "A dynamic mixotrophy model needs a rate law for acetate uptake, not only a feed concentration.",
      suggested_source: "cited_paper",
      severity: "critical",
    });
  }
}

function addOxygenBalancedMixotrophyChecks(
  input: ModelAssemblyInput,
  corpus: string,
  missing: MissingRequirement[],
  seen: Set<string>,
): void {
  if (!hasState(input, [/\bdo\b|\bdissolved oxygen\b|\bc_?o2\b|\bo2\b/])) {
    addMissing(missing, seen, {
      item: "Dissolved O2 state",
      category: "source_document",
      required_for: "oxygen balance",
      why_needed: "Oxygen-balanced mixotrophy needs a dissolved oxygen state to couple gas transfer, photosynthesis, and respiration.",
      suggested_source: "current paper",
      severity: "critical",
    });
  }
  if (!hasState(input, [/\btic\b|\bdissolved co2\b|\bc_?co2\b|\bco2\b|\binorganic carbon\b/])) {
    addMissing(missing, seen, {
      item: "Dissolved CO2/TIC state",
      category: "source_document",
      required_for: "carbon balance",
      why_needed: "A six-state oxygen/carbon model needs a dissolved CO2 or TIC state for autotrophic carbon uptake and gas exchange.",
      suggested_source: "supporting_information",
      severity: "critical",
    });
  }
  if (!hasAny(corpus, [/\bo2\b.*\b(co2|yield|stoich)/, /\bco2\b.*\b(yield|stoich)/, /\bstoichiometr/])) {
    addMissing(missing, seen, {
      item: "O2 and CO2 yield/stoichiometry",
      category: "stoichiometric_yield",
      required_for: "oxygen and carbon source terms",
      why_needed: "O2/CO2 stoichiometry is needed to convert growth and uptake rates into gas-liquid balance terms.",
      suggested_source: "current paper",
      severity: "critical",
    });
  }
  if (!hasParameter(input, [/\bmu(max)?\b|\bks\b|\bq(ac|o2|co2)\b|\bkinetic\b/])) {
    addMissing(missing, seen, {
      item: "Kinetic constants for growth and uptake",
      category: "kinetic_parameter",
      required_for: "closed ODE right-hand-side rates",
      why_needed: "Experimental productivity and yield calculations do not define the kinetic constants needed for dynamic rate laws.",
      suggested_source: "supporting_information",
      severity: "critical",
    });
  }
  if (closedLoopControlClaimed(corpus) && !hasControllerParameters(input, corpus)) {
    addMissing(missing, seen, {
      item: "Controller parameters for DO control",
      category: "control_parameter",
      required_for: "closed-loop oxygen control dynamics",
      why_needed: "A claimed DO controller needs setpoint logic and gains/time constants before it can be simulated.",
      suggested_source: "user_assumption",
      severity: "critical",
    });
  }
}

function addGeneralDynamicChecks(
  input: ModelAssemblyInput,
  corpus: string,
  missing: MissingRequirement[],
  seen: Set<string>,
): void {
  const hasStateRows =
    input.variables.some((variable) => lower(variable.role) === "state") ||
    (input.raw?.state_variables ?? []).some((variable) => lower(variable.role) === "state");
  const hasOde = hasEquation(input, [/d\s*[a-z][a-z0-9_]*\s*\/\s*d\s*t/i]);

  if (!hasStateRows) {
    addMissing(missing, seen, {
      item: "State variables",
      category: "source_document",
      required_for: "dynamic model assembly",
      why_needed: "A runnable ODE model needs explicit state variables.",
      suggested_source: "current paper",
      severity: "critical",
    });
  }
  if (!hasOde && input.equations.length === 0 && (input.raw?.equations ?? []).length === 0) {
    addMissing(missing, seen, {
      item: "Governing dynamic equations",
      category: "source_document",
      required_for: "ODE model assembly",
      why_needed: "A scaffold can list quantities, but runnable dynamics require balance or rate equations.",
      suggested_source: "current paper",
      severity: "critical",
    });
  }
  if (!hasInitialConditions(input, corpus) && hasStateRows) {
    addMissing(missing, seen, {
      item: "Initial conditions",
      category: "initial_condition",
      required_for: "ODE simulation start values",
      why_needed: "ODE solvers need initial values for each state variable.",
      suggested_source: "user_assumption",
      severity: "critical",
    });
  }
}

function recommendedActions(missing: MissingRequirement[]): string[] {
  const actions: string[] = [];
  const text = missing.map((item) => `${item.item} ${item.category} ${item.suggested_source}`).join(" ").toLowerCase();

  if (text.includes("supporting_information")) {
    actions.push("Upload the Supporting Information");
  }
  if (text.includes("cited_paper")) {
    actions.push("Upload the cited light-model or kinetic-model paper");
  }
  if (text.includes("henry-law")) {
    actions.push("Provide assumed Henry-law convention");
  }
  if (text.includes("kinetic")) {
    actions.push("Provide kinetic constants or allow calibration");
  }
  if (text.includes("controller")) {
    actions.push("Provide controller parameters for closed-loop DO control");
  }
  if (text.includes("initial_condition")) {
    actions.push("Provide initial conditions for each state variable");
  }
  if (actions.length === 0 && missing.length > 0) {
    actions.push("Upload another source document that defines the missing model requirements");
  }
  if (actions.length === 0) {
    actions.push("Review extracted equations, parameters, units, and assumptions before simulation");
  }
  return uniqueStrings(actions);
}

function deriveStatus(
  input: ModelAssemblyInput,
  missing: MissingRequirement[],
): Pick<
  ModelAssemblyReport,
  "assembly_status" | "can_generate_runnable_model" | "can_generate_scaffold"
> {
  const critical = missing.filter((item) => item.severity === "critical").length;
  const hasEquations = input.equations.length > 0 || (input.raw?.equations ?? []).length > 0;
  const hasStates =
    input.variables.some((variable) => lower(variable.role) === "state") ||
    (input.raw?.state_variables ?? []).some((variable) => lower(variable.role) === "state");
  const hasParameters = input.parameters.length > 0 || (input.raw?.parameters ?? []).length > 0;
  const canGenerateScaffold = hasEquations || hasStates || hasParameters;

  if (!canGenerateScaffold || (!hasEquations && !hasStates)) {
    return {
      assembly_status: "insufficient",
      can_generate_runnable_model: false,
      can_generate_scaffold: false,
    };
  }

  if (critical === 0) {
    return {
      assembly_status: "complete",
      can_generate_runnable_model: true,
      can_generate_scaffold: true,
    };
  }

  return {
    assembly_status: "partial",
    can_generate_runnable_model: false,
    can_generate_scaffold: true,
  };
}

export function analyzeModelAssembly(input: ModelAssemblyInput): ModelAssemblyReport {
  const corpus = buildCorpus(input);
  const targetModelType = detectTargetModelType(corpus);
  const available = buildAvailableItems(input);
  const missing: MissingRequirement[] = [];
  const missingSeen = new Set<string>();

  addGeneralDynamicChecks(input, corpus, missing, missingSeen);

  if (/chemostat|continuous bioreactor|oxygen-balanced|mixotrophic/.test(lower(targetModelType))) {
    addChemostatChecks(input, missing, missingSeen);
  }
  if (/photobioreactor|microalgae|oxygen-balanced/.test(lower(targetModelType))) {
    addPhotobioreactorChecks(input, corpus, missing, missingSeen);
  }
  if (/gas-liquid|o2\/co2|oxygen-balanced/.test(lower(targetModelType))) {
    addGasTransferChecks(corpus, missing, missingSeen);
  }
  if (/acetate|heterotrophy|autotrophy|mixotrophic|oxygen-balanced/.test(lower(targetModelType))) {
    addAcetateMetabolismChecks(input, missing, missingSeen);
  }
  if (/oxygen-balanced|mixotrophic/.test(lower(targetModelType))) {
    addOxygenBalancedMixotrophyChecks(input, corpus, missing, missingSeen);
  }

  const status = deriveStatus(input, missing);

  return {
    ...status,
    target_model_type: targetModelType,
    available_from_current_source: available,
    missing_requirements: missing,
    recommended_next_actions: recommendedActions(missing),
  };
}
