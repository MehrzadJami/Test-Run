export type ParameterValueLike = {
  value?: unknown;
  valueRaw?: unknown;
  valueNumeric?: unknown;
};

const UNKNOWN_PARAMETER_VALUE_RE =
  /^(?:unknown|not\s+specified|not\s+reported|n\.?d\.?|n\/a|na|none|null|missing|uncertain|\u2014|-|\?)$/i;
const NUMBER_RE = /[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/;

function clean(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

export function isUnknownParameterValue(value: unknown): boolean {
  const text = clean(value);
  return text === "" || UNKNOWN_PARAMETER_VALUE_RE.test(text);
}

function parseLooseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = clean(value);
  if (isUnknownParameterValue(text)) return null;
  const direct = Number(text);
  if (Number.isFinite(direct)) return direct;
  const match = text.match(NUMBER_RE);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getParameterNumericValue(parameter: ParameterValueLike): number | null {
  if (typeof parameter.valueNumeric === "number") {
    return Number.isFinite(parameter.valueNumeric) ? parameter.valueNumeric : null;
  }

  if (parameter.valueNumeric === null) {
    const raw = clean(parameter.valueRaw);
    if (raw !== "") return null;
  }

  return parseLooseNumber(parameter.value);
}

export function getParameterDisplayValue(parameter: ParameterValueLike): string {
  const numeric = getParameterNumericValue(parameter);
  if (numeric !== null) return String(numeric);

  const raw = clean(parameter.valueRaw);
  if (raw !== "") return raw;

  const value = clean(parameter.value);
  if (value !== "" && !isUnknownParameterValue(value)) return value;

  return "unknown";
}

export function hasKnownParameterValue(parameter: ParameterValueLike): boolean {
  return getParameterNumericValue(parameter) !== null;
}
