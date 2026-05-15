import { useState, useCallback, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { useGetModelCardByProject } from "@workspace/api-client-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ActivitySquare,
  Play,
  RotateCcw,
  Download,
  AlertTriangle,
  Info,
  ExternalLink,
  FlaskConical,
  TrendingUp,
} from "lucide-react";
import {
  getSupportedSimulationModelType,
  SIMULATION_UNSUPPORTED_MESSAGE,
  type SupportedSimulationModelType,
} from "@/lib/simulation-support";
import { analyzeChemEModel } from "@workspace/cheme-brain";
import { buildChemEBrainInputForModelCard } from "@/lib/cheme-brain-report";
import { decideChemEBrainSimulationReadiness } from "@/lib/cheme-brain-readiness";
import { CHEME_BRAIN_READINESS_AUTHORITY_ENABLED } from "@/lib/feature-flags";
import { getParameterNumericValue } from "@/lib/parameter-values";
import {
  batchCultureODE,
  monodChemostatODE,
  rk4,
  type SimulationPoint,
  type SimulationResult,
} from "@/lib/simulation-engine";

// ─── types ────────────────────────────────────────────────────────────────────

interface SimParams {
  mumax: number;
  Ks: number;
  D: number;
  Sin: number;
  Yxs: number;
  X0: number;
  S0: number;
  tFinal: number;
  dt: number;
}

interface ValidationError {
  field: string;
  message: string;
}

interface Warning {
  id: string;
  message: string;
}

// ─── demo defaults ─────────────────────────────────────────────────────────────

const DEMO_PARAMS: SimParams = {
  mumax: 0.4,
  Ks: 0.1,
  D: 0.2,
  Sin: 10.0,
  Yxs: 0.5,
  X0: 0.5,
  S0: 5.0,
  tFinal: 50,
  dt: 0.1,
};

const REQUIRED_FIELDS: Record<SupportedSimulationModelType, Array<keyof SimParams>> = {
  monod_chemostat: ["mumax", "Ks", "D", "Sin", "Yxs", "X0", "S0", "tFinal", "dt"],
  batch_culture: ["mumax", "Ks", "Yxs", "X0", "S0", "tFinal", "dt"],
};

// ─── validation ───────────────────────────────────────────────────────────────

const MAX_SIMULATION_STEPS = 100_000; // ~100 s at dt=0.001; prevents browser freeze

function validate(p: SimParams, modelType: SupportedSimulationModelType): ValidationError[] {
  const errors: ValidationError[] = [];
  if (p.mumax <= 0) errors.push({ field: "mumax", message: "μmax must be > 0" });
  if (p.Ks <= 0) errors.push({ field: "Ks", message: "Ks must be > 0 (prevents division by zero in growth rate)" });
  if (modelType === "monod_chemostat" && p.D < 0) errors.push({ field: "D", message: "Dilution rate D cannot be negative" });
  if (modelType === "monod_chemostat" && p.Sin < 0) errors.push({ field: "Sin", message: "Feed concentration S_in cannot be negative" });
  if (p.Yxs <= 0) errors.push({ field: "Yxs", message: "Yield Yxs must be > 0" });
  if (p.X0 < 0) errors.push({ field: "X0", message: "Initial biomass X₀ cannot be negative" });
  if (p.S0 < 0) errors.push({ field: "S0", message: "Initial substrate S₀ cannot be negative" });
  if (p.tFinal <= 0) errors.push({ field: "tFinal", message: "Simulation time must be > 0" });
  if (p.dt <= 0) errors.push({ field: "dt", message: "Time step must be > 0" });
  if (p.dt > 0 && p.tFinal > 0 && p.dt >= p.tFinal)
    errors.push({ field: "dt", message: "Time step must be smaller than final time" });
  if (p.dt > 0 && p.tFinal > 0 && p.tFinal / p.dt > MAX_SIMULATION_STEPS)
    errors.push({
      field: "dt",
      message: `Too many steps: tFinal/dt = ${Math.ceil(p.tFinal / p.dt).toLocaleString()} exceeds limit of ${MAX_SIMULATION_STEPS.toLocaleString()}. Increase Δt or reduce simulation time.`,
    });
  return errors;
}

function getWarnings(p: SimParams, modelType: SupportedSimulationModelType): Warning[] {
  const warnings: Warning[] = [];
  if (modelType === "monod_chemostat") {
    const muMax_at_Sin = (p.mumax * p.Sin) / (p.Ks + p.Sin);
    if (p.D > muMax_at_Sin) {
      warnings.push({
        id: "washout",
        message: `Washout likely: D (${p.D.toFixed(3)} h⁻¹) exceeds maximum achievable μ at S_in (${muMax_at_Sin.toFixed(3)} h⁻¹). Biomass will decay to zero.`,
      });
    }
    if (p.D === 0) {
      warnings.push({
        id: "batch",
        message: "D = 0 means no inflow/outflow — this is batch mode. Use an explicit batch_culture model card when binding extracted batch data.",
      });
    }
  }
  if (p.dt > 0.5) {
    warnings.push({
      id: "dt",
      message: "Large time step may reduce accuracy. Consider Δt ≤ 0.5 h.",
    });
  }
  if (p.X0 === 0 && p.S0 === 0) {
    warnings.push({
      id: "trivial",
      message: "Both X₀ and S₀ are zero — the system has no dynamics to simulate.",
    });
  }
  return warnings;
}

// ─── CSV helper ───────────────────────────────────────────────────────────────

function downloadCsv(
  data: SimulationPoint[],
  params: SimParams,
  modelType: SupportedSimulationModelType,
) {
  const MAX_CSV_ROWS = 10_000;
  const truncated = data.length > MAX_CSV_ROWS;
  const exportData = truncated ? data.slice(0, MAX_CSV_ROWS) : data;
  const meta = [
    `# ChemAI Model Compiler — ${modelType === "batch_culture" ? "Batch Culture" : "Chemostat"} Simulation`,
    modelType === "batch_culture"
      ? `# mumax=${params.mumax} Ks=${params.Ks} Yxs=${params.Yxs}`
      : `# mumax=${params.mumax} Ks=${params.Ks} D=${params.D} Sin=${params.Sin} Yxs=${params.Yxs}`,
    `# X0=${params.X0} S0=${params.S0} tFinal=${params.tFinal} dt=${params.dt}`,
    truncated ? `# NOTE: output capped at ${MAX_CSV_ROWS} rows (${data.length} total points)` : "",
    "",
  ].filter(Boolean).join("\n");
  const header = "time_h,X_g_per_L,S_g_per_L\n";
  const rows = exportData.map((pt) => `${pt.t},${pt.X},${pt.S}`).join("\n");
  const blob = new Blob([meta + header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${modelType}_simulation.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── sub-components ───────────────────────────────────────────────────────────

interface ParamFieldProps {
  id: string;
  label: string;
  symbol: string;
  unit: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}

function ParamField({
  id,
  label,
  symbol,
  unit,
  value,
  error,
  onChange,
}: ParamFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}{" "}
        <span className="font-mono text-foreground font-semibold">{symbol}</span>
        {unit && (
          <span className="text-muted-foreground font-normal"> ({unit})</span>
        )}
      </Label>
      <Input
        id={id}
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-8 font-mono text-sm ${
          error ? "border-destructive focus-visible:ring-destructive" : ""
        }`}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: number;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-mono text-xs text-muted-foreground mb-1">
        t = {label} h
      </p>
      {payload.map((p) => (
        <p key={p.name} className="font-mono" style={{ color: p.color }}>
          {p.name} = {p.value.toFixed(4)} g/L
        </p>
      ))}
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toParams(raw: Record<string, string>): Partial<SimParams> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = parseFloat(v);
    if (!isNaN(n)) out[k] = n;
  }
  return out as Partial<SimParams>;
}

function isComplete(
  p: Partial<SimParams>,
  modelType: SupportedSimulationModelType,
): p is SimParams {
  return REQUIRED_FIELDS[modelType].every(
    (k) => k in p && Number.isFinite((p as Record<string, number>)[k])
  );
}

type SimulationParameterRow = {
  symbol?: string | null;
  name?: string | null;
  value?: string | number | null;
  valueRaw?: string | null;
  valueNumeric?: number | null;
  unit?: string | null;
  confidence?: string | null;
  sourceQuote?: string | null;
  originalValue?: Record<string, unknown> | null;
};

type SimulationVariableRow = {
  symbol?: string | null;
  name?: string | null;
  role?: string | null;
  unit?: string | null;
  sourceQuote?: string | null;
  originalValue?: Record<string, unknown> | null;
};

type SimulationEquationRow = {
  id?: number;
  latex?: string | null;
  plaintext?: string | null;
  meaning?: string | null;
  description?: string | null;
  equationType?: string | null;
  sourceQuote?: string | null;
};

type SimulationAssumptionRow = {
  text: string;
  sourceQuote?: string | null;
  confidence?: string | null;
};

type SimulationRawExtraction = {
  model_type?: string | null;
  system_type?: string | null;
  model_card?: {
    model_type?: string | null;
  } | null;
  parameters?: SimulationParameterRow[];
  state_variables?: Array<{
    symbol?: string | null;
    initial_condition?: string | number | null;
    source_context?: string | null;
  }>;
  initial_conditions?: Array<{
    symbol?: string | null;
    state_symbol?: string | null;
    value?: string | number | null;
    value_numeric?: number | null;
  }>;
};

type SimulationCard = {
  extraction: {
    modelCardTitle?: string | null;
    providerUsed?: string | null;
    modelType?: string | null;
    modelTypeOverride?: string | null;
    domain?: string | null;
    systemDescription?: string | null;
    problemStatement?: string | null;
    rawExtractionJson?: unknown;
  };
  parameters: SimulationParameterRow[];
  variables: SimulationVariableRow[];
  equations?: SimulationEquationRow[];
  assumptionItems?: SimulationAssumptionRow[];
  limitationItems?: SimulationAssumptionRow[];
};

type BoundValues = {
  rawParams: Record<string, string>;
  boundFields: string[];
};

function normalizeSymbol(symbol: string | null | undefined): string {
  return String(symbol ?? "")
    .trim()
    .replace(/[μµ]/g, "mu")
    .replace(/[₀]/g, "0")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
}

function parseNumberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = String(value ?? "").match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildParamMap(card: SimulationCard | undefined): Map<string, number> {
  const map = new Map<string, number>();
  const add = (parameter: SimulationParameterRow) => {
    const { symbol } = parameter;
    const key = normalizeSymbol(String(symbol ?? ""));
    const parsed = getParameterNumericValue(parameter);
    if (key && parsed !== null) map.set(key, parsed);
  };

  for (const parameter of card?.parameters ?? []) add(parameter);

  const raw = card?.extraction.rawExtractionJson as SimulationRawExtraction | null | undefined;
  for (const parameter of raw?.parameters ?? []) add(parameter);

  return map;
}

function extractInitialFromText(symbol: string, text: string | null | undefined): number | null {
  const normalized = String(text ?? "").replace(/[₀]/g, "0");
  const hasInitialContext = /\binitial\b|\binoculum\b|\bat\s+t\s*=\s*0\b/i.test(normalized);
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const direct = new RegExp(`\\b${escaped}\\s*0\\s*=\\s*([-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?)`, "i");
  const initialContext = new RegExp(`\\b${escaped}\\s*=\\s*([-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?)`, "i");
  const directMatch = normalized.match(direct);
  if (directMatch) return parseNumberValue(directMatch[1]);
  if (hasInitialContext) {
    const match = normalized.match(initialContext);
    if (match) return parseNumberValue(match[1]);
  }
  return null;
}

function buildInitialConditionMap(
  card: SimulationCard | undefined,
  paramMap: Map<string, number>,
): Map<string, number> {
  const map = new Map<string, number>();
  const x0 = paramMap.get("x0");
  const s0 = paramMap.get("s0");
  if (x0 !== undefined) map.set("X", x0);
  if (s0 !== undefined) map.set("S", s0);

  for (const variable of card?.variables ?? []) {
    const symbol = String(variable.symbol ?? "").trim();
    if (!symbol) continue;
    const parsed =
      parseNumberValue(variable.originalValue?.initial_condition) ??
      extractInitialFromText(symbol, variable.sourceQuote);
    if (parsed !== null) map.set(symbol, parsed);
  }

  const raw = card?.extraction.rawExtractionJson as SimulationRawExtraction | null | undefined;
  for (const variable of raw?.state_variables ?? []) {
    const symbol = String(variable.symbol ?? "").trim();
    if (!symbol) continue;
    const parsed =
      parseNumberValue(variable.initial_condition) ??
      extractInitialFromText(symbol, variable.source_context);
    if (parsed !== null) map.set(symbol, parsed);
  }

  return map;
}

function bindExtractedValues(
  card: SimulationCard | undefined,
  modelType: SupportedSimulationModelType,
): BoundValues {
  const paramMap = buildParamMap(card);
  const icMap = buildInitialConditionMap(card, paramMap);
  const next = Object.fromEntries(
    Object.entries(DEMO_PARAMS).map(([key, value]) => [key, String(value)]),
  );
  const boundFields: string[] = [];

  const setParam = (field: keyof SimParams, aliases: string[]) => {
    for (const alias of aliases) {
      const value = paramMap.get(normalizeSymbol(alias));
      if (value !== undefined) {
        next[field] = String(value);
        boundFields.push(field);
        return;
      }
    }
  };
  const setInitial = (field: "X0" | "S0", symbol: string) => {
    const value = icMap.get(symbol);
    if (value !== undefined) {
      next[field] = String(value);
      boundFields.push(field);
    }
  };

  setParam("mumax", ["mumax", "mu_max", "mu_maximum"]);
  setParam("Ks", ["Ks"]);
  setParam("Yxs", ["Yxs", "Yx_s", "Y_xs", "yield"]);
  if (modelType === "monod_chemostat") {
    setParam("D", ["D"]);
    setParam("Sin", ["Sin", "S_in", "substrate_feed"]);
  }
  setInitial("X0", "X");
  setInitial("S0", "S");

  return { rawParams: next, boundFields };
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function Simulation() {
  const qp = new URLSearchParams(window.location.search);
  const modelProjectId = Number(qp.get("projectId") ?? "");
  const canUseModelData = Number.isFinite(modelProjectId) && modelProjectId > 0;
  const modelCardQuery = useGetModelCardByProject(canUseModelData ? modelProjectId : 0);
  const modelCard = modelCardQuery.data as SimulationCard | undefined;
  const rawExtraction =
    modelCard?.extraction.rawExtractionJson as SimulationRawExtraction | null | undefined;

  const [rawParams, setRawParams] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        Object.entries(DEMO_PARAMS).map(([k, v]) => [k, String(v)])
      )
  );
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const simData = simResult?.points ?? null;
  const [hasRun, setHasRun] = useState(false);
  const [lastParams, setLastParams] = useState<SimParams | null>(null);
  const [valueSource, setValueSource] = useState<"demo" | "extracted">("demo");
  const [boundFields, setBoundFields] = useState<string[]>([]);
  const [unsupportedModelMessage, setUnsupportedModelMessage] = useState<string | null>(null);
  const [activeModelType, setActiveModelType] =
    useState<SupportedSimulationModelType>("monod_chemostat");

  useEffect(() => {
    if (!canUseModelData) {
      setUnsupportedModelMessage(null);
      setValueSource("demo");
      setBoundFields([]);
      setActiveModelType("monod_chemostat");
      return;
    }
    if (!modelCard) return;

    const supportedType = getSupportedSimulationModelType({
      rawModelType: rawExtraction?.model_type,
      modelCardModelType: rawExtraction?.model_card?.model_type,
      modelType: modelCard.extraction.modelType,
      modelTypeOverride: modelCard.extraction.modelTypeOverride,
      systemType: rawExtraction?.system_type,
      domain: modelCard.extraction.domain,
      parameters: modelCard.parameters,
    });
    const chemEBrainReport = CHEME_BRAIN_READINESS_AUTHORITY_ENABLED
      ? analyzeChemEModel(
          buildChemEBrainInputForModelCard({
            extraction: {
              modelCardTitle: modelCard.extraction.modelCardTitle ?? "Model card",
              providerUsed: modelCard.extraction.providerUsed ?? "unknown",
              domain: modelCard.extraction.domain ?? "unknown",
              systemDescription: modelCard.extraction.systemDescription,
              problemStatement: modelCard.extraction.problemStatement,
              modelType: modelCard.extraction.modelType,
              modelTypeOverride: modelCard.extraction.modelTypeOverride,
            },
            equations: (modelCard.equations ?? []).map((equation, index) => ({
              id: equation.id ?? index + 1,
              latex: equation.latex ?? equation.plaintext ?? "",
              plaintext: equation.plaintext ?? equation.latex ?? "",
              meaning: equation.meaning ?? undefined,
              description: equation.description ?? undefined,
              equationType: equation.equationType,
              sourceQuote: equation.sourceQuote ?? "",
            })),
            variables: modelCard.variables.map((variable) => ({
              symbol: String(variable.symbol ?? ""),
              name: variable.name ?? "",
              role: variable.role ?? "",
              unit: variable.unit ?? "",
              sourceQuote: variable.sourceQuote ?? "",
              originalValue: variable.originalValue,
            })),
            parameters: modelCard.parameters.map((parameter) => ({
              symbol: String(parameter.symbol ?? ""),
              name: parameter.name ?? "",
              value: parameter.value,
              valueRaw: parameter.valueRaw,
              valueNumeric: parameter.valueNumeric,
              unit: parameter.unit,
              confidence: parameter.confidence ?? undefined,
              sourceQuote: parameter.sourceQuote ?? "",
              originalValue: parameter.originalValue,
            })),
            assumptionItems: (modelCard.assumptionItems ?? []).map((item) => ({
              text: item.text,
              sourceQuote: item.sourceQuote ?? undefined,
              confidence: item.confidence ?? undefined,
            })),
            limitationItems: (modelCard.limitationItems ?? []).map((item) => ({
              text: item.text,
              sourceQuote: item.sourceQuote ?? undefined,
              confidence: item.confidence ?? undefined,
            })),
            raw: rawExtraction as any,
          }),
        )
      : null;
    const readiness = decideChemEBrainSimulationReadiness({
      featureEnabled: CHEME_BRAIN_READINESS_AUTHORITY_ENABLED,
      report: chemEBrainReport,
      legacySupportedModelType: supportedType,
      parameters: modelCard.parameters,
      equations: modelCard.equations,
      variables: modelCard.variables,
      raw: rawExtraction ?? null,
    });

    if (!readiness.canRunSimulation || !readiness.runtimeModelType) {
      setUnsupportedModelMessage(CHEME_BRAIN_READINESS_AUTHORITY_ENABLED ? readiness.message : SIMULATION_UNSUPPORTED_MESSAGE);
      setValueSource("demo");
      setBoundFields([]);
      setSimResult(null);
      setHasRun(false);
      setLastParams(null);
      return;
    }

    const bound = bindExtractedValues(modelCard, readiness.runtimeModelType);
    setRawParams(bound.rawParams);
    setUnsupportedModelMessage(null);
    setActiveModelType(readiness.runtimeModelType);
    setValueSource(bound.boundFields.length > 0 ? "extracted" : "demo");
    setBoundFields(bound.boundFields);
    setSimResult(null);
    setHasRun(false);
    setLastParams(null);
  }, [canUseModelData, modelCard, rawExtraction]);

  const parsed = useMemo(() => toParams(rawParams), [rawParams]);

  const errors = useMemo<ValidationError[]>(() => {
    if (!isComplete(parsed, activeModelType)) return [];
    return validate(parsed, activeModelType);
  }, [parsed, activeModelType]);

  const warnings = useMemo<Warning[]>(() => {
    if (!isComplete(parsed, activeModelType) || errors.length > 0) return [];
    return getWarnings(parsed, activeModelType);
  }, [parsed, errors, activeModelType]);

  const fieldError = useCallback(
    (field: string) => errors.find((e) => e.field === field)?.message,
    [errors]
  );

  const handleRun = useCallback(() => {
    if (unsupportedModelMessage || !isComplete(parsed, activeModelType) || errors.length > 0) return;
    const result = rk4(
      activeModelType === "batch_culture" ? batchCultureODE : monodChemostatODE,
      {
        initialState: { X: parsed.X0, S: parsed.S0 },
        params: { ...parsed },
        tFinal: parsed.tFinal,
        dt: parsed.dt,
      },
    );
    setSimResult(result);
    setLastParams({ ...parsed });
    setHasRun(true);
  }, [parsed, errors, unsupportedModelMessage, activeModelType]);

  const handleReset = useCallback(() => {
    setRawParams(
      Object.fromEntries(
        Object.entries(DEMO_PARAMS).map(([k, v]) => [k, String(v)])
      )
    );
    setSimResult(null);
    setHasRun(false);
    setLastParams(null);
    setValueSource("demo");
    setBoundFields([]);
    setUnsupportedModelMessage(null);
    setActiveModelType("monod_chemostat");
  }, []);

  const set = (field: string) => (v: string) =>
    setRawParams((prev) => ({ ...prev, [field]: v }));

  const canRun = !unsupportedModelMessage && isComplete(parsed, activeModelType) && errors.length === 0;

  const steadyState = useMemo(() => {
    if (!lastParams || activeModelType !== "monod_chemostat") return null;
    const p = lastParams;
    if (p.D <= 0 || p.D >= p.mumax) return { washout: true };
    const SSS = (p.D * p.Ks) / (p.mumax - p.D);
    const XSS = p.Yxs * (p.Sin - SSS);
    if (SSS < 0 || XSS < 0) return { washout: true };
    return {
      washout: false,
      SSS: SSS.toFixed(4),
      XSS: XSS.toFixed(4),
      muSS: p.D.toFixed(4),
    };
  }, [lastParams]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">
              {activeModelType === "batch_culture"
                ? "Batch Culture Simulation"
                : "Demo Monod Chemostat Simulation"}
            </h1>
            <Badge variant="secondary" className="font-mono text-xs">
              RK4
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {activeModelType === "batch_culture"
              ? "Batch Monod growth culture"
              : "Chemostat / Monod kinetics"}{" "}
            — solved in-browser with 4th-order Runge-Kutta
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            Demo / supported-model simulation, not a universal simulator.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This demo solver is not automatically generated from arbitrary model cards yet.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {valueSource === "extracted" ? "Using extracted values" : "Using demo defaults"}
            {valueSource === "demo" && !canUseModelData ? " (add ?projectId=<id> to use extracted params)" : ""}
            {valueSource === "extracted" && boundFields.length > 0
              ? ` (${boundFields.join(", ")})`
              : ""}
          </p>
          {modelCardQuery.isLoading && canUseModelData ? (
            <p className="text-xs text-muted-foreground mt-1">
              Loading model card for project {modelProjectId}…
            </p>
          ) : null}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Reset to demo
          </Button>
          {simData && lastParams && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv(simData, lastParams, activeModelType)}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Download CSV
            </Button>
          )}
          <Button size="sm" onClick={handleRun} disabled={!canRun}>
            <Play className="h-4 w-4 mr-1.5" />
            Run simulation
          </Button>
        </div>
      </div>

      {unsupportedModelMessage ? (
        <Alert className="border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertTitle>Unsupported model for simulation</AlertTitle>
          <AlertDescription className="text-sm">
            {unsupportedModelMessage} The project parameters were not loaded.
            Open <Link href="/simulation" className="underline underline-offset-2">the demo simulation without a project id</Link> to run the demo model.
          </AlertDescription>
        </Alert>
      ) : null}

      {modelCardQuery.isError && canUseModelData ? (
        <Alert className="border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertTitle>Could not load model card</AlertTitle>
          <AlertDescription className="text-sm">
            Using demo defaults because project {modelProjectId} could not be loaded.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ── validation errors ── */}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fix the following before running</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 mt-1 space-y-0.5 text-sm">
              {errors.map((e) => (
                <li key={e.field}>{e.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* ── warnings ── */}
      {warnings.map((w) => (
        <Alert
          key={w.id}
          className="border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20"
        >
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-sm">{w.message}</AlertDescription>
        </Alert>
      ))}
      {simResult?.clampedNegative && (
        <Alert className="border-red-400/50 bg-red-50/50 dark:bg-red-950/20">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-sm">
            <strong>Numerical instability detected:</strong>{" "}
            {simResult.clampedSymbols.length > 0
              ? `State variable${simResult.clampedSymbols.length > 1 ? "s" : ""} [${simResult.clampedSymbols.join(", ")}] went negative`
              : "A state variable went negative"}{" "}
            and was clamped to 0. This typically indicates the time step Δt is too large or the ODE formulation contains an error. Try reducing Δt.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
        {/* ══ left: parameter cards ══ */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Kinetic Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ParamField
                id="mumax"
                label="Max growth rate"
                symbol="μmax"
                unit="h⁻¹"
                value={rawParams.mumax}
                error={fieldError("mumax")}
                onChange={set("mumax")}
              />
              <ParamField
                id="Ks"
                label="Half-saturation"
                symbol="Ks"
                unit="g/L"
                value={rawParams.Ks}
                error={fieldError("Ks")}
                onChange={set("Ks")}
              />
              <ParamField
                id="Yxs"
                label="Biomass yield"
                symbol="Yxs"
                unit="g-X/g-S"
                value={rawParams.Yxs}
                error={fieldError("Yxs")}
                onChange={set("Yxs")}
              />
            </CardContent>
          </Card>

          {activeModelType === "monod_chemostat" ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Operating Conditions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ParamField
                  id="D"
                  label="Dilution rate"
                  symbol="D"
                  unit="h⁻¹"
                  value={rawParams.D}
                  error={fieldError("D")}
                  onChange={set("D")}
                />
                <ParamField
                  id="Sin"
                  label="Feed substrate"
                  symbol="S_in"
                  unit="g/L"
                  value={rawParams.Sin}
                  error={fieldError("Sin")}
                  onChange={set("Sin")}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Initial Conditions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ParamField
                id="X0"
                label="Initial biomass"
                symbol="X₀"
                unit="g/L"
                value={rawParams.X0}
                error={fieldError("X0")}
                onChange={set("X0")}
              />
              <ParamField
                id="S0"
                label="Initial substrate"
                symbol="S₀"
                unit="g/L"
                value={rawParams.S0}
                error={fieldError("S0")}
                onChange={set("S0")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Solver Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ParamField
                id="tFinal"
                label="Simulation time"
                symbol="t_final"
                unit="h"
                value={rawParams.tFinal}
                error={fieldError("tFinal")}
                onChange={set("tFinal")}
              />
              <ParamField
                id="dt"
                label="Time step"
                symbol="Δt"
                unit="h"
                value={rawParams.dt}
                error={fieldError("dt")}
                onChange={set("dt")}
              />
            </CardContent>
          </Card>

          {/* link to model card */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-4 pb-3 flex items-start gap-3">
              <ActivitySquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Model card</p>
                <p className="text-muted-foreground text-xs mb-2">
                  See the extracted equations and parameters this simulation is
                  based on.
                </p>
                <Link href={canUseModelData ? `/model-cards/${modelProjectId}` : "/model-cards"}>
                  <Button variant="outline" size="sm" className="text-xs h-7">
                    <ExternalLink className="h-3 w-3 mr-1.5" />
                    {canUseModelData ? "Open model card" : "Open model cards"}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ══ right: chart + info ══ */}
        <div className="space-y-4">
          {/* chart card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    Concentration vs. Time
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Biomass{" "}
                    <span className="text-teal-600 dark:text-teal-400 font-semibold">
                      X
                    </span>{" "}
                    and substrate{" "}
                    <span className="text-orange-500 font-semibold">S</span>{" "}
                    trajectories
                    {activeModelType === "monod_chemostat"
                      ? " — dashed lines show analytical steady state"
                      : ""}
                  </CardDescription>
                </div>
                {hasRun && simData && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {simData.length} pts
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!hasRun ? (
                <div className="flex flex-col items-center justify-center h-72 text-center text-muted-foreground space-y-3">
                  <div className="bg-muted/40 p-5 rounded-full">
                    <TrendingUp className="h-10 w-10 opacity-30" />
                  </div>
                  <p className="text-sm max-w-xs">
                    Set parameters and click{" "}
                    <strong className="text-foreground">Run simulation</strong>{" "}
                    to plot biomass and substrate trajectories.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart
                    data={simData ?? []}
                    margin={{ top: 8, right: 20, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted"
                    />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      label={{
                        value: "Time (h)",
                        position: "insideBottom",
                        offset: -12,
                        fontSize: 11,
                      }}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      label={{
                        value: "Concentration (g/L)",
                        angle: -90,
                        position: "insideLeft",
                        offset: 14,
                        fontSize: 11,
                      }}
                      tick={{ fontSize: 11 }}
                      width={60}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
                    />
                    {/* steady-state reference lines */}
                    {steadyState && !steadyState.washout && "XSS" in steadyState && (
                      <ReferenceLine
                        y={parseFloat(steadyState.XSS as string)}
                        stroke="#0d9488"
                        strokeDasharray="5 4"
                        strokeOpacity={0.55}
                        label={{
                          value: `X*=${steadyState.XSS}`,
                          position: "insideTopRight",
                          fontSize: 10,
                          fill: "#0d9488",
                        }}
                      />
                    )}
                    {steadyState && !steadyState.washout && "SSS" in steadyState && (
                      <ReferenceLine
                        y={parseFloat(steadyState.SSS as string)}
                        stroke="#f97316"
                        strokeDasharray="5 4"
                        strokeOpacity={0.55}
                        label={{
                          value: `S*=${steadyState.SSS}`,
                          position: "insideBottomRight",
                          fontSize: 10,
                          fill: "#f97316",
                        }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="X"
                      name="X (biomass)"
                      stroke="#0d9488"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="S"
                      name="S (substrate)"
                      stroke="#f97316"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* steady-state summary */}
          {hasRun && steadyState && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Analytical Steady State
                </CardTitle>
                <CardDescription className="text-xs">
                  Predicted equilibrium at μ* = D (chemostat steady-state
                  condition).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {steadyState.washout ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                    Washout predicted — biomass washes out at this dilution rate.
                    Reduce D below μmax to sustain growth.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-teal-50 dark:bg-teal-950/30 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">
                        X* (steady state)
                      </p>
                      <p className="font-mono text-xl font-semibold text-teal-600 dark:text-teal-400">
                        {steadyState.XSS}
                      </p>
                      <p className="text-xs text-muted-foreground">g/L</p>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">
                        S* (steady state)
                      </p>
                      <p className="font-mono text-xl font-semibold text-orange-500">
                        {steadyState.SSS}
                      </p>
                      <p className="text-xs text-muted-foreground">g/L</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">
                        μ* = D at S.S.
                      </p>
                      <p className="font-mono text-xl font-semibold text-muted-foreground">
                        {steadyState.muSS}
                      </p>
                      <p className="text-xs text-muted-foreground">h⁻¹</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* model explanation */}
          <Card className="bg-muted/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Model Equations
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">
                    Monod growth rate
                  </p>
                  <code className="block bg-background border border-border rounded px-3 py-2 font-mono text-xs">
                    μ = μmax · S / (Ks + S)
                  </code>
                </div>
                {activeModelType === "monod_chemostat" ? (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-medium">
                        Biomass ODE
                      </p>
                      <code className="block bg-background border border-border rounded px-3 py-2 font-mono text-xs">
                        dX/dt = (μ − D) · X
                      </code>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-medium">
                        Substrate ODE
                      </p>
                      <code className="block bg-background border border-border rounded px-3 py-2 font-mono text-xs">
                        dS/dt = D·(S_in−S) − (μ·X)/Yxs
                      </code>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-medium">
                        Biomass ODE
                      </p>
                      <code className="block bg-background border border-border rounded px-3 py-2 font-mono text-xs">
                        dX/dt = μ · X
                      </code>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-medium">
                        Substrate ODE
                      </p>
                      <code className="block bg-background border border-border rounded px-3 py-2 font-mono text-xs">
                        dS/dt = −(μ·X)/Yxs
                      </code>
                    </div>
                  </>
                )}
              </div>
              <Separator />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <p><span className="font-mono font-semibold text-foreground">X</span> — biomass (g/L)</p>
                <p><span className="font-mono font-semibold text-foreground">S</span> — substrate (g/L)</p>
                {activeModelType === "monod_chemostat" ? (
                  <p><span className="font-mono font-semibold text-foreground">D</span> — dilution rate (h⁻¹)</p>
                ) : null}
                <p><span className="font-mono font-semibold text-foreground">Yxs</span> — yield (g-X/g-S)</p>
                <p><span className="font-mono font-semibold text-foreground">μmax</span> — max growth (h⁻¹)</p>
                <p><span className="font-mono font-semibold text-foreground">Ks</span> — half-saturation (g/L)</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Solver: 4th-order Runge-Kutta, capped at 50 000 steps, decimated to ≤ 1 000 plot points for performance.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
