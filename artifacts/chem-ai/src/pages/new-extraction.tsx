import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCreateProject,
  useAddSourceDocument,
  useCreateExtraction,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UploadCloud,
  FileText,
  Loader2,
  FlaskConical,
  Microscope,
  TriangleAlert,
  Zap,
  Bot,
  CheckCircle2,
  XCircle,
  FileSearch,
  KeyRound,
} from "lucide-react";
import {
  MOCK_MODE_POINTS,
  PROVIDER_OPTIONS,
  RULE_BASED_MODE_DESCRIPTION,
  type ProviderChoice,
} from "@/lib/mock-provider-disclosure";
import {
  PDF_FALLBACK_MESSAGE,
  buildParsedPdfSourcePayload,
  buildTextSourcePayload,
  parsedPdfNeedsFallback,
  type ParsedPdfForExtraction,
} from "@/lib/pdf-extraction-flow";
import {
  extractionSubmitStepLabel,
  releaseSubmitLock,
  tryAcquireSubmitLock,
  type ExtractionSubmitStep,
} from "@/lib/extraction-submit-guard";

type ExtractionFailureDetails = {
  validationIssues?: string[];
  debugArtifactPath?: string;
  validationStage?: string;
  model?: string;
  promptVersion?: string;
  schemaVersion?: string;
  responseFormatMode?: string;
};

class ExtractionApiError extends Error {
  constructor(
    message: string,
    readonly details?: ExtractionFailureDetails,
  ) {
    super(message);
    this.name = "ExtractionApiError";
  }
}

// ─── Demo source texts ────────────────────────────────────────────────────────

const DEMO_CHEMOSTAT: { title: string; text: string } = {
  title: "Chemostat — Monod kinetics (Andrews 1968)",
  text: `Continuous Chemostat Culture — Substrate-limited Microalgae Growth Kinetics
Adapted from Andrews, J.F. (1968). Biotechnology and Bioengineering, 10(6), 707-723.

SYSTEM DESCRIPTION
A well-mixed, constant-volume chemostat was operated under continuous steady-state
conditions with continuous nutrient feed and cell harvest at dilution rate D.
Growth kinetics are described by the Monod model for substrate-limited growth.

GOVERNING EQUATIONS

Monod growth rate:
  μ = μmax · S / (Ks + S)

Biomass mass balance:
  dX/dt = (μ − D) · X

Substrate mass balance:
  dS/dt = D · (Sin − S) − (μ / Yxs) · X

PARAMETERS
  μmax = 0.40 h⁻¹      maximum specific growth rate
  Ks   = 0.10 g/L      half-saturation constant for substrate
  D    = 0.20 h⁻¹      dilution rate (operator-set)
  Sin  = 10.0 g/L      feed substrate concentration
  Yxs  = 0.50 g-X/g-S  biomass yield on substrate

STATE VARIABLES
  X  — biomass concentration (g/L),   initial condition: X₀ = 0.5 g/L
  S  — limiting substrate (g/L),      initial condition: S₀ = 5.0 g/L

ASSUMPTIONS
  1. The culture vessel is perfectly mixed (continuous stirred-tank reactor).
  2. Cell death and maintenance energy are negligible.
  3. Temperature and pH are held constant throughout.
  4. Only one substrate limits growth.
  5. The yield coefficient Yxs is constant over the concentration range studied.

LIMITATIONS
  - The Monod model does not capture substrate inhibition at elevated concentrations.
  - Product formation and product inhibition are not included.
  - The model was validated only under steady-state chemostat conditions.
  - Light limitation (for photosynthetic cultures) is not represented.`,
};

const DEMO_BIOREACTOR: { title: string; text: string } = {
  title: "Aerobic Bioreactor — Gas-liquid O₂ transfer",
  text: `Aerobic Stirred-Tank Bioreactor — Gas-Liquid Oxygen Transfer Kinetics

SYSTEM DESCRIPTION
A stirred-tank aerobic bioreactor with continuous air sparging was modelled.
Dissolved oxygen (DO) transfer from the gas phase to the liquid phase is the
rate-limiting step. Biomass growth depends directly on dissolved oxygen
availability.

GOVERNING EQUATIONS

Oxygen transfer rate (OTR) from gas to liquid:
  OTR = kLa · (C* − CL)

Oxygen uptake rate by biomass (OUR):
  OUR = qO2 · X

Dissolved oxygen (DO) balance:
  dCL/dt = kLa · (C* − CL) − qO2 · X

Biomass balance (oxygen-limited continuous culture):
  dX/dt = (μ − D) · X
  where μ = μmax · CL / (KO + CL)  (Monod kinetics on DO)

PARAMETERS
  kLa  = 200   h⁻¹          volumetric oxygen mass transfer coefficient
  C*   = 7.5   mg-O2/L      dissolved O₂ saturation at 37°C, 1 atm
  qO2  = 50    mg-O2/g-X/h  specific oxygen uptake rate
  KO   = 0.05  mg-O2/L      O₂ half-saturation constant for growth
  μmax = 0.35  h⁻¹          maximum specific growth rate (O₂-limited)
  D    = 0.10  h⁻¹          dilution rate

STATE VARIABLES
  CL — dissolved oxygen concentration (mg/L),  initial: CL₀ = 7.5 mg/L
  X  — biomass concentration (g/L),            initial: X₀ = 0.2 g/L

ASSUMPTIONS
  1. Gas-phase oxygen concentration is constant (excess air supply assumed).
  2. kLa is constant at fixed agitation speed and aeration rate.
  3. Dissolved oxygen is the sole limiting nutrient in this model.
  4. Henry's law applies for O₂/water equilibrium at 37°C and 1 atm.
  5. CO₂ accumulation and pH effects on kLa are negligible.

LIMITATIONS
  - CO₂ stripping and carbonate buffer effects are not included.
  - Foam formation at high agitation is not modelled.
  - Substrate (carbon source) limitation is not considered.
  - kLa is assumed scale-independent, which may not hold for large vessels.`,
};

// ─── PDF parse helpers ────────────────────────────────────────────────────────

const MAX_TXT_BYTES = 10 * 1024 * 1024; // 10 MB for plain text files
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB for PDF files

type ParsedPdf = ParsedPdfForExtraction;

/** Read a File as a base64 data-URL and strip the header prefix. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

// How many characters of PDF extracted text to show in the preview
const PREVIEW_CHARS = 1800;
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3.1:8b";

type ProviderStatus = {
  groq?: {
    available: boolean;
    reason: string;
    model: string;
    freeTierMode: boolean;
    limits: {
      maxChunksPerExtraction: number;
      maxTokensPerExtraction: number;
      maxExtractionsPerDay: number;
      maxInputTokensPerRequest: number;
      maxOutputTokensPerRequest: number;
    };
    usageToday: {
      requests: number;
      estimatedTokens: number;
      extractions: number;
    };
  };
  autoProvider?: string;
};

function estimateGroqPdfCost(parsedPdf: ParsedPdf | null, status?: ProviderStatus) {
  const groq = status?.groq;
  const chunks = parsedPdf?.structuredDocument?.chunks ?? [];
  if (!parsedPdf || !groq || chunks.length === 0) return null;
  const selectedChunks = Math.min(chunks.length, groq.limits.maxChunksPerExtraction);
  const selectedText = chunks
    .slice(0, selectedChunks)
    .map((chunk) => chunk.text)
    .join("\n\n");
  const estimatedInputTokens = Math.ceil(selectedText.length / 4);
  const estimatedTotalTokens = estimatedInputTokens + groq.limits.maxOutputTokensPerRequest;
  return {
    selectedChunks,
    totalChunks: chunks.length,
    estimatedInputTokens,
    estimatedTotalTokens,
    fitsBudget:
      estimatedInputTokens <= groq.limits.maxInputTokensPerRequest &&
      estimatedTotalTokens <= groq.limits.maxTokensPerExtraction &&
      groq.usageToday.extractions < groq.limits.maxExtractionsPerDay,
  };
}

export default function NewExtraction() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [activeTab, setActiveTab] = useState<"upload" | "paste">("paste");
  const [selectedProvider, setSelectedProvider] =
    useState<ProviderChoice>("auto");
  const [openaiKey, setOpenaiKey] = useState(
    () => localStorage.getItem("chemai_openai_key") ?? "",
  );
  const [geminiKey, setGeminiKey] = useState(
    () => localStorage.getItem("chemai_gemini_key") ?? "",
  );
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(
    () => localStorage.getItem("chemai_ollama_base_url") ?? DEFAULT_OLLAMA_BASE_URL,
  );
  const [ollamaModel, setOllamaModel] = useState(
    () => localStorage.getItem("chemai_ollama_model") ?? DEFAULT_OLLAMA_MODEL,
  );

  // ── Text file upload state ──────────────────────────────────────────────────
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    content: string;
  } | null>(null);

  // ── PDF upload state ────────────────────────────────────────────────────────
  const [parsedPdf, setParsedPdf] = useState<ParsedPdf | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [submitLocked, setSubmitLocked] = useState(false);
  const [submitStep, setSubmitStep] = useState<ExtractionSubmitStep>("idle");
  const [extractionFailure, setExtractionFailure] = useState<{
    message: string;
    details?: ExtractionFailureDetails;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitLockRef = useRef(false);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const createProject = useCreateProject();
  const addSource = useAddSourceDocument();
  const createExtraction = useCreateExtraction();
  const providerStatus = useQuery<ProviderStatus>({
    queryKey: ["provider-status"],
    queryFn: async () => {
      const response = await fetch("/api/providers/status");
      if (!response.ok) throw new Error("Provider status unavailable");
      return (await response.json()) as ProviderStatus;
    },
    staleTime: 30_000,
  });

  const isBusy =
    isParsing ||
    submitLocked ||
    createProject.isPending ||
    addSource.isPending ||
    createExtraction.isPending;

  const isMockDemoProvider = selectedProvider === "mock";
  const isRuleBasedProvider = selectedProvider === "rule_based";
  const hasOpenAiKey = openaiKey.trim().length > 0;
  const hasGeminiKey = geminiKey.trim().length > 0;
  const hasStoredOllamaConfig =
    localStorage.getItem("chemai_ollama_base_url") !== null ||
    localStorage.getItem("chemai_ollama_model") !== null;
  const hasExplicitOllamaConfig =
    hasStoredOllamaConfig && ollamaBaseUrl.trim().length > 0;
  const hasGroqConfigured = providerStatus.data?.groq?.available === true;
  const groqEstimate = estimateGroqPdfCost(parsedPdf, providerStatus.data);
  const shouldSendOllamaHeaders =
    selectedProvider === "ollama" ||
    (selectedProvider === "auto" && hasExplicitOllamaConfig);
  const visibleProviderOptions = PROVIDER_OPTIONS.filter((option) => {
    if (option.value === "openai") return hasOpenAiKey;
    if (option.value === "gemini") return hasGeminiKey;
    return true;
  });
  const autoWillUseRuleBasedFirst =
    selectedProvider === "auto" &&
    !hasOpenAiKey &&
    !hasGeminiKey &&
    !hasGroqConfigured &&
    !hasExplicitOllamaConfig;

  useEffect(() => {
    if (selectedProvider === "openai" && !hasOpenAiKey) {
      setSelectedProvider("auto");
    }
    if (selectedProvider === "gemini" && !hasGeminiKey) {
      setSelectedProvider("auto");
    }
  }, [hasGeminiKey, hasOpenAiKey, selectedProvider]);

  // ── Derived source content ──────────────────────────────────────────────────
  function getSourceContent(): string {
    if (activeTab === "upload") {
      if (parsedPdf) return parsedPdf.text;
      return uploadedFile?.content ?? "";
    }
    return pastedText;
  }

  // ── Demo loader ─────────────────────────────────────────────────────────────
  function loadDemo(type: "chemostat" | "bioreactor") {
    const demo = type === "chemostat" ? DEMO_CHEMOSTAT : DEMO_BIOREACTOR;
    setActiveTab("paste");
    setTitle(demo.title);
    setPastedText(demo.text);
    toast({
      title: "Demo text loaded",
      description: `"${demo.title}" — click Extract Model to run the extraction.`,
    });
  }

  // ── Plain text file handler ─────────────────────────────────────────────────
  function handleTextFile(file: File) {
    if (file.size > MAX_TXT_BYTES) {
      toast({
        title: "File too large",
        description: "Max size for text files is 10 MB.",
        variant: "destructive",
      });
      return;
    }
    // Clear any PDF state when switching to a text file
    setParsedPdf(null);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = () => {
      setUploadedFile({ name: file.name, content: String(reader.result ?? "") });
    };
    reader.onerror = () => {
      toast({
        title: "Failed to read file",
        description: "Try a plain .txt file or paste the text directly.",
        variant: "destructive",
      });
    };
    reader.readAsText(file);
  }

  // ── PDF file handler ────────────────────────────────────────────────────────
  async function handlePdfFile(file: File) {
    if (file.size > MAX_PDF_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setParseError(
        `PDF is ${mb} MB — the limit is 20 MB. Paste the relevant sections manually instead.`,
      );
      return;
    }

    // Clear previous results
    setUploadedFile(null);
    setParsedPdf(null);
    setParseError(null);
    setShowFullPreview(false);
    setIsParsing(true);

    try {
      const base64 = await fileToBase64(file);

      const response = await fetch("/api/pdf/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64 }),
      });

      const data = (await response.json()) as
        | {
            text: string;
            pageCount: number;
            charCount: number;
            wordCount: number;
            structuredDocument?: ParsedPdf["structuredDocument"];
          }
        | { error: string };

      if (!response.ok || "error" in data) {
        const msg =
          "error" in data
            ? data.error
            : "PDF parsing failed. Please paste the text manually.";
        setParseError(msg);
        return;
      }

      const nextParsedPdf: ParsedPdf = {
        name: file.name,
        text: data.text,
        pageCount: data.pageCount,
        charCount: data.charCount,
        wordCount: data.wordCount,
        structuredDocument: data.structuredDocument,
      };
      if (parsedPdfNeedsFallback(nextParsedPdf)) {
        setParseError(PDF_FALLBACK_MESSAGE);
        return;
      }

      setParsedPdf({
        ...nextParsedPdf,
      });
    } catch {
      setParseError(
        "Could not reach the server while parsing the PDF. Please check your connection or paste the text manually.",
      );
    } finally {
      setIsParsing(false);
    }
  }

  // ── File picker dispatcher ──────────────────────────────────────────────────
  function handleFileChosen(file: File) {
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      void handlePdfFile(file);
    } else {
      handleTextFile(file);
    }
  }

  // ── Extraction submit ───────────────────────────────────────────────────────
  async function handleExtract() {
    if (!tryAcquireSubmitLock(submitLockRef)) return;
    setSubmitLocked(true);
    setSubmitStep("creating_project");
    setExtractionFailure(null);
    let keepLockedForNavigation = false;

    const sourceContent = getSourceContent();
    const isUpload = activeTab === "upload";

    try {
      if (!sourceContent.trim()) {
        toast({
          title: "No source provided",
          description: isUpload
            ? parsedPdf === null
              ? "Upload a PDF or .txt file first."
              : "No text was extracted from the PDF."
            : "Paste source text first, or load a demo.",
          variant: "destructive",
        });
        return;
      }

      const fallbackTitle = isUpload
        ? (parsedPdf?.name ?? uploadedFile?.name ?? "Untitled extraction")
        : (sourceContent.split(/\r?\n/).find((l) => l.trim()) ??
            "Untitled extraction"
          ).slice(0, 80);

      const projectName = title.trim() || fallbackTitle;

      const project = await createProject.mutateAsync({
        data: { name: projectName, description: "" },
      });

      setSubmitStep("saving_source");
      const sourcePayload =
        parsedPdf && isUpload
          ? buildParsedPdfSourcePayload(parsedPdf)
          : buildTextSourcePayload(
              sourceContent,
              isUpload ? (uploadedFile?.name ?? null) : null,
            );

      await addSource.mutateAsync({
        projectId: project.id,
        data: sourcePayload,
      });
      setSubmitStep("extracting_model");
      const extractionRes = await fetch(`/api/projects/${project.id}/extractions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(openaiKey ? { "x-openai-api-key": openaiKey } : {}),
          ...(geminiKey ? { "x-gemini-api-key": geminiKey } : {}),
          ...(shouldSendOllamaHeaders && ollamaBaseUrl
            ? { "x-ollama-base-url": ollamaBaseUrl }
            : {}),
          ...(shouldSendOllamaHeaders && ollamaModel
            ? { "x-ollama-model": ollamaModel }
            : {}),
        },
        body: JSON.stringify({ provider: selectedProvider }),
      });
      if (!extractionRes.ok) {
        const data = (await extractionRes.json()) as {
          error?: string;
          details?: ExtractionFailureDetails;
        };
        throw new ExtractionApiError(data.error ?? "Extraction failed", data.details);
      }

      await queryClient.invalidateQueries({
        queryKey: getListProjectsQueryKey(),
      });

      toast({
        title: "Extraction complete",
        description: `Created model card for "${projectName}".`,
      });

      setSubmitStep("opening_model_card");
      keepLockedForNavigation = true;
      navigate(`/model-cards/${project.id}`);
    } catch (err) {
      if (err instanceof ExtractionApiError) {
        setExtractionFailure({
          message: err.message,
          details: err.details,
        });
      } else if (err instanceof Error) {
        setExtractionFailure({ message: err.message });
      } else {
        setExtractionFailure({ message: "Unknown error talking to the API." });
      }
      toast({
        title: "Extraction failed",
        description:
          err instanceof Error
            ? err.message
            : "Unknown error talking to the API.",
        variant: "destructive",
      });
    } finally {
      if (!keepLockedForNavigation) {
        releaseSubmitLock(submitLockRef);
        setSubmitLocked(false);
        setSubmitStep("idle");
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          New Extraction
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Upload a published paper or paste scientific text to extract model
          artifacts — equations, variables, parameters, assumptions, and
          missing-information reports.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Provider API Keys (browser local)
          </CardTitle>
          <CardDescription>
            Stored only in your browser and sent as request headers for this extraction.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>OpenAI API Key</Label>
            <Input
              type="password"
              value={openaiKey}
              onChange={(e) => {
                setOpenaiKey(e.target.value);
                localStorage.setItem("chemai_openai_key", e.target.value);
              }}
              placeholder="sk-..."
            />
          </div>
          <div className="space-y-2">
            <Label>Gemini API Key</Label>
            <Input
              type="password"
              value={geminiKey}
              onChange={(e) => {
                setGeminiKey(e.target.value);
                localStorage.setItem("chemai_gemini_key", e.target.value);
              }}
              placeholder="AIza..."
            />
          </div>
          <div className="space-y-2">
            <Label>Ollama Base URL</Label>
            <Input
              value={ollamaBaseUrl}
              onChange={(e) => {
                setOllamaBaseUrl(e.target.value);
                localStorage.setItem("chemai_ollama_base_url", e.target.value);
              }}
              placeholder="http://localhost:11434"
            />
          </div>
          <div className="space-y-2">
            <Label>Ollama Model</Label>
            <Input
              value={ollamaModel}
              onChange={(e) => {
                setOllamaModel(e.target.value);
                localStorage.setItem("chemai_ollama_model", e.target.value);
              }}
              placeholder="llama3.1:8b"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Verification warning ── */}
      <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
        <TriangleAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Manual verification required
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            AI-extracted equations, parameters, units, and assumptions{" "}
            <strong>must be manually verified</strong> against the original
            source before use in simulation, design, or publication. AI models
            can hallucinate values, misread notation, or omit constraints.
          </p>
        </div>
      </div>

      {/* ── Mock mode disclosure ── */}
      <div
        className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
        data-testid="mock-mode-disclosure"
      >
        <TriangleAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Mock demo mode is not real extraction
          </p>
          <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-400 leading-relaxed list-disc pl-4">
            {MOCK_MODE_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Configure OpenAI, Gemini, Groq, or a local provider to analyze source text.
          </p>
        </div>
      </div>

      {/* ── Demo workflow ── */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-primary">
              Load a demo source text
            </h2>
          </div>
          <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
            Works with any provider
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Pre-fills the paste tab with a realistic methodology excerpt from
          chemical engineering literature. Select a provider below, then click
          Extract Model.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 border-primary/30 hover:bg-primary/10"
            onClick={() => loadDemo("chemostat")}
            data-testid="btn-demo-chemostat"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Monod Chemostat (Andrews 1968)
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 border-primary/30 hover:bg-primary/10"
            onClick={() => loadDemo("bioreactor")}
            data-testid="btn-demo-bioreactor"
          >
            <Microscope className="h-3.5 w-3.5" />
            Aerobic Bioreactor — O₂ transfer
          </Button>
        </div>
      </div>

      {/* ── Main form ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {/* Source input */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Extraction Source</CardTitle>
              <CardDescription>
                Upload a PDF or plain-text file, or paste text directly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                value={activeTab}
                onValueChange={(v) => {
                  setActiveTab(v === "upload" ? "upload" : "paste");
                }}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="upload" data-testid="tab-upload">
                    Upload Document
                  </TabsTrigger>
                  <TabsTrigger value="paste" data-testid="tab-paste">
                    Paste Text
                  </TabsTrigger>
                </TabsList>

                {/* ── Upload tab ── */}
                <TabsContent value="upload" className="space-y-4">

                  {/* Dropzone */}
                  <div
                    className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-10 flex flex-col items-center justify-center text-center bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => !isBusy && fileInputRef.current?.click()}
                    data-testid="dropzone-upload"
                  >
                    {isParsing ? (
                      <>
                        <Loader2 className="h-10 w-10 text-primary mb-4 animate-spin" />
                        <h3 className="text-base font-semibold">Parsing PDF…</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Extracting text server-side, please wait.
                        </p>
                      </>
                    ) : parsedPdf ? (
                      <>
                        <CheckCircle2 className="h-10 w-10 text-green-500 mb-4" />
                        <h3 className="text-base font-semibold">
                          {parsedPdf.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {parsedPdf.pageCount} pages ·{" "}
                          {parsedPdf.charCount.toLocaleString()} characters ·{" "}
                          {parsedPdf.wordCount.toLocaleString()} words
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Click to replace
                        </p>
                      </>
                    ) : uploadedFile ? (
                      <>
                        <FileText className="h-10 w-10 text-primary mb-4" />
                        <h3 className="text-base font-semibold">
                          {uploadedFile.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {uploadedFile.content.length.toLocaleString()}{" "}
                          characters loaded — click to replace
                        </p>
                      </>
                    ) : parseError ? (
                      <>
                        <XCircle className="h-10 w-10 text-destructive mb-4" />
                        <h3 className="text-base font-semibold text-destructive">
                          Parse failed
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                          {parseError}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-2">
                          Click to try another file
                        </p>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-10 w-10 text-muted-foreground mb-4" />
                        <h3 className="text-base font-semibold">
                          Click to upload
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          PDF (text-based) or .txt file
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">
                          PDF max 20 MB · 200 pages · text-based only
                        </p>
                      </>
                    )}

                    <input
                      type="file"
                      className="hidden"
                      ref={fileInputRef}
                      accept=".pdf,application/pdf,.txt,text/plain"
                      data-testid="input-file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileChosen(file);
                        // reset so the same file can be re-selected
                        e.target.value = "";
                      }}
                    />
                  </div>

                  {/* ── PDF extracted text preview ── */}
                  {parsedPdf && (
                    <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <FileSearch className="h-4 w-4 text-green-600 dark:text-green-400" />
                          <span className="text-sm font-semibold text-green-800 dark:text-green-300">
                            Extracted text preview
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="text-xs">
                            {parsedPdf.pageCount} pages
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {parsedPdf.charCount.toLocaleString()} chars
                          </Badge>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Review the extracted text below, then click{" "}
                        <strong>Extract Model</strong> to proceed.
                      </p>

                      <div className="relative">
                        <pre className="text-xs font-mono bg-background/70 border rounded p-3 max-h-52 overflow-y-auto whitespace-pre-wrap break-words text-foreground/80 leading-relaxed">
                          {showFullPreview
                            ? parsedPdf.text
                            : parsedPdf.text.slice(0, PREVIEW_CHARS)}
                          {!showFullPreview &&
                            parsedPdf.text.length > PREVIEW_CHARS && (
                              <span className="text-muted-foreground">
                                {"\n"}…
                              </span>
                            )}
                        </pre>
                        {parsedPdf.text.length > PREVIEW_CHARS && (
                          <button
                            className="mt-1 text-xs text-primary hover:underline"
                            onClick={() =>
                              setShowFullPreview((v) => !v)
                            }
                          >
                            {showFullPreview
                              ? "Show less"
                              : `Show all ${parsedPdf.charCount.toLocaleString()} characters`}
                          </button>
                        )}
                      </div>

                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        If the text looks garbled or missing equations, the PDF
                        may be image-based. Switch to the Paste Text tab and
                        paste the content manually.
                      </p>
                    </div>
                  )}

                  {/* Error hint below dropzone (additional context) */}
                  {parseError && (
                    <p className="text-xs text-muted-foreground">
                      Tip: Use the <strong>Paste Text</strong> tab to paste
                      content from a PDF viewer directly.
                    </p>
                  )}
                </TabsContent>

                {/* ── Paste tab (unchanged) ── */}
                <TabsContent value="paste">
                  <div className="space-y-3">
                    <Label htmlFor="raw-text" className="text-sm font-medium">
                      Raw Scientific Text
                    </Label>
                    <Textarea
                      id="raw-text"
                      placeholder="Paste methodology sections, equations, or parameter tables here…"
                      className="min-h-[320px] font-mono text-sm resize-y"
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      data-testid="input-paste-text"
                    />
                    <p className="text-xs text-muted-foreground">
                      {pastedText.length > 0
                        ? `${pastedText.length.toLocaleString()} characters`
                        : "Include equations, parameters, variables, and any assumptions you can find."}
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Settings sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Extraction Settings</CardTitle>
              <CardDescription>
                Configure the AI provider and project name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Provider selector */}
              <div className="space-y-2">
                <Label
                  htmlFor="provider-select"
                  className="text-sm font-medium flex items-center gap-1.5"
                >
                  <Bot className="h-3.5 w-3.5" />
                  AI Provider
                </Label>
                <Select
                  value={selectedProvider}
                  onValueChange={(v) =>
                    setSelectedProvider(v as ProviderChoice)
                  }
                >
                  <SelectTrigger
                    id="provider-select"
                    data-testid="select-provider"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleProviderOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex flex-col py-0.5">
                          <span className="font-medium">{opt.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {opt.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedProvider === "rule_based" && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5" />
                    {RULE_BASED_MODE_DESCRIPTION}
                  </p>
                )}
                {selectedProvider === "mock" && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                    <TriangleAlert className="h-3 w-3 mt-0.5 shrink-0" />
                    Mock demo: fixed chemostat fixture.
                  </p>
                )}
                {selectedProvider === "auto" && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Zap className="h-3 w-3 mt-0.5 shrink-0" />
                    {autoWillUseRuleBasedFirst
                      ? "Auto will use Rule-based local mode. Mock is explicit demo mode only."
                      : "Auto tries configured providers first, then Rule-based local mode. Mock is explicit demo mode only."}
                  </p>
                )}
                {selectedProvider === "openai" && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                    Uses the OpenAI key configured in this browser for this extraction.
                  </p>
                )}
                {selectedProvider === "gemini" && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-500" />
                    Uses the Gemini key configured in this browser for this extraction.
                  </p>
                )}
                {selectedProvider === "groq" && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-500 mt-1.5" />
                    {providerStatus.data?.groq?.available
                      ? `Groq configured on the server using ${providerStatus.data.groq.model}. Paper text is sent to Groq cloud AI.`
                      : "Groq API key missing on the server. Set GROQ_API_KEY to use this provider."}
                  </p>
                )}
                {selectedProvider === "ollama" && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-500" />
                    Requires a reachable local Ollama server.
                  </p>
                )}
                {providerStatus.data?.groq && (
                  <div className="rounded-md border border-sky-500/25 bg-sky-500/5 p-3 text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">Groq status</span>
                      <Badge variant="outline" className="text-[10px]">
                        {providerStatus.data.groq.available
                          ? "Groq configured"
                          : "Groq API key missing"}
                      </Badge>
                    </div>
                    <p>
                      Free-tier mode {providerStatus.data.groq.freeTierMode ? "on" : "off"}: max {providerStatus.data.groq.limits.maxChunksPerExtraction} chunks, {providerStatus.data.groq.limits.maxTokensPerExtraction.toLocaleString()} tokens per extraction, {providerStatus.data.groq.limits.maxExtractionsPerDay} extractions/day.
                    </p>
                    {groqEstimate && parsedPdf && (
                      <p>
                        PDF estimate: {groqEstimate.selectedChunks}/{groqEstimate.totalChunks} chunks, ~{groqEstimate.estimatedTotalTokens.toLocaleString()} tokens, {groqEstimate.fitsBudget ? "fits current budget" : "would exceed current budget"}.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Project title */}
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-medium">
                  Project title{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="title"
                  placeholder="e.g. CSTR isothermal model"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="input-title"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to derive from the source text.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button
                className="w-full h-11 text-base font-semibold"
                size="lg"
                onClick={handleExtract}
                disabled={isBusy}
                data-testid="btn-extract"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Parsing PDF…
                  </>
                ) : isBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {submitStep !== "idle"
                      ? extractionSubmitStepLabel(submitStep)
                      : parsedPdf
                      ? "Extracting model from PDF..."
                      : isMockDemoProvider
                      ? "Running Mock demo…"
                      : isRuleBasedProvider
                      ? "Running rule-based local extraction…"
                      : selectedProvider === "groq"
                      ? "Running Groq paper understanding…"
                      : "Running extraction…"}
                  </>
                ) : parsedPdf ? (
                  "Confirm & Extract Model"
                ) : (
                  "Extract Model"
                )}
              </Button>
              {isBusy && !isParsing && !isMockDemoProvider && (
                <p className="text-xs text-center text-muted-foreground animate-pulse">
                  {submitStep !== "idle"
                    ? extractionSubmitStepLabel(submitStep)
                    : isRuleBasedProvider
                    ? parsedPdf
                      ? "Extracting model from PDF..."
                      : "Extracting obvious equations, parameters, and units with deterministic local patterns…"
                    : selectedProvider === "groq"
                    ? "Using server-side Groq with conservative free-tier chunk and token limits…"
                    : "Running the selected provider. Auto uses Rule-based local mode when no configured provider is available; Mock is explicit demo mode only."}
                </p>
              )}
              {isBusy && !isParsing && isMockDemoProvider && (
                <p className="text-xs text-center text-muted-foreground animate-pulse">
                  Creating project and loading fixed MockProvider demo output…
                </p>
              )}
              {extractionFailure && (
                <div className="w-full rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-2">
                  <p className="font-medium">{extractionFailure.message}</p>
                  {extractionFailure.details?.validationIssues?.length ? (
                    <div className="space-y-1">
                      <p className="font-medium">Top validation issues</p>
                      <ul className="list-disc pl-4 space-y-1">
                        {extractionFailure.details.validationIssues.slice(0, 5).map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {extractionFailure.details?.debugArtifactPath ? (
                    <p>
                      Debug artifact:{" "}
                      <code className="break-all">
                        {extractionFailure.details.debugArtifactPath}
                      </code>
                    </p>
                  ) : null}
                  {(extractionFailure.details?.promptVersion ||
                    extractionFailure.details?.schemaVersion) ? (
                    <p className="text-destructive/80">
                      Prompt/schema: {extractionFailure.details.promptVersion ?? "unknown"} /{" "}
                      {extractionFailure.details.schemaVersion ?? "unknown"}
                    </p>
                  ) : null}
                </div>
              )}
            </CardFooter>
          </Card>

          {/* Tip box */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground space-y-2">
            <p className="font-medium text-foreground text-xs">
              What gets extracted
            </p>
            <ul className="space-y-1">
              {[
                "State variables with units and roles",
                "Parameters with values and source quotes",
                "Equations in LaTeX with source context",
                "Assumptions and limitations",
                "Missing information report",
              ].map((item) => (
                <li key={item} className="flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">·</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="pt-1 border-t border-border/50">
              <strong className="text-foreground">PDF tip:</strong> Text-based
              PDFs only. For scanned documents, copy-paste from your PDF
              viewer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
