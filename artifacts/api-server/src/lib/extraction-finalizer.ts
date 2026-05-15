import {
  ExtractionResultSchema,
  type ExtractionResult,
  type ExtractedModelType,
  type ExtractedParameter,
  type ExtractedStateVariable,
  type FinalizerChange,
} from "./extraction-schema";

export interface FinalizedExtractionResult {
  result: ExtractionResult;
  changed: boolean;
  warnings: string[];
}

const UNIT_INFERRED_FROM_INITIAL_CONDITION = "Unit inferred from initial condition.";
const UNIT_INFERRED_FROM_CSTAR = "Unit inferred from Cstar_O2 in the same oxygen balance.";

// AUDIT-5: per-field provenance helpers. Each mutating finalizer rule appends
// an entry so downstream code (UI, exports, ChemE Brain) can distinguish
// AI-extracted values from finalizer-inferred ones.
type RowWithChanges = { finalizer_changes?: FinalizerChange[] };
function appendChange<T extends RowWithChanges>(row: T, change: FinalizerChange): T {
  return {
    ...row,
    finalizer_changes: [...(row.finalizer_changes ?? []), change],
  };
}
function changeString(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function cloneExtractionResult(result: ExtractionResult): ExtractionResult {
  return {
    ...result,
    state_variables: result.state_variables.map((variable) => ({
      ...variable,
      initial_condition: variable.initial_condition
        ? { ...variable.initial_condition }
        : undefined,
    })),
    parameters: result.parameters.map((parameter) => ({ ...parameter })),
    initial_conditions: (result.initial_conditions ?? []).map((initial) => ({
      ...initial,
    })),
    equations: result.equations.map((equation) => ({
      ...equation,
      variables_involved: [...equation.variables_involved],
    })),
    assumptions: result.assumptions.map((assumption) => ({ ...assumption })),
    limitations: result.limitations.map((limitation) => ({ ...limitation })),
    model_card: {
      ...result.model_card,
      inputs: [...result.model_card.inputs],
      outputs: [...result.model_card.outputs],
      control_variables: [...result.model_card.control_variables],
      missing_information: [...result.model_card.missing_information],
    },
  };
}

function parseNumericValue(value: string): number | null {
  const match = value.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isUnknownPlaceholder(value: unknown): boolean {
  const text = normalized(value);
  return text === "" || text === "-" || text === "unknown" || text === "n/a";
}

function hasUsefulSourceContext(sourceContext: unknown): boolean {
  const text = normalized(sourceContext);
  const compact = text.replace(/[\s,.:;-]+/g, "");
  if (!compact || compact === "unknown" || compact === "unknownpage") return false;
  if (/^unknown page\b/.test(text) && /unknown placeholder|^\s*unknown page\s*,?\s*:?\s*$/.test(text)) {
    return false;
  }
  return !/\bunknown placeholder\b/.test(text);
}

function parameterValueKey(parameter: ExtractedParameter): string | null {
  const numeric = parseNumericValue(parameter.value);
  const unit = normalized(parameter.unit);
  if (numeric == null || isUnknownPlaceholder(unit)) return null;
  return `${numeric}:${unit}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function initialStateSymbol(symbol: string): string | null {
  // Require the trailing 0 to be either preceded by an explicit underscore OR
  // not preceded by another digit — prevents X00 from matching (likely identifier, not IC).
  const match = symbol.trim().match(/^([A-Za-z][A-Za-z0-9_]*?)(?:_0|(?<![0-9])0)$/);
  return match?.[1] ?? null;
}

function roleBySymbol(
  symbol: string,
  modelType: ExtractedModelType,
): ExtractedStateVariable["role"] | null {
  const lower = normalized(symbol);
  if (lower === "mu") return "output";
  if (lower === "sin") return "input";
  if (lower === "cstar_o2") return "input";
  if (lower === "kla") return "parameter";
  if (lower === "d" && modelType === "monod_chemostat") return "control";
  return null;
}

function hasDerivativeEquationForSymbol(result: ExtractionResult, symbol: string): boolean {
  const text = result.equations
    .map((equation) => `${equation.equation_plaintext} ${equation.equation_latex}`)
    .join("\n");
  return new RegExp(`d\\s*${escapeRegExp(symbol)}\\s*\\/\\s*d\\s*t\\s*=`, "i").test(text);
}

function hasSymbol(values: string[], symbol: string): boolean {
  return values.some((value) => normalized(value) === normalized(symbol));
}

function stateSymbols(result: ExtractionResult): Set<string> {
  return new Set(
    result.state_variables
      .filter(
        (variable) =>
          variable.role === "state" &&
          !isUnknownPlaceholder(variable.symbol) &&
          !isUnknownPlaceholder(variable.name),
      )
      .map((variable) => normalized(variable.symbol)),
  );
}

function isInitialConditionParameter(
  parameter: ExtractedParameter,
  states: Set<string>,
): boolean {
  if (parameter.status === "initial_condition") return true;
  if (/\binitial condition\b/i.test(parameter.name)) return true;
  if (/\[initial_condition\]|\binitial conditions?\b/i.test(parameter.source_context)) return true;
  const stateSymbol = initialStateSymbol(parameter.symbol);
  return Boolean(stateSymbol && states.has(normalized(stateSymbol)));
}

function appendOnce(value: string, note: string): string {
  if (value.includes(note)) return value;
  return `${value} ${note}`.trim();
}

function normalizeInitialConditionParameters(result: ExtractionResult): boolean {
  let changed = false;
  const states = stateSymbols(result);
  result.parameters = result.parameters.map((parameter) => {
    if (!isInitialConditionParameter(parameter, states)) return parameter;
    const stateSymbol = initialStateSymbol(parameter.symbol);
    if (!stateSymbol) return parameter;
    const name = `Initial condition for ${stateSymbol}`;
    const source_context = appendOnce(parameter.source_context, "[initial_condition]");
    let next: ExtractedParameter = {
      ...parameter,
      name,
      status: "initial_condition" as const,
      source_context,
    };
    if (next.status !== parameter.status) {
      next = appendChange(next, {
        rule: "normalize_initial_condition_parameter",
        field: "status",
        before: changeString(parameter.status),
        after: "initial_condition",
      });
    }
    if (next.name !== parameter.name) {
      next = appendChange(next, {
        rule: "normalize_initial_condition_parameter",
        field: "name",
        before: changeString(parameter.name),
        after: name,
      });
    }
    if (
      next.name !== parameter.name ||
      next.status !== parameter.status ||
      next.source_context !== parameter.source_context
    ) {
      changed = true;
    }
    return next;
  });
  return changed;
}

function normalizeInitialConditions(result: ExtractionResult): boolean {
  let changed = false;
  const bySymbol = new Map<string, NonNullable<ExtractionResult["initial_conditions"]>[number]>();
  for (const initial of result.initial_conditions ?? []) {
    const state = initial.state_symbol || initialStateSymbol(initial.symbol) || "";
    const normalizedInitial = {
      ...initial,
      state_symbol: state || initial.state_symbol,
      name: state ? `Initial condition for ${state}` : initial.name,
    };
    const key = normalized(initial.symbol);
    if (!key || bySymbol.has(key)) continue;
    bySymbol.set(key, normalizedInitial);
    if (
      normalizedInitial.state_symbol !== initial.state_symbol ||
      normalizedInitial.name !== initial.name
    ) {
      changed = true;
    }
  }

  for (const parameter of result.parameters) {
    if (parameter.status !== "initial_condition") continue;
    const state = initialStateSymbol(parameter.symbol);
    if (!state) continue;
    const key = normalized(parameter.symbol);
    if (bySymbol.has(key)) continue;
    bySymbol.set(key, {
      symbol: parameter.symbol,
      state_symbol: state,
      name: parameter.name || `Initial condition for ${state}`,
      value: parameter.value,
      value_numeric: parseNumericValue(parameter.value),
      unit: parameter.unit,
      source_context: parameter.source_context,
      confidence: parameter.confidence,
    });
    changed = true;
  }

  const next = [...bySymbol.values()];
  const existing = result.initial_conditions ?? [];
  if (
    existing.length !== next.length ||
    existing.some((initial, index) => normalized(initial.symbol) !== normalized(next[index]?.symbol))
  ) {
    changed = true;
  }
  result.initial_conditions = next;
  return changed;
}

function attachInitialConditionsToStates(result: ExtractionResult): boolean {
  let changed = false;
  const byState = new Map(
    (result.initial_conditions ?? []).map((initial) => [
      normalized(initial.state_symbol),
      initial,
    ]),
  );
  result.state_variables = result.state_variables.map((variable) => {
    if (variable.role !== "state") return variable;
    const initial = byState.get(normalized(variable.symbol));
    if (!initial) return variable;
    const existing = variable.initial_condition;
    if (
      existing &&
      existing.symbol === initial.symbol &&
      existing.value === initial.value &&
      existing.unit === initial.unit
    ) {
      return variable;
    }
    changed = true;
    return {
      ...variable,
      initial_condition: {
        symbol: initial.symbol,
        value: initial.value,
        value_numeric: initial.value_numeric,
        unit: initial.unit,
        source_context: initial.source_context,
        confidence: initial.confidence,
      },
    };
  });
  return changed;
}

function inferStateUnitsFromInitialConditions(result: ExtractionResult): boolean {
  let changed = false;
  const byState = new Map(
    (result.initial_conditions ?? [])
      .filter((initial) => !isUnknownPlaceholder(initial.unit))
      .map((initial) => [normalized(initial.state_symbol), initial]),
  );
  result.state_variables = result.state_variables.map((variable) => {
    if (!isUnknownPlaceholder(variable.unit)) return variable;
    const initial = byState.get(normalized(variable.symbol));
    if (!initial) return variable;
    changed = true;
    const nextConfidence: typeof variable.confidence =
      variable.confidence === "high" || variable.confidence === "medium" ? "medium" : "low";
    let next: ExtractedStateVariable = {
      ...variable,
      unit: initial.unit,
      confidence: nextConfidence,
      source_context: appendOnce(variable.source_context, UNIT_INFERRED_FROM_INITIAL_CONDITION),
    };
    next = appendChange(next, {
      rule: "infer_state_unit_from_initial_condition",
      field: "unit",
      before: changeString(variable.unit),
      after: initial.unit,
    });
    if (nextConfidence !== variable.confidence) {
      next = appendChange(next, {
        rule: "infer_state_unit_from_initial_condition",
        field: "confidence",
        before: changeString(variable.confidence),
        after: nextConfidence,
      });
    }
    return next;
  });
  return changed;
}

function equationContainsBoth(result: ExtractionResult, left: string, right: string): boolean {
  const leftKey = normalized(left);
  const rightKey = normalized(right);
  return result.equations.some((equation) => {
    const text = normalized(`${equation.equation_plaintext} ${equation.equation_latex}`);
    return text.includes(leftKey) && text.includes(rightKey);
  });
}

function inferGasStateUnitFromSaturationParameter(result: ExtractionResult): boolean {
  if (result.model_type !== "gas_liquid") return false;
  const cstar = result.parameters.find(
    (parameter) =>
      normalized(parameter.symbol) === "cstar_o2" &&
      !isUnknownPlaceholder(parameter.unit),
  );
  if (!cstar || !equationContainsBoth(result, "C_O2", "Cstar_O2")) return false;

  let changed = false;
  result.state_variables = result.state_variables.map((variable) => {
    if (normalized(variable.symbol) !== "c_o2" || !isUnknownPlaceholder(variable.unit)) {
      return variable;
    }
    changed = true;
    const nextConfidence: typeof variable.confidence =
      variable.confidence === "high" || variable.confidence === "medium" ? "medium" : "low";
    let next: ExtractedStateVariable = {
      ...variable,
      unit: cstar.unit,
      confidence: nextConfidence,
      source_context: appendOnce(variable.source_context, UNIT_INFERRED_FROM_CSTAR),
    };
    next = appendChange(next, {
      rule: "infer_gas_state_unit_from_cstar",
      field: "unit",
      before: changeString(variable.unit),
      after: cstar.unit,
    });
    if (nextConfidence !== variable.confidence) {
      next = appendChange(next, {
        rule: "infer_gas_state_unit_from_cstar",
        field: "confidence",
        before: changeString(variable.confidence),
        after: nextConfidence,
      });
    }
    return next;
  });
  return changed;
}

function normalizePlaceholderUnits(result: ExtractionResult): boolean {
  let changed = false;
  result.state_variables = result.state_variables.map((variable) => {
    if (variable.unit !== "-") return variable;
    changed = true;
    return appendChange(
      { ...variable, unit: "unknown" },
      {
        rule: "normalize_placeholder_unit",
        field: "unit",
        before: "-",
        after: "unknown",
      },
    );
  });
  return changed;
}

function correctVariableRoles(result: ExtractionResult): boolean {
  let changed = false;
  result.state_variables = result.state_variables.map((variable) => {
    if (
      result.model_type === "gas_liquid" &&
      variable.role === "state" &&
      normalized(variable.symbol) === "x" &&
      !hasDerivativeEquationForSymbol(result, variable.symbol)
    ) {
      changed = true;
      return appendChange(
        { ...variable, role: "input" },
        {
          rule: "correct_role_gas_liquid_biomass",
          field: "role",
          before: changeString(variable.role),
          after: "input",
        },
      );
    }

    const role = roleBySymbol(variable.symbol, result.model_type);
    if (!role || variable.role === role) return variable;
    changed = true;
    return appendChange(
      { ...variable, role },
      {
        rule: "correct_role_by_symbol",
        field: "role",
        before: changeString(variable.role),
        after: role,
      },
    );
  });
  return changed;
}

function hasExplicitAssignmentEvidence(parameter: ExtractedParameter): boolean {
  if (
    isUnknownPlaceholder(parameter.symbol) ||
    isUnknownPlaceholder(parameter.value) ||
    parameter.status === "initial_condition"
  ) {
    return false;
  }
  const source = parameter.source_context;
  if (!hasUsefulSourceContext(source)) return false;
  const symbolPattern = escapeRegExp(parameter.symbol);
  return new RegExp(`\\b${symbolPattern}\\b\\s*=\\s*[-+]?\\d`, "i").test(source);
}

function promoteExplicitParameterEvidence(result: ExtractionResult): boolean {
  let changed = false;
  result.parameters = result.parameters.map((parameter) => {
    if (!hasExplicitAssignmentEvidence(parameter)) return parameter;
    const nextConfidence: typeof parameter.confidence =
      parameter.confidence === "low" ? "medium" : parameter.confidence;
    const nextStatus =
      parameter.status === "unknown" || parameter.status === "inferred" || parameter.status == null
        ? ("explicit" as const)
        : parameter.status;
    let next: ExtractedParameter = {
      ...parameter,
      confidence: nextConfidence,
      status: nextStatus,
    };
    if (nextConfidence !== parameter.confidence) {
      next = appendChange(next, {
        rule: "promote_explicit_parameter_evidence",
        field: "confidence",
        before: changeString(parameter.confidence),
        after: nextConfidence,
      });
      changed = true;
    }
    if (nextStatus !== parameter.status) {
      next = appendChange(next, {
        rule: "promote_explicit_parameter_evidence",
        field: "status",
        before: changeString(parameter.status),
        after: nextStatus,
      });
      changed = true;
    }
    return next;
  });
  return changed;
}

function refineModelCardControls(result: ExtractionResult): boolean {
  let changed = false;
  const before = result.model_card.control_variables;
  const controls = before.filter((symbol) => {
    const lower = normalized(symbol);
    if (lower !== "kla" && lower !== "cstar_o2") return true;
    const sourceText = [
      ...result.parameters
        .filter((parameter) => normalized(parameter.symbol) === lower)
        .map((parameter) => parameter.source_context),
      ...result.state_variables
        .filter((variable) => normalized(variable.symbol) === lower)
        .map((variable) => variable.source_context),
    ].join(" ");
    return /\b(control|controlled|manipulated|setpoint|set point)\b/i.test(sourceText);
  });

  if (
    result.model_type === "monod_chemostat" &&
    result.parameters.some((parameter) => normalized(parameter.symbol) === "d") &&
    !hasSymbol(controls, "D")
  ) {
    controls.push("D");
  }

  if (controls.length !== before.length || controls.some((value, index) => value !== before[index])) {
    result.model_card.control_variables = controls;
    changed = true;
  }
  return changed;
}

function maybeSetFallbackSummary(result: ExtractionResult): boolean {
  const summary = result.model_card.short_summary.trim();
  const weakSummary =
    !summary ||
    /\bunknown paper\b|\bunknown system\b|no complete dynamic ode system was identified/i.test(summary);
  if (!weakSummary) return false;

  if (result.model_type === "monod_chemostat") {
    result.model_card.short_summary =
      "Continuous Monod chemostat model with biomass X, substrate S, dilution rate D, and feed substrate Sin.";
    return true;
  }
  if (result.model_type === "gas_liquid") {
    result.model_card.short_summary =
      "Aerobic gas-liquid oxygen-transfer model with dissolved oxygen C_O2, kLa transfer, and biomass oxygen uptake qO2*X.";
    return true;
  }
  return false;
}

function hasBetterExplicitEvidence(result: ExtractionResult): boolean {
  return (
    result.state_variables.some(
      (variable) =>
        !isUnknownPlaceholder(variable.symbol) &&
        !isUnknownPlaceholder(variable.name) &&
        variable.confidence !== "low",
    ) ||
    result.equations.length > 0 ||
    result.parameters.some((parameter) => !isUnknownPlaceholder(parameter.symbol))
  );
}

function appendModelCardMissingInfo(result: ExtractionResult, message: string): void {
  const trimmed = message.trim();
  if (!trimmed) return;
  if (result.model_card.missing_information.some((item) => normalized(item) === normalized(trimmed))) {
    return;
  }
  result.model_card.missing_information.push(trimmed);
}

function removeMeaninglessUnknownRows(result: ExtractionResult): boolean {
  let changed = false;
  const hasBetterEvidence = hasBetterExplicitEvidence(result);
  result.state_variables = result.state_variables.filter((variable) => {
    const isMeaninglessUnknown =
      isUnknownPlaceholder(variable.symbol) &&
      isUnknownPlaceholder(variable.name) &&
      variable.confidence === "low" &&
      hasBetterEvidence;
    if (isMeaninglessUnknown) {
      changed = true;
      return false;
    }
    return true;
  });

  const namedParameterValueKeys = new Set(
    result.parameters
      .filter((parameter) => !isUnknownPlaceholder(parameter.symbol))
      .map(parameterValueKey)
      .filter((value): value is string => Boolean(value)),
  );
  result.parameters = result.parameters.filter((parameter) => {
    const key = parameterValueKey(parameter);
    const isDuplicateUnknown =
      isUnknownPlaceholder(parameter.symbol) &&
      parameter.confidence === "low" &&
      key != null &&
      namedParameterValueKeys.has(key);
    const isEmptyUnknown =
      isUnknownPlaceholder(parameter.symbol) &&
      isUnknownPlaceholder(parameter.name) &&
      parameter.confidence === "low" &&
      !hasUsefulSourceContext(parameter.source_context) &&
      hasBetterEvidence;
    const isMissingUnknown =
      isUnknownPlaceholder(parameter.symbol) &&
      parameter.status === "missing" &&
      hasUsefulSourceContext(parameter.source_context);
    if (isMissingUnknown) {
      appendModelCardMissingInfo(result, parameter.source_context || parameter.name);
    }
    if (isDuplicateUnknown || isEmptyUnknown || isMissingUnknown) {
      changed = true;
      return false;
    }
    return true;
  });
  return changed;
}

function removeStaleInitialConditionMissingInfo(result: ExtractionResult): boolean {
  const states = stateSymbols(result);
  if (states.size === 0) return false;
  const initialStates = new Set(
    (result.initial_conditions ?? []).map((initial) => normalized(initial.state_symbol)),
  );
  const allStatesHaveInitials = [...states].every((state) => initialStates.has(state));
  if (!allStatesHaveInitials) return false;

  const before = result.model_card.missing_information;
  const after = before.filter(
    (item) => !/\binitial conditions?\b/i.test(item),
  );
  if (after.length === before.length) return false;
  result.model_card.missing_information = after;
  return true;
}

function pruneUnknownModelCardReferences(result: ExtractionResult): boolean {
  let changed = false;
  const prune = (values: string[]): string[] => {
    const next = values.filter((value) => !isUnknownPlaceholder(value));
    if (next.length !== values.length) changed = true;
    return next;
  };

  result.model_card.inputs = prune(result.model_card.inputs);
  result.model_card.outputs = prune(result.model_card.outputs);
  result.model_card.control_variables = prune(result.model_card.control_variables);
  result.equations = result.equations.map((equation) => {
    const variables = prune(equation.variables_involved);
    if (variables.length === equation.variables_involved.length) return equation;
    return { ...equation, variables_involved: variables };
  });
  return changed;
}

export function finalizeExtractionResult(result: ExtractionResult): FinalizedExtractionResult {
  const next = cloneExtractionResult(result);
  const warnings: string[] = [];
  let changed = false;

  if (normalizeInitialConditionParameters(next)) changed = true;
  if (normalizeInitialConditions(next)) changed = true;
  if (attachInitialConditionsToStates(next)) changed = true;
  if (correctVariableRoles(next)) changed = true;
  if (promoteExplicitParameterEvidence(next)) changed = true;
  if (inferStateUnitsFromInitialConditions(next)) changed = true;
  if (inferGasStateUnitFromSaturationParameter(next)) changed = true;
  if (normalizePlaceholderUnits(next)) changed = true;
  if (refineModelCardControls(next)) changed = true;
  if (maybeSetFallbackSummary(next)) changed = true;
  if (removeMeaninglessUnknownRows(next)) {
    changed = true;
    warnings.push("Removed low-confidence placeholder unknown rows that duplicated explicit source-backed evidence.");
  }
  if (pruneUnknownModelCardReferences(next)) changed = true;
  if (removeStaleInitialConditionMissingInfo(next)) changed = true;

  // AUDIT-4: coerce any leftover `undefined` parameter status to "unknown" so
  // downstream consumers (DB writer, UI, ChemE Brain) never observe undefined.
  next.parameters = next.parameters.map((parameter) =>
    parameter.status == null ? { ...parameter, status: "unknown" as const } : parameter,
  );

  // AUDIT-5: surface a human-readable summary of every finalizer mutation so
  // the audit panel can show "X rule promoted Y from low to medium" without
  // the consumer having to walk every row.
  const ruleSymbolMap = new Map<string, Set<string>>();
  const recordRule = (rule: string, symbol: string) => {
    if (!ruleSymbolMap.has(rule)) ruleSymbolMap.set(rule, new Set());
    ruleSymbolMap.get(rule)!.add(symbol);
  };
  for (const variable of next.state_variables) {
    for (const change of variable.finalizer_changes ?? []) {
      recordRule(change.rule, variable.symbol);
    }
  }
  for (const parameter of next.parameters) {
    for (const change of parameter.finalizer_changes ?? []) {
      recordRule(change.rule, parameter.symbol);
    }
  }
  for (const [rule, symbols] of ruleSymbolMap) {
    const symbolList = [...symbols].sort().join(", ");
    warnings.push(`Finalizer rule '${rule}' applied to: ${symbolList}`);
  }

  const parsed = ExtractionResultSchema.parse(next);
  return { result: parsed, changed, warnings };
}
