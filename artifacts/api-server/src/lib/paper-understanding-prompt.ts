export type PaperUnderstandingDocumentChunk = {
  chunk_id: string;
  page_start: number;
  page_end: number;
  section_heading: string;
  text: string;
  char_count?: number;
};

export type PaperUnderstandingPromptOptions = {
  maxTotalChars?: number;
  note?: string;
};

export type PaperUnderstandingPrompt = {
  systemPrompt: string;
  userPrompt: string;
};

const DEFAULT_MAX_TOTAL_CHARS = 24000;

const PAPER_UNDERSTANDING_JSON_SHAPE = `{
  "paper_title": "<string>",
  "paper_type": "<experimental/modeling/review/mixed/unknown>",
  "model_type": "<monod_chemostat/fed_batch/batch_culture/cstr/pfr/enzyme_kinetics/gas_liquid/microalgae_photobioreactor/oxygen_balanced_mixotrophy/unknown>",
  "main_system": "<string>",
  "organism_or_material": "<string>",
  "process_type": "<string>",
  "operating_mode": "<string>",
  "experimental_setup": [],
  "candidate_state_variables": [],
  "candidate_parameters": [],
  "candidate_equations": [],
  "tables_or_reported_values": [],
  "controls_and_setpoints": [],
  "assumptions": [],
  "limitations_or_missing_info": [],
  "referenced_external_sources_needed": []
}`;

export const PAPER_UNDERSTANDING_SYSTEM_PROMPT = `You are a chemical and biochemical engineering model-extraction assistant.

Read the document as a full paper, not as a single paragraph. Build an intermediate PaperUnderstanding JSON object before any model-card extraction.

Rules:
1. Return strict JSON only. No markdown fences, no commentary, no prose outside JSON.
2. Never invent missing values, equations, constants, units, controller parameters, Henry-law conventions, light-model parameters, or initial conditions.
3. Classify model_type before extracting details.
4. Preserve page_start, page_end, section_heading, source_kind, source_context, and confidence for every extracted item.
5. Preserve whether a value came from abstract, methods, table, nomenclature, results, supporting information, or another section.
6. Distinguish equation_type exactly as one of: dynamic_ode, algebraic_calculation, stoichiometric_reaction, empirical_correlation, reported_experimental_result, unknown.
7. Distinguish dynamic balances from productivity, yield, stoichiometric, and reporting calculations.
8. Extract equations, variables, parameters, units, assumptions, controls, setpoints, operating mode, organism/material, and experimental setup only when present.
9. Identify missing model pieces explicitly and ask for supporting information, cited papers, calibration data, databook constants, or user assumptions when needed.

Model type guidance:
- dilution rate D + continuous culture + biomass/substrate -> monod_chemostat
- variable volume or feed F(t) -> fed_batch
- closed system, no inlet/outlet -> batch_culture
- well-mixed reactor with residence time -> cstr
- axial/spatial coordinate z -> pfr
- Vmax/Km/substrate/product -> enzyme_kinetics
- kLa/Henry/DO/O2/CO2 -> gas_liquid
- light/PFD/PBR/microalgae -> microalgae_photobioreactor
- DO-controlled acetate-fed mixotrophy -> oxygen_balanced_mixotrophy
- unclear -> unknown

The JSON object must match this top-level shape:
${PAPER_UNDERSTANDING_JSON_SHAPE}`;

function formatChunk(chunk: PaperUnderstandingDocumentChunk): string {
  const pages =
    chunk.page_start === chunk.page_end
      ? `page ${chunk.page_start}`
      : `pages ${chunk.page_start}-${chunk.page_end}`;
  return [
    `[${chunk.chunk_id}; ${pages}; section="${chunk.section_heading}"]`,
    chunk.text.trim(),
  ].join("\n");
}

function truncateChunks(
  chunks: PaperUnderstandingDocumentChunk[],
  maxTotalChars: number,
): PaperUnderstandingDocumentChunk[] {
  const out: PaperUnderstandingDocumentChunk[] = [];
  let used = 0;
  for (const chunk of chunks) {
    if (used >= maxTotalChars) break;
    const remaining = maxTotalChars - used;
    const text =
      chunk.text.length > remaining
        ? `${chunk.text.slice(0, Math.max(0, remaining - 15)).trimEnd()}\n[truncated]`
        : chunk.text;
    out.push({ ...chunk, text });
    used += text.length;
  }
  return out;
}

export function buildPaperUnderstandingPrompt(
  documentChunks: PaperUnderstandingDocumentChunk[],
  options: PaperUnderstandingPromptOptions = {},
): PaperUnderstandingPrompt {
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;
  const chunks = truncateChunks(documentChunks, maxTotalChars);
  const chunkText =
    chunks.length > 0
      ? chunks.map(formatChunk).join("\n\n")
      : "[No document chunks provided]";

  return {
    systemPrompt: PAPER_UNDERSTANDING_SYSTEM_PROMPT,
    userPrompt: [
      "Analyze these structured document chunks and return one PaperUnderstanding JSON object.",
      options.note ? `Additional instruction: ${options.note}` : "",
      "Document chunks:",
      chunkText,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
