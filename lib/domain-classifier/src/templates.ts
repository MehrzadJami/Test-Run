/**
 * Domain templates for M19.
 *
 * Each template defines what a well-formed extraction of that model type
 * should contain: expected variables and parameters (with canonical units),
 * a domain-specific checklist, ODE template hints, and unit rules.
 *
 * These are GUIDELINES, not hard constraints. The frontend displays them as
 * transparency aids; they are never used to reject or alter an extraction.
 */

import type { DomainTemplate, ModelType } from "./types";

// ── Chemostat / Continuous Stirred Tank Bioreactor ───────────────────────────

const CHEMOSTAT: DomainTemplate = {
  modelType: "chemostat",
  displayName: "Chemostat / CSTBR",
  description:
    "Continuous-culture bioreactor where a liquid medium is continuously fed and removed at equal volumetric rates, maintaining a constant culture volume. At steady state, growth rate equals the dilution rate D.",
  expectedVariables: [
    {
      symbol: "X",
      name: "Biomass concentration",
      unit: "g/L",
      required: true,
      description: "Concentration of microorganisms in the culture vessel.",
      aliases: ["X", "Cx", "biomass"],
    },
    {
      symbol: "S",
      name: "Substrate concentration",
      unit: "g/L",
      required: true,
      description: "Limiting nutrient substrate concentration in the vessel.",
      aliases: ["S", "Cs", "substrate", "glucose"],
    },
    {
      symbol: "t",
      name: "Time",
      unit: "h",
      required: true,
      aliases: ["t", "time"],
    },
  ],
  expectedParameters: [
    {
      symbol: "D",
      name: "Dilution rate",
      unit: "1/h",
      required: true,
      description: "Volumetric flow rate divided by culture volume (D = F/V).",
      aliases: ["D", "dilution_rate", "D_value"],
    },
    {
      symbol: "Sin",
      name: "Feed substrate concentration",
      unit: "g/L",
      required: true,
      description: "Substrate concentration in the feed medium.",
      aliases: ["Sin", "S_in", "Sf", "s_feed"],
    },
    {
      symbol: "μmax",
      name: "Maximum specific growth rate",
      unit: "1/h",
      required: true,
      aliases: ["μmax", "mu_max", "umax", "mumax"],
    },
    {
      symbol: "Ks",
      name: "Monod half-saturation constant",
      unit: "g/L",
      required: true,
      aliases: ["Ks", "K_s", "Km"],
    },
    {
      symbol: "Yxs",
      name: "Biomass yield on substrate",
      unit: "g/g",
      required: true,
      aliases: ["Yxs", "Y_xs", "Y", "yield"],
    },
  ],
  checklistItems: [
    {
      id: "chem-d-unit",
      category: "unit",
      description: "Dilution rate D has unit 1/h (or 1/s, 1/d).",
      symbol: "D",
      expectedUnit: "1/h",
      severity: "critical",
    },
    {
      id: "chem-sin",
      category: "parameter",
      description: "Feed substrate concentration Sin is explicitly reported.",
      symbol: "Sin",
      severity: "critical",
    },
    {
      id: "chem-yield",
      category: "parameter",
      description: "Biomass yield coefficient Yxs (g biomass / g substrate) is provided.",
      symbol: "Yxs",
      severity: "critical",
    },
    {
      id: "chem-initial",
      category: "variable",
      description: "Initial conditions X(0) and S(0) are stated for dynamic simulation.",
      severity: "warning",
    },
    {
      id: "chem-ode",
      category: "equation",
      description: "Mass balance ODEs for X and S are explicitly stated (not just steady-state expressions).",
      severity: "warning",
    },
    {
      id: "chem-mass-balance",
      category: "equation",
      description: "Steady-state mass balance closes: D·Sin ≈ D·S + (1/Yxs)·μ·X.",
      severity: "info",
    },
    {
      id: "chem-time-unit",
      category: "unit",
      description: "Time unit is specified consistently (h, d, or s) across all rate parameters.",
      severity: "warning",
    },
  ],
  odeHints: [
    {
      description: "Biomass ODE (Monod kinetics)",
      example: "dX/dt = (μ - D) · X",
    },
    {
      description: "Substrate ODE",
      example: "dS/dt = D · (Sin - S) - (1/Yxs) · μ · X",
    },
    {
      description: "Monod growth rate",
      example: "μ = μmax · S / (Ks + S)",
    },
    {
      description: "Steady-state condition (dX/dt = 0 → μ* = D)",
      example: "X* = Yxs · (Sin - S*),  S* = Ks · D / (μmax - D)",
    },
  ],
  unitRules: [
    { symbol: "D", expectedUnit: "1/h", alternatives: ["h⁻¹", "1/d", "d⁻¹", "1/s"] },
    { symbol: "Sin", expectedUnit: "g/L", alternatives: ["g·L⁻¹", "kg/m³"] },
    { symbol: "X", expectedUnit: "g/L", alternatives: ["g·L⁻¹", "g/dL"] },
    { symbol: "S", expectedUnit: "g/L", alternatives: ["g·L⁻¹", "mg/L"] },
    { symbol: "μmax", expectedUnit: "1/h", alternatives: ["h⁻¹"] },
    { symbol: "Ks", expectedUnit: "g/L", alternatives: ["mg/L", "g·L⁻¹"] },
    { symbol: "Yxs", expectedUnit: "g/g", alternatives: ["g·g⁻¹", "dimensionless"] },
  ],
};

// ── Batch Reactor ────────────────────────────────────────────────────────────

const BATCH_REACTOR: DomainTemplate = {
  modelType: "batch_reactor",
  displayName: "Batch Reactor",
  description:
    "Closed system with no continuous inflow or outflow. All substrates and inoculum are added at t=0; the reaction proceeds until substrate depletion or a set endpoint.",
  expectedVariables: [
    { symbol: "X", name: "Biomass concentration", unit: "g/L", required: true, aliases: ["X", "Cx"] },
    { symbol: "S", name: "Substrate concentration", unit: "g/L", required: true, aliases: ["S", "Cs"] },
    { symbol: "t", name: "Time", unit: "h", required: true },
  ],
  expectedParameters: [
    { symbol: "X0", name: "Initial biomass", unit: "g/L", required: true, aliases: ["X0", "X(0)", "X_0"] },
    { symbol: "S0", name: "Initial substrate", unit: "g/L", required: true, aliases: ["S0", "S(0)", "S_0"] },
    { symbol: "μmax", name: "Maximum specific growth rate", unit: "1/h", required: true, aliases: ["μmax", "mu_max"] },
    { symbol: "Ks", name: "Half-saturation constant", unit: "g/L", required: true, aliases: ["Ks", "K_s"] },
    { symbol: "Yxs", name: "Yield coefficient", unit: "g/g", required: true, aliases: ["Yxs", "Y"] },
  ],
  checklistItems: [
    {
      id: "batch-no-dilution",
      category: "parameter",
      description: "No dilution rate D or feed flow F appears (closed system).",
      severity: "critical",
    },
    {
      id: "batch-initial",
      category: "variable",
      description: "Initial conditions X(0) and S(0) are numerically specified.",
      severity: "critical",
    },
    {
      id: "batch-time",
      category: "parameter",
      description: "Batch duration or time horizon is stated.",
      severity: "warning",
    },
    {
      id: "batch-yield",
      category: "parameter",
      description: "Yield coefficient Yxs is provided.",
      severity: "critical",
    },
    {
      id: "batch-units",
      category: "unit",
      description: "Consistent units for concentration (g/L) and time (h or d).",
      severity: "warning",
    },
  ],
  odeHints: [
    { description: "Biomass ODE", example: "dX/dt = μ · X" },
    { description: "Substrate ODE", example: "dS/dt = -(1/Yxs) · μ · X" },
    { description: "Monod growth rate", example: "μ = μmax · S / (Ks + S)" },
    { description: "Initial conditions", example: "X(0) = X0, S(0) = S0" },
  ],
  unitRules: [
    { symbol: "X", expectedUnit: "g/L" },
    { symbol: "S", expectedUnit: "g/L" },
    { symbol: "μmax", expectedUnit: "1/h", alternatives: ["h⁻¹"] },
    { symbol: "Ks", expectedUnit: "g/L" },
    { symbol: "Yxs", expectedUnit: "g/g" },
  ],
};

// ── Fed-Batch Reactor ────────────────────────────────────────────────────────

const FED_BATCH: DomainTemplate = {
  modelType: "fed_batch",
  displayName: "Fed-Batch Reactor",
  description:
    "Semi-open system where substrate is continuously or intermittently added but no liquid is removed. Culture volume grows over time.",
  expectedVariables: [
    { symbol: "X", name: "Biomass concentration", unit: "g/L", required: true },
    { symbol: "S", name: "Substrate concentration", unit: "g/L", required: true },
    { symbol: "V", name: "Culture volume", unit: "L", required: true, description: "Increases over time due to feeding." },
    { symbol: "t", name: "Time", unit: "h", required: true },
  ],
  expectedParameters: [
    { symbol: "F", name: "Feed flow rate", unit: "L/h", required: true, aliases: ["F", "Fin", "F_feed"] },
    { symbol: "Sin", name: "Feed substrate concentration", unit: "g/L", required: true, aliases: ["Sin", "S_in"] },
    { symbol: "μmax", name: "Maximum growth rate", unit: "1/h", required: true },
    { symbol: "Yxs", name: "Yield coefficient", unit: "g/g", required: true },
    { symbol: "V0", name: "Initial culture volume", unit: "L", required: false },
  ],
  checklistItems: [
    {
      id: "fedbatch-volume",
      category: "variable",
      description: "Volume V appears as a state variable with dV/dt = F.",
      symbol: "V",
      severity: "critical",
    },
    {
      id: "fedbatch-feedrate",
      category: "parameter",
      description: "Feed rate F (L/h) is defined and its time profile stated (constant, exponential, etc.).",
      symbol: "F",
      expectedUnit: "L/h",
      severity: "critical",
    },
    {
      id: "fedbatch-sin",
      category: "parameter",
      description: "Feed concentration Sin is provided.",
      symbol: "Sin",
      severity: "critical",
    },
    {
      id: "fedbatch-dilution",
      category: "equation",
      description: "Effective dilution D_eff = F/V (time-varying) is recognised.",
      severity: "warning",
    },
    {
      id: "fedbatch-initial-volume",
      category: "parameter",
      description: "Initial volume V(0) is specified.",
      severity: "warning",
    },
  ],
  odeHints: [
    { description: "Volume ODE", example: "dV/dt = F" },
    { description: "Biomass ODE (includes dilution by volume growth)", example: "dX/dt = μ · X - (F/V) · X" },
    { description: "Substrate ODE", example: "dS/dt = (F/V) · (Sin - S) - (1/Yxs) · μ · X" },
    { description: "Effective dilution (time-varying)", example: "D_eff(t) = F(t) / V(t)" },
    { description: "Exponential feeding to maintain constant μ", example: "F(t) = F0 · exp(μ_set · t)" },
  ],
  unitRules: [
    { symbol: "F", expectedUnit: "L/h", alternatives: ["mL/h", "m³/h"] },
    { symbol: "V", expectedUnit: "L", alternatives: ["mL", "m³"] },
    { symbol: "X", expectedUnit: "g/L" },
    { symbol: "S", expectedUnit: "g/L" },
    { symbol: "Sin", expectedUnit: "g/L" },
  ],
};

// ── CSTR (Chemical Reaction) ─────────────────────────────────────────────────

const CSTR: DomainTemplate = {
  modelType: "cstr",
  displayName: "CSTR (Chemical Reactor)",
  description:
    "Continuously Stirred Tank Reactor for chemical reactions. Well-mixed, steady-state or dynamic operation. Often involves temperature, activation energy, and Arrhenius kinetics.",
  expectedVariables: [
    { symbol: "Ca", name: "Reactant concentration", unit: "mol/L", required: true, aliases: ["Ca", "C_A", "C"] },
    { symbol: "T", name: "Temperature", unit: "K", required: false, aliases: ["T", "Temp"] },
    { symbol: "t", name: "Time", unit: "s", required: true },
  ],
  expectedParameters: [
    { symbol: "τ", name: "Residence time", unit: "s", required: true, aliases: ["tau", "τ", "theta"] },
    { symbol: "k0", name: "Pre-exponential factor", unit: "1/s (or units of rate)", required: false, aliases: ["k0", "A", "k_0"] },
    { symbol: "Ea", name: "Activation energy", unit: "J/mol", required: false, aliases: ["Ea", "E_a", "activation_energy"] },
    { symbol: "Ca0", name: "Inlet concentration", unit: "mol/L", required: true, aliases: ["Ca0", "C_A0", "Cin"] },
    { symbol: "ΔHr", name: "Heat of reaction", unit: "J/mol", required: false, aliases: ["ΔHr", "dHr", "Hr"] },
  ],
  checklistItems: [
    {
      id: "cstr-residence",
      category: "parameter",
      description: "Residence time τ (or F and V separately) is specified.",
      symbol: "τ",
      expectedUnit: "s",
      severity: "critical",
    },
    {
      id: "cstr-inlet",
      category: "parameter",
      description: "Inlet reactant concentration Ca0 is provided.",
      symbol: "Ca0",
      severity: "critical",
    },
    {
      id: "cstr-kinetics",
      category: "equation",
      description: "Reaction rate expression r(Ca, T) is explicitly stated.",
      severity: "critical",
    },
    {
      id: "cstr-activation",
      category: "parameter",
      description: "Activation energy Ea is provided if temperature dependence is modelled.",
      symbol: "Ea",
      severity: "warning",
    },
    {
      id: "cstr-heat",
      category: "assumption",
      description: "Isothermal assumption is stated OR heat transfer equation is provided.",
      severity: "warning",
    },
    {
      id: "cstr-units",
      category: "unit",
      description: "Concentration in mol/L or g/L, temperature in K, time in s or h.",
      severity: "warning",
    },
  ],
  odeHints: [
    { description: "Concentration ODE (dynamic)", example: "dCa/dt = (Ca0 - Ca) / τ - r(Ca, T)" },
    { description: "Temperature ODE (non-isothermal)", example: "dT/dt = (T0 - T) / τ + (-ΔHr / (ρ·Cp)) · r(Ca, T)" },
    { description: "Arrhenius rate constant", example: "k(T) = k0 · exp(-Ea / (R · T))" },
    { description: "nth-order rate law", example: "r = k(T) · Ca^n" },
    { description: "Steady-state mass balance", example: "Ca = Ca0 - r(Ca,T) · τ" },
  ],
  unitRules: [
    { symbol: "τ", expectedUnit: "s", alternatives: ["min", "h"] },
    { symbol: "Ca", expectedUnit: "mol/L", alternatives: ["mol·L⁻¹", "g/L"] },
    { symbol: "T", expectedUnit: "K", alternatives: ["°C"] },
    { symbol: "Ea", expectedUnit: "J/mol", alternatives: ["kJ/mol"] },
  ],
};

// ── Gas-Liquid Oxygen Transfer ───────────────────────────────────────────────

const GAS_LIQUID_TRANSFER: DomainTemplate = {
  modelType: "gas_liquid_transfer",
  displayName: "Gas-Liquid / O₂ Transfer",
  description:
    "Aerobic bioreactor model focused on dissolved oxygen dynamics. Key parameter is the volumetric oxygen mass transfer coefficient kLa. Models the balance between oxygen supply (OTR) and microbial demand (OUR).",
  expectedVariables: [
    { symbol: "CL", name: "Dissolved oxygen concentration", unit: "g/L", required: true, aliases: ["CL", "C_L", "DO", "C_O2"] },
    { symbol: "t", name: "Time", unit: "h", required: true },
  ],
  expectedParameters: [
    { symbol: "kLa", name: "Volumetric mass transfer coefficient", unit: "1/h", required: true, aliases: ["kLa", "k_La", "KLa"] },
    { symbol: "C*", name: "Oxygen saturation concentration", unit: "g/L", required: true, aliases: ["Cstar", "C*", "CL_sat", "Csat"] },
    { symbol: "OUR", name: "Oxygen uptake rate", unit: "g/L/h", required: false, aliases: ["OUR", "qO2"] },
    { symbol: "qO2", name: "Specific oxygen consumption rate", unit: "g/(g·h)", required: false, aliases: ["qO2", "q_O2"] },
  ],
  checklistItems: [
    {
      id: "oxy-kla",
      category: "parameter",
      description: "kLa (h⁻¹) is explicitly reported with its value or correlation.",
      symbol: "kLa",
      expectedUnit: "1/h",
      severity: "critical",
    },
    {
      id: "oxy-sat",
      category: "parameter",
      description: "Oxygen saturation concentration C* is stated.",
      symbol: "C*",
      severity: "critical",
    },
    {
      id: "oxy-henry",
      category: "assumption",
      description: "Henry's law convention or direct saturation value is specified.",
      severity: "warning",
    },
    {
      id: "oxy-our",
      category: "parameter",
      description: "Oxygen uptake rate (OUR) or cell-specific O₂ demand qO2 is provided.",
      severity: "warning",
    },
    {
      id: "oxy-aeration",
      category: "assumption",
      description: "Aeration conditions (airflow rate, agitation speed, sparger type) are reported.",
      severity: "info",
    },
    {
      id: "oxy-temp",
      category: "parameter",
      description: "Temperature dependence of C* (or operating temperature) is stated.",
      severity: "info",
    },
  ],
  odeHints: [
    { description: "Dissolved oxygen ODE", example: "dCL/dt = kLa · (C* - CL) - OUR" },
    { description: "With microbial growth coupling", example: "OUR = qO2 · X" },
    { description: "kLa empirical correlation", example: "kLa = α · (P/V)^β · vs^γ  [Higbie / Calderbank]" },
    { description: "Temperature-corrected C*", example: "C*(T) = C*_20 · θ^(T-20)  [θ ≈ 0.9970–0.9999]" },
  ],
  unitRules: [
    { symbol: "kLa", expectedUnit: "1/h", alternatives: ["h⁻¹", "1/s", "s⁻¹"] },
    { symbol: "CL", expectedUnit: "g/L", alternatives: ["mg/L", "mol/L"] },
    { symbol: "C*", expectedUnit: "g/L", alternatives: ["mg/L"] },
    { symbol: "OUR", expectedUnit: "g/L/h", alternatives: ["mmol/L/h"] },
  ],
};

// ── Microalgae / Photobioreactor ─────────────────────────────────────────────

const MICROALGAE_PBR: DomainTemplate = {
  modelType: "microalgae_pbr",
  displayName: "Microalgae / PBR",
  description:
    "Photobioreactor model for microalgal growth driven by light irradiance. Growth rate is a function of light intensity (often Monod-type or Haldane inhibition for high irradiance).",
  expectedVariables: [
    { symbol: "X", name: "Biomass concentration", unit: "g/L", required: true, aliases: ["X", "Cx", "biomass"] },
    { symbol: "t", name: "Time", unit: "d", required: true },
  ],
  expectedParameters: [
    { symbol: "I", name: "Light irradiance", unit: "μmol/m²/s", required: true, aliases: ["I", "I0", "irradiance", "PAR"] },
    { symbol: "μmax", name: "Maximum growth rate", unit: "1/d", required: true, aliases: ["μmax", "mu_max"] },
    { symbol: "KI", name: "Light saturation constant", unit: "μmol/m²/s", required: true, aliases: ["KI", "K_I", "Ks_light"] },
    { symbol: "KIi", name: "Light inhibition constant (Haldane)", unit: "μmol/m²/s", required: false, aliases: ["KIi", "Ki", "KI_inhib"] },
    { symbol: "D", name: "Dilution rate (if continuous)", unit: "1/d", required: false, aliases: ["D"] },
  ],
  checklistItems: [
    {
      id: "pbr-light",
      category: "parameter",
      description: "Light irradiance I (μmol/m²/s or W/m²) is explicitly modelled.",
      symbol: "I",
      expectedUnit: "μmol/m²/s",
      severity: "critical",
    },
    {
      id: "pbr-light-model",
      category: "equation",
      description: "Light-dependent growth model is stated (Monod-type or Haldane inhibition).",
      severity: "critical",
    },
    {
      id: "pbr-ki",
      category: "parameter",
      description: "Light saturation constant KI is provided.",
      symbol: "KI",
      severity: "critical",
    },
    {
      id: "pbr-inhibition",
      category: "assumption",
      description: "If photoinhibition is possible: Haldane model with KIi is used (else Monod assumed).",
      symbol: "KIi",
      severity: "warning",
    },
    {
      id: "pbr-co2",
      category: "assumption",
      description: "CO₂ / nutrient limitation is addressed or explicitly neglected.",
      severity: "info",
    },
    {
      id: "pbr-productivity",
      category: "parameter",
      description: "Volumetric or areal biomass productivity definition is stated.",
      severity: "info",
    },
  ],
  odeHints: [
    { description: "Biomass ODE (batch)", example: "dX/dt = μ(I) · X" },
    { description: "Biomass ODE (continuous)", example: "dX/dt = (μ(I) - D) · X" },
    { description: "Monod-type light model", example: "μ(I) = μmax · I / (KI + I)" },
    { description: "Haldane light model (with inhibition)", example: "μ(I) = μmax · I / (KI + I + I²/KIi)" },
    { description: "Volumetric productivity", example: "P = D · X  [g/L/d at steady state]" },
  ],
  unitRules: [
    { symbol: "I", expectedUnit: "μmol/m²/s", alternatives: ["W/m²", "µE/m²/s"] },
    { symbol: "μmax", expectedUnit: "1/d", alternatives: ["d⁻¹", "1/h", "h⁻¹"] },
    { symbol: "KI", expectedUnit: "μmol/m²/s", alternatives: ["W/m²"] },
    { symbol: "X", expectedUnit: "g/L", alternatives: ["g·L⁻¹"] },
  ],
};

// ── Generic ODE ──────────────────────────────────────────────────────────────

const GENERIC_ODE: DomainTemplate = {
  modelType: "generic_ode",
  displayName: "Generic ODE Model",
  description:
    "No specific domain was detected. The general good-practice checklist below applies to any ODE system.",
  expectedVariables: [],
  expectedParameters: [],
  checklistItems: [
    {
      id: "gen-units",
      category: "unit",
      description: "All parameters have explicit units.",
      severity: "warning",
    },
    {
      id: "gen-initial",
      category: "variable",
      description: "Initial conditions for all state variables are stated.",
      severity: "warning",
    },
    {
      id: "gen-time",
      category: "parameter",
      description: "Time unit and integration horizon are specified.",
      severity: "warning",
    },
    {
      id: "gen-values",
      category: "parameter",
      description: "Numeric values (not just symbols) are given for all parameters.",
      severity: "warning",
    },
    {
      id: "gen-ode",
      category: "equation",
      description: "Right-hand side of every ODE is explicitly stated.",
      severity: "critical",
    },
  ],
  odeHints: [
    { description: "Generalised ODE system", example: "dy/dt = f(t, y, p)  where p is the parameter vector" },
    { description: "Use scipy.integrate.solve_ivp for numerical integration (Python)." },
  ],
  unitRules: [],
};

// ── Public API ───────────────────────────────────────────────────────────────

const TEMPLATES: Record<ModelType, DomainTemplate> = {
  chemostat: CHEMOSTAT,
  batch_reactor: BATCH_REACTOR,
  fed_batch: FED_BATCH,
  cstr: CSTR,
  gas_liquid_transfer: GAS_LIQUID_TRANSFER,
  microalgae_pbr: MICROALGAE_PBR,
  generic_ode: GENERIC_ODE,
};

export function getDomainTemplate(modelType: ModelType): DomainTemplate {
  return TEMPLATES[modelType];
}

export function getAllTemplates(): DomainTemplate[] {
  return Object.values(TEMPLATES);
}
