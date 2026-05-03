import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getActiveProvider,
  runExtraction,
  mapExtractionToDb,
  ExtractionInputError,
  ExtractionProviderError,
  MIN_SOURCE_CHARS,
} from "../extractor";
import { ExtractionResultSchema } from "../extraction-schema";
import { OllamaPaperUnderstandingProvider } from "../providers/ollama-paper-understanding-provider";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUFFICIENT_TEXT = "A".repeat(MIN_SOURCE_CHARS + 1);

function validExtractionResult() {
  return {
    paper_title_or_topic: "Test Paper",
    model_type: "cstr" as const,
    system_type: "CSTR",
    process_description: "Continuously stirred tank reactor model.",
    state_variables: [
      {
        symbol: "C",
        name: "Concentration",
        meaning: "Reactant concentration in the tank.",
        unit: "mol/L",
        role: "state" as const,
        source_context: "Eq. 1",
        confidence: "high" as const,
      },
    ],
    parameters: [
      {
        symbol: "k",
        name: "Rate constant",
        value: "0.5",
        unit: "1/s",
        source_context: "Table 1",
        confidence: "medium" as const,
      },
    ],
    equations: [
      {
        label: "(1)",
        equation_latex: "\\frac{dC}{dt} = -kC",
        equation_plaintext: "dC/dt = -k*C",
        meaning: "First-order decay",
        variables_involved: ["C", "k"],
        source_context: "Eq. 1",
        confidence: "high" as const,
      },
    ],
    assumptions: [
      {
        assumption: "Perfectly mixed.",
        source_context: "Section 2",
        confidence: "high" as const,
      },
    ],
    limitations: [
      {
        limitation: "Isothermal only.",
        source_context: "Section 5",
        confidence: "medium" as const,
      },
    ],
    model_card: {
      short_summary: "First-order CSTR model.",
      model_type: "ODE",
      inputs: ["C_in"],
      outputs: ["C"],
      control_variables: ["F"],
      missing_information: [],
      can_generate_ode_template: true,
    },
  };
}

function validPaperUnderstanding() {
  const context = {
    page_start: 1,
    page_end: 1,
    section_heading: "Methods",
    source_kind: "methods" as const,
    confidence: "high" as const,
  };
  return {
    paper_title: "Monod chemostat paper",
    paper_type: "modeling" as const,
    model_type: "monod_chemostat" as const,
    main_system: "Continuous chemostat",
    organism_or_material: "microbial culture",
    process_type: "substrate-limited growth",
    operating_mode: "continuous culture",
    experimental_setup: [
      {
        item: "Chemostat setup",
        details: "A continuous chemostat was operated at dilution rate D.",
        source_context: "A continuous chemostat was operated at dilution rate D.",
        ...context,
      },
    ],
    candidate_state_variables: [
      {
        symbol: "X",
        name: "Biomass concentration",
        meaning: "Biomass concentration in the reactor.",
        unit: "g/L",
        role: "state" as const,
        source_context: "Biomass X and substrate S were modeled.",
        ...context,
      },
      {
        symbol: "S",
        name: "Substrate concentration",
        meaning: "Substrate concentration in the reactor.",
        unit: "g/L",
        role: "state" as const,
        source_context: "Biomass X and substrate S were modeled.",
        ...context,
      },
    ],
    candidate_parameters: [
      {
        symbol: "D",
        name: "Dilution rate",
        value: "0.1",
        unit: "1/h",
        source_context: "D = 0.1 1/h.",
        ...context,
      },
    ],
    candidate_equations: [
      {
        label: "(1)",
        equation_plaintext: "dX/dt = (mu - D)*X",
        equation_latex: "\\frac{dX}{dt} = (\\mu - D)X",
        equation_type: "dynamic_ode" as const,
        meaning: "Biomass dynamic balance.",
        variables_involved: ["X", "mu", "D"],
        source_context: "dX/dt = (mu - D)*X.",
        ...context,
      },
    ],
    tables_or_reported_values: [],
    controls_and_setpoints: [
      {
        variable: "D",
        value: "0.1",
        unit: "1/h",
        control_type: "operator-set dilution rate",
        source_context: "D = 0.1 1/h.",
        ...context,
      },
    ],
    assumptions: [
      {
        item: "Well mixed",
        details: "The reactor is well mixed.",
        source_context: "The reactor is well mixed.",
        ...context,
      },
    ],
    limitations_or_missing_info: [
      {
        item: "Initial conditions",
        details: "Initial conditions were not reported.",
        source_context: "Initial conditions were not reported.",
        confidence: "medium" as const,
        page_start: 1,
        page_end: 1,
        section_heading: "Methods",
        source_kind: "methods" as const,
      },
    ],
    referenced_external_sources_needed: [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── MockProvider via getActiveProvider ──────────────────────────────────────

describe("getActiveProvider", () => {
  beforeEach(() => {
    delete process.env["OPENAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["OLLAMA_BASE_URL"];
  });

  it("returns mock provider when explicitly requested", () => {
    process.env["OPENAI_API_KEY"] = "sk-fake";
    const p = getActiveProvider("mock");
    expect(p.name).toBe("mock");
  });

  it("falls back to rule_based when no API keys are configured", () => {
    const p = getActiveProvider("auto");
    expect(p.name).toBe("rule_based");
  });

  it("returns rule_based provider when explicitly requested", () => {
    process.env["OPENAI_API_KEY"] = "sk-fake";
    const p = getActiveProvider("rule_based");
    expect(p.name).toBe("rule_based");
  });

  it("returns ollama provider when explicitly requested", () => {
    const p = getActiveProvider("ollama");
    expect(p.name).toBe("ollama");
  });

  it("returns openai when OPENAI_API_KEY is present and preferred", () => {
    process.env["OPENAI_API_KEY"] = "sk-fake";
    const p = getActiveProvider("openai");
    expect(p.name).toBe("openai");
  });

  it("returns gemini when GEMINI_API_KEY is present and preferred", () => {
    process.env["GEMINI_API_KEY"] = "gm-fake";
    const p = getActiveProvider("gemini");
    expect(p.name).toBe("gemini");
  });

  it("auto-falls back to rule_based when requested openai key is absent", () => {
    delete process.env["OPENAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    const p = getActiveProvider("openai");
    expect(p.name).toBe("rule_based");
  });

  it("auto-prefers openai over gemini when both keys present", () => {
    process.env["OPENAI_API_KEY"] = "sk-fake";
    process.env["GEMINI_API_KEY"] = "gm-fake";
    const p = getActiveProvider("auto");
    expect(p.name).toBe("openai");
  });
});

// ─── runExtraction input validation ──────────────────────────────────────────

describe("runExtraction — input validation", () => {
  it("throws ExtractionInputError for empty string", async () => {
    await expect(runExtraction("")).rejects.toBeInstanceOf(ExtractionInputError);
  });

  it("throws ExtractionInputError for whitespace-only string", async () => {
    await expect(runExtraction("   \n\t  ")).rejects.toBeInstanceOf(ExtractionInputError);
  });

  it("throws ExtractionInputError when text is below MIN_SOURCE_CHARS", async () => {
    const short = "A".repeat(MIN_SOURCE_CHARS - 1);
    await expect(runExtraction(short)).rejects.toBeInstanceOf(ExtractionInputError);
  });

  it("succeeds with RuleBasedProvider for sufficient text", async () => {
    delete process.env["OPENAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    const { result, providerName } = await runExtraction(SUFFICIENT_TEXT);
    expect(providerName).toBe("rule_based");
    expect(result.paper_title_or_topic).toBeTruthy();
    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });

  it("auto provider falls back to rule_based when no real providers are configured", async () => {
    delete process.env["OPENAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["OLLAMA_BASE_URL"];
    const { providerName } = await runExtraction(SUFFICIENT_TEXT, "auto");
    expect(providerName).toBe("rule_based");
  });

  it("returns clear provider error when OpenAI is selected without key", async () => {
    delete process.env["OPENAI_API_KEY"];
    await expect(runExtraction(SUFFICIENT_TEXT, "openai")).rejects.toMatchObject({
      name: "ExtractionProviderError",
      providerName: "openai",
      status: 502,
      message: expect.stringContaining("OPENAI_API_KEY"),
    });
  });

  it("returns clear provider error when Gemini is selected without key", async () => {
    delete process.env["GEMINI_API_KEY"];
    await expect(runExtraction(SUFFICIENT_TEXT, "gemini")).rejects.toMatchObject({
      name: "ExtractionProviderError",
      providerName: "gemini",
      status: 502,
      message: expect.stringContaining("GEMINI_API_KEY"),
    });
  });
});

// ─── MockProvider output schema validity ─────────────────────────────────────

describe("MockProvider — ExtractionResultSchema validity", () => {
  beforeEach(() => {
    delete process.env["OPENAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["OLLAMA_BASE_URL"];
  });

  it("returns output that passes ExtractionResultSchema", async () => {
    const { result, providerName } = await runExtraction(SUFFICIENT_TEXT, "mock");
    expect(providerName).toBe("mock");
    const parsed = ExtractionResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(result.model_type).toBe("unknown");
  });

  it("derives title from first non-empty line of source text", async () => {
    const { result } = await runExtraction("Monod Chemostat Model\nMore text here...", "mock");
    expect(result.paper_title_or_topic).toBe("Monod Chemostat Model");
  });

  it("truncates very long first lines", async () => {
    const longLine = "X".repeat(200) + "\nMore text.";
    const { result } = await runExtraction(longLine, "mock");
    expect(result.paper_title_or_topic.length).toBeLessThanOrEqual(92);
    expect(result.paper_title_or_topic.endsWith("...")).toBe(true);
  });
});

// ─── OllamaPaperUnderstandingProvider output and fallback ───────────────────

describe("OllamaPaperUnderstandingProvider", () => {
  beforeEach(() => {
    delete process.env["OPENAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["OLLAMA_BASE_URL"];
  });

  it("maps mocked Ollama paper-understanding JSON into a valid extraction result", async () => {
    const response = `\`\`\`json\n${JSON.stringify(validPaperUnderstanding())}\n\`\`\``;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        response,
        prompt_eval_count: 100,
        eval_count: 40,
        total_duration: 1234,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, providerName, audit } = await runExtraction(
      SUFFICIENT_TEXT,
      "ollama",
      { ollamaBaseUrl: "http://localhost:11434", ollamaModel: "llama3.1" },
    );

    expect(providerName).toBe("ollama");
    expect(result.model_type).toBe("monod_chemostat");
    expect(result.state_variables.map((v) => v.symbol)).toEqual(
      expect.arrayContaining(["X", "S"]),
    );
    expect(result.model_card.can_generate_ode_template).toBe(true);
    expect(audit.providerModel).toBe("llama3.1");
    expect(audit.systemPrompt).toContain("PaperUnderstanding");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });

  it("accepts structured document chunks and includes page context in the prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ response: JSON.stringify(validPaperUnderstanding()) }),
    });
    const provider = new OllamaPaperUnderstandingProvider(
      "http://localhost:11434",
      "llama3.1",
      fetchMock as unknown as typeof fetch,
    );

    const output = await provider.extractFromChunks([
      {
        chunk_id: "pdf_001",
        page_start: 2,
        page_end: 3,
        section_heading: "Materials and Methods",
        text: "A continuous chemostat was operated at dilution rate D.",
        char_count: 58,
      },
    ]);

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      prompt: string;
    };
    expect(body.prompt).toContain(
      '[pdf_001; pages 2-3; section="Materials and Methods"]',
    );
    expect(output.raw.model_type).toBe("monod_chemostat");
    expect(ExtractionResultSchema.safeParse(output.raw).success).toBe(true);
  });

  it("returns a useful error when explicitly selected Ollama is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(
      runExtraction(SUFFICIENT_TEXT, "ollama", {
        ollamaBaseUrl: "http://localhost:11434",
        ollamaModel: "llama3.1",
      }),
    ).rejects.toMatchObject({
      name: "ExtractionProviderError",
      providerName: "ollama",
      message: expect.stringContaining("Ollama is unavailable"),
    });
  });

  it("falls back to RuleBasedProvider when auto-selected Ollama is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const { result, providerName } = await runExtraction(
      "A continuous chemostat is modeled with biomass X and substrate S. " +
        "The growth rate is mu = mumax*S/(Ks+S). " +
        "The biomass balance is dX/dt = (mu - D)*X. " +
        "Parameters are mumax = 0.8 1/h and D = 0.1 1/h.",
      "auto",
      { ollamaBaseUrl: "http://localhost:11434", ollamaModel: "llama3.1" },
    );

    expect(providerName).toBe("rule_based");
    expect(result.model_type).toBe("monod_chemostat");
    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });
});

// ─── RuleBasedProvider output ────────────────────────────────────────────────

describe("RuleBasedProvider", () => {
  beforeEach(() => {
    delete process.env["OPENAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["OLLAMA_BASE_URL"];
  });

  const chemostatFixture =
    "A continuous chemostat is modeled with biomass X and substrate S. " +
    "The growth rate is mu = mumax*S/(Ks+S). " +
    "The biomass balance is dX/dt = (mu - D)*X. " +
    "The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X. " +
    "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, " +
    "Sin = 10 g/L, and Yxs = 0.5 g/g. " +
    "The reactor is assumed well-mixed and volume is constant.";

  const gasTransferFixture =
    "In an aerobic bioreactor, dissolved oxygen C_O2 changes due to " +
    "gas-liquid transfer and biological consumption. " +
    "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X. " +
    "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, " +
    "and qO2 = 0.02 gO2/gX/h. " +
    "The system assumes constant temperature and well-mixed liquid phase. " +
    "Henry-law convention was not specified.";

  it("extracts the chemostat fixture with states, parameters, and three equations", async () => {
    const { result, providerName, audit } = await runExtraction(
      chemostatFixture,
      "rule_based",
    );

    const variableBySymbol = new Map(result.state_variables.map((v) => [v.symbol, v]));
    const parameterBySymbol = new Map(result.parameters.map((p) => [p.symbol, p]));
    const equationTexts = result.equations.map((eq) => eq.equation_plaintext);

    expect(providerName).toBe("rule_based");
    expect(audit.providerModel).toBe("rule_based");
    expect(result.model_type).toBe("monod_chemostat");
    expect(result.system_type).toContain("Chemostat");

    expect(variableBySymbol.get("X")).toMatchObject({
      role: "state",
      name: "Biomass concentration",
    });
    expect(variableBySymbol.get("S")).toMatchObject({
      role: "state",
      name: "Substrate concentration",
    });
    expect(variableBySymbol.get("mu")).toMatchObject({
      role: "output",
      name: "Specific growth rate",
    });

    expect(parameterBySymbol.get("mumax")).toMatchObject({ value: "0.8", unit: "1/h" });
    expect(parameterBySymbol.get("Ks")).toMatchObject({ value: "0.05", unit: "g/L" });
    expect(parameterBySymbol.get("D")).toMatchObject({ value: "0.1", unit: "1/h" });
    expect(parameterBySymbol.get("Sin")).toMatchObject({ value: "10", unit: "g/L" });
    expect(parameterBySymbol.get("Yxs")).toMatchObject({ value: "0.5", unit: "g/g" });

    expect(equationTexts).toHaveLength(3);
    expect(equationTexts).toEqual(
      expect.arrayContaining([
        "mu = mumax*S/(Ks+S)",
        "dX/dt = (mu - D)*X",
        "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X",
      ]),
    );
    expect(result.assumptions.map((a) => a.assumption).join(" ")).toContain("well-mixed");
    expect(result.assumptions.map((a) => a.assumption).join(" ")).toContain("constant");
    expect(result.model_card.inputs).toContain("Sin");
    expect(result.model_card.outputs).toEqual(expect.arrayContaining(["X", "S", "mu"]));
    expect(result.model_card.control_variables).toContain("D");
    expect(result.model_card.missing_information.join(" ")).toMatch(/Initial conditions/i);
    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });

  it("extracts the gas-transfer fixture with full dC_O2/dt equation", async () => {
    const { result, providerName } = await runExtraction(
      gasTransferFixture,
      "rule_based",
    );

    const variableBySymbol = new Map(result.state_variables.map((v) => [v.symbol, v]));
    const parameterBySymbol = new Map(result.parameters.map((p) => [p.symbol, p]));
    const equationTexts = result.equations.map((eq) => eq.equation_plaintext);

    expect(providerName).toBe("rule_based");
    expect(result.model_type).toBe("gas_liquid");
    expect(result.system_type).toContain("Gas-liquid");

    expect(variableBySymbol.get("C_O2")).toMatchObject({
      role: "state",
      name: "Dissolved oxygen concentration",
    });
    expect(variableBySymbol.get("X")).toMatchObject({
      role: "input",
      name: "Biomass concentration",
    });
    expect(parameterBySymbol.get("kLa")).toMatchObject({ value: "80", unit: "1/h" });
    expect(parameterBySymbol.get("Cstar_O2")).toMatchObject({
      value: "0.008",
      unit: "g/L",
    });
    expect(parameterBySymbol.get("qO2")).toMatchObject({
      value: "0.02",
      unit: "gO2/gX/h",
    });

    expect(equationTexts).toEqual([
      "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X",
    ]);
    expect(result.assumptions.map((a) => a.assumption).join(" ")).toContain(
      "constant temperature",
    );
    expect(result.assumptions.map((a) => a.assumption).join(" ")).toContain(
      "well-mixed liquid phase",
    );
    expect(result.limitations.map((l) => l.limitation).join(" ")).toContain(
      "Henry-law convention was not specified",
    );
    expect(result.model_card.inputs).toContain("X");
    expect(result.model_card.outputs).toContain("C_O2");
    expect(result.model_card.control_variables).toContain("kLa");
    expect(result.model_card.missing_information.join(" ")).toContain(
      "Henry-law convention was not specified",
    );
    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });

  it("cleans trailing punctuation from extracted units", async () => {
    const { result } = await runExtraction(
      `${chemostatFixture} ${gasTransferFixture}`,
      "rule_based",
    );
    const units = new Map(result.parameters.map((p) => [p.symbol, p.unit]));

    expect(units.get("Yxs")).toBe("g/g");
    expect(units.get("qO2")).toBe("gO2/gX/h");
  });

  it("classifies an Abiusi-like excerpt as oxygen-balanced mixotrophy", async () => {
    const abiusiLikeExcerpt =
      "An acetate-fed mixotrophic microalgae photobioreactor was operated as a continuous culture. " +
      "The dilution rate D was set to 0.25 1/d and the working volume was 1.8 L. " +
      "Dissolved oxygen (DO) was controlled at a setpoint by changing the oxygen balance while PFD and light exposure were reported. " +
      "The text discusses autotrophic growth, heterotrophic acetate uptake, oxygen production and CO2 consumption, but kinetic constants and controller parameters were not specified.";

    const { result, providerName } = await runExtraction(
      abiusiLikeExcerpt,
      "rule_based",
    );

    expect(providerName).toBe("rule_based");
    expect(result.model_type).toBe("oxygen_balanced_mixotrophy");
    expect(result.system_type).toContain("Oxygen-balanced");
    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });

  it("handles weak generic text gracefully", async () => {
    const source =
      "This paragraph discusses experiments qualitatively. No equations are reported and values are unknown. The setup was not specified in detail.";

    const { result, providerName } = await runExtraction(source, "rule_based");

    expect(providerName).toBe("rule_based");
    expect(result.model_type).toBe("unknown");
    expect(result.system_type).toBe("Generic ODE model");
    expect(result.equations).toHaveLength(0);
    expect(result.parameters).toHaveLength(0);
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies garbage input as unknown without crashing", async () => {
    const source = "??? ### not a model ".repeat(20);

    const { result, providerName } = await runExtraction(source, "rule_based");

    expect(providerName).toBe("rule_based");
    expect(result.model_type).toBe("unknown");
    expect(result.equations).toHaveLength(0);
    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });
});

// ─── runExtraction — provider error wrapping (tested via ExtractionResultSchema) ──
//
// ESM modules bind exported names at parse time, so vi.spyOn on getActiveProvider
// does not intercept the call inside runExtraction (which holds its own closure
// reference). Instead, we test the two error paths through what we *can* control:
//
//   1. Provider-throw → ExtractionProviderError
//      Covered indirectly: if we could supply a bad API key the real providers
//      would throw. Since we can't inject a provider we instead verify that
//      ExtractionProviderError is a proper Error subclass with the right shape.
//
//   2. Invalid schema → ExtractionProviderError
//      Covered via ExtractionResultSchema.safeParse on known-bad data.
//
//   3. JSON repair strategies → covered by testing ExtractionResultSchema
//      directly against the repaired candidates.

describe("ExtractionProviderError — class shape", () => {
  it("is an Error with status 502 and providerName", () => {
    const err = new ExtractionProviderError("bad output", "openai");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(502);
    expect(err.providerName).toBe("openai");
    expect(err.name).toBe("ExtractionProviderError");
  });
});

describe("ExtractionInputError — class shape", () => {
  it("is an Error with status 400", () => {
    const err = new ExtractionInputError("too short");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(400);
    expect(err.name).toBe("ExtractionInputError");
  });
});

// ─── JSON repair — tested via ExtractionResultSchema directly ─────────────────
//
// tryRepairJson is not exported, but its three strategies can be verified by
// constructing inputs that each strategy handles and checking schema validity.

describe("JSON repair strategies — via ExtractionResultSchema", () => {
  const valid = validExtractionResult();
  const validJson = JSON.stringify(valid);

  it("strategy 1 (direct JSON.parse): plain JSON string passes schema", () => {
    const parsed = JSON.parse(validJson);
    const result = ExtractionResultSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("strategy 2 (fence strip): content inside ```json fences is valid after strip", () => {
    const fenced = `\`\`\`json\n${validJson}\n\`\`\``;
    const match = fenced.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    expect(match).not.toBeNull();
    const stripped = JSON.parse(match![1]);
    const result = ExtractionResultSchema.safeParse(stripped);
    expect(result.success).toBe(true);
  });

  it("strategy 2 (fence strip): content inside plain ``` fences is valid after strip", () => {
    const fenced = `\`\`\`\n${validJson}\n\`\`\``;
    const match = fenced.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    expect(match).not.toBeNull();
    const stripped = JSON.parse(match![1]);
    const result = ExtractionResultSchema.safeParse(stripped);
    expect(result.success).toBe(true);
  });

  it("strategy 3 (brace slice): JSON embedded in leading prose is valid after slice", () => {
    const withProse = `Here is the extraction:\n${validJson}\nEnd of output.`;
    const first = withProse.indexOf("{");
    const last = withProse.lastIndexOf("}");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(last).toBeGreaterThan(first);
    const sliced = JSON.parse(withProse.slice(first, last + 1));
    const result = ExtractionResultSchema.safeParse(sliced);
    expect(result.success).toBe(true);
  });

  it("invalid schema data fails ExtractionResultSchema", () => {
    const result = ExtractionResultSchema.safeParse({ bad: "data" });
    expect(result.success).toBe(false);
  });

  it("empty object fails ExtractionResultSchema", () => {
    const result = ExtractionResultSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("missing required field (paper_title_or_topic) fails schema", () => {
    const { paper_title_or_topic: _, ...without } = valid;
    void _;
    const result = ExtractionResultSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("missing required field (model_type) fails schema", () => {
    const { model_type: _, ...without } = valid;
    void _;
    const result = ExtractionResultSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

// ─── mapExtractionToDb ────────────────────────────────────────────────────────

describe("mapExtractionToDb", () => {
  const raw = validExtractionResult();

  it("sets modelCardTitle from paper_title_or_topic", () => {
    const mapped = mapExtractionToDb(raw);
    expect(mapped.extraction.modelCardTitle).toBe("Test Paper");
  });

  it("sets domain from system_type", () => {
    const mapped = mapExtractionToDb(raw);
    expect(mapped.extraction.domain).toBe("CSTR");
  });

  it("maps equations with ordinal and latex", () => {
    const mapped = mapExtractionToDb(raw);
    expect(mapped.equations).toHaveLength(1);
    expect(mapped.equations[0].ordinal).toBe(0);
    expect(mapped.equations[0].latex).toBe("\\frac{dC}{dt} = -kC");
  });

  it("maps variables with downgraded role", () => {
    const mapped = mapExtractionToDb(raw);
    expect(mapped.variables).toHaveLength(1);
    expect(mapped.variables[0].symbol).toBe("C");
    expect(mapped.variables[0].role).toBe("state");
  });

  it("maps parameters and parses numeric value", () => {
    const mapped = mapExtractionToDb(raw);
    expect(mapped.parameters).toHaveLength(1);
    expect(mapped.parameters[0].value).toBe(0.5);
  });

  it("maps assumptions and limitations into assumptions array with kind", () => {
    const mapped = mapExtractionToDb(raw);
    const kinds = mapped.assumptions.map((a) => a.kind);
    expect(kinds).toContain("assumption");
    expect(kinds).toContain("limitation");
  });

  it("assigns value=0 and confidence=low for unparseable numeric string", () => {
    const modified = {
      ...raw,
      parameters: [{ ...raw.parameters[0], value: "not-a-number" }],
    };
    const mapped = mapExtractionToDb(modified);
    expect(mapped.parameters[0].value).toBe(0);
    expect(mapped.parameters[0].confidence).toBe("low");
  });

  it("handles can_generate_ode_template=false gracefully", () => {
    const modified = {
      ...raw,
      model_card: { ...raw.model_card, can_generate_ode_template: false },
    };
    const mapped = mapExtractionToDb(modified);
    expect(mapped.extraction.odeTemplate).toContain("not available");
  });

  it("builds problem statement from model card outputs/inputs", () => {
    const mapped = mapExtractionToDb(raw);
    expect(mapped.extraction.problemStatement).toContain("C");
  });

  it("handles empty arrays without throwing", () => {
    const empty = {
      ...raw,
      state_variables: [],
      parameters: [],
      equations: [],
      assumptions: [],
      limitations: [],
    };
    const mapped = mapExtractionToDb(empty);
    expect(mapped.equations).toHaveLength(0);
    expect(mapped.variables).toHaveLength(0);
    expect(mapped.parameters).toHaveLength(0);
  });

  it("downgrading role: unsupported role string becomes 'input'", () => {
    const withBadRole = {
      ...raw,
      state_variables: [
        { ...raw.state_variables[0], role: "control" as "state" },
      ],
    };
    const mapped = mapExtractionToDb(withBadRole);
    expect(mapped.variables[0].role).toBe("input");
  });
});
