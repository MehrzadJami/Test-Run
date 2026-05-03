import type {
  ExtractedModelType,
  ExtractionResult,
  ExtractedEquation,
  ExtractedLimitation,
} from "./extraction-schema";
import type {
  CandidateEquation,
  PaperEvidenceItem,
  PaperUnderstanding,
} from "./paper-understanding-schema";

function pageContext(item: { page_start: number; page_end: number; section_heading: string; source_context: string }): string {
  const pageLabel =
    item.page_start === item.page_end
      ? `p. ${item.page_start}`
      : `pp. ${item.page_start}-${item.page_end}`;
  return `${pageLabel}, ${item.section_heading}: ${item.source_context}`;
}

function combinedUnderstandingText(understanding: PaperUnderstanding): string {
  return [
    understanding.paper_title,
    understanding.model_type,
    understanding.main_system,
    understanding.organism_or_material,
    understanding.process_type,
    understanding.operating_mode,
    ...understanding.experimental_setup.map((item) => `${item.item} ${item.details}`),
    ...understanding.candidate_state_variables.map((item) => `${item.symbol} ${item.name} ${item.meaning}`),
    ...understanding.candidate_parameters.map((item) => `${item.symbol} ${item.name} ${item.value} ${item.unit}`),
    ...understanding.candidate_equations.map((item) => `${item.equation_type} ${item.equation_plaintext} ${item.meaning}`),
    ...understanding.tables_or_reported_values.map((item) => `${item.item} ${item.value} ${item.unit}`),
    ...understanding.controls_and_setpoints.map((item) => `${item.variable} ${item.value} ${item.control_type}`),
    ...understanding.assumptions.map((item) => `${item.item} ${item.details}`),
    ...understanding.limitations_or_missing_info.map((item) => `${item.item} ${item.details}`),
  ]
    .join(" ")
    .toLowerCase();
}

export function inferModelTypeFromPaperUnderstanding(
  understanding: PaperUnderstanding,
): ExtractedModelType {
  if (understanding.model_type !== "unknown") return understanding.model_type;

  const text = combinedUnderstandingText(understanding);
  const hasDoControl =
    /\bdo\b.{0,80}\b(control|controlled|setpoint|set point)\b/.test(text) ||
    /\bdissolved oxygen\b.{0,80}\b(control|controlled|setpoint|set point)\b/.test(text);
  const hasAcetate = /\bacetate\b|\bacetic acid\b/.test(text);
  const hasMixotrophy = /\bmixotroph|\bheterotroph|\bautotroph/.test(text);
  const hasPbr = /\bphotobioreactor\b|\bpbr\b|\bmicroalgae\b|\bpfd\b|\blight\b/.test(text);

  if (hasDoControl && hasAcetate && (hasMixotrophy || hasPbr)) {
    return "oxygen_balanced_mixotrophy";
  }
  if (hasPbr) return "microalgae_photobioreactor";
  if (/\bkla\b|\bhenry\b|\bo2\b|\bco2\b|\bdissolved oxygen\b|\bgas-liquid\b/.test(text)) {
    return "gas_liquid";
  }
  if (/\bchemostat\b|\bdilution rate\b|\bcontinuous culture\b/.test(text)) {
    return "monod_chemostat";
  }
  if (/\bfed-batch\b|\bfed batch\b|\bvariable volume\b|\bf\(t\)/.test(text)) {
    return "fed_batch";
  }
  if (/\bbatch culture\b|\bclosed system\b|\bno inlet\b|\bno outlet\b/.test(text)) {
    return "batch_culture";
  }
  if (/\bcstr\b|\bresidence time\b/.test(text)) return "cstr";
  if (/\bpfr\b|\bplug-flow\b|\bplug flow\b|\bcoordinate z\b/.test(text)) return "pfr";
  if (/\bvmax\b|\bkm\b|\benzyme\b|\bmichaelis/.test(text)) return "enzyme_kinetics";
  return "unknown";
}

function equationMeaning(equation: CandidateEquation): string {
  const typeLabel = equation.equation_type.replace(/_/g, " ");
  return `${typeLabel}: ${equation.meaning}`;
}

function mapEquation(equation: CandidateEquation, index: number): ExtractedEquation {
  return {
    label: equation.label || `(${index + 1})`,
    equation_latex: equation.equation_latex || equation.equation_plaintext,
    equation_plaintext: equation.equation_plaintext,
    meaning: equationMeaning(equation),
    variables_involved: equation.variables_involved,
    source_context: pageContext(equation),
    confidence: equation.confidence,
  };
}

function mapMissingInfo(item: PaperEvidenceItem): ExtractedLimitation {
  return {
    limitation: `${item.item}: ${item.details}`,
    source_context: pageContext(item),
    confidence: item.confidence,
  };
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values.map((v) => v.trim()).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function mapPaperUnderstandingToExtractionResult(
  understanding: PaperUnderstanding,
): ExtractionResult {
  const modelType = inferModelTypeFromPaperUnderstanding(understanding);
  const dynamicEquations = understanding.candidate_equations.filter(
    (equation) => equation.equation_type === "dynamic_ode",
  );
  const controlVariables = unique([
    ...understanding.controls_and_setpoints.map((control) => control.variable),
    ...understanding.candidate_state_variables
      .filter((variable) => variable.role === "control")
      .map((variable) => variable.symbol),
  ]);
  const missingInformation = unique([
    ...understanding.limitations_or_missing_info.map(
      (item) => `${item.item}: ${item.details}`,
    ),
    ...understanding.referenced_external_sources_needed.map(
      (item) => `Source needed - ${item.item}: ${item.details}`,
    ),
  ]);

  return {
    paper_title_or_topic: understanding.paper_title,
    model_type: modelType,
    system_type: understanding.main_system || understanding.process_type || "Unknown system",
    process_description: [
      understanding.process_type,
      understanding.operating_mode,
      understanding.organism_or_material,
      ...understanding.experimental_setup.map((item) => item.details),
    ]
      .filter(Boolean)
      .join(" "),
    state_variables: understanding.candidate_state_variables.map((variable) => ({
      symbol: variable.symbol,
      name: variable.name,
      meaning: variable.meaning,
      unit: variable.unit,
      role: variable.role,
      source_context: pageContext(variable),
      confidence: variable.confidence,
    })),
    parameters: understanding.candidate_parameters.map((parameter) => ({
      symbol: parameter.symbol,
      name: parameter.name,
      value: parameter.value || "unknown",
      unit: parameter.unit,
      source_context: pageContext(parameter),
      confidence: parameter.confidence,
    })),
    equations: understanding.candidate_equations.map(mapEquation),
    assumptions: understanding.assumptions.map((item) => ({
      assumption: `${item.item}: ${item.details}`,
      source_context: pageContext(item),
      confidence: item.confidence,
    })),
    limitations: [
      ...understanding.limitations_or_missing_info.map(mapMissingInfo),
      ...understanding.referenced_external_sources_needed.map((item) => ({
        limitation: `External source needed - ${item.item}: ${item.details}`,
        source_context: pageContext(item),
        confidence: item.confidence,
      })),
    ],
    model_card: {
      short_summary: `${understanding.paper_type} paper about ${understanding.main_system}. ${dynamicEquations.length > 0 ? "Dynamic model equations were identified." : "No complete dynamic ODE system was identified."}`,
      model_type: `${modelType}; ${dynamicEquations.length} dynamic ODE equation(s) identified`,
      inputs: unique(
        understanding.candidate_state_variables
          .filter((variable) => variable.role === "input")
          .map((variable) => variable.symbol),
      ),
      outputs: unique(
        understanding.candidate_state_variables
          .filter((variable) => variable.role === "state" || variable.role === "output")
          .map((variable) => variable.symbol),
      ),
      control_variables: controlVariables,
      missing_information: missingInformation,
      can_generate_ode_template: dynamicEquations.length > 0,
    },
  };
}
