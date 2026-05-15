export type PaperUnderstandingNormalizationResult = {
  value: unknown;
  applied: boolean;
  warnings: string[];
};

const NORMALIZATION_WARNING =
  "Groq response required schema normalization before validation.";

const confidenceValues = new Set(["high", "medium", "low"]);
const sourceKindValues = new Set([
  "abstract",
  "introduction",
  "methods",
  "materials_and_methods",
  "results",
  "discussion",
  "conclusions",
  "nomenclature",
  "supporting_information",
  "table",
  "figure",
  "references",
  "unknown",
]);
const roleValues = new Set(["state", "input", "output", "parameter", "control"]);
const equationTypeValues = new Set([
  "dynamic_ode",
  "algebraic_calculation",
  "stoichiometric_reaction",
  "empirical_correlation",
  "reported_experimental_result",
  "control_law",
  "unknown",
]);
const parameterStatusValues = new Set(["explicit", "inferred", "missing", "unknown"]);
const modelTypeValues = new Set([
  "monod_chemostat",
  "fed_batch",
  "batch_culture",
  "cstr",
  "pfr",
  "enzyme_kinetics",
  "gas_liquid",
  "microalgae_photobioreactor",
  "oxygen_balanced_mixotrophy",
  "unknown",
]);
const paperTypeValues = new Set(["experimental", "modeling", "review", "mixed", "unknown"]);
const assemblyStatusValues = new Set(["complete", "partial", "insufficient"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function mark(state: { applied: boolean; warnings: Set<string> }): void {
  state.applied = true;
  state.warnings.add(NORMALIZATION_WARNING);
}

function normalizeStringField(
  record: Record<string, unknown>,
  key: string,
  fallback: string,
  state: { applied: boolean; warnings: Set<string> },
): void {
  if (typeof record[key] !== "string") {
    record[key] = fallback;
    mark(state);
  }
}

function normalizeEnumField(
  record: Record<string, unknown>,
  key: string,
  allowed: Set<string>,
  fallback: string,
  state: { applied: boolean; warnings: Set<string> },
): void {
  if (typeof record[key] !== "string" || !allowed.has(record[key] as string)) {
    record[key] = fallback;
    mark(state);
  }
}

function stripUnknownFields(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  state: { applied: boolean; warnings: Set<string> },
): Record<string, unknown> {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      delete record[key];
      mark(state);
    }
  }
  return record;
}

function normalizeNullablePage(
  value: unknown,
  state: { applied: boolean; warnings: Set<string> },
): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }
  if (value !== null) mark(state);
  return null;
}

function sourceEvidencePage(record: Record<string, unknown>): number | null {
  const evidence = record["source_evidence"];
  if (!isRecord(evidence)) return null;
  const page = evidence["page"];
  return typeof page === "number" ? page : null;
}

function normalizeSourceEvidence(
  value: unknown,
  state: { applied: boolean; warnings: Set<string> },
): unknown {
  if (!isRecord(value)) {
    mark(state);
    return { page: null, section_heading: "", quote: "" };
  }
  const next = { ...value };
  next["page"] = normalizeNullablePage(next["page"], state);
  normalizeStringField(next, "section_heading", "", state);
  normalizeStringField(next, "quote", "", state);
  return next;
}

function withSourceContext(
  record: Record<string, unknown>,
  state: { applied: boolean; warnings: Set<string> },
  sourceText = "",
): Record<string, unknown> {
  const next = { ...record };
  if ("source_evidence" in next) {
    next["source_evidence"] = normalizeSourceEvidence(next["source_evidence"], state);
  }
  const evidencePage = sourceEvidencePage(next);
  if (!("page_start" in next)) {
    next["page_start"] = evidencePage;
    mark(state);
  } else {
    next["page_start"] = normalizeNullablePage(next["page_start"], state);
  }
  if (!("page_end" in next)) {
    next["page_end"] = evidencePage;
    mark(state);
  } else {
    next["page_end"] = normalizeNullablePage(next["page_end"], state);
  }
  if (!("section_heading" in next)) {
    next["section_heading"] =
      isRecord(next["source_evidence"]) && typeof next["source_evidence"]["section_heading"] === "string"
        ? next["source_evidence"]["section_heading"]
        : "";
    mark(state);
  } else if (typeof next["section_heading"] !== "string") {
    next["section_heading"] = "";
    mark(state);
  }
  if (!("source_kind" in next)) {
    next["source_kind"] = "unknown";
    mark(state);
  } else {
    normalizeEnumField(next, "source_kind", sourceKindValues, "unknown", state);
  }
  if (!("source_context" in next)) {
    next["source_context"] =
      isRecord(next["source_evidence"]) && typeof next["source_evidence"]["quote"] === "string"
        ? next["source_evidence"]["quote"]
        : sourceText;
    mark(state);
  } else if (typeof next["source_context"] !== "string") {
    next["source_context"] = sourceText;
    mark(state);
  }
  if (!("confidence" in next)) {
    next["confidence"] = "low";
    mark(state);
  } else {
    normalizeEnumField(next, "confidence", confidenceValues, "low", state);
  }
  return next;
}

function asArray(value: unknown, state: { applied: boolean; warnings: Set<string> }): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  mark(state);
  return [value];
}

function normalizeEvidenceItem(
  item: unknown,
  state: { applied: boolean; warnings: Set<string> },
): unknown {
  if (typeof item === "string") {
    mark(state);
    return withSourceContext(
      {
        item,
        details: item,
      },
      state,
      item,
    );
  }
  if (!isRecord(item)) return item;
  const text = stringValue(item["item"], stringValue(item["details"]));
  const next = withSourceContext(item, state, text);
  if (!("item" in next) || typeof next["item"] !== "string") {
    next["item"] = text || "unknown";
    mark(state);
  }
  if (!("details" in next) || typeof next["details"] !== "string") {
    next["details"] = text || stringValue(next["item"], "unknown");
    mark(state);
  }
  return stripUnknownFields(
    next,
    ["page_start", "page_end", "section_heading", "source_kind", "source_context", "confidence", "item", "details"],
    state,
  );
}

function normalizeVariable(
  item: unknown,
  role: "state" | "input" | "output" | "control",
  state: { applied: boolean; warnings: Set<string> },
): unknown {
  if (typeof item === "string") {
    mark(state);
    return withSourceContext(
      {
        symbol: item,
        name: item,
        meaning: item,
        unit: "",
        role,
      },
      state,
      item,
    );
  }
  if (!isRecord(item)) return item;
  const text = stringValue(item["name"], stringValue(item["symbol"], stringValue(item["meaning"])));
  const next = withSourceContext(item, state, text);
  for (const key of ["symbol", "name", "meaning", "unit"] as const) {
    if (!(key in next) || typeof next[key] !== "string") {
      next[key] = key === "unit" ? "" : text || "unknown";
      mark(state);
    }
  }
  normalizeEnumField(next, "role", roleValues, role, state);
  return stripUnknownFields(
    next,
    ["page_start", "page_end", "section_heading", "source_kind", "source_context", "confidence", "symbol", "name", "meaning", "unit", "role"],
    state,
  );
}

function normalizeParameter(
  item: unknown,
  state: { applied: boolean; warnings: Set<string> },
): unknown {
  if (typeof item === "string") {
    mark(state);
    return withSourceContext(
      {
        symbol: item,
        name: item,
        value: "unknown",
        value_raw: "unknown",
        value_numeric: null,
        unit: "",
        meaning: item,
        status: "unknown",
      },
      state,
      item,
    );
  }
  if (!isRecord(item)) return item;
  const text = stringValue(item["name"], stringValue(item["symbol"], stringValue(item["meaning"])));
  const next = withSourceContext(item, state, text);
  for (const key of ["symbol", "name", "unit"] as const) {
    if (!(key in next) || typeof next[key] !== "string") {
      next[key] = key === "unit" ? "" : text || "unknown";
      mark(state);
    }
  }
  if (!("value_raw" in next) && !("value" in next) && !("value_numeric" in next)) {
    next["value_raw"] = "unknown";
    next["value_numeric"] = null;
    next["status"] = "unknown";
    mark(state);
  }
  if (
    "value_numeric" in next &&
    next["value_numeric"] !== null &&
    typeof next["value_numeric"] !== "number"
  ) {
    next["value_numeric"] = null;
    mark(state);
  } else if (!("value_numeric" in next)) {
    next["value_numeric"] = null;
    mark(state);
  }
  if (!("value_raw" in next) || typeof next["value_raw"] !== "string") {
    next["value_raw"] =
      typeof next["value"] === "string" && next["value"].trim()
        ? next["value"]
        : next["value_numeric"] != null
          ? String(next["value_numeric"])
          : "unknown";
    mark(state);
  }
  if (!("meaning" in next) || typeof next["meaning"] !== "string") {
    next["meaning"] = text || stringValue(next["name"], "unknown");
    mark(state);
  }
  normalizeEnumField(next, "status", parameterStatusValues, "unknown", state);
  return stripUnknownFields(
    next,
    ["page_start", "page_end", "section_heading", "source_kind", "source_context", "confidence", "symbol", "name", "value", "value_raw", "value_numeric", "unit", "meaning", "status"],
    state,
  );
}

function inferStateSymbol(symbol: string): string {
  const trimmed = symbol.trim();
  const match = trimmed.match(/^([A-Za-z][A-Za-z0-9_]*?)(?:0|_0|initial)$/i);
  return match?.[1] || trimmed.replace(/0$/, "") || trimmed;
}

function normalizeInitialCondition(
  item: unknown,
  state: { applied: boolean; warnings: Set<string> },
): unknown {
  if (typeof item === "string") {
    mark(state);
    return withSourceContext(
      {
        symbol: item,
        state_symbol: inferStateSymbol(item),
        name: `Initial condition for ${inferStateSymbol(item)}`,
        value_raw: "unknown",
        value_numeric: null,
        unit: "",
        status: "unknown",
      },
      state,
      item,
    );
  }
  if (!isRecord(item)) return item;
  const text = stringValue(item["name"], stringValue(item["symbol"], stringValue(item["state_symbol"])));
  const next = withSourceContext(item, state, text);
  if (!("symbol" in next) || typeof next["symbol"] !== "string") {
    next["symbol"] = text || "unknown";
    mark(state);
  }
  if (!("state_symbol" in next) || typeof next["state_symbol"] !== "string") {
    next["state_symbol"] = inferStateSymbol(stringValue(next["symbol"], text || "unknown"));
    mark(state);
  }
  if (!("name" in next) || typeof next["name"] !== "string") {
    next["name"] = `Initial condition for ${stringValue(next["state_symbol"], "state")}`;
    mark(state);
  }
  if (!("value_raw" in next) || typeof next["value_raw"] !== "string") {
    next["value_raw"] =
      typeof next["value"] === "string" && next["value"].trim()
        ? next["value"]
        : next["value_numeric"] != null && typeof next["value_numeric"] === "number"
          ? String(next["value_numeric"])
          : "unknown";
    mark(state);
  }
  if (
    !("value_numeric" in next) ||
    (next["value_numeric"] !== null && typeof next["value_numeric"] !== "number")
  ) {
    next["value_numeric"] = null;
    mark(state);
  }
  normalizeStringField(next, "unit", "", state);
  normalizeEnumField(next, "status", parameterStatusValues, "explicit", state);
  return stripUnknownFields(
    next,
    [
      "page_start",
      "page_end",
      "section_heading",
      "source_kind",
      "source_context",
      "confidence",
      "symbol",
      "state_symbol",
      "name",
      "value_raw",
      "value_numeric",
      "unit",
      "status",
    ],
    state,
  );
}

function normalizeEquation(
  item: unknown,
  state: { applied: boolean; warnings: Set<string> },
): unknown {
  if (typeof item === "string") {
    mark(state);
    return withSourceContext(
      {
        label: "",
        equation_plaintext: item,
        equation_latex: item,
        equation_type: "unknown",
        meaning: item,
        variables_involved: [],
      },
      state,
      item,
    );
  }
  if (!isRecord(item)) return item;
  const text = stringValue(item["equation_plaintext"], stringValue(item["equation_latex"], stringValue(item["meaning"])));
  const next = withSourceContext(item, state, text);
  if (!("label" in next) || typeof next["label"] !== "string") {
    next["label"] = "";
    mark(state);
  }
  if (!("equation_plaintext" in next) || typeof next["equation_plaintext"] !== "string") {
    next["equation_plaintext"] = text || "unknown";
    mark(state);
  }
  if (!("equation_latex" in next) || typeof next["equation_latex"] !== "string") {
    next["equation_latex"] = stringValue(next["equation_plaintext"], "unknown");
    mark(state);
  }
  normalizeEnumField(next, "equation_type", equationTypeValues, "unknown", state);
  if (!("meaning" in next) || typeof next["meaning"] !== "string") {
    next["meaning"] = text || "unknown";
    mark(state);
  }
  if (!Array.isArray(next["variables_involved"])) {
    next["variables_involved"] = [];
    mark(state);
  } else if (next["variables_involved"].some((value) => typeof value !== "string")) {
    next["variables_involved"] = next["variables_involved"]
      .filter((value) => typeof value === "string");
    mark(state);
  }
  return stripUnknownFields(
    next,
    ["page_start", "page_end", "section_heading", "source_kind", "source_context", "confidence", "label", "equation_plaintext", "equation_latex", "equation_type", "meaning", "variables_involved"],
    state,
  );
}

function normalizeControlSetpoint(
  item: unknown,
  state: { applied: boolean; warnings: Set<string> },
): unknown {
  if (typeof item === "string") {
    mark(state);
    return withSourceContext(
      {
        variable: item,
        value: "unknown",
        unit: "",
        control_type: "unknown",
      },
      state,
      item,
    );
  }
  if (!isRecord(item)) return item;
  const text = stringValue(item["variable"], stringValue(item["control_type"]));
  const next = withSourceContext(item, state, text);
  for (const key of ["variable", "value", "unit", "control_type"] as const) {
    if (!(key in next) || typeof next[key] !== "string") {
      next[key] = key === "unit" ? "" : key === "value" ? "unknown" : text || "unknown";
      mark(state);
    }
  }
  return stripUnknownFields(
    next,
    ["page_start", "page_end", "section_heading", "source_kind", "source_context", "confidence", "variable", "value", "unit", "control_type"],
    state,
  );
}

function normalizeTableValueRow(
  item: unknown,
  state: { applied: boolean; warnings: Set<string> },
): unknown {
  if (typeof item === "string") {
    mark(state);
    return {
      symbol_or_item: item,
      value: "unknown",
      unit: "",
      meaning: item,
      confidence: "low",
      source_quote: item,
    };
  }
  if (!isRecord(item)) {
    mark(state);
    return {
      symbol_or_item: "unknown",
      value: "unknown",
      unit: "",
      meaning: "unknown",
      confidence: "low",
      source_quote: "",
    };
  }
  const next = { ...item };
  const text = stringValue(next["symbol_or_item"], stringValue(next["meaning"]));
  normalizeStringField(next, "symbol_or_item", text || "unknown", state);
  normalizeStringField(next, "value", "unknown", state);
  normalizeStringField(next, "unit", "", state);
  normalizeStringField(next, "meaning", text || stringValue(next["symbol_or_item"], "unknown"), state);
  normalizeEnumField(next, "confidence", confidenceValues, "low", state);
  normalizeStringField(next, "source_quote", "", state);
  return stripUnknownFields(
    next,
    ["symbol_or_item", "value", "unit", "meaning", "confidence", "source_quote"],
    state,
  );
}

function normalizeTableOrValueBlock(
  item: unknown,
  state: { applied: boolean; warnings: Set<string> },
): unknown {
  if (typeof item === "string") {
    mark(state);
    return {
      page: null,
      section_heading: "",
      caption_or_context: item,
      raw_text: item,
      extracted_rows: [],
      confidence: "low",
    };
  }
  if (!isRecord(item)) {
    mark(state);
    return {
      page: null,
      section_heading: "",
      caption_or_context: "unknown",
      raw_text: "",
      extracted_rows: [],
      confidence: "low",
    };
  }
  const next = { ...item };
  next["page"] = normalizeNullablePage(next["page"], state);
  normalizeStringField(next, "section_heading", "", state);
  normalizeStringField(next, "caption_or_context", stringValue(next["raw_text"], "unknown"), state);
  normalizeStringField(next, "raw_text", "", state);
  const rows = asArray(next["extracted_rows"], state);
  next["extracted_rows"] = rows.map((row) => normalizeTableValueRow(row, state));
  normalizeEnumField(next, "confidence", confidenceValues, "low", state);
  return stripUnknownFields(
    next,
    ["page", "section_heading", "caption_or_context", "raw_text", "extracted_rows", "confidence"],
    state,
  );
}

function normalizeTableReportedValue(
  item: unknown,
  state: { applied: boolean; warnings: Set<string> },
): unknown {
  if (typeof item === "string") {
    mark(state);
    return withSourceContext(
      {
        label: "",
        item,
        value: "unknown",
        unit: "",
      },
      state,
      item,
    );
  }
  if (!isRecord(item)) {
    mark(state);
    return withSourceContext(
      {
        label: "",
        item: "unknown",
        value: "unknown",
        unit: "",
      },
      state,
    );
  }
  const text = stringValue(item["item"], stringValue(item["label"]));
  const next = withSourceContext(item, state, text);
  normalizeStringField(next, "label", "", state);
  normalizeStringField(next, "item", text || "unknown", state);
  normalizeStringField(next, "value", "unknown", state);
  normalizeStringField(next, "unit", "", state);
  return stripUnknownFields(
    next,
    ["page_start", "page_end", "section_heading", "source_kind", "source_context", "confidence", "label", "item", "value", "unit"],
    state,
  );
}

function normalizeArrayField(
  root: Record<string, unknown>,
  key: string,
  state: { applied: boolean; warnings: Set<string> },
  normalizeItem: (item: unknown, state: { applied: boolean; warnings: Set<string> }) => unknown,
): void {
  if (!(key in root)) {
    root[key] = [];
    mark(state);
    return;
  }
  const input = asArray(root[key], state);
  root[key] = input.map((item) => normalizeItem(item, state));
}

export function normalizePaperUnderstandingCandidate(
  candidate: unknown,
): PaperUnderstandingNormalizationResult {
  const state = { applied: false, warnings: new Set<string>() };
  if (!isRecord(candidate)) {
    return { value: candidate, applied: false, warnings: [] };
  }
  const root = { ...candidate };

  normalizeStringField(root, "paper_title", "Unknown paper", state);
  normalizeEnumField(root, "paper_type", paperTypeValues, "unknown", state);
  normalizeEnumField(root, "model_type", modelTypeValues, "unknown", state);
  normalizeStringField(root, "main_system", "Unknown system", state);
  normalizeStringField(root, "organism_or_material", "", state);
  normalizeStringField(root, "process_type", "", state);
  normalizeStringField(root, "operating_mode", "", state);

  if ("equipment_setup" in root && !("reactor_or_equipment_setup" in root)) {
    root["reactor_or_equipment_setup"] = root["equipment_setup"];
    delete root["equipment_setup"];
    mark(state);
  } else if ("equipment_setup" in root) {
    delete root["equipment_setup"];
    mark(state);
  }

  normalizeArrayField(root, "candidate_state_variables", state, (item, s) =>
    normalizeVariable(item, "state", s),
  );
  normalizeArrayField(root, "candidate_inputs", state, (item, s) =>
    normalizeVariable(item, "input", s),
  );
  normalizeArrayField(root, "candidate_outputs", state, (item, s) =>
    normalizeVariable(item, "output", s),
  );
  normalizeArrayField(root, "candidate_controls", state, (item, s) =>
    normalizeVariable(item, "control", s),
  );
  normalizeArrayField(root, "candidate_parameters", state, normalizeParameter);
  normalizeArrayField(root, "initial_conditions", state, normalizeInitialCondition);
  normalizeArrayField(root, "candidate_equations", state, normalizeEquation);
  normalizeArrayField(root, "tables_or_reported_values", state, normalizeTableReportedValue);
  normalizeArrayField(root, "tables_or_value_blocks", state, normalizeTableOrValueBlock);
  normalizeArrayField(root, "controls_and_setpoints", state, normalizeControlSetpoint);

  for (const key of [
    "experimental_setup",
    "assumptions",
    "limitations_or_missing_info",
    "procedure_steps",
    "reactor_or_equipment_setup",
    "operating_timeline",
    "referenced_external_sources_needed",
  ]) {
    normalizeArrayField(root, key, state, normalizeEvidenceItem);
  }

  if (isRecord(root["model_assembly_assessment"])) {
    const assessment = { ...(root["model_assembly_assessment"] as Record<string, unknown>) };
    normalizeEnumField(
      assessment,
      "assembly_status",
      assemblyStatusValues,
      "insufficient",
      state,
    );
    if (typeof assessment["can_generate_runnable_model"] !== "boolean") {
      assessment["can_generate_runnable_model"] = false;
      mark(state);
    }
    if (typeof assessment["can_generate_scaffold"] !== "boolean") {
      assessment["can_generate_scaffold"] = false;
      mark(state);
    }
    for (const key of ["available_from_current_source", "missing_requirements"]) {
      const input = asArray(assessment[key], state);
      assessment[key] = input.map((item) => normalizeEvidenceItem(item, state));
    }
    if (!Array.isArray(assessment["recommended_next_actions"])) {
      assessment["recommended_next_actions"] =
        assessment["recommended_next_actions"] == null
          ? []
          : [String(assessment["recommended_next_actions"])];
      mark(state);
    }
    root["model_assembly_assessment"] = stripUnknownFields(
      assessment,
      [
        "assembly_status",
        "can_generate_runnable_model",
        "can_generate_scaffold",
        "available_from_current_source",
        "missing_requirements",
        "recommended_next_actions",
      ],
      state,
    );
  } else {
    root["model_assembly_assessment"] = {
      assembly_status: "insufficient",
      can_generate_runnable_model: false,
      can_generate_scaffold: false,
      available_from_current_source: [],
      missing_requirements: [],
      recommended_next_actions: [],
    };
    mark(state);
  }

  return {
    value: stripUnknownFields(
      root,
      [
        "paper_title",
        "paper_type",
        "model_type",
        "main_system",
        "organism_or_material",
        "process_type",
        "operating_mode",
        "reactor_or_equipment_setup",
        "procedure_steps",
        "operating_timeline",
        "experimental_setup",
        "candidate_state_variables",
        "candidate_inputs",
        "candidate_outputs",
        "candidate_controls",
        "candidate_parameters",
        "initial_conditions",
        "candidate_equations",
        "tables_or_reported_values",
        "tables_or_value_blocks",
        "controls_and_setpoints",
        "assumptions",
        "limitations_or_missing_info",
        "referenced_external_sources_needed",
        "model_assembly_assessment",
      ],
      state,
    ),
    applied: state.applied,
    warnings: Array.from(state.warnings),
  };
}

export { NORMALIZATION_WARNING as PAPER_UNDERSTANDING_NORMALIZATION_WARNING };
