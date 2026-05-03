import type { ExtractionProvider, ProviderName } from "../extractor";
import type {
  ExtractionResult,
  ExtractedAssumption,
  ExtractedEquation,
  ExtractedLimitation,
  ExtractedParameter,
  ExtractedStateVariable,
} from "../extraction-schema";

const TITLE_MAX = 90;
const MAX_EQUATIONS = 12;
const MAX_PARAMETERS = 24;
const MAX_SENTENCE_ITEMS = 8;
const SYMBOL_PATTERN = "[A-Za-z][A-Za-z0-9_]*";

const COMMON_TOKENS = new Set([
  "and",
  "or",
  "for",
  "the",
  "where",
  "with",
  "from",
  "rate",
  "constant",
  "assume",
  "assumed",
  "negligible",
  "well",
  "mixed",
  "not",
  "reported",
  "specified",
  "unknown",
  "uncertain",
  "exp",
  "log",
  "ln",
  "sin",
  "cos",
  "dt",
  "h",
  "hr",
  "s",
  "min",
  "l",
  "g",
  "mg",
  "mol",
]);

function isCommonToken(token: string): boolean {
  const lower = token.toLowerCase();
  if (lower === "dt") return true;
  if (!COMMON_TOKENS.has(lower)) return false;

  // Keep domain symbols that intentionally use capitalization, e.g. S, Sin.
  return token === token.toLowerCase();
}

const PARAMETER_NAMES: Record<string, string> = {
  d: "Dilution rate",
  ks: "Half-saturation constant",
  mumax: "Maximum specific growth rate",
  yxs: "Biomass yield coefficient",
  kla: "Volumetric mass transfer coefficient",
  cstar: "Saturation concentration",
  cstar_o2: "Saturation dissolved oxygen concentration",
  qo2: "Specific oxygen uptake rate",
  ko: "Oxygen half-saturation constant",
  sin: "Feed substrate concentration",
  k: "Rate constant",
};

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeSymbols(text: string): string {
  return text
    .replace(/[μµ]/g, "mu")
    .replace(/\bmu\s*max\b/gi, "mumax")
    .replace(/\bmu_max\b/gi, "mumax")
    .replace(/\bC\s*\*/g, "Cstar")
    .replace(/\bCstar\b/gi, "Cstar")
    .replace(/[−–—]/g, "-");
}

function deriveTitle(sourceText: string): string {
  const firstLine = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "Rule-based extraction";
  return firstLine.length > TITLE_MAX
    ? `${firstLine.slice(0, TITLE_MAX - 3)}...`
    : firstLine;
}

function cleanLine(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

function inferSystemType(normalizedLower: string): string {
  const explicitChemostat =
    /\bchemostat\b/.test(normalizedLower) ||
    /\bdilution\s+rate\b/.test(normalizedLower);
  const monod = /\bmonod\b|\bmumax\b|\bks\b/.test(normalizedLower);
  const gasTransfer =
    /\bkla\b|\bo2\b|\bco2\b|\bhenry\b|\bgas[-\s]?liquid\b|\boxygen\b/.test(
      normalizedLower,
    );

  if (explicitChemostat || (monod && !gasTransfer)) {
    return "Chemostat / Monod growth model";
  }
  if (gasTransfer) {
    return "Gas-liquid bioreactor / transfer model";
  }
  if (monod) {
    return "Chemostat / Monod growth model";
  }
  return "Generic ODE model";
}

function meaningForEquation(line: string): string {
  const normalized = normalizeSymbols(line).toLowerCase();
  if (/d\s*[a-z][a-z0-9_]*\s*\/\s*d\s*t/.test(normalized)) {
    return "Ordinary differential equation detected from the source text.";
  }
  if (/\bmonod\b|\bmumax\b|\bks\b/.test(normalized)) {
    return "Monod-style growth relation detected from the source text.";
  }
  if (/\bkla\b|\bcstar\b|\bo2\b|\bco2\b|\bhenry\b/.test(normalized)) {
    return "Gas-transfer relation detected from the source text.";
  }
  return "Explicit equation or assignment detected from the source text.";
}

function normalizeEquationExpression(expression: string): string {
  return normalizeSymbols(expression)
    .replace(/\s+/g, " ")
    .replace(/\s*=\s*/, " = ")
    .trim()
    .replace(/[.;,]+$/g, "");
}

function isNumericAssignment(expression: string): boolean {
  const rhs = expression.split("=").slice(1).join("=").trim();
  return /^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?(?:\s|$)/.test(rhs);
}

function sourceContextForMatch(sourceText: string, start: number, end: number): string {
  const before = sourceText.slice(0, start);
  const sentenceStart = Math.max(
    before.lastIndexOf("."),
    before.lastIndexOf("!"),
    before.lastIndexOf("?"),
    before.lastIndexOf("\n"),
  );
  const after = sourceText.slice(end);
  const nextStops = [".", "!", "?", "\n"]
    .map((stop) => after.indexOf(stop))
    .filter((idx) => idx >= 0);
  const sentenceEnd =
    nextStops.length > 0 ? end + Math.min(...nextStops) + 1 : sourceText.length;
  return cleanLine(sourceText.slice(sentenceStart + 1, sentenceEnd));
}

function extractEquationSymbols(expression: string): string[] {
  const normalized = normalizeSymbols(expression);
  const tokens = normalized.match(/\b[A-Za-z][A-Za-z0-9_]*\b/g) ?? [];
  const symbols = new Set<string>();
  const derivativeRe = new RegExp(`d\\s*(${SYMBOL_PATTERN})\\s*\\/\\s*d\\s*t`, "gi");
  let derivativeMatch: RegExpExecArray | null;
  while ((derivativeMatch = derivativeRe.exec(normalized)) !== null) {
    const symbol = derivativeMatch[1];
    if (symbol) symbols.add(symbol);
  }

  for (const token of tokens) {
    if (isCommonToken(token)) continue;
    if (/^d[A-Z][A-Za-z0-9_]*$/.test(token)) continue;
    symbols.add(token);
  }
  return [...symbols];
}

function extractEquations(sourceText: string, normalizedLower: string): ExtractedEquation[] {
  const equations: ExtractedEquation[] = [];
  const seen = new Set<string>();
  const normalizedSource = normalizeSymbols(sourceText);
  const lhsPattern = `(?:d\\s*${SYMBOL_PATTERN}\\s*\\/\\s*d\\s*t|${SYMBOL_PATTERN})`;
  const equationRe = new RegExp(
    `(^|[^A-Za-z0-9_/])(${lhsPattern}\\s*=\\s*[^.;,\\n]+)`,
    "g",
  );

  let match: RegExpExecArray | null;
  while ((match = equationRe.exec(normalizedSource)) !== null) {
    const expression = normalizeEquationExpression(match[2] ?? "");
    if (!expression.includes("=") || isNumericAssignment(expression)) continue;
    const key = expression.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const expressionStart = match.index + (match[1]?.length ?? 0);
    const expressionEnd = expressionStart + (match[2]?.length ?? 0);
    const sourceContext = sourceContextForMatch(
      normalizedSource,
      expressionStart,
      expressionEnd,
    );
    equations.push({
      label: `(${equations.length + 1})`,
      equation_latex: expression,
      equation_plaintext: expression,
      meaning: meaningForEquation(expression),
      variables_involved: extractEquationSymbols(expression),
      source_context: sourceContext,
      confidence: "high",
    });
    if (equations.length >= MAX_EQUATIONS) break;
  }

  const hasMonodEquation = equations.some((eq) =>
    /\bmumax\b.*\bks\b|\bks\b.*\bmumax\b/i.test(eq.equation_plaintext),
  );
  if (
    !hasMonodEquation &&
    /\bmonod\b/.test(normalizedLower) &&
    /\bmumax\b/.test(normalizedLower) &&
    /\bks\b/.test(normalizedLower)
  ) {
    const plaintext = "mu = mumax * S / (Ks + S)";
    equations.push({
      label: `(${equations.length + 1})`,
      equation_latex: plaintext,
      equation_plaintext: plaintext,
      meaning: "Canonical Monod growth relation inferred from explicit Monod, mumax, and Ks mentions.",
      variables_involved: ["mu", "mumax", "S", "Ks"],
      source_context: "Monod, mumax, and Ks were mentioned in the source text.",
      confidence: "medium",
    });
  }

  return equations;
}

function cleanUnit(rawUnit: string): string {
  const token = rawUnit.trim().match(/^([A-Za-z0-9/%^()._\-]+)/)?.[1];
  if (!token) return "-";
  const cleaned = token.replace(/[.,;:]+$/g, "");
  if (!cleaned) return "-";
  const lower = cleaned.toLowerCase();
  if (["and", "where", "with", "is", "was", "maximum", "minimum"].includes(lower)) {
    return "-";
  }
  return cleaned;
}

function cleanParameterSymbol(symbol: string): string {
  return normalizeSymbols(symbol).replace(/\*$/, "star");
}

function parameterName(symbol: string): string {
  return PARAMETER_NAMES[symbol.toLowerCase()] ?? symbol;
}

function extractParameters(sourceText: string): ExtractedParameter[] {
  const parameters: ExtractedParameter[] = [];
  const seen = new Set<string>();
  const normalized = normalizeSymbols(sourceText);
  const assignmentRe = new RegExp(
    `(^|[^A-Za-z0-9_/])(${SYMBOL_PATTERN}(?:\\*)?)\\s*=\\s*` +
      `(-?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)\\s*` +
      `([A-Za-z0-9/%^()._\\-]*)`,
    "g",
  );

  let match: RegExpExecArray | null;
  while ((match = assignmentRe.exec(normalized)) !== null) {
    const symbol = cleanParameterSymbol(match[2] ?? "");
    const lower = symbol.toLowerCase();
    if (!symbol || isCommonToken(symbol) || seen.has(lower)) continue;
    const value = match[3] ?? "";
    const expressionStart = match.index + (match[1]?.length ?? 0);
    const expressionEnd = assignmentRe.lastIndex;
    seen.add(lower);
    parameters.push({
      symbol,
      name: parameterName(symbol),
      value,
      unit: cleanUnit(match[4] ?? ""),
      source_context: sourceContextForMatch(normalized, expressionStart, expressionEnd),
      confidence: "high",
    });
    if (parameters.length >= MAX_PARAMETERS) return parameters;
  }

  return parameters;
}

function extractDerivativeStates(equations: ExtractedEquation[]): Map<string, string> {
  const states = new Map<string, string>();
  const derivativeRe = /d\s*([A-Za-z][A-Za-z0-9_]*)\s*\/\s*d\s*t/gi;
  for (const eq of equations) {
    derivativeRe.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = derivativeRe.exec(eq.equation_plaintext)) !== null) {
      const symbol = match[1] ?? "";
      if (symbol) states.set(symbol, eq.source_context);
    }
  }
  return states;
}

function variableName(symbol: string): string {
  const lower = symbol.toLowerCase();
  if (lower === "x") return "Biomass concentration";
  if (lower === "s") return "Substrate concentration";
  if (lower === "c" || lower === "cl") return "Concentration";
  if (lower === "c_o2") return "Dissolved oxygen concentration";
  if (lower === "cstar_o2") return "Saturation dissolved oxygen concentration";
  if (lower === "mu") return "Specific growth rate";
  if (lower === "otr") return "Oxygen transfer rate";
  if (lower === "our") return "Oxygen uptake rate";
  if (lower === "o2") return "Oxygen";
  if (lower === "co2") return "Carbon dioxide";
  return symbol;
}

function variableMeaning(symbol: string): string {
  const lower = symbol.toLowerCase();
  if (lower === "x") return "Biomass concentration in the reactor.";
  if (lower === "s") return "Substrate concentration in the reactor.";
  if (lower === "c_o2") return "Dissolved oxygen concentration in the liquid phase.";
  if (lower === "c") return "Concentration state variable.";
  if (lower === "mu") return "Specific growth rate from the growth-rate relation.";
  return `Variable inferred from rule-based equation parsing: ${symbol}.`;
}

function roleForVariable(symbol: string, stateSymbols: Set<string>): ExtractedStateVariable["role"] {
  if (stateSymbols.has(symbol)) return "state";
  const lower = symbol.toLowerCase();
  if (["mu", "otr", "our"].includes(lower)) return "output";
  return "input";
}

function extractVariables(
  equations: ExtractedEquation[],
  parameters: ExtractedParameter[],
): ExtractedStateVariable[] {
  const statesByContext = extractDerivativeStates(equations);
  const stateSymbols = new Set(statesByContext.keys());
  const parameterSymbols = new Set(parameters.map((p) => p.symbol.toLowerCase()));
  const candidates = new Map<string, string>();

  for (const [symbol, context] of statesByContext) {
    candidates.set(symbol, context);
  }

  for (const eq of equations) {
    for (const symbol of eq.variables_involved) {
      const lower = symbol.toLowerCase();
      if (parameterSymbols.has(lower) || isCommonToken(symbol)) continue;
      if (/^d[A-Z]/.test(symbol)) continue;
      if (!candidates.has(symbol)) candidates.set(symbol, eq.source_context);
    }
  }

  return [...candidates.entries()].map(([symbol, context]) => ({
    symbol,
    name: variableName(symbol),
    meaning: variableMeaning(symbol),
    unit: "-",
    role: roleForVariable(symbol, stateSymbols),
    source_context: context,
    confidence: "medium",
  }));
}

function splitSentences(sourceText: string): string[] {
  return (
    sourceText
      .replace(/\s+/g, " ")
      .match(/[^.!?]+[.!?]?/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? []
  );
}

function uniqueByText<T extends { source_context: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.source_context.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function extractAssumptions(sourceText: string): ExtractedAssumption[] {
  const items = splitSentences(sourceText)
    .filter((sentence) =>
      /\bassume\b|\bassumed\b|\bnegligible\b|\bconstant\b|\bwell[-\s]?mixed\b/i.test(
        sentence,
      ),
    )
    .map((sentence) => ({
      assumption: sentence,
      source_context: sentence,
      confidence: "low" as const,
    }));
  return uniqueByText(items).slice(0, MAX_SENTENCE_ITEMS);
}

function extractLimitations(sourceText: string): ExtractedLimitation[] {
  const items = splitSentences(sourceText)
    .filter((sentence) =>
      /\bmissing\b|\bnot reported\b|\bnot specified\b|\bunknown\b|\buncertain\b/i.test(
        sentence,
      ),
    )
    .map((sentence) => ({
      limitation: sentence,
      source_context: sentence,
      confidence: "low" as const,
    }));
  return uniqueByText(items).slice(0, MAX_SENTENCE_ITEMS);
}

function buildMissingInformation(
  equations: ExtractedEquation[],
  parameters: ExtractedParameter[],
  variables: ExtractedStateVariable[],
  normalizedLower: string,
): string[] {
  const missing: string[] = [];
  if (equations.length === 0) missing.push("No explicit equations detected.");
  if (parameters.length === 0) missing.push("No explicit numeric parameter assignments detected.");
  if (variables.length === 0) missing.push("No model variables inferred from equations.");
  const hasStateOde = variables.some((variable) => variable.role === "state");
  if (
    hasStateOde &&
    !/\binitial\b|\binitial\s+conditions?\b|\bat\s+t\s*=\s*0\b|\b[a-z][a-z0-9_]*0\b/i.test(
      normalizedLower,
    )
  ) {
    missing.push("Initial conditions for state variables were not specified.");
  }
  if (
    /\bkla\b|\bo2\b|\bhenry\b|\bgas[-\s]?liquid\b|\boxygen\b/.test(normalizedLower) &&
    (/\bhenry[-\s]?law\b.*\bnot specified\b/.test(normalizedLower) ||
      !/\bhenry[-\s]?law\b/.test(normalizedLower))
  ) {
    missing.push("Henry-law convention was not specified.");
  }
  return missing;
}

function canGenerateOdeTemplate(equations: ExtractedEquation[]): boolean {
  return equations.some((eq) => /d\s*[A-Za-z][A-Za-z0-9_]*\s*\/\s*d\s*t/i.test(eq.equation_plaintext));
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function inputSymbols(
  variables: ExtractedStateVariable[],
  parameters: ExtractedParameter[],
): string[] {
  return uniqueStrings([
    ...variables
      .filter((variable) => variable.role === "input")
      .map((variable) => variable.symbol),
    ...parameters
      .filter((parameter) =>
        parameter.symbol.toLowerCase() === "sin" ||
        parameter.symbol.toLowerCase().startsWith("cstar"),
      )
      .map((parameter) => parameter.symbol),
  ]);
}

function outputSymbols(variables: ExtractedStateVariable[]): string[] {
  return uniqueStrings(
    variables
      .filter((variable) => variable.role === "state" || variable.role === "output")
      .map((variable) => variable.symbol),
  );
}

function controlVariableSymbols(parameters: ExtractedParameter[]): string[] {
  return uniqueStrings(
    parameters
      .filter((parameter) => ["d", "kla"].includes(parameter.symbol.toLowerCase()))
      .map((parameter) => parameter.symbol),
  );
}

function fallbackResult(sourceText: string): ExtractionResult {
  const title = deriveTitle(sourceText);
  return {
    paper_title_or_topic: title,
    system_type: "Generic ODE model",
    process_description:
      "Rule-based extraction completed with no reliable structured model patterns detected.",
    state_variables: [],
    parameters: [],
    equations: [],
    assumptions: [],
    limitations: [
      {
        limitation: "Rule-based extraction found limited explicit model information.",
        source_context: title,
        confidence: "low",
      },
    ],
    model_card: {
      short_summary: `Rule-based extraction for "${title}" found limited explicit model data.`,
      model_type: "Generic ODE",
      inputs: [],
      outputs: [],
      control_variables: [],
      missing_information: [
        "No explicit equations detected.",
        "No explicit numeric parameter assignments detected.",
        "No model variables inferred from equations.",
      ],
      can_generate_ode_template: false,
    },
  };
}

export class RuleBasedProvider implements ExtractionProvider {
  readonly name: ProviderName = "rule_based";

  async extract(sourceText: string): Promise<ExtractionResult> {
    try {
      const safeSource = safeText(sourceText);
      const title = deriveTitle(safeSource);
      const normalizedLower = normalizeSymbols(safeSource).toLowerCase();
      const systemType = inferSystemType(normalizedLower);
      const equations = extractEquations(safeSource, normalizedLower);
      const parameters = extractParameters(safeSource);
      const variables = extractVariables(equations, parameters);
      const assumptions = extractAssumptions(safeSource);
      const limitations = extractLimitations(safeSource);
      const missingInformation = buildMissingInformation(
        equations,
        parameters,
        variables,
        normalizedLower,
      );

      if (limitations.length === 0 && missingInformation.length > 0) {
        limitations.push({
          limitation: missingInformation.join(" "),
          source_context: title,
          confidence: "low",
        });
      }

      return {
        paper_title_or_topic: title,
        system_type: systemType,
        process_description:
          "Offline rule-based extraction from explicit equations, numeric assignments, and keyword-matched assumptions or limitations in the source text.",
        state_variables: variables,
        parameters,
        equations,
        assumptions,
        limitations,
        model_card: {
          short_summary: `Rule-based extraction for "${title}" (${systemType}).`,
          model_type: systemType,
          inputs: inputSymbols(variables, parameters),
          outputs: outputSymbols(variables),
          control_variables: controlVariableSymbols(parameters),
          missing_information: missingInformation,
          can_generate_ode_template: canGenerateOdeTemplate(equations),
        },
      };
    } catch {
      return fallbackResult(sourceText);
    }
  }
}
