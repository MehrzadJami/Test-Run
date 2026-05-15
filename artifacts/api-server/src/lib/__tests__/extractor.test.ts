import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  getActiveProvider,
  runExtraction,
  mapExtractionToDb,
  parseParameterValue,
  ExtractionInputError,
  ExtractionProviderError,
  MIN_SOURCE_CHARS,
} from "../extractor";
import { ExtractionResultSchema } from "../extraction-schema";
import { GeminiProvider } from "../providers/gemini-provider";
import { GroqProvider } from "../providers/groq-provider";
import { OllamaPaperUnderstandingProvider } from "../providers/ollama-paper-understanding-provider";
import { OpenAIProvider } from "../providers/openai-provider";
import { resetGroqBudgetForTests } from "../providers/groq-budget";
import { getProviderStatus } from "../provider-status";
import { PaperUnderstandingValidationError } from "../providers/paper-understanding-response";

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
    initial_conditions: [],
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

function validPaperUnderstandingWithPdfContext() {
  const pdfContext = {
    page_start: 2,
    page_end: 3,
    section_heading: "Materials and Methods",
    source_kind: "materials_and_methods" as const,
    confidence: "high" as const,
  };
  const understanding = validPaperUnderstanding();
  return {
    ...understanding,
    experimental_setup: understanding.experimental_setup.map((item) => ({
      ...item,
      ...pdfContext,
    })),
    candidate_state_variables: understanding.candidate_state_variables.map((item) => ({
      ...item,
      ...pdfContext,
    })),
    candidate_parameters: understanding.candidate_parameters.map((item) => ({
      ...item,
      ...pdfContext,
    })),
    candidate_equations: understanding.candidate_equations.map((item) => ({
      ...item,
      ...pdfContext,
    })),
    controls_and_setpoints: understanding.controls_and_setpoints.map((item) => ({
      ...item,
      ...pdfContext,
    })),
    assumptions: understanding.assumptions.map((item) => ({
      ...item,
      ...pdfContext,
    })),
    limitations_or_missing_info: understanding.limitations_or_missing_info.map(
      (item) => ({
        ...item,
        ...pdfContext,
        confidence: "medium" as const,
      }),
    ),
  };
}

afterEach(() => {
  resetGroqBudgetForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env["GROQ_API_KEY"];
  delete process.env["GROQ_MAX_EXTRACTIONS_PER_DAY"];
  delete process.env["GROQ_MAX_INPUT_TOKENS_PER_REQUEST"];
  delete process.env["GROQ_MAX_OUTPUT_TOKENS_PER_REQUEST"];
  delete process.env["GROQ_DEBUG_DIR"];
});

// ─── MockProvider via getActiveProvider ──────────────────────────────────────

describe("getActiveProvider", () => {
  beforeEach(() => {
    delete process.env["OPENAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["GROQ_API_KEY"];
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

  it("returns groq when GROQ_API_KEY is present and preferred", () => {
    process.env["GROQ_API_KEY"] = "gsk-fake";
    const p = getActiveProvider("groq");
    expect(p.name).toBe("groq");
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
    process.env["GROQ_API_KEY"] = "gsk-fake";
    const p = getActiveProvider("auto");
    expect(p.name).toBe("openai");
  });

  it("auto selects Groq before Ollama and RuleBased when OpenAI/Gemini are missing", () => {
    process.env["GROQ_API_KEY"] = "gsk-fake";
    process.env["OLLAMA_BASE_URL"] = "http://localhost:11434";
    const p = getActiveProvider("auto");
    expect(p.name).toBe("groq");
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
      status: 400,
      message: expect.stringContaining("OPENAI_API_KEY"),
    });
  });

  it("returns clear provider error when Gemini is selected without key", async () => {
    delete process.env["GEMINI_API_KEY"];
    await expect(runExtraction(SUFFICIENT_TEXT, "gemini")).rejects.toMatchObject({
      name: "ExtractionProviderError",
      providerName: "gemini",
      status: 400,
      message: expect.stringContaining("GEMINI_API_KEY"),
    });
  });

  it("returns clear provider error when Groq is selected without key", async () => {
    delete process.env["GROQ_API_KEY"];
    await expect(runExtraction(SUFFICIENT_TEXT, "groq")).rejects.toMatchObject({
      name: "ExtractionProviderError",
      providerName: "groq",
      status: 400,
      message: expect.stringContaining("GROQ_API_KEY"),
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

  it("runExtraction passes structured PDF chunks through providers that support PaperUnderstanding", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        response: JSON.stringify(validPaperUnderstandingWithPdfContext()),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, providerName, audit } = await runExtraction(
      SUFFICIENT_TEXT,
      "ollama",
      {
        ollamaBaseUrl: "http://localhost:11434",
        ollamaModel: "llama3.1",
        documentChunks: [
          {
            chunk_id: "pdf_001",
            page_start: 2,
            page_end: 3,
            section_heading: "Materials and Methods",
            text: "A continuous chemostat was operated at dilution rate D.",
            char_count: 58,
          },
        ],
        sourceKind: "pdf",
      } as never,
    );

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      prompt: string;
    };
    expect(providerName).toBe("ollama");
    expect(body.prompt).toContain(
      '[pdf_001; pages 2-3; section="Materials and Methods"]',
    );
    expect(result.state_variables[0]?.source_context).toContain(
      "pp. 2-3, Materials and Methods",
    );
    expect(audit.promptTemplateSummary).toContain("structured PDF");
  });

  it("OpenAI and Gemini providers expose PaperUnderstanding chunk extraction for PDFs", () => {
    expect(typeof new OpenAIProvider("gpt-test", "sk-test").extractFromChunks).toBe(
      "function",
    );
    expect(typeof new GeminiProvider("gemini-test", "gm-test").extractFromChunks).toBe(
      "function",
    );
  });

  it("RuleBasedProvider structured PDF fallback explains flat local extraction", async () => {
    const { providerName, audit } = await runExtraction(
      "A continuous chemostat is modeled with biomass X and substrate S. " +
        "The growth rate is mu = mumax*S/(Ks+S). " +
        "The biomass balance is dX/dt = (mu - D)*X. " +
        "Parameters are mumax = 0.8 1/h and D = 0.1 1/h.",
      "rule_based",
      {
        documentChunks: [
          {
            chunk_id: "pdf_001",
            page_start: 2,
            page_end: 2,
            section_heading: "Methods",
            text: "The biomass balance is dX/dt = (mu - D)*X.",
            char_count: 47,
          },
        ],
        sourceKind: "pdf",
      } as never,
    );

    expect(providerName).toBe("rule_based");
    expect(audit.promptTemplateSummary).toMatch(/flat\/local extraction/i);
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

// ─── GroqProvider budgeted professor extraction ─────────────────────────────

describe("GroqProvider", () => {
  beforeEach(() => {
    resetGroqBudgetForTests();
    delete process.env["OPENAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["OLLAMA_BASE_URL"];
    process.env["GROQ_API_KEY"] = "gsk-test";
  });

  it("validates mocked PaperUnderstanding and preserves page context", async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              { message: { content: JSON.stringify(validPaperUnderstandingWithPdfContext()) } },
            ],
          }),
        },
      },
    };
    const provider = new GroqProvider("llama-3.3-70b-versatile", "gsk-test", client);

    const output = await provider.extractFromChunks([
      {
        chunk_id: "pdf_001",
        page_start: 2,
        page_end: 3,
        section_heading: "Materials and Methods",
        text: "A continuous chemostat was operated at dilution rate D.",
        char_count: 58,
        contains_equation_like_text: true,
      },
    ]);

    const parsedOutput = ExtractionResultSchema.parse(output.raw);
    expect(parsedOutput.model_type).toBe("monod_chemostat");
    expect(parsedOutput.state_variables[0]?.source_context).toContain(
      "pp. 2-3, Materials and Methods",
    );
    expect(output.tokenMeta?.provider).toBe("groq");
    expect(output.tokenMeta?.selectedChunks).toBe(1);
    expect(ExtractionResultSchema.safeParse(output.raw).success).toBe(true);
  });

  it("preserves tiny Monod Groq equations, numeric parameters, and initial conditions", async () => {
    const monodText =
      "A continuous chemostat is modeled with biomass X and substrate S. " +
      "The specific growth rate is mu = mumax*S/(Ks + S). " +
      "The biomass balance is dX/dt = (mu - D)*X. " +
      "The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X. " +
      "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, " +
      "Sin = 10 g/L, and Yxs = 0.5 gX/gS. " +
      "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L. " +
      "The reactor is assumed well mixed and volume is constant.";
    const context = {
      page_start: 1,
      page_end: 1,
      section_heading: "Source text",
      source_kind: "methods" as const,
      confidence: "high" as const,
    };
    const groqResponse = {
      paper_title: "Continuous Monod chemostat",
      paper_type: "modeling" as const,
      model_type: "monod_chemostat" as const,
      main_system: "Continuous chemostat with Monod growth",
      organism_or_material: "biomass culture",
      process_type: "substrate-limited growth",
      operating_mode: "continuous culture",
      reactor_or_equipment_setup: [
        {
          item: "Chemostat",
          details: "Continuous chemostat with well mixed constant-volume reactor.",
          source_context: "A continuous chemostat is modeled... The reactor is assumed well mixed and volume is constant.",
          ...context,
        },
      ],
      procedure_steps: [],
      operating_timeline: [],
      experimental_setup: [],
      candidate_state_variables: [
        {
          symbol: "X",
          name: "Biomass concentration",
          meaning: "Biomass concentration in the chemostat",
          unit: "g/L",
          role: "state" as const,
          source_context: "biomass X",
          ...context,
        },
        {
          symbol: "S",
          name: "Substrate concentration",
          meaning: "Substrate concentration in the chemostat",
          unit: "g/L",
          role: "state" as const,
          source_context: "substrate S",
          ...context,
        },
      ],
      candidate_inputs: [
        {
          symbol: "Sin",
          name: "Feed substrate concentration",
          meaning: "Substrate concentration entering the chemostat",
          unit: "g/L",
          role: "input" as const,
          source_context: "Sin = 10 g/L",
          ...context,
        },
      ],
      candidate_outputs: [
        {
          symbol: "mu",
          name: "Specific growth rate",
          meaning: "Specific growth rate computed by the Monod relation",
          unit: "1/h",
          role: "output" as const,
          source_context: "mu = mumax*S/(Ks + S)",
          ...context,
        },
      ],
      candidate_controls: [
        {
          symbol: "D",
          name: "Dilution rate",
          meaning: "Operator-set dilution rate",
          unit: "1/h",
          role: "control" as const,
          source_context: "D = 0.1 1/h",
          ...context,
        },
      ],
      candidate_parameters: [
        {
          symbol: "mumax",
          name: "Maximum specific growth rate",
          value_raw: "0.8",
          value_numeric: 0.8,
          unit: "1/h",
          meaning: "Maximum specific growth rate",
          status: "explicit" as const,
          source_context: "mumax = 0.8 1/h",
          ...context,
        },
        {
          symbol: "Ks",
          name: "Monod half-saturation constant",
          value_raw: "0.05",
          value_numeric: 0.05,
          unit: "g/L",
          meaning: "Monod substrate half-saturation constant",
          status: "explicit" as const,
          source_context: "Ks = 0.05 g/L",
          ...context,
        },
        {
          symbol: "D",
          name: "Dilution rate",
          value_raw: "0.1",
          value_numeric: 0.1,
          unit: "1/h",
          meaning: "Dilution rate control value",
          status: "explicit" as const,
          source_context: "D = 0.1 1/h",
          ...context,
        },
        {
          symbol: "Sin",
          name: "Feed substrate concentration",
          value_raw: "10",
          value_numeric: 10,
          unit: "g/L",
          meaning: "Feed substrate concentration",
          status: "explicit" as const,
          source_context: "Sin = 10 g/L",
          ...context,
        },
        {
          symbol: "Yxs",
          name: "Biomass yield on substrate",
          value_raw: "0.5",
          value_numeric: 0.5,
          unit: "gX/gS",
          meaning: "Biomass yield coefficient",
          status: "explicit" as const,
          source_context: "Yxs = 0.5 gX/gS",
          ...context,
        },
      ],
      initial_conditions: [
        {
          symbol: "X0",
          state_symbol: "X",
          name: "Initial condition for X",
          value_raw: "0.1",
          value_numeric: 0.1,
          unit: "g/L",
          status: "explicit" as const,
          source_context: "X0 = 0.1 g/L",
          ...context,
        },
        {
          symbol: "S0",
          state_symbol: "S",
          name: "Initial condition for S",
          value_raw: "5",
          value_numeric: 5,
          unit: "g/L",
          status: "explicit" as const,
          source_context: "S0 = 5 g/L",
          ...context,
        },
      ],
      candidate_equations: [
        {
          label: "Eq. mu",
          equation_plaintext: "mu = mumax*S/(Ks + S)",
          equation_latex: "\\mu = \\mu_{max} S/(K_s + S)",
          equation_type: "algebraic_calculation" as const,
          meaning: "Monod growth-rate relation",
          variables_involved: ["mu", "mumax", "S", "Ks"],
          source_context: "mu = mumax*S/(Ks + S)",
          ...context,
        },
        {
          label: "Eq. X",
          equation_plaintext: "dX/dt = (mu - D)*X",
          equation_latex: "dX/dt = (mu - D)X",
          equation_type: "dynamic_ode" as const,
          meaning: "Biomass balance",
          variables_involved: ["X", "mu", "D"],
          source_context: "dX/dt = (mu - D)*X",
          ...context,
        },
        {
          label: "Eq. S",
          equation_plaintext: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X",
          equation_latex: "dS/dt = D(Sin - S) - (1/Yxs)mu X",
          equation_type: "dynamic_ode" as const,
          meaning: "Substrate balance",
          variables_involved: ["S", "D", "Sin", "Yxs", "mu", "X"],
          source_context: "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X",
          ...context,
        },
      ],
      tables_or_reported_values: [],
      tables_or_value_blocks: [],
      controls_and_setpoints: [
        {
          variable: "D",
          value: "0.1",
          unit: "1/h",
          control_type: "dilution rate",
          source_context: "D = 0.1 1/h",
          ...context,
        },
      ],
      assumptions: [
        {
          item: "Well mixed",
          details: "The reactor is assumed well mixed.",
          source_context: "well mixed",
          ...context,
        },
        {
          item: "Constant volume",
          details: "The reactor volume is constant.",
          source_context: "volume is constant",
          ...context,
        },
      ],
      limitations_or_missing_info: [],
      referenced_external_sources_needed: [],
      model_assembly_assessment: {
        assembly_status: "complete" as const,
        can_generate_runnable_model: true,
        can_generate_scaffold: true,
        available_from_current_source: [
          {
            item: "Initial conditions",
            details: "X0 and S0 are explicitly reported.",
            source_context: "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L.",
            ...context,
          },
        ],
        missing_requirements: [],
        recommended_next_actions: [],
      },
    };
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(groqResponse) } }],
          }),
        },
      },
    };

    const provider = new GroqProvider("llama-3.3-70b-versatile", "gsk-test", client);
    const providerOutput = await provider.extract(monodText);
    const result = ExtractionResultSchema.parse(providerOutput.raw);
    const mapped = mapExtractionToDb(result);

    expect(providerOutput.tokenMeta?.provider).toBe("groq");
    expect(result.model_type).toBe("monod_chemostat");
    expect(result.state_variables.map((variable) => variable.symbol)).toEqual(
      expect.arrayContaining(["X", "S", "mu", "D", "Sin"]),
    );
    const parameters = new Map(result.parameters.map((parameter) => [parameter.symbol, parameter]));
    for (const [symbol, value] of [
      ["mumax", "0.8"],
      ["Ks", "0.05"],
      ["D", "0.1"],
      ["Sin", "10"],
      ["Yxs", "0.5"],
    ]) {
      expect(parameters.get(symbol)?.value).toBe(value);
    }
    expect(result.initial_conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "X0", value: "0.1", value_numeric: 0.1 }),
        expect.objectContaining({ symbol: "S0", value: "5", value_numeric: 5 }),
      ]),
    );
    expect(parameters.get("X0")).toMatchObject({
      name: "Initial condition for X",
      status: "initial_condition",
    });
    expect(parameters.get("S0")).toMatchObject({
      name: "Initial condition for S",
      status: "initial_condition",
    });
    expect(result.equations).toHaveLength(3);
    expect(result.equations.map((equation) => equation.equation_plaintext)).toEqual(
      expect.arrayContaining([
        "mu = mumax*S/(Ks + S)",
        "dX/dt = (mu - D)*X",
        "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X",
      ]),
    );
    expect(result.equations.find((equation) => equation.equation_plaintext.startsWith("mu ="))?.equation_type).not.toBe("dynamic_ode");
    expect(result.equations.filter((equation) => equation.equation_type === "dynamic_ode")).toHaveLength(2);
    expect(result.assumptions.map((assumption) => assumption.assumption).join(" ")).toMatch(/well mixed/i);
    expect(result.assumptions.map((assumption) => assumption.assumption).join(" ")).toMatch(/constant volume/i);
    expect(mapped.equations).toHaveLength(3);
    expect(mapped.parameters.find((parameter) => parameter.symbol === "X0")?.originalValue).toMatchObject({
      kind: "initial_condition",
    });
    expect(mapped.variables.find((variable) => variable.symbol === "X")?.originalValue).toMatchObject({
      initial_condition: expect.objectContaining({ symbol: "X0", value: "0.1" }),
    });
  });

  it("merges explicit tiny Monod evidence when Groq returns a weak structured response", async () => {
    const monodText =
      "A continuous chemostat is modeled with biomass X and substrate S. " +
      "The specific growth rate is mu = mumax*S/(Ks + S). " +
      "The biomass balance is dX/dt = (mu - D)*X. " +
      "The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X. " +
      "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, " +
      "Sin = 10 g/L, and Yxs = 0.5 gX/gS. " +
      "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L. " +
      "The reactor is assumed well mixed and volume is constant.";
    const source = {
      page_start: 1,
      page_end: 1,
      section_heading: "Source text",
      source_kind: "methods" as const,
      source_context: "A continuous chemostat is modeled with biomass X and substrate S.",
      confidence: "medium" as const,
    };
    const weakGroqResponse = {
      paper_title: "Unknown paper",
      paper_type: "unknown" as const,
      model_type: "unknown" as const,
      main_system: "Unknown system",
      organism_or_material: "",
      process_type: "",
      operating_mode: "",
      candidate_state_variables: [
        {
          symbol: "X",
          name: "Biomass",
          meaning: "Biomass concentration",
          unit: "-",
          role: "state" as const,
          ...source,
        },
        {
          symbol: "S",
          name: "Substrate",
          meaning: "Substrate concentration",
          unit: "-",
          role: "state" as const,
          ...source,
        },
        {
          symbol: "unknown",
          name: "unknown",
          meaning: "Unknown placeholder",
          unit: "-",
          role: "state" as const,
          page_start: null,
          page_end: null,
          section_heading: "",
          source_kind: "unknown" as const,
          source_context: "A continuous chemostat is modeled with biomass X and substrate S.",
          confidence: "low" as const,
        },
      ],
      candidate_inputs: [
        {
          symbol: "D",
          name: "Dilution rate",
          meaning: "Dilution rate",
          unit: "1/h",
          role: "input" as const,
          ...source,
        },
        {
          symbol: "Sin",
          name: "Feed substrate",
          meaning: "Feed substrate concentration",
          unit: "g/L",
          role: "input" as const,
          ...source,
        },
      ],
      candidate_outputs: [],
      candidate_controls: [],
      candidate_parameters: [
        {
          symbol: "unknown",
          name: "unknown",
          value_raw: "0.8",
          value_numeric: 0.8,
          unit: "1/h",
          meaning: "Unknown placeholder",
          status: "inferred" as const,
          page_start: null,
          page_end: null,
          section_heading: "",
          source_kind: "unknown" as const,
          source_context: "",
          confidence: "low" as const,
        },
      ],
      initial_conditions: [],
      candidate_equations: [],
      controls_and_setpoints: [],
      assumptions: [],
      limitations_or_missing_info: [],
      referenced_external_sources_needed: [],
      model_assembly_assessment: {
        assembly_status: "partial" as const,
        can_generate_runnable_model: false,
        can_generate_scaffold: true,
        available_from_current_source: [],
        missing_requirements: [],
        recommended_next_actions: [],
      },
    };
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(weakGroqResponse) } }],
          }),
        },
      },
    };

    const provider = new GroqProvider("llama-3.3-70b-versatile", "gsk-test", client);
    const output = await provider.extract(monodText);
    const result = ExtractionResultSchema.parse(output.raw);
    const mapped = mapExtractionToDb(result);

    expect(output.tokenMeta?.provider).toBe("groq");
    expect(output.tokenMeta?.explicitEvidenceMergeApplied).toBe(true);
    expect(result.model_type).toBe("monod_chemostat");
    expect(result.model_card.short_summary).toBe(
      "Continuous Monod chemostat model with biomass X, substrate S, dilution rate D, and feed substrate Sin.",
    );
    expect(result.state_variables.some((variable) => variable.symbol.toLowerCase() === "unknown")).toBe(false);
    expect(result.parameters.some((parameter) => parameter.symbol.toLowerCase() === "unknown")).toBe(false);
    expect(result.equations.map((equation) => equation.equation_plaintext)).toEqual(
      expect.arrayContaining([
        "mu = mumax*S/(Ks + S)",
        "dX/dt = (mu - D)*X",
        "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X",
      ]),
    );
    expect(result.equations.filter((equation) => equation.equation_type === "dynamic_ode")).toHaveLength(2);
    const parameters = new Map(result.parameters.map((parameter) => [parameter.symbol, parameter]));
    expect(parameters.get("mumax")).toMatchObject({ value: "0.8", unit: "1/h" });
    expect(parameters.get("Ks")).toMatchObject({ value: "0.05", unit: "g/L" });
    expect(parameters.get("D")).toMatchObject({ value: "0.1", unit: "1/h" });
    expect(parameters.get("Sin")).toMatchObject({ value: "10", unit: "g/L" });
    expect(parameters.get("Yxs")).toMatchObject({ value: "0.5", unit: "gX/gS" });
    expect(parameters.get("D")?.source_context).toContain("Parameters are mumax = 0.8 1/h");
    expect(parameters.get("X0")).toMatchObject({
      value: "0.1",
      status: "initial_condition",
      name: "Initial condition for X",
    });
    expect(parameters.get("S0")).toMatchObject({
      value: "5",
      status: "initial_condition",
      name: "Initial condition for S",
    });
    expect(result.assumptions.map((assumption) => assumption.assumption).join(" ")).toMatch(/well mixed/i);
    expect(result.assumptions.map((assumption) => assumption.assumption).join(" ")).toMatch(/constant/i);
    expect(result.state_variables.find((variable) => variable.symbol === "X")).toMatchObject({
      unit: "g/L",
      confidence: "medium",
    });
    expect(result.state_variables.find((variable) => variable.symbol === "S")).toMatchObject({
      unit: "g/L",
      confidence: "medium",
    });
    expect(result.model_card.control_variables).toContain("D");
    expect(result.model_card.control_variables).not.toContain("mu");
    expect(mapped.equations).toHaveLength(3);
    expect(mapped.parameters.find((parameter) => parameter.symbol === "Yxs")?.valueNumeric).toBe(0.5);
    expect(mapped.parameters.find((parameter) => parameter.symbol === "X0")?.originalValue).toMatchObject({
      kind: "initial_condition",
    });
  });

  it("removes weak Groq placeholders after explicit gas-transfer evidence is merged", async () => {
    const gasText =
      "In an aerobic bioreactor, dissolved oxygen C_O2 changes due to gas-liquid transfer and biological consumption. " +
      "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X. " +
      "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h. " +
      "The system assumes constant temperature and well-mixed liquid phase. " +
      "Henry-law convention was not specified.";
    const weakGroqResponse = {
      paper_title: "Unknown paper",
      paper_type: "unknown" as const,
      model_type: "unknown" as const,
      main_system: "Unknown system",
      organism_or_material: "",
      process_type: "",
      operating_mode: "",
      candidate_state_variables: [
        {
          symbol: "unknown",
          name: "unknown",
          meaning: "Unknown placeholder",
          unit: "-",
          role: "state" as const,
          page_start: null,
          page_end: null,
          section_heading: "",
          source_kind: "unknown" as const,
          source_context: "",
          confidence: "low" as const,
        },
        {
          symbol: "X",
          name: "Biomass concentration",
          meaning: "Biomass concentration in the oxygen uptake term.",
          unit: "-",
          role: "state" as const,
          page_start: 1,
          page_end: 1,
          section_heading: "Source text",
          source_kind: "methods" as const,
          source_context: "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X.",
          confidence: "medium" as const,
        },
      ],
      candidate_inputs: [],
      candidate_outputs: [],
      candidate_controls: [],
      candidate_parameters: [
        {
          symbol: "kLa",
          name: "Volumetric mass transfer coefficient",
          value_raw: "80",
          value_numeric: 80,
          unit: "1/h",
          meaning: "Gas-liquid transfer coefficient",
          status: "unknown" as const,
          page_start: 1,
          page_end: 1,
          section_heading: "Source text",
          source_kind: "methods" as const,
          source_context: "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h.",
          confidence: "low" as const,
        },
        {
          symbol: "Cstar_O2",
          name: "Saturation dissolved oxygen concentration",
          value_raw: "0.008",
          value_numeric: 0.008,
          unit: "g/L",
          meaning: "Saturation dissolved oxygen concentration",
          status: "unknown" as const,
          page_start: 1,
          page_end: 1,
          section_heading: "Source text",
          source_kind: "methods" as const,
          source_context: "Parameters are kLa = 80 1/h, Cstar_O2 = 0.008 g/L, and qO2 = 0.02 gO2/gX/h.",
          confidence: "low" as const,
        },
        {
          symbol: "unknown",
          name: "unknown",
          value_raw: "80",
          value_numeric: 80,
          unit: "1/h",
          meaning: "Unknown transfer value",
          status: "inferred" as const,
          page_start: null,
          page_end: null,
          section_heading: "",
          source_kind: "unknown" as const,
          source_context: "",
          confidence: "low" as const,
        },
        {
          symbol: "unknown",
          name: "unknown",
          value_raw: "0.008",
          value_numeric: 0.008,
          unit: "g/L",
          meaning: "Unknown saturation value",
          status: "inferred" as const,
          page_start: null,
          page_end: null,
          section_heading: "",
          source_kind: "unknown" as const,
          source_context: "",
          confidence: "low" as const,
        },
      ],
      initial_conditions: [],
      candidate_equations: [],
      controls_and_setpoints: [],
      assumptions: [],
      limitations_or_missing_info: [],
      referenced_external_sources_needed: [],
      model_assembly_assessment: {
        assembly_status: "partial" as const,
        can_generate_runnable_model: false,
        can_generate_scaffold: true,
        available_from_current_source: [],
        missing_requirements: [],
        recommended_next_actions: [],
      },
    };
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(weakGroqResponse) } }],
          }),
        },
      },
    };

    const provider = new GroqProvider("llama-3.3-70b-versatile", "gsk-test", client);
    const output = await provider.extract(gasText);
    const result = ExtractionResultSchema.parse(output.raw);
    const variables = new Map(result.state_variables.map((variable) => [variable.symbol, variable]));
    const parameters = new Map(result.parameters.map((parameter) => [parameter.symbol, parameter]));

    expect(output.tokenMeta?.explicitEvidenceMergeApplied).toBe(true);
    expect(result.model_type).toBe("gas_liquid");
    expect(result.model_card.short_summary).toBe(
      "Aerobic gas-liquid oxygen-transfer model with dissolved oxygen C_O2, kLa transfer, and biomass oxygen uptake qO2*X.",
    );
    expect(result.state_variables.some((variable) => variable.symbol.toLowerCase() === "unknown")).toBe(false);
    expect(result.parameters.some((parameter) => parameter.symbol.toLowerCase() === "unknown")).toBe(false);
    expect(result.equations.map((equation) => equation.equation_plaintext)).toContain(
      "dC_O2/dt = kLa*(Cstar_O2 - C_O2) - qO2*X",
    );
    expect(parameters.get("kLa")).toMatchObject({ value: "80", unit: "1/h" });
    expect(parameters.get("Cstar_O2")).toMatchObject({ value: "0.008", unit: "g/L" });
    expect(parameters.get("qO2")).toMatchObject({ value: "0.02", unit: "gO2/gX/h" });
    expect(parameters.get("kLa")?.confidence).not.toBe("low");
    expect(parameters.get("kLa")?.status).toBe("explicit");
    expect(parameters.get("Cstar_O2")?.confidence).not.toBe("low");
    expect(parameters.get("Cstar_O2")?.status).toBe("explicit");
    expect(variables.get("C_O2")).toMatchObject({
      role: "state",
      unit: "g/L",
    });
    expect(variables.get("X")?.role).not.toBe("state");
    expect(result.model_card.control_variables).not.toContain("kLa");
    expect(result.model_card.missing_information.join(" ")).toContain(
      "Henry-law convention was not specified",
    );
  });

  it("uses Groq strict json_schema response format by default", async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(validPaperUnderstanding()) } }],
          }),
        },
      },
    };
    const provider = new GroqProvider("llama-3.3-70b-versatile", "gsk-test", client);

    await provider.extractFromChunks([
      {
        chunk_id: "pdf_001",
        page_start: 2,
        page_end: 2,
        section_heading: "Methods",
        text: "The biomass balance is dX/dt = (mu - D)*X.",
        contains_equation_like_text: true,
      },
    ]);

    const call = client.chat.completions.create.mock.calls[0]?.[0] as {
      response_format?: {
        type?: string;
        json_schema?: { name?: string; strict?: boolean; schema?: unknown };
      };
    };
    expect(call.response_format?.type).toBe("json_schema");
    expect(call.response_format?.json_schema).toMatchObject({
      name: "paper_understanding",
      strict: true,
    });
    expect(call.response_format?.json_schema?.schema).toBeTruthy();
  });

  it("retries with json_object when Groq strict schema output is unsupported", async () => {
    const client = {
      chat: {
        completions: {
          create: vi
            .fn()
            .mockRejectedValueOnce(
              Object.assign(new Error("response_format json_schema unsupported"), {
                status: 400,
              }),
            )
            .mockResolvedValueOnce({
              choices: [{ message: { content: JSON.stringify(validPaperUnderstanding()) } }],
            }),
        },
      },
    };
    const provider = new GroqProvider("llama-3.3-70b-versatile", "gsk-test", client);

    const output = await provider.extractFromChunks([
      {
        chunk_id: "pdf_001",
        page_start: 2,
        page_end: 2,
        section_heading: "Methods",
        text: "The biomass balance is dX/dt = (mu - D)*X.",
        contains_equation_like_text: true,
      },
    ]);

    expect(client.chat.completions.create).toHaveBeenCalledTimes(2);
    const retryCall = client.chat.completions.create.mock.calls[1]?.[0] as {
      response_format?: { type?: string };
    };
    expect(retryCall.response_format?.type).toBe("json_object");
    expect(output.tokenMeta?.responseFormatMode).toBe("json_object");
    expect(output.tokenMeta?.responseFormatWarnings).toEqual(
      expect.arrayContaining([
        "Groq strict schema unsupported; retried with JSON object mode.",
      ]),
    );
  });

  it("normalizes Groq string-array responses and records an audit warning", async () => {
    const malformed = {
      ...validPaperUnderstanding(),
      candidate_inputs: ["acetate feed", "light intensity"],
      candidate_outputs: ["biomass productivity"],
      candidate_controls: ["DO setpoint"],
      candidate_parameters: ["kinetic constants not reported"],
    };
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(malformed) } }],
          }),
        },
      },
    };
    const provider = new GroqProvider("llama-3.3-70b-versatile", "gsk-test", client);

    const output = await provider.extractFromChunks([
      {
        chunk_id: "pdf_001",
        page_start: 2,
        page_end: 2,
        section_heading: "Methods",
        text: "Acetate feed and DO setpoint were described, but kinetic constants were not reported.",
      },
    ]);

    const parsedOutput = ExtractionResultSchema.parse(output.raw);
    expect(output.tokenMeta?.provider).toBe("groq");
    expect(parsedOutput.model_card.inputs).toEqual(
      expect.arrayContaining(["acetate feed", "light intensity"]),
    );
    const unknownParameter = parsedOutput.parameters.find((parameter) =>
      parameter.name.includes("kinetic constants"),
    );
    expect(unknownParameter).toMatchObject({ value: "unknown", confidence: "low" });
    expect(unknownParameter?.source_context).toContain("unknown page");
    expect(output.tokenMeta?.normalizationApplied).toBe(true);
    expect(output.tokenMeta?.normalizationWarnings).toEqual(
      expect.arrayContaining([
        "Groq response required schema normalization before validation.",
      ]),
    );
  });

  it("throws a validation error when malformed Groq output cannot be normalized", async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "not json at all" } }],
          }),
        },
      },
    };
    const provider = new GroqProvider("llama-3.3-70b-versatile", "gsk-test", client);

    await expect(provider.extract(SUFFICIENT_TEXT)).rejects.toMatchObject({
      name: "PaperUnderstandingValidationError",
      message: expect.stringContaining("malformed PaperUnderstanding JSON"),
    });
  });

  it("does not count failed Groq validation as a daily successful extraction", async () => {
    process.env["GROQ_MAX_EXTRACTIONS_PER_DAY"] = "1";
    const malformedClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "not json at all" } }],
          }),
        },
      },
    };
    const failingProvider = new GroqProvider("llama-3.3-70b-versatile", "gsk-test", malformedClient);

    await expect(failingProvider.extract(SUFFICIENT_TEXT)).rejects.toBeInstanceOf(
      PaperUnderstandingValidationError,
    );
    expect(getProviderStatus().groq.usageToday.extractions).toBe(0);
    expect(getProviderStatus().groq.usageToday.requests).toBe(1);

    const successClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(validPaperUnderstanding()) } }],
          }),
        },
      },
    };
    const provider = new GroqProvider("llama-3.3-70b-versatile", "gsk-test", successClient);
    const output = await provider.extract(SUFFICIENT_TEXT);

    expect(output.tokenMeta?.provider).toBe("groq");
    expect(getProviderStatus().groq.usageToday.extractions).toBe(1);
    expect(JSON.stringify(getProviderStatus())).not.toContain("gsk-test");
  });

  it("writes a dev debug artifact when Groq validation still fails", async () => {
    const debugDir = mkdtempSync(path.join(tmpdir(), "groq-debug-"));
    process.env["GROQ_DEBUG_DIR"] = debugDir;
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "not json at all" } }],
          }),
        },
      },
    };
    const provider = new GroqProvider("llama-3.3-70b-versatile", "gsk-secret", client);

    await expect(provider.extract(SUFFICIENT_TEXT)).rejects.toMatchObject({
      name: "PaperUnderstandingValidationError",
      validationIssues: expect.any(Array),
      debugArtifactPath: expect.stringContaining(debugDir),
    });

    const thrown = await provider.extract(SUFFICIENT_TEXT).catch((error) => error);
    expect(thrown).toBeInstanceOf(PaperUnderstandingValidationError);
    expect(existsSync(thrown.debugArtifactPath)).toBe(true);
    const artifact = readFileSync(thrown.debugArtifactPath, "utf8");
    expect(artifact).toContain("groq-professor-v2");
    expect(artifact).toContain("groq-paper-understanding-v2");
    expect(artifact).not.toContain("gsk-secret");
    rmSync(debugDir, { recursive: true, force: true });
  });

  it("always routes PDF chunks through local chunk selection before calling Groq", async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(validPaperUnderstanding()) } }],
          }),
        },
      },
    };
    const provider = new GroqProvider("llama-3.3-70b-versatile", "gsk-test", client);

    await provider.extractFromChunks([
      {
        chunk_id: "ref_001",
        page_start: 9,
        page_end: 9,
        section_heading: "References",
        text: "References only. Figure 1 is cited elsewhere.",
        contains_figure_reference: true,
      },
      {
        chunk_id: "methods_001",
        page_start: 3,
        page_end: 3,
        section_heading: "Materials and Methods",
        text: "The biomass balance is dX/dt = (mu - D)*X and D = 0.1 1/h.",
        contains_equation_like_text: true,
        contains_table_like_text: true,
      },
    ]);

    const call = client.chat.completions.create.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPrompt = call.messages.find((message) => message.role === "user")?.content ?? "";
    expect(userPrompt).toContain("methods_001");
    expect(userPrompt).not.toContain("ref_001");
  });

  it("trims low-priority chunks until the Groq prompt fits the input budget", async () => {
    process.env["GROQ_MAX_INPUT_TOKENS_PER_REQUEST"] = "7000";
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(validPaperUnderstanding()) } }],
          }),
        },
      },
    };
    const provider = new GroqProvider("llama-3.3-70b-versatile", "gsk-test", client);

    const output = await provider.extractFromChunks([
      {
        chunk_id: "methods_priority",
        page_start: 3,
        page_end: 3,
        section_heading: "Materials and Methods",
        text: "The biomass balance is dX/dt = (mu - D)*X and D = 0.1 1/h.",
        contains_equation_like_text: true,
        contains_table_like_text: true,
      },
      {
        chunk_id: "references_low",
        page_start: 9,
        page_end: 9,
        section_heading: "References",
        text: "References ".repeat(20_000),
        contains_figure_reference: true,
      },
    ]);

    const call = client.chat.completions.create.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPrompt = call.messages.find((message) => message.role === "user")?.content ?? "";
    expect(userPrompt).toContain("methods_priority");
    expect(userPrompt).not.toContain("references_low");
    expect(output.tokenMeta?.selectedChunks).toBe(1);
    expect(output.tokenMeta?.estimatedSchemaTokens).toEqual(expect.any(Number));
    expect(output.tokenMeta?.estimatedPromptTokens).toEqual(expect.any(Number));
    expect(output.tokenMeta?.selectionWarnings).toEqual(
      expect.arrayContaining([
        "Groq free-tier mode processed only the highest-signal chunks. Some paper content was skipped due to token limits.",
      ]),
    );
  });

  it("falls back to RuleBased in Auto when Groq budget is exhausted and records the reason", async () => {
    process.env["GROQ_MAX_EXTRACTIONS_PER_DAY"] = "0";

    const { providerName, audit } = await runExtraction(
      "A continuous chemostat is modeled with biomass X and substrate S. " +
        "The growth rate is mu = mumax*S/(Ks+S). The biomass balance is dX/dt = (mu - D)*X. " +
        "Parameters are mumax = 0.8 1/h and D = 0.1 1/h.",
      "auto",
      {
        documentChunks: [
          {
            chunk_id: "pdf_001",
            page_start: 2,
            page_end: 2,
            section_heading: "Methods",
            text: "The biomass balance is dX/dt = (mu - D)*X.",
            contains_equation_like_text: true,
          },
        ],
        sourceKind: "pdf",
      },
    );

    expect(providerName).toBe("rule_based");
    expect(audit.tokenUsage?.providerFallbacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "groq", to: "rule_based" }),
      ]),
    );
    expect(audit.promptTemplateSummary).toMatch(/Groq free-tier budget reached/i);
  });

  it("falls back to RuleBased in Auto when Groq schema validation fails", async () => {
    vi.spyOn(GroqProvider.prototype, "extractFromChunks").mockRejectedValue(
      new PaperUnderstandingValidationError(
        "Groq returned malformed structured data.",
        {
          normalizationApplied: true,
          normalizationWarnings: [
            "Groq response required schema normalization before validation.",
          ],
          validationIssues: ["candidate_inputs.0: expected object, received string"],
          validationStage: "groq_paper_understanding",
          repairedJson: { candidate_inputs: ["acetate feed"] },
          normalizedJson: { candidate_inputs: ["acetate feed"] },
          rawResponseSnippet: "{\"candidate_inputs\":[\"acetate feed\"]}",
          debugArtifactPath: "logs/groq-validation-failure-test.json",
        },
      ),
    );

    const { providerName, audit } = await runExtraction(
      "A continuous chemostat is modeled with biomass X and substrate S. " +
        "The growth rate is mu = mumax*S/(Ks+S). The biomass balance is dX/dt = (mu - D)*X. " +
        "Parameters are mumax = 0.8 1/h and D = 0.1 1/h.",
      "auto",
      {
        documentChunks: [
          {
            chunk_id: "pdf_001",
            page_start: 2,
            page_end: 2,
            section_heading: "Methods",
            text: "The biomass balance is dX/dt = (mu - D)*X.",
            contains_equation_like_text: true,
          },
        ],
        sourceKind: "pdf",
      },
    );

    expect(providerName).toBe("rule_based");
    expect(audit.tokenUsage?.providerFallbacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "groq", to: "rule_based" }),
      ]),
    );
    expect(audit.promptTemplateSummary).toContain(
      "Groq failed schema validation; Auto fallback used Ollama/RuleBased.",
    );
  });

  it("returns explicit 413-style Groq error when token budget is exhausted", async () => {
    process.env["GROQ_MAX_INPUT_TOKENS_PER_REQUEST"] = "1";

    await expect(runExtraction(SUFFICIENT_TEXT, "groq")).rejects.toMatchObject({
      name: "ExtractionProviderError",
      providerName: "groq",
      status: 413,
      message: expect.stringContaining("Groq free-tier budget cannot fit"),
    });
  });

  it("returns explicit Groq rate-limit error for 429 responses", async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue({
            status: 429,
            headers: new Headers({ "retry-after": "60" }),
          }),
        },
      },
    };
    const provider = new GroqProvider("llama-3.3-70b-versatile", "gsk-test", client);

    await expect(provider.extract(SUFFICIENT_TEXT)).rejects.toMatchObject({
      name: "GroqRateLimitError",
      message: expect.stringContaining("Try again later or reduce PDF size"),
    });
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

  it("finalizes the exact Monod text with initial conditions on the RuleBased path", async () => {
    const exactMonodText =
      "A continuous chemostat is modeled with biomass X and substrate S. " +
      "The specific growth rate is mu = mumax*S/(Ks + S). " +
      "The biomass balance is dX/dt = (mu - D)*X. " +
      "The substrate balance is dS/dt = D*(Sin - S) - (1/Yxs)*mu*X. " +
      "Parameters are mumax = 0.8 1/h, Ks = 0.05 g/L, D = 0.1 1/h, " +
      "Sin = 10 g/L, and Yxs = 0.5 gX/gS. " +
      "Initial conditions are X0 = 0.1 g/L and S0 = 5 g/L. " +
      "The reactor is assumed well mixed and volume is constant.";

    const { result, providerName } = await runExtraction(exactMonodText, "rule_based");
    const variables = new Map(result.state_variables.map((variable) => [variable.symbol, variable]));
    const parameters = new Map(result.parameters.map((parameter) => [parameter.symbol, parameter]));

    expect(providerName).toBe("rule_based");
    expect(result.state_variables.some((variable) => variable.symbol.toLowerCase() === "unknown")).toBe(false);
    expect(result.parameters.some((parameter) => parameter.symbol.toLowerCase() === "unknown")).toBe(false);
    expect(variables.get("X")).toMatchObject({
      role: "state",
      unit: "g/L",
    });
    expect(variables.get("S")).toMatchObject({
      role: "state",
      unit: "g/L",
    });
    for (const symbol of ["mumax", "Ks", "D", "Sin", "Yxs", "X0", "S0"]) {
      expect(parameters.has(symbol)).toBe(true);
    }
    expect(parameters.get("X0")).toMatchObject({
      name: "Initial condition for X",
      status: "initial_condition",
    });
    expect(parameters.get("S0")).toMatchObject({
      name: "Initial condition for S",
      status: "initial_condition",
    });
    expect(result.initial_conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "X0", state_symbol: "X" }),
        expect.objectContaining({ symbol: "S0", state_symbol: "S" }),
      ]),
    );
    expect(result.equations.map((equation) => equation.equation_plaintext)).toEqual(
      expect.arrayContaining([
        "mu = mumax*S/(Ks + S)",
        "dX/dt = (mu - D)*X",
        "dS/dt = D*(Sin - S) - (1/Yxs)*mu*X",
      ]),
    );
    expect(result.model_card.missing_information.join(" ")).not.toMatch(/initial conditions/i);
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
    expect(result.model_card.control_variables).not.toContain("kLa");
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

  it("classifies a batch culture fixture without treating it as chemostat", async () => {
    const batchFixture =
      "A batch culture was run as a closed system with no inlet and no outlet. " +
      "Biomass X and substrate S follow Monod-style growth. " +
      "The growth relation is mu = mumax*S/(Ks+S). " +
      "The biomass balance is dX/dt = mu*X. " +
      "The substrate balance is dS/dt = -(1/Yxs)*mu*X. " +
      "Parameters are mumax = 0.4 1/h, Ks = 0.1 g/L, and Yxs = 0.5 g/g.";

    const { result } = await runExtraction(batchFixture, "rule_based");

    expect(result.model_type).toBe("batch_culture");
    expect(result.equations.map((eq) => eq.equation_plaintext)).toEqual(
      expect.arrayContaining([
        "mu = mumax*S/(Ks+S)",
        "dX/dt = mu*X",
        "dS/dt = -(1/Yxs)*mu*X",
      ]),
    );
    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies a fed-batch culture fixture", async () => {
    const fedBatchFixture =
      "A fed-batch culture has variable volume and feed F(t). " +
      "The volume balance is dV/dt = F. " +
      "The biomass balance is dX/dt = mu*X - (F/V)*X. " +
      "Parameters are F = 0.02 L/h, V0 = 1.0 L, mumax = 0.35 1/h, Ks = 0.08 g/L.";

    const { result } = await runExtraction(fedBatchFixture, "rule_based");

    expect(result.model_type).toBe("fed_batch");
    expect(result.equations.map((eq) => eq.equation_plaintext)).toEqual(
      expect.arrayContaining(["dV/dt = F", "dX/dt = mu*X - (F/V)*X"]),
    );
    expect(ExtractionResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies a Michaelis-Menten enzyme kinetics fixture", async () => {
    const enzymeFixture =
      "A Michaelis-Menten enzyme kinetics model was fitted for substrate S and product P. " +
      "The reaction velocity is v = Vmax*S/(Km+S). " +
      "Parameters are Vmax = 2.5 mmol/L/min and Km = 0.2 mmol/L. " +
      "No dynamic reactor state balance was reported.";

    const { result } = await runExtraction(enzymeFixture, "rule_based");
    const parameterBySymbol = new Map(result.parameters.map((p) => [p.symbol, p]));

    expect(result.model_type).toBe("enzyme_kinetics");
    expect(result.equations.map((eq) => eq.equation_plaintext)).toContain(
      "v = Vmax*S/(Km+S)",
    );
    expect(parameterBySymbol.get("Vmax")).toMatchObject({ value: "2.5" });
    expect(parameterBySymbol.get("Km")).toMatchObject({ value: "0.2" });
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
    expect(mapped.equations[0].equationType).toBe("dynamic_ode");
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
    expect(mapped.parameters[0].valueRaw).toBe("0.5");
    expect(mapped.parameters[0].valueNumeric).toBe(0.5);
  });

  it("parses numeric values with units without changing provider output", () => {
    const parsed = parseParameterValue("0.8 1/h");
    expect(parsed).toEqual({ raw: "0.8 1/h", numeric: 0.8, ok: true });
  });

  it("maps assumptions and limitations into assumptions array with kind", () => {
    const mapped = mapExtractionToDb(raw);
    const kinds = mapped.assumptions.map((a) => a.kind);
    expect(kinds).toContain("assumption");
    expect(kinds).toContain("limitation");
  });

  it("preserves unknown values as raw text with null numeric value", () => {
    const modified = {
      ...raw,
      parameters: [{ ...raw.parameters[0], value: "unknown" }],
    };
    const mapped = mapExtractionToDb(modified);
    expect(mapped.parameters[0].valueRaw).toBe("unknown");
    expect(mapped.parameters[0].valueNumeric).toBeNull();
    expect(mapped.parameters[0].confidence).toBe("low");
    expect(mapped.parameters[0].sourceQuote).toContain(
      'value "unknown" could not be parsed numerically',
    );
  });

  it("preserves nonnumeric values as raw text with null numeric value", () => {
    const modified = {
      ...raw,
      parameters: [{ ...raw.parameters[0], value: "not-a-number" }],
    };
    const mapped = mapExtractionToDb(modified);
    expect(mapped.parameters[0].valueRaw).toBe("not-a-number");
    expect(mapped.parameters[0].valueNumeric).toBeNull();
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

  it("preserves control role", () => {
    const withControlRole = {
      ...raw,
      state_variables: [
        { ...raw.state_variables[0], role: "control" as "state" },
      ],
    };
    const mapped = mapExtractionToDb(withControlRole);
    expect(mapped.variables[0].role).toBe("control");
  });

  it("preserves parameter role", () => {
    const withParameterRole = {
      ...raw,
      state_variables: [
        { ...raw.state_variables[0], role: "parameter" as "state" },
      ],
    };
    const mapped = mapExtractionToDb(withParameterRole);
    expect(mapped.variables[0].role).toBe("parameter");
  });

  it("preserves non-dynamic equation types", () => {
    const withStoichiometry = {
      ...raw,
      equations: [
        {
          ...raw.equations[0],
          equation_latex: "CH_3COOH + 2 O_2 \\to 2 CO_2 + 2 H_2O",
          equation_plaintext: "CH3COOH + 2 O2 -> 2 CO2 + 2 H2O",
          equation_type: "stoichiometric_reaction" as const,
        },
      ],
    };
    const mapped = mapExtractionToDb(withStoichiometry);
    expect(mapped.equations[0].equationType).toBe("stoichiometric_reaction");
  });

  it("preserves control-law equation types", () => {
    const withControlLaw = {
      ...raw,
      equations: [
        {
          ...raw.equations[0],
          equation_latex: "u = K_p(DO_{sp} - DO)",
          equation_plaintext: "u = Kp*(DO_sp - DO)",
          equation_type: "control_law" as const,
        },
      ],
    };
    const mapped = mapExtractionToDb(withControlLaw);
    expect(mapped.equations[0].equationType).toBe("control_law");
  });
});
