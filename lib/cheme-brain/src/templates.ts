import type {
  ChemEModelTemplate,
  ChemEModelTemplateId,
  ChemEWarning,
  MissingRequirement,
  RecommendedNextSource,
  RequiredInformationCategory,
  RequiredInformationItem,
  SimulationSupport,
  UnitExpectation,
} from "./types";

/**
 * Static ChemE Brain templates.
 *
 * These are reasoning checklists only. They are not provider output, not source
 * evidence, not DB schema, and not simulation authorization.
 */

export const CHEME_MODEL_TEMPLATE_IDS = [
  "monod_chemostat",
  "batch_culture",
  "fed_batch",
  "gas_liquid",
  "enzyme_kinetics",
  "photobioreactor_light",
  "oxygen_balanced_mixotrophy",
  "unknown",
] as const satisfies readonly ChemEModelTemplateId[];

const reviewCurrentSource: RecommendedNextSource = {
  sourceType: "current_source_review",
  reason: "Verify whether the current source explicitly reports the required item.",
};

const supportingInfo: RecommendedNextSource = {
  sourceType: "supporting_information",
  reason: "Supporting Information often contains parameter tables, derivations, and operating details.",
};

const userAssumption: RecommendedNextSource = {
  sourceType: "user_assumption",
  reason: "A user-supplied assumption can fill a model gap only when clearly labelled as assumed.",
};

const calibrationData: RecommendedNextSource = {
  sourceType: "calibration_data",
  reason: "Experimental data may be needed to estimate missing kinetic or empirical parameters.",
};

const citedPaper: RecommendedNextSource = {
  sourceType: "cited_paper",
  reason: "The source may cite another paper for the model relation or constants.",
};

const databook: RecommendedNextSource = {
  sourceType: "databook",
  reason: "Physical constants and convention-specific coefficients should come from a verified databook.",
};

function item(
  id: string,
  category: RequiredInformationCategory,
  label: string,
  symbols: string[],
  description: string,
  acceptableEvidence: string[],
  severity: RequiredInformationItem["severity"] = "critical",
  required = true,
): RequiredInformationItem {
  return {
    id,
    category,
    label,
    symbols,
    required,
    evidenceStatus: "missing",
    severity,
    description,
    acceptableEvidence,
  };
}

function missing(
  id: string,
  itemName: string,
  category: MissingRequirement["category"],
  requiredFor: string,
  whyNeeded: string,
  suggestedSources: RecommendedNextSource[],
  triggerEvidence: string[] = [],
  severity: MissingRequirement["severity"] = "critical",
): MissingRequirement {
  return {
    id,
    item: itemName,
    category,
    requiredFor,
    whyNeeded,
    suggestedSources,
    severity,
    triggerEvidence,
  };
}

function unit(symbol: string, expectedUnit: string, note: string): UnitExpectation {
  return {
    symbol,
    expectedUnit,
    evidenceStatus: "missing",
    note,
  };
}

function warning(id: string, message: string, safetyRule: string): ChemEWarning {
  return {
    id,
    severity: "warning",
    message,
    safetyRule,
  };
}

function baseWarnings(templateName: string): ChemEWarning[] {
  return [
    warning(
      `${templateName}-no-numeric-defaults`,
      "Template expectations are not numerical values and must not be inserted into an extraction.",
      "Never invent numeric values.",
    ),
    warning(
      `${templateName}-not-source-evidence`,
      "Template knowledge validates or requests evidence; it is not source evidence.",
      "Never treat textbook defaults as source evidence.",
    ),
    warning(
      `${templateName}-not-provider-replacement`,
      "Templates do not replace provider extraction or explicit source-backed evidence.",
      "Templates are checklists and reasoning aids only.",
    ),
  ];
}

export const CHEME_MODEL_TEMPLATES: Record<ChemEModelTemplateId, ChemEModelTemplate> = {
  monod_chemostat: {
    id: "monod_chemostat",
    canonicalModelType: "monod_chemostat",
    displayName: "Monod Chemostat",
    description: "Continuous culture with Monod growth, dilution, and biomass/substrate balances.",
    requiredStates: [
      item("monod-state-x", "state", "Biomass state", ["X"], "Biomass concentration must be a state.", ["Explicit X state or dX/dt balance."]),
      item("monod-state-s", "state", "Substrate state", ["S"], "Substrate concentration must be a state.", ["Explicit S state or dS/dt balance."]),
    ],
    commonInputs: [
      item("monod-input-sin", "input", "Feed substrate concentration", ["Sin", "S_in"], "Feed substrate concentration is needed for the substrate balance.", ["Sin or feed substrate assignment."]),
    ],
    commonOutputs: [
      item("monod-output-mu", "output", "Specific growth rate", ["mu", "μ"], "Growth rate should be represented as an output/intermediate, not a state.", ["mu rate-law equation."]),
      item("monod-output-x", "output", "Biomass concentration output", ["X"], "Biomass is normally a reported output.", ["X state/output evidence."], "info", false),
      item("monod-output-s", "output", "Substrate concentration output", ["S"], "Substrate is normally a reported output.", ["S state/output evidence."], "info", false),
    ],
    commonControls: [
      item("monod-control-d", "control", "Dilution rate operating variable", ["D"], "Dilution rate is commonly manipulated or selected operationally.", ["D assignment or operating condition."]),
    ],
    requiredParameters: [
      item("monod-param-mumax", "parameter", "Maximum specific growth rate", ["mumax", "mu_max", "μmax"], "Monod rate law requires maximum growth rate.", ["Explicit mumax value and unit."]),
      item("monod-param-ks", "parameter", "Half-saturation constant", ["Ks", "K_s"], "Monod rate law requires half-saturation concentration.", ["Explicit Ks value and unit."]),
      item("monod-param-d", "parameter", "Dilution rate", ["D"], "Chemostat balances require dilution rate.", ["Explicit D value and unit."]),
      item("monod-param-sin", "parameter", "Feed substrate concentration", ["Sin", "S_in"], "Substrate balance requires feed substrate concentration.", ["Explicit Sin value and unit."]),
      item("monod-param-yxs", "parameter", "Biomass yield on substrate", ["Yxs", "Y_xs"], "Substrate consumption term requires biomass yield.", ["Explicit Yxs value and unit."]),
    ],
    requiredEquations: [
      item("monod-eq-mu", "equation", "Monod growth relation", ["mu", "mumax", "Ks", "S"], "Growth relation must define mu.", ["mu = mumax*S/(Ks+S) or equivalent."]),
      item("monod-eq-dxdt", "equation", "Biomass dynamic balance", ["dX/dt"], "Runnable chemostat simulation requires biomass ODE.", ["Derivative equation for X."]),
      item("monod-eq-dsdt", "equation", "Substrate dynamic balance", ["dS/dt"], "Runnable chemostat simulation requires substrate ODE.", ["Derivative equation for S."]),
    ],
    requiredInitialOrBoundaryConditions: [
      item("monod-ic-x0", "initial_condition", "Initial biomass", ["X0", "X_0", "X(0)"], "ODE simulation requires initial biomass.", ["Explicit X0 or X(0)."]),
      item("monod-ic-s0", "initial_condition", "Initial substrate", ["S0", "S_0", "S(0)"], "ODE simulation requires initial substrate.", ["Explicit S0 or S(0)."]),
    ],
    commonUnitExpectations: [
      unit("X", "concentration", "Biomass state should carry concentration units."),
      unit("S", "concentration", "Substrate state should carry concentration units."),
      unit("mu", "inverse time", "Specific growth rate should carry inverse-time units."),
      unit("mumax", "inverse time", "Maximum specific growth rate should carry inverse-time units."),
      unit("Ks", "concentration", "Ks should use the same concentration basis as S."),
      unit("D", "inverse time", "Dilution rate should carry inverse-time units."),
      unit("Sin", "concentration", "Feed substrate concentration should match S units."),
      unit("Yxs", "ratio", "Yield should use an explicit mass or molar ratio convention."),
    ],
    commonMissingRequirements: [
      missing("monod-missing-ics", "Initial conditions X0 and S0", "initial_condition", "ODE simulation start values", "Each state needs an explicit starting value.", [reviewCurrentSource, userAssumption]),
      missing("monod-missing-yxs", "Biomass yield Yxs", "stoichiometric_yield", "Substrate balance", "Substrate consumption cannot be closed without yield evidence.", [reviewCurrentSource, supportingInfo]),
    ],
    simulationSupport: "supported_not_ready",
    warnings: [
      ...baseWarnings("monod"),
      warning("monod-no-steady-as-ode", "Do not treat steady-state expressions as dynamic ODEs unless derivatives are explicit.", "Never mark simulation runnable without required equations."),
    ],
    recommendedNextSources: [reviewCurrentSource, supportingInfo, userAssumption],
  },

  batch_culture: {
    id: "batch_culture",
    canonicalModelType: "batch_culture",
    displayName: "Batch Culture",
    description: "Closed culture model with no inlet/outlet dilution term unless source evidence says otherwise.",
    requiredStates: [
      item("batch-state-x", "state", "Biomass state", ["X"], "Batch growth models require biomass if growth is modeled.", ["Explicit biomass state or dX/dt."]),
      item("batch-state-s", "state", "Substrate state", ["S"], "Substrate is required when uptake is modeled.", ["Explicit substrate state or dS/dt."]),
    ],
    commonInputs: [
      item("batch-input-initial-media", "input", "Initial medium composition", ["S0", "medium"], "Batch models depend on initial composition.", ["Initial substrate or medium composition."], "warning", false),
    ],
    commonOutputs: [
      item("batch-output-x", "output", "Biomass output", ["X"], "Biomass is commonly reported.", ["Biomass measurement or model output."], "info", false),
      item("batch-output-product", "output", "Product output", ["P"], "Product may be an output if modeled.", ["Product equation or measurement."], "info", false),
    ],
    commonControls: [
      item("batch-control-temperature", "control", "Operating temperature", ["T"], "Temperature may affect kinetics.", ["Reported temperature."], "info", false),
    ],
    requiredParameters: [
      item("batch-param-mumax", "parameter", "Growth-rate parameter", ["mumax", "mu_max"], "Growth model needs a rate parameter when Monod-like kinetics are used.", ["Explicit growth-rate parameter."]),
      item("batch-param-ks", "parameter", "Substrate affinity parameter", ["Ks", "K_s"], "Substrate-limited growth needs an affinity parameter.", ["Explicit Ks or equivalent."]),
      item("batch-param-yxs", "parameter", "Yield coefficient", ["Yxs", "Y_xs"], "Substrate balance requires yield evidence.", ["Explicit yield coefficient."]),
    ],
    requiredEquations: [
      item("batch-eq-growth", "equation", "Growth or uptake rate law", ["mu", "rate"], "Batch dynamics need a rate expression.", ["Explicit growth or uptake relation."]),
      item("batch-eq-states", "equation", "State balances without dilution", ["dX/dt", "dS/dt"], "Batch ODEs should not include inlet/outlet terms unless fed-batch evidence exists.", ["Derivative equations for states."]),
    ],
    requiredInitialOrBoundaryConditions: [
      item("batch-ic-states", "initial_condition", "Initial state values", ["X0", "S0"], "Closed-system ODEs require initial state values.", ["Initial conditions for all states."]),
    ],
    commonUnitExpectations: [
      unit("X", "concentration", "Biomass should carry concentration units."),
      unit("S", "concentration", "Substrate should carry concentration units."),
      unit("mumax", "inverse time", "Growth-rate parameters should carry inverse-time units."),
      unit("Yxs", "ratio", "Yield should include mass or molar basis."),
    ],
    commonMissingRequirements: [
      missing("batch-missing-ics", "Initial state values", "initial_condition", "Batch ODE start values", "Batch culture has no inlet refresh; ICs define the trajectory.", [reviewCurrentSource, userAssumption]),
      missing("batch-missing-kinetics", "Growth/uptake kinetic constants", "kinetic_parameter", "Rate-law evaluation", "The rate law cannot be evaluated without source-backed kinetic parameters.", [supportingInfo, calibrationData]),
    ],
    simulationSupport: "supported_not_ready",
    warnings: [
      ...baseWarnings("batch"),
      warning("batch-no-d-default", "Do not require or insert dilution rate D for a batch culture.", "Do not force one model type into another."),
    ],
    recommendedNextSources: [reviewCurrentSource, supportingInfo, calibrationData, userAssumption],
  },

  fed_batch: {
    id: "fed_batch",
    canonicalModelType: "fed_batch",
    displayName: "Fed-Batch Culture",
    description: "Culture with feed addition and usually variable volume.",
    requiredStates: [
      item("fed-state-x", "state", "Biomass state", ["X"], "Fed-batch growth requires biomass state evidence.", ["Explicit X state or dX/dt."]),
      item("fed-state-s", "state", "Substrate state", ["S"], "Substrate is needed when feed affects substrate balance.", ["Explicit S state or dS/dt."]),
      item("fed-state-v", "state", "Volume state", ["V"], "Fed-batch balances often require volume dynamics.", ["V state, dV/dt, or explicit constant-volume exception."]),
    ],
    commonInputs: [
      item("fed-input-feed", "input", "Feed profile", ["F(t)", "F", "feed"], "Feed rate or feed profile drives fed-batch dynamics.", ["F(t), feed schedule, or flow profile."]),
      item("fed-input-sf", "input", "Feed substrate concentration", ["Sf", "Sfeed", "Sin"], "Feed composition is needed for substrate balance.", ["Feed substrate concentration."]),
    ],
    commonOutputs: [
      item("fed-output-x", "output", "Biomass output", ["X"], "Biomass is commonly reported.", ["Biomass measurement or model output."], "info", false),
      item("fed-output-v", "output", "Volume output", ["V"], "Volume trajectory may be reported or simulated.", ["Volume state or output."], "info", false),
    ],
    commonControls: [
      item("fed-control-feed", "control", "Feed control", ["F(t)", "F"], "Feed rate is a common manipulated variable.", ["Feed profile or controller."]),
    ],
    requiredParameters: [
      item("fed-param-kinetics", "parameter", "Kinetic parameters", ["mumax", "Ks"], "Growth/uptake kinetics require source-backed constants.", ["Explicit kinetic constants."]),
      item("fed-param-yield", "parameter", "Yield coefficients", ["Yxs"], "Mass balances require yield evidence.", ["Explicit yield values."]),
    ],
    requiredEquations: [
      item("fed-eq-volume", "equation", "Volume/feed balance", ["V", "dV/dt", "F(t)"], "Fed-batch simulation needs feed-volume relation.", ["dV/dt, V(t), or feed profile relation."]),
      item("fed-eq-mass", "equation", "Variable-volume mass balances", ["dX/dt", "dS/dt"], "Fed-batch concentration balances need dilution/feed terms.", ["Derivative balances with feed or volume terms."]),
    ],
    requiredInitialOrBoundaryConditions: [
      item("fed-ic-states", "initial_condition", "Initial states and volume", ["X0", "S0", "V0"], "Fed-batch ODEs require state and volume ICs.", ["Initial concentrations and initial volume."]),
      item("fed-bc-feed", "boundary_condition", "Feed schedule", ["F(t)", "feed"], "Feed schedule is a boundary/input condition.", ["Feed trajectory or dosing schedule."]),
    ],
    commonUnitExpectations: [
      unit("V", "volume", "Volume should carry volume units."),
      unit("F", "volume per time", "Feed rate should carry volume/time units."),
      unit("Sfeed", "concentration", "Feed substrate concentration should match substrate units."),
    ],
    commonMissingRequirements: [
      missing("fed-missing-feed", "Feed profile F(t)", "boundary_condition", "Fed-batch forcing", "Feed rate determines volume and substrate addition.", [reviewCurrentSource, supportingInfo, userAssumption]),
      missing("fed-missing-volume", "Volume relation V or dV/dt", "model_structure", "Variable-volume balance", "Fed-batch balances need volume evidence.", [reviewCurrentSource, supportingInfo]),
    ],
    simulationSupport: "scaffold_only",
    warnings: [
      ...baseWarnings("fed-batch"),
      warning("fed-no-constant-volume-default", "Do not silently collapse fed-batch to constant-volume batch.", "Never convert missing values into assumptions."),
    ],
    recommendedNextSources: [reviewCurrentSource, supportingInfo, userAssumption, calibrationData],
  },

  gas_liquid: {
    id: "gas_liquid",
    canonicalModelType: "gas_liquid",
    displayName: "Gas-Liquid Transfer",
    description: "Dissolved gas balance with transfer, saturation/equilibrium, and uptake/production terms.",
    requiredStates: [
      item("gas-state-dissolved", "state", "Dissolved gas state", ["C_O2", "C_CO2", "C"], "Only species with derivative evidence are states.", ["dC/dt, dC_O2/dt, or explicit state statement."]),
    ],
    commonInputs: [
      item("gas-input-cstar", "input", "Saturation or equilibrium concentration", ["Cstar", "Cstar_O2", "C*"], "Transfer driving force often requires saturation concentration.", ["Cstar or Henry-law relation."]),
      item("gas-input-biomass", "input", "Biomass forcing", ["X"], "Biomass may be an input/forcing in oxygen-only balances unless dX/dt exists.", ["X in uptake term without biomass ODE."], "warning", false),
    ],
    commonOutputs: [
      item("gas-output-dissolved", "output", "Dissolved gas concentration", ["C_O2", "C_CO2", "C"], "Dissolved concentration is the usual output.", ["Dissolved gas state/output."]),
    ],
    commonControls: [
      item("gas-control-aeration", "control", "Aeration or gas flow", ["Qg", "airflow", "gas_flow"], "Gas flow may be a control when manipulated.", ["Reported gas flow or controller."], "warning", false),
    ],
    requiredParameters: [
      item("gas-param-kla", "parameter", "Volumetric mass transfer coefficient", ["kLa", "k_La"], "Transfer model needs kLa or equivalent.", ["Explicit kLa value and unit."]),
      item("gas-param-equilibrium", "parameter", "Equilibrium/saturation relation", ["Cstar", "Henry", "H"], "Saturation/equilibrium terms require convention-backed evidence.", ["Cstar value or Henry-law convention."]),
      item("gas-param-uptake", "parameter", "Biological uptake/production parameter", ["qO2", "qCO2"], "Biological consumption/production terms need rate evidence.", ["Explicit uptake/production parameter."], "warning"),
    ],
    requiredEquations: [
      item("gas-eq-transfer", "equation", "Gas-transfer balance", ["dC/dt", "kLa", "Cstar"], "Gas-liquid model requires transfer equation evidence.", ["Derivative balance or transfer-rate equation."]),
    ],
    requiredInitialOrBoundaryConditions: [
      item("gas-ic-c", "initial_condition", "Initial dissolved gas concentration", ["C0", "C_O20", "C_O2_0"], "ODE simulation requires initial dissolved species.", ["Initial dissolved gas concentration."]),
      item("gas-bc-equilibrium", "convention", "Henry-law or saturation convention", ["Henry", "Cstar"], "Equilibrium convention controls units and equation direction.", ["Henry convention or explicit saturation concentration definition."]),
    ],
    commonUnitExpectations: [
      unit("C", "concentration", "Dissolved gas concentration should carry concentration units."),
      unit("kLa", "inverse time", "kLa should carry inverse-time units."),
      unit("Cstar", "concentration", "Saturation concentration should match dissolved species units."),
      unit("qO2", "specific rate", "Specific uptake rate should include biomass and time basis."),
    ],
    commonMissingRequirements: [
      missing("gas-missing-henry", "Henry-law or saturation convention", "physical_constant", "Gas-liquid equilibrium", "Without a convention, Cstar/Henry terms can be directionally or dimensionally wrong.", [databook, supportingInfo, userAssumption], ["Cstar", "saturation", "equilibrium", "Henry"]),
      missing("gas-missing-ic", "Initial dissolved gas concentration", "initial_condition", "ODE simulation start value", "The dissolved gas state needs an explicit starting value.", [reviewCurrentSource, userAssumption]),
    ],
    simulationSupport: "scaffold_only",
    warnings: [
      ...baseWarnings("gas-liquid"),
      warning("gas-x-not-state", "Do not classify biomass X as a state in an oxygen-only balance unless dX/dt exists.", "Preserve role evidence."),
      warning("gas-henry-convention", "Henry-law conventions are not interchangeable.", "Never invent physical constants or conventions."),
    ],
    recommendedNextSources: [databook, supportingInfo, userAssumption],
  },

  enzyme_kinetics: {
    id: "enzyme_kinetics",
    canonicalModelType: "enzyme_kinetics",
    displayName: "Enzyme Kinetics",
    description: "Enzymatic rate model such as Michaelis-Menten or an inhibition extension.",
    requiredStates: [
      item("enzyme-state-substrate", "state", "Substrate state or independent variable", ["S"], "Dynamic enzyme models need substrate state; rate-only fits need substrate variable.", ["S concentration or dS/dt."]),
    ],
    commonInputs: [
      item("enzyme-input-enzyme", "input", "Enzyme loading", ["E", "E0"], "Rates often depend on enzyme loading or normalization.", ["Enzyme concentration/loading."], "warning", false),
    ],
    commonOutputs: [
      item("enzyme-output-rate", "output", "Reaction rate", ["v", "r"], "Enzyme models usually predict rate.", ["Rate equation or reported rate."]),
      item("enzyme-output-product", "output", "Product concentration", ["P"], "Product is an output when dynamic product formation is modeled.", ["Product equation or measurement."], "info", false),
    ],
    commonControls: [
      item("enzyme-control-ph", "control", "pH", ["pH"], "pH may be controlled experimentally.", ["Reported pH."], "info", false),
      item("enzyme-control-temperature", "control", "Temperature", ["T"], "Temperature may be controlled experimentally.", ["Reported temperature."], "info", false),
    ],
    requiredParameters: [
      item("enzyme-param-vmax", "parameter", "Maximum rate", ["Vmax", "V_max"], "Michaelis-Menten relation requires Vmax.", ["Explicit Vmax value and unit."]),
      item("enzyme-param-km", "parameter", "Michaelis constant", ["Km", "K_m"], "Michaelis-Menten relation requires Km.", ["Explicit Km value and unit."]),
    ],
    requiredEquations: [
      item("enzyme-eq-mm", "equation", "Michaelis-Menten or explicit rate law", ["v", "Vmax", "Km", "S"], "Rate relation is required before model use.", ["v = Vmax*S/(Km+S) or equivalent."]),
    ],
    requiredInitialOrBoundaryConditions: [
      item("enzyme-ic-substrate", "initial_condition", "Initial substrate", ["S0", "S_0"], "Dynamic substrate/product simulation needs initial substrate.", ["Initial substrate concentration."], "warning"),
    ],
    commonUnitExpectations: [
      unit("Vmax", "concentration per time", "Vmax should carry rate units."),
      unit("Km", "concentration", "Km should match substrate units."),
      unit("S", "concentration", "Substrate should carry concentration units."),
    ],
    commonMissingRequirements: [
      missing("enzyme-missing-vmax-km", "Vmax and Km", "kinetic_parameter", "Rate-law evaluation", "Michaelis-Menten kinetics cannot be evaluated without Vmax and Km.", [reviewCurrentSource, supportingInfo, calibrationData]),
    ],
    simulationSupport: "scaffold_only",
    warnings: [
      ...baseWarnings("enzyme"),
      warning("enzyme-rate-not-ode", "Initial-rate equations are not dynamic ODEs unless state derivatives are explicit.", "Distinguish reporting/rate laws from runnable dynamics."),
    ],
    recommendedNextSources: [reviewCurrentSource, supportingInfo, calibrationData],
  },

  photobioreactor_light: {
    id: "photobioreactor_light",
    canonicalModelType: "microalgae_photobioreactor",
    displayName: "Photobioreactor Light Model",
    description: "Light attenuation and light-growth reasoning for photobioreactor models.",
    requiredStates: [
      item("pbr-state-biomass", "state", "Biomass state", ["X"], "Light attenuation often depends on biomass.", ["Biomass state or concentration evidence."]),
    ],
    commonInputs: [
      item("pbr-input-light", "input", "Incident light or PFD", ["I0", "PFD", "irradiance"], "Light model needs incident light evidence.", ["PFD, irradiance, or light intensity."]),
      item("pbr-input-geometry", "input", "Reactor geometry/path length", ["L", "path_length", "diameter"], "Light attenuation depends on geometry.", ["Path length or geometry."]),
    ],
    commonOutputs: [
      item("pbr-output-growth", "output", "Light-limited growth rate", ["mu", "rX"], "Light model may feed a growth-rate relation.", ["Light-growth relation."], "warning", false),
    ],
    commonControls: [
      item("pbr-control-light", "control", "Light intensity", ["PFD", "irradiance"], "Light can be a manipulated operating variable.", ["Set light intensity."]),
    ],
    requiredParameters: [
      item("pbr-param-attenuation", "parameter", "Light attenuation parameters", ["ka", "kb", "alpha"], "Average light calculation requires attenuation evidence.", ["Explicit attenuation or optical parameter."]),
      item("pbr-param-light-growth", "parameter", "Light-growth parameters", ["Iopt", "KI", "Pmax"], "Light-growth relation needs source-backed parameters.", ["Explicit light-growth constants."]),
    ],
    requiredEquations: [
      item("pbr-eq-attenuation", "equation", "Light attenuation relation", ["I", "PFD"], "PBR reasoning needs an average/internal light relation.", ["Beer-Lambert, Evers-style, or cited light model."]),
      item("pbr-eq-growth", "equation", "Light-growth relation", ["mu", "I"], "Dynamic PBR models need light-growth coupling.", ["Growth relation using light."]),
    ],
    requiredInitialOrBoundaryConditions: [
      item("pbr-bc-light", "boundary_condition", "Light boundary condition", ["I0", "PFD"], "Incident light boundary condition is needed.", ["PFD/irradiance with units."]),
      item("pbr-ic-biomass", "initial_condition", "Initial biomass", ["X0"], "Dynamic biomass model needs an initial biomass value.", ["Initial biomass."]),
    ],
    commonUnitExpectations: [
      unit("PFD", "photon flux", "PFD should carry photon-flux units."),
      unit("L", "length", "Path length should carry length units."),
      unit("X", "concentration", "Biomass should carry concentration units."),
    ],
    commonMissingRequirements: [
      missing("pbr-missing-light-model", "Light attenuation model", "light_model", "Photobioreactor growth model", "Average light or internal light cannot be reconstructed from incident light alone.", [citedPaper, supportingInfo, userAssumption]),
    ],
    simulationSupport: "scaffold_only",
    warnings: [
      ...baseWarnings("photobioreactor-light"),
      warning("pbr-no-incident-as-average", "Do not treat incident light as average internal light without a light model.", "Use ChemE knowledge only for validation and missing-info detection."),
    ],
    recommendedNextSources: [citedPaper, supportingInfo, userAssumption, calibrationData],
  },

  oxygen_balanced_mixotrophy: {
    id: "oxygen_balanced_mixotrophy",
    canonicalModelType: "oxygen_balanced_mixotrophy",
    displayName: "Oxygen-Balanced Mixotrophy",
    description: "Microalgae mixotrophy model coupling biomass, acetate/substrate, dissolved gases, light, and DO control.",
    requiredStates: [
      item("mix-state-x", "state", "Biomass state", ["X"], "Biomass dynamics are central to mixotrophy.", ["Biomass state or dX/dt."]),
      item("mix-state-acetate", "state", "Acetate/substrate state", ["Ac", "S"], "Acetate-fed mixotrophy needs substrate state evidence.", ["Acetate/substrate state or derivative."]),
      item("mix-state-o2", "state", "Dissolved oxygen state", ["C_O2", "DO"], "Oxygen-balanced model needs dissolved oxygen state.", ["DO state or dC_O2/dt."]),
      item("mix-state-co2", "state", "Dissolved CO2/TIC state", ["C_CO2", "TIC"], "Carbon-balanced model needs CO2/TIC state when claimed.", ["CO2/TIC state or balance."]),
    ],
    commonInputs: [
      item("mix-input-acetate-feed", "input", "Acetate feed", ["Ac_in", "F_ac"], "Acetate feed drives heterotrophic uptake.", ["Feed concentration or feed rate."]),
      item("mix-input-light", "input", "Light/PFD", ["PFD", "I0"], "Autotrophic growth requires light evidence.", ["PFD or light intensity."]),
    ],
    commonOutputs: [
      item("mix-output-productivity", "output", "Productivity/yield outputs", ["productivity", "yield"], "Productivity/yield may be reported but is not automatically ODE content.", ["Reported productivity or yield calculation."], "info", false),
    ],
    commonControls: [
      item("mix-control-do", "control", "DO control/setpoint", ["DO_setpoint", "C_O2_set"], "DO-controlled operation needs setpoint/control evidence.", ["DO setpoint or controller description."]),
      item("mix-control-feed", "control", "Acetate feed control", ["F_ac", "feed"], "Acetate feed may be manipulated.", ["Feed policy or control."]),
    ],
    requiredParameters: [
      item("mix-param-kinetics", "parameter", "Autotrophic and heterotrophic kinetics", ["mu_auto", "qAc"], "Growth/uptake terms require source-backed kinetic parameters.", ["Explicit kinetic constants."]),
      item("mix-param-stoich", "parameter", "O2/CO2 stoichiometry", ["YO2", "YCO2"], "Oxygen/carbon balances require stoichiometric yields.", ["Explicit stoichiometry/yield values."]),
      item("mix-param-gas", "parameter", "Gas-transfer/equilibrium parameters", ["kLa", "Henry"], "Dissolved gas balances require gas-transfer and convention evidence.", ["kLa and Henry/convention evidence."]),
      item("mix-param-controller", "parameter", "Controller parameters", ["Kp", "Ki", "controller"], "Closed-loop control claims require controller details.", ["Controller gains or control law."]),
    ],
    requiredEquations: [
      item("mix-eq-growth", "equation", "Autotrophic/heterotrophic growth relations", ["mu_auto", "qAc"], "Dynamic mixotrophy needs growth and uptake relations.", ["Growth/light and acetate uptake equations."]),
      item("mix-eq-o2co2", "equation", "O2/CO2 dynamic balances", ["dC_O2/dt", "dC_CO2/dt"], "Oxygen-balanced model needs gas-state balances.", ["Dissolved gas derivative equations."]),
      item("mix-eq-control", "equation", "DO control law", ["DO_setpoint", "control_law"], "Closed-loop simulation needs a control law.", ["Control equation or explicit control policy."], "warning"),
    ],
    requiredInitialOrBoundaryConditions: [
      item("mix-ic-states", "initial_condition", "Initial values for biomass, acetate, O2, and CO2/TIC", ["X0", "Ac0", "C_O20", "C_CO20"], "Every state needs an IC.", ["Initial values for all states."]),
      item("mix-bc-feed-light", "boundary_condition", "Feed/light boundary conditions", ["Ac_in", "PFD"], "Inputs must be known to simulate.", ["Feed and light conditions."]),
    ],
    commonUnitExpectations: [
      unit("PFD", "photon flux", "Light input should carry photon-flux units."),
      unit("kLa", "inverse time", "Gas-transfer coefficient should carry inverse-time units."),
      unit("DO", "concentration or percent saturation", "DO convention must be explicit."),
      unit("Ac", "concentration", "Acetate/substrate should carry concentration units."),
    ],
    commonMissingRequirements: [
      missing("mix-missing-kinetics", "Autotrophic and heterotrophic kinetic constants", "kinetic_parameter", "Growth and acetate uptake", "Procedure descriptions do not define runnable kinetics.", [supportingInfo, citedPaper, calibrationData]),
      missing("mix-missing-light", "Light model parameters", "light_model", "Autotrophic growth relation", "Light-growth coupling needs source-backed light model evidence.", [citedPaper, supportingInfo]),
      missing("mix-missing-henry", "Henry-law convention", "physical_constant", "Gas-liquid equilibrium", "O2/CO2 transfer cannot be dimensionally verified without convention.", [databook, supportingInfo, userAssumption]),
      missing("mix-missing-controller", "Controller parameters/control law", "controller", "Closed-loop DO control", "DO setpoint alone does not define controller dynamics.", [supportingInfo, existingCodeSource(), userAssumption]),
      missing("mix-missing-ics", "Initial conditions for all states", "initial_condition", "ODE simulation start values", "Every claimed state needs an initial value.", [reviewCurrentSource, userAssumption]),
    ],
    simulationSupport: "scaffold_only",
    warnings: [
      ...baseWarnings("oxygen-balanced-mixotrophy"),
      warning("mix-no-six-state-hallucination", "Do not invent a full six-state ODE model from procedure text alone.", "Never invent missing model structure or values."),
      warning("mix-productivity-not-ode", "Productivity/yield/carbon-balance calculations are not dynamic ODEs unless they define state derivatives.", "Classify equations by semantics before simulation."),
    ],
    recommendedNextSources: [supportingInfo, citedPaper, userAssumption, calibrationData, databook],
  },

  unknown: {
    id: "unknown",
    canonicalModelType: "unknown",
    displayName: "Unknown / Generic",
    description: "Fallback template for sources without enough evidence to choose a chemical-engineering model type.",
    requiredStates: [
      item("unknown-state-evidence", "state", "Explicit state evidence", [], "Only explicit states or derivative equations should create states.", ["Derivative equation or source-labelled state."]),
    ],
    commonInputs: [],
    commonOutputs: [],
    commonControls: [],
    requiredParameters: [
      item("unknown-param-evidence", "parameter", "Source-backed parameter definitions", [], "Parameters must come from source text or user assumptions.", ["Explicit parameter assignment."]),
    ],
    requiredEquations: [
      item("unknown-eq-evidence", "equation", "Source-backed governing equations", [], "No template equation should be forced onto unknown sources.", ["Explicit equation text."]),
    ],
    requiredInitialOrBoundaryConditions: [
      item("unknown-ic-evidence", "initial_condition", "Initial/boundary conditions for any states", [], "Any dynamic state needs IC/BC evidence.", ["Explicit IC/BC."]),
    ],
    commonUnitExpectations: [
      unit("all_states", "source-backed units", "Each observed state should carry a unit or a missing-unit warning."),
      unit("all_parameters", "source-backed units", "Each parameter should carry a unit or explicit dimensionless/unknown status."),
    ],
    commonMissingRequirements: [
      missing("unknown-missing-model-type", "Model type evidence", "model_structure", "Model classification", "Unknown sources should request more evidence instead of forcing a template.", [reviewCurrentSource, supportingInfo]),
    ],
    simulationSupport: "unsupported",
    warnings: [
      ...baseWarnings("unknown"),
      warning("unknown-no-forcing", "Do not force unknown sources into Monod, batch, or gas-liquid templates.", "Never use generic textbook knowledge as source evidence."),
    ],
    recommendedNextSources: [reviewCurrentSource, supportingInfo, userAssumption],
  },
};

function existingCodeSource(): RecommendedNextSource {
  return {
    sourceType: "existing_code",
    reason: "Existing simulation/control code may define controller equations and parameters.",
  };
}

export function getChemEModelTemplate(id: ChemEModelTemplateId): ChemEModelTemplate {
  return CHEME_MODEL_TEMPLATES[id];
}

export function getChemEModelTemplates(): ChemEModelTemplate[] {
  return CHEME_MODEL_TEMPLATE_IDS.map((id) => CHEME_MODEL_TEMPLATES[id]);
}
