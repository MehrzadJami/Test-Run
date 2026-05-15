import type {
  ExtractedModelType,
  ExtractionResult,
  ExtractedEquation,
  ExtractedLimitation,
} from "./extraction-schema";
import type {
  CandidateEquation,
  CandidateParameter,
  InitialCondition,
  PaperEvidenceItem,
  PaperUnderstanding,
  TableOrValueBlock,
} from "./paper-understanding-schema";

function pageContext(item: { page_start: number | null; page_end: number | null; section_heading: string; source_context: string }): string {
  const pageLabel =
    item.page_start == null || item.page_end == null
      ? "unknown page"
      : item.page_start === item.page_end
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
    ...(understanding.reactor_or_equipment_setup ?? []).map((item) => `${item.item} ${item.details}`),
    ...(understanding.procedure_steps ?? []).map((item) => `${item.item} ${item.details}`),
    ...(understanding.operating_timeline ?? []).map((item) => `${item.item} ${item.details}`),
    ...understanding.candidate_state_variables.map((item) => `${item.symbol} ${item.name} ${item.meaning}`),
    ...(understanding.candidate_inputs ?? []).map((item) => `${item.symbol} ${item.name} ${item.meaning}`),
    ...(understanding.candidate_outputs ?? []).map((item) => `${item.symbol} ${item.name} ${item.meaning}`),
    ...(understanding.candidate_controls ?? []).map((item) => `${item.symbol} ${item.name} ${item.meaning}`),
    ...understanding.candidate_parameters.map((item) => `${item.symbol} ${item.name} ${parameterValue(item)} ${item.unit}`),
    ...(understanding.initial_conditions ?? []).map((item) => `${item.symbol} ${item.state_symbol} ${initialConditionValue(item)} ${item.unit}`),
    ...understanding.candidate_equations.map((item) => `${item.equation_type} ${item.equation_plaintext} ${item.meaning}`),
    ...understanding.tables_or_reported_values.map((item) => `${item.item} ${item.value} ${item.unit}`),
    ...(understanding.tables_or_value_blocks ?? []).map((block) => `${block.caption_or_context} ${block.raw_text}`),
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

function parameterValue(parameter: CandidateParameter): string {
  if (parameter.value_raw != null && parameter.value_raw.trim()) {
    return parameter.value_raw;
  }
  if (parameter.value != null && parameter.value.trim()) return parameter.value;
  if (parameter.value_numeric != null) return String(parameter.value_numeric);
  return "unknown";
}

function initialConditionValue(initialCondition: InitialCondition): string {
  if (initialCondition.value_raw.trim()) return initialCondition.value_raw;
  if (initialCondition.value_numeric != null) {
    return String(initialCondition.value_numeric);
  }
  return "unknown";
}

function initialConditionByState(
  understanding: PaperUnderstanding,
): Map<string, InitialCondition> {
  const map = new Map<string, InitialCondition>();
  for (const initialCondition of understanding.initial_conditions ?? []) {
    const key = initialCondition.state_symbol.trim();
    if (!key || map.has(key)) continue;
    map.set(key, initialCondition);
  }
  return map;
}

function mapEquation(equation: CandidateEquation, index: number): ExtractedEquation {
  return {
    label: equation.label || `(${index + 1})`,
    equation_latex: equation.equation_latex || equation.equation_plaintext,
    equation_plaintext: equation.equation_plaintext,
    equation_type: equation.equation_type,
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

function allCandidateVariables(understanding: PaperUnderstanding) {
  return uniqueBySymbol([
    ...understanding.candidate_state_variables,
    ...(understanding.candidate_inputs ?? []),
    ...(understanding.candidate_outputs ?? []),
    ...(understanding.candidate_controls ?? []),
  ]);
}

function uniqueBySymbol<T extends { symbol: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.symbol.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

type MappedParameter = {
  symbol: string;
  name: string;
  value: string;
  unit: string;
  source_context: string;
  confidence: "high" | "medium" | "low";
  status?: "explicit" | "inferred" | "missing" | "unknown" | "initial_condition";
};

function tableParameters(
  understanding: PaperUnderstanding,
): MappedParameter[] {
  const existing = new Set(
    understanding.candidate_parameters.map((parameter) => parameter.symbol),
  );
  const rows: MappedParameter[] = [];
  for (const block of understanding.tables_or_value_blocks ?? []) {
    for (const row of block.extracted_rows) {
      const symbol = row.symbol_or_item.trim();
      if (!symbol || existing.has(symbol)) continue;
      if (!row.value && !row.unit) continue;
      rows.push({
        symbol,
        name: row.symbol_or_item,
        value: row.value || "unknown",
        unit: row.unit,
        source_context: tableRowContext(block, row.source_quote),
        confidence: row.confidence,
        status: "explicit",
      });
      existing.add(symbol);
    }
  }
  return rows;
}

function tableRowContext(block: TableOrValueBlock, quote: string): string {
  const pageLabel = block.page == null ? "unknown page" : `p. ${block.page}`;
  return `${pageLabel}, ${block.section_heading}: ${quote || block.caption_or_context}`;
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
    ...allCandidateVariables(understanding)
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
    ...(understanding.model_assembly_assessment?.missing_requirements ?? []).map(
      (item) => `${item.item}: ${item.details}`,
    ),
    ...(understanding.model_assembly_assessment?.recommended_next_actions ?? []).map(
      (action) => `Recommended action - ${action}`,
    ),
  ]);
  const variables = allCandidateVariables(understanding);
  const initialByState = initialConditionByState(understanding);
  const explicitParameters = understanding.candidate_parameters.map((parameter) => ({
    symbol: parameter.symbol,
    name: parameter.name,
    value: parameterValue(parameter),
    unit: parameter.unit,
    source_context: pageContext(parameter),
    confidence:
      parameter.status === "missing" || parameter.status === "unknown"
        ? ("low" as const)
        : parameter.confidence,
    // AUDIT-4: never leak `undefined` status downstream — coerce at the boundary.
    status: parameter.status ?? "unknown",
  }));
  const existingParameterSymbols = new Set(
    explicitParameters.map((parameter) => parameter.symbol),
  );
  const initialConditionParameters: MappedParameter[] = (understanding.initial_conditions ?? [])
    .filter((initialCondition) => !existingParameterSymbols.has(initialCondition.symbol))
    .map((initialCondition) => ({
      symbol: initialCondition.symbol,
      name: initialCondition.name || `Initial condition for ${initialCondition.state_symbol}`,
      value: initialConditionValue(initialCondition),
      unit: initialCondition.unit,
      source_context: `${pageContext(initialCondition)} [initial_condition]`,
      confidence:
        initialCondition.status === "missing" || initialCondition.status === "unknown"
          ? ("low" as const)
          : initialCondition.confidence,
      status: "initial_condition",
    }));
  const parameters = [
    ...explicitParameters,
    ...initialConditionParameters,
    ...tableParameters(understanding),
  ];
  const canGenerateScaffold =
    understanding.model_assembly_assessment?.can_generate_scaffold ??
    dynamicEquations.length > 0;

  return {
    paper_title_or_topic: understanding.paper_title,
    model_type: modelType,
    system_type: understanding.main_system || understanding.process_type || "Unknown system",
    process_description: [
      understanding.process_type,
      understanding.operating_mode,
      understanding.organism_or_material,
      ...understanding.experimental_setup.map((item) => item.details),
      ...(understanding.reactor_or_equipment_setup ?? []).map((item) => item.details),
      ...(understanding.procedure_steps ?? []).map((item) => item.details),
      ...(understanding.operating_timeline ?? []).map((item) => item.details),
    ]
      .filter(Boolean)
      .join(" "),
    state_variables: variables.map((variable) => ({
      symbol: variable.symbol,
      name: variable.name,
      meaning: variable.meaning,
      unit: variable.unit,
      role: variable.role,
      source_context: pageContext(variable),
      confidence: variable.confidence,
      initial_condition: initialByState.has(variable.symbol)
        ? {
            symbol: initialByState.get(variable.symbol)!.symbol,
            value: initialConditionValue(initialByState.get(variable.symbol)!),
            value_numeric: initialByState.get(variable.symbol)!.value_numeric,
            unit: initialByState.get(variable.symbol)!.unit,
            source_context: pageContext(initialByState.get(variable.symbol)!),
            confidence: initialByState.get(variable.symbol)!.confidence,
          }
        : undefined,
    })),
    parameters,
    initial_conditions: (understanding.initial_conditions ?? []).map((initialCondition) => ({
      symbol: initialCondition.symbol,
      state_symbol: initialCondition.state_symbol,
      name: initialCondition.name || `Initial condition for ${initialCondition.state_symbol}`,
      value: initialConditionValue(initialCondition),
      value_numeric: initialCondition.value_numeric,
      unit: initialCondition.unit,
      source_context: pageContext(initialCondition),
      confidence: initialCondition.confidence,
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
        variables
          .filter((variable) => variable.role === "input")
          .map((variable) => variable.symbol),
      ),
      outputs: unique(
        variables
          .filter((variable) => variable.role === "state" || variable.role === "output")
          .map((variable) => variable.symbol),
      ),
      control_variables: controlVariables,
      missing_information: missingInformation,
      can_generate_ode_template: dynamicEquations.length > 0 && canGenerateScaffold,
    },
  };
}
