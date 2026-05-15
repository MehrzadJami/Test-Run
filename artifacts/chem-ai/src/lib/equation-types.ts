export type EquationType =
  | "dynamic_ode"
  | "algebraic_calculation"
  | "stoichiometric_reaction"
  | "empirical_correlation"
  | "reported_experimental_result"
  | "control_law"
  | "unknown";

type EquationLike = {
  equationType?: unknown;
  equation_type?: unknown;
  latex?: unknown;
  plaintext?: unknown;
  description?: unknown;
  equation_latex?: unknown;
  equation_plaintext?: unknown;
};

const EQUATION_TYPES: ReadonlySet<string> = new Set([
  "dynamic_ode",
  "algebraic_calculation",
  "stoichiometric_reaction",
  "empirical_correlation",
  "reported_experimental_result",
  "control_law",
  "unknown",
]);

const DERIVATIVE_RE =
  /(?:^|[^A-Za-z])d[A-Za-z][A-Za-z0-9_]*\s*\/\s*dt\s*=|\\frac\s*\{\s*d[A-Za-z][A-Za-z0-9_]*\s*\}\s*\{\s*dt\s*\}/;

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

export function normalizeEquationType(value: unknown): EquationType {
  const raw = text(value).trim();
  return EQUATION_TYPES.has(raw) ? (raw as EquationType) : "unknown";
}

export function equationText(equation: EquationLike): string {
  return [
    equation.latex,
    equation.plaintext,
    equation.description,
    equation.equation_latex,
    equation.equation_plaintext,
  ]
    .map(text)
    .join(" ");
}

export function isExplicitlyNonDynamicEquation(equation: EquationLike): boolean {
  const explicit = equation.equationType ?? equation.equation_type;
  if (explicit == null || explicit === "") return false;
  const type = normalizeEquationType(explicit);
  return type !== "unknown" && type !== "dynamic_ode";
}

export function isDynamicEquation(equation: EquationLike): boolean {
  const explicit = equation.equationType ?? equation.equation_type;
  const type = normalizeEquationType(explicit);
  if (type === "dynamic_ode") return true;
  if (type !== "unknown") return false;
  return DERIVATIVE_RE.test(equationText(equation));
}
