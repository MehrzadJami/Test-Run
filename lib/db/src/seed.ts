/**
 * Standalone seed script — run with:
 *   pnpm --filter @workspace/db run seed
 *
 * Requires DATABASE_URL in the environment.
 * For local dev: copy .env.example to .env, then run this script.
 * dotenv/config is imported so .env is loaded automatically if present.
 */
import "dotenv/config";
import { eq, and, isNull } from "drizzle-orm";
import {
  db,
  pool,
  projectsTable,
  sourceDocumentsTable,
  extractionsTable,
  equationsTable,
  variablesTable,
  parametersTable,
  assumptionsTable,
} from "./index.js";

const SEED_PROJECT_NAME = "Chemostat — microalgae bioreactor (Andrews 1968)";

const SOURCE_TEXT = `Continuous-culture chemostat for microalgae growth — Andrews (1968)
A constant-volume, constant-flow chemostat with substrate-limited algal growth.
The single substrate S (limiting nutrient) feeds biomass X following the Monod
expression. Steady state is reached when the dilution rate equals the specific
growth rate. The reactor is well mixed, isothermal, and operated at a fixed
photon flux. The light-limitation term is folded into mu_max for this study.

Governing equations (transient form, constant volume V, volumetric flow q):
  dX/dt = mu(S) X - D X
  dS/dt = D (S_in - S) - (1/Y) mu(S) X
  mu(S) = mu_max S / (K_S + S)
where D = q / V is the dilution rate.

Reported parameters at 25 C:
  mu_max = 1.10 1/day
  K_S    = 12.0 mg/L
  Y      = 0.45 g biomass / g substrate
  S_in   = 150 mg/L
  D      = 0.6 1/day
`;

const PYTHON_TEMPLATE = `# Chemostat — microalgae growth (Andrews 1968)
# Solver: scipy.integrate.solve_ivp (RK45)

import numpy as np
from scipy.integrate import solve_ivp


def rhs(t, y, p):
    X, S = y
    mu = p["mu_max"] * S / (p["K_S"] + S)
    dXdt = mu * X - p["D"] * X
    dSdt = p["D"] * (p["S_in"] - S) - (1.0 / p["Y"]) * mu * X
    return [dXdt, dSdt]


def simulate(t_span=(0.0, 30.0), n_points=300):
    params = {
        "mu_max": 1.10,   # 1/day
        "K_S":    12.0,   # mg/L
        "Y":      0.45,   # g biomass / g substrate
        "S_in":   150.0,  # mg/L
        "D":      0.6,    # 1/day
    }
    y0 = [10.0, 150.0]   # X0 (mg/L), S0 (mg/L)
    sol = solve_ivp(
        fun=lambda t, y: rhs(t, y, params),
        t_span=t_span,
        y0=y0,
        t_eval=np.linspace(t_span[0], t_span[1], n_points),
        method="RK45",
    )
    return sol


if __name__ == "__main__":
    sol = simulate()
    print("t (first 5):", sol.t[:5])
    print("X (first 5):", sol.y[0, :5])
    print("S (first 5):", sol.y[1, :5])
`;

const CHEMOSTAT_RAW_EXTRACTION = {
  paper_title_or_topic:
    "Continuous chemostat — substrate-limited microalgae growth",
  system_type: "Biochemical engineering",
  process_description:
    "Constant-volume, constant-flow chemostat with substrate-limited algal growth following Monod kinetics. Well mixed, isothermal, fixed photon flux folded into mu_max.",
  state_variables: [
    {
      symbol: "X",
      name: "Biomass concentration",
      meaning: "Algal biomass concentration in the reactor.",
      unit: "mg/L",
      role: "state",
      source_context: "X is the algal biomass concentration in the reactor.",
      confidence: "high",
    },
    {
      symbol: "S",
      name: "Limiting substrate concentration",
      meaning: "Residual concentration of the limiting nutrient.",
      unit: "mg/L",
      role: "state",
      source_context:
        "S is the residual concentration of the limiting nutrient.",
      confidence: "high",
    },
    {
      symbol: "t",
      name: "Time",
      meaning: "Independent variable for the transient simulation.",
      unit: "day",
      role: "input",
      source_context: "Independent variable for the transient simulation.",
      confidence: "high",
    },
  ],
  parameters: [
    {
      symbol: "mu_max",
      name: "Maximum specific growth rate",
      value: "1.10",
      unit: "1/day",
      source_context:
        "Maximum specific growth rate reported as 1.10 1/day at 25 C.",
      confidence: "high",
    },
    {
      symbol: "K_S",
      name: "Half-saturation constant",
      value: "12.0",
      unit: "mg/L",
      source_context: "Half-saturation constant K_S = 12 mg/L.",
      confidence: "medium",
    },
    {
      symbol: "Y",
      name: "Yield coefficient",
      value: "0.45",
      unit: "g/g",
      source_context:
        "Yield coefficient Y = 0.45 g biomass per g substrate consumed.",
      confidence: "high",
    },
    {
      symbol: "S_in",
      name: "Feed substrate concentration",
      value: "150",
      unit: "mg/L",
      source_context: "Feed substrate concentration S_in = 150 mg/L.",
      confidence: "high",
    },
    {
      symbol: "D",
      name: "Dilution rate",
      value: "0.6",
      unit: "1/day",
      source_context:
        "Dilution rate D = q/V set to 0.6 1/day in the reported experiment.",
      confidence: "high",
    },
  ],
  equations: [
    {
      label: "(1)",
      equation_latex: "\\frac{dX}{dt} = \\mu(S) X - D X",
      equation_plaintext: "dX/dt = mu(S)*X - D*X",
      meaning: "Biomass balance with growth and washout terms.",
      variables_involved: ["X", "S", "D"],
      source_context:
        "Net biomass accumulation equals growth minus removal at the dilution rate D.",
      confidence: "high",
    },
    {
      label: "(2)",
      equation_latex:
        "\\frac{dS}{dt} = D (S_{in} - S) - \\frac{1}{Y} \\mu(S) X",
      equation_plaintext: "dS/dt = D*(S_in - S) - (1/Y)*mu(S)*X",
      meaning: "Substrate balance with feed, washout, and consumption (yield Y).",
      variables_involved: ["S", "X", "D", "S_in", "Y"],
      source_context:
        "Substrate is supplied by the feed, removed with the outflow, and consumed by growth at yield Y.",
      confidence: "high",
    },
    {
      label: "(3)",
      equation_latex: "\\mu(S) = \\frac{\\mu_{max} S}{K_S + S}",
      equation_plaintext: "mu(S) = mu_max * S / (K_S + S)",
      meaning: "Monod specific growth rate as a function of substrate.",
      variables_involved: ["S", "mu_max", "K_S"],
      source_context:
        "Specific growth rate follows the Monod expression with maximum mu_max and half-saturation constant K_S.",
      confidence: "high",
    },
  ],
  assumptions: [
    {
      assumption: "Perfectly mixed reactor (no spatial gradients).",
      source_context: "The reactor is well mixed.",
      confidence: "high",
    },
    {
      assumption: "Constant working volume V and isothermal at 25 C.",
      source_context: "Constant-volume operation at fixed temperature.",
      confidence: "high",
    },
    {
      assumption:
        "Light limitation absorbed into mu_max — no explicit photon-balance term.",
      source_context: "The light-limitation term is folded into mu_max.",
      confidence: "medium",
    },
    {
      assumption: "Single limiting substrate S; other nutrients in excess.",
      source_context: "Substrate-limited growth following Monod.",
      confidence: "high",
    },
  ],
  limitations: [
    {
      limitation:
        "Photon flux is held constant — model breaks down for diurnal or shaded operation.",
      source_context: "Operated at a fixed photon flux.",
      confidence: "medium",
    },
    {
      limitation:
        "Yield Y assumed constant; in reality varies with growth rate and stress conditions.",
      source_context: "Yield reported as a single number at 25 C.",
      confidence: "medium",
    },
  ],
  model_card: {
    short_summary:
      "Continuous chemostat with Monod kinetics; transient ODE for biomass X and substrate S given dilution rate D and feed concentration S_in.",
    model_type: "ODE — two-state nonlinear",
    inputs: ["S_in", "D", "t"],
    outputs: ["X", "S"],
    control_variables: ["D", "S_in"],
    missing_information: [
      "Photon flux dependence",
      "Temperature dependence of mu_max",
      "Initial conditions for transient simulation",
    ],
    can_generate_ode_template: true,
  },
};

async function main(): Promise<void> {
  console.log("ChemEngAI — seed demo data");

  const existing = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.name, SEED_PROJECT_NAME))
    .limit(1);

  if (existing.length > 0) {
    const projectId = existing[0]!.id;
    const backfilled = await db
      .update(extractionsTable)
      .set({ rawExtractionJson: CHEMOSTAT_RAW_EXTRACTION })
      .where(
        and(
          eq(extractionsTable.projectId, projectId),
          isNull(extractionsTable.rawExtractionJson),
        ),
      )
      .returning({ id: extractionsTable.id });

    if (backfilled.length > 0) {
      console.log(
        `  backfilled raw_extraction_json on ${backfilled.length} extraction(s)`,
      );
    } else {
      console.log("  demo project already present — nothing to do");
    }
    return;
  }

  console.log("  inserting chemostat demo project...");

  await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projectsTable)
      .values({
        name: SEED_PROJECT_NAME,
        description:
          "Continuous-culture chemostat with substrate-limited microalgae growth (Monod kinetics). Seeded by ChemAI on first boot for demo purposes.",
      })
      .returning();
    if (!project) throw new Error("Failed to insert project");

    const [source] = await tx
      .insert(sourceDocumentsTable)
      .values({
        projectId: project.id,
        kind: "text",
        filename: "andrews_1968_chemostat.txt",
        content: SOURCE_TEXT,
      })
      .returning();
    if (!source) throw new Error("Failed to insert source document");

    const [extraction] = await tx
      .insert(extractionsTable)
      .values({
        projectId: project.id,
        sourceDocumentId: source.id,
        providerUsed: "mock",
        status: "ready",
        modelCardTitle:
          "Continuous chemostat — substrate-limited microalgae growth",
        domain: "Biochemical engineering",
        systemDescription:
          "Constant-volume, constant-flow chemostat with substrate-limited algal growth following Monod kinetics. Well mixed, isothermal, fixed photon flux folded into mu_max.",
        problemStatement:
          "Predict the time evolution of biomass X and limiting substrate S given dilution rate D and feed concentration S_in, and identify the steady-state operating point.",
        odeTemplate: PYTHON_TEMPLATE,
        rawExtractionJson: CHEMOSTAT_RAW_EXTRACTION,
      })
      .returning();
    if (!extraction) throw new Error("Failed to insert extraction");

    await tx.insert(equationsTable).values([
      {
        extractionId: extraction.id,
        ordinal: 0,
        latex: "\\frac{dX}{dt} = \\mu(S) X - D X",
        description: "Biomass balance with growth and washout terms.",
        sourceQuote:
          "Net biomass accumulation equals growth minus removal at the dilution rate D.",
      },
      {
        extractionId: extraction.id,
        ordinal: 1,
        latex:
          "\\frac{dS}{dt} = D (S_{in} - S) - \\frac{1}{Y} \\mu(S) X",
        description:
          "Substrate balance with feed, washout, and consumption (yield Y).",
        sourceQuote:
          "Substrate is supplied by the feed, removed with the outflow, and consumed by growth at yield Y.",
      },
      {
        extractionId: extraction.id,
        ordinal: 2,
        latex: "\\mu(S) = \\frac{\\mu_{max} S}{K_S + S}",
        description: "Monod specific growth rate as a function of substrate.",
        sourceQuote:
          "Specific growth rate follows the Monod expression with maximum mu_max and half-saturation constant K_S.",
      },
    ]);

    await tx.insert(variablesTable).values([
      {
        extractionId: extraction.id,
        ordinal: 0,
        symbol: "X",
        name: "Biomass concentration",
        unit: "mg/L",
        role: "state",
        sourceQuote: "X is the algal biomass concentration in the reactor.",
      },
      {
        extractionId: extraction.id,
        ordinal: 1,
        symbol: "S",
        name: "Limiting substrate concentration",
        unit: "mg/L",
        role: "state",
        sourceQuote:
          "S is the residual concentration of the limiting nutrient.",
      },
      {
        extractionId: extraction.id,
        ordinal: 2,
        symbol: "t",
        name: "Time",
        unit: "day",
        role: "input",
        sourceQuote: "Independent variable for the transient simulation.",
      },
    ]);

    await tx.insert(parametersTable).values([
      {
        extractionId: extraction.id,
        ordinal: 0,
        symbol: "mu_max",
        value: 1.1,
        unit: "1/day",
        confidence: "high",
        sourceQuote:
          "Maximum specific growth rate reported as 1.10 1/day at 25 C.",
      },
      {
        extractionId: extraction.id,
        ordinal: 1,
        symbol: "K_S",
        value: 12.0,
        unit: "mg/L",
        confidence: "medium",
        sourceQuote: "Half-saturation constant K_S = 12 mg/L.",
      },
      {
        extractionId: extraction.id,
        ordinal: 2,
        symbol: "Y",
        value: 0.45,
        unit: "g/g",
        confidence: "high",
        sourceQuote:
          "Yield coefficient Y = 0.45 g biomass per g substrate consumed.",
      },
      {
        extractionId: extraction.id,
        ordinal: 3,
        symbol: "S_in",
        value: 150.0,
        unit: "mg/L",
        confidence: "high",
        sourceQuote: "Feed substrate concentration S_in = 150 mg/L.",
      },
      {
        extractionId: extraction.id,
        ordinal: 4,
        symbol: "D",
        value: 0.6,
        unit: "1/day",
        confidence: "high",
        sourceQuote:
          "Dilution rate D = q/V set to 0.6 1/day in the reported experiment.",
      },
    ]);

    await tx.insert(assumptionsTable).values([
      {
        extractionId: extraction.id,
        ordinal: 0,
        kind: "assumption",
        text: "Perfectly mixed reactor (no spatial gradients).",
      },
      {
        extractionId: extraction.id,
        ordinal: 1,
        kind: "assumption",
        text: "Constant working volume V and isothermal at 25 C.",
      },
      {
        extractionId: extraction.id,
        ordinal: 2,
        kind: "assumption",
        text: "Light limitation absorbed into mu_max — no explicit photon-balance term.",
      },
      {
        extractionId: extraction.id,
        ordinal: 3,
        kind: "assumption",
        text: "Single limiting substrate S; other nutrients in excess.",
      },
      {
        extractionId: extraction.id,
        ordinal: 0,
        kind: "limitation",
        text: "Photon flux is held constant — model breaks down for diurnal or shaded operation.",
      },
      {
        extractionId: extraction.id,
        ordinal: 1,
        kind: "limitation",
        text: "Yield Y assumed constant; in reality varies with growth rate and stress conditions.",
      },
    ]);

    console.log(
      `  done — project.id=${project.id} extraction.id=${extraction.id}`,
    );
  });
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
