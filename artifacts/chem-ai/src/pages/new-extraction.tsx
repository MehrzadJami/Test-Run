import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";

// ─── Provider config ──────────────────────────────────────────────────────────

type ProviderChoice = "auto" | "mock" | "openai" | "gemini";

const PROVIDER_OPTIONS: {
  value: ProviderChoice;
  label: string;
  description: string;
}[] = [
  {
    value: "auto",
    label: "Auto",
    description: "OpenAI → Gemini → Mock (uses best available key)",
  },
  {
    value: "openai",
    label: "OpenAI (GPT-4o)",
    description: "Requires OPENAI_API_KEY",
  },
  {
    value: "gemini",
    label: "Gemini 1.5 Flash",
    description: "Requires GEMINI_API_KEY",
  },
  {
    value: "mock",
    label: "Mock (demo)",
    description: "Deterministic demo output — no API key needed",
  },
];

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

// ─── Component ───────────────────────────────────────────────────────────────

const MAX_BYTES = 10 * 1024 * 1024;

export default function NewExtraction() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [activeTab, setActiveTab] = useState<"upload" | "paste">("paste");
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const [selectedProvider, setSelectedProvider] =
    useState<ProviderChoice>("auto");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createProject = useCreateProject();
  const addSource = useAddSourceDocument();
  const createExtraction = useCreateExtraction();

  const isBusy =
    createProject.isPending ||
    addSource.isPending ||
    createExtraction.isPending;

  const isRealProvider =
    selectedProvider === "openai" ||
    selectedProvider === "gemini" ||
    selectedProvider === "auto";

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

  function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast({
        title: "File too large",
        description: "Max upload size is 10 MB.",
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setUploadedFile({ name: file.name, content: text });
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

  async function handleExtract() {
    const isUpload = activeTab === "upload";
    const sourceContent = isUpload
      ? (uploadedFile?.content ?? "")
      : pastedText;

    if (!sourceContent.trim()) {
      toast({
        title: "No source provided",
        description: isUpload
          ? "Upload a .txt file first."
          : "Paste source text first, or load a demo.",
        variant: "destructive",
      });
      return;
    }

    const fallbackTitle = isUpload
      ? (uploadedFile?.name ?? "Untitled extraction")
      : (sourceContent.split(/\r?\n/).find((l) => l.trim()) ??
          "Untitled extraction"
        ).slice(0, 80);

    const projectName = title.trim() || fallbackTitle;

    try {
      const project = await createProject.mutateAsync({
        data: { name: projectName, description: "" },
      });

      await addSource.mutateAsync({
        projectId: project.id,
        data: {
          kind: isUpload ? "pdf" : "text",
          filename: isUpload ? (uploadedFile?.name ?? null) : null,
          content: sourceContent,
        },
      });

      await createExtraction.mutateAsync({
        projectId: project.id,
        data: { provider: selectedProvider },
      });

      await queryClient.invalidateQueries({
        queryKey: getListProjectsQueryKey(),
      });

      toast({
        title: "Extraction complete",
        description: `Created model card for "${projectName}".`,
      });

      navigate(`/model-cards/${project.id}`);
    } catch (err) {
      toast({
        title: "Extraction failed",
        description:
          err instanceof Error
            ? err.message
            : "Unknown error talking to the API.",
        variant: "destructive",
      });
    }
  }

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
                Provide the source material for the model extraction.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                value={activeTab}
                onValueChange={(v) =>
                  setActiveTab(v === "upload" ? "upload" : "paste")
                }
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

                <TabsContent value="upload">
                  <div
                    className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 flex flex-col items-center justify-center text-center bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="dropzone-upload"
                  >
                    {uploadedFile ? (
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
                    ) : (
                      <>
                        <UploadCloud className="h-10 w-10 text-muted-foreground mb-4" />
                        <h3 className="text-base font-semibold">
                          Click to upload a text file
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          .txt only — or paste PDF text on the other tab
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">
                          Max 10 MB
                        </p>
                      </>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      ref={fileInputRef}
                      accept=".txt,text/plain"
                      data-testid="input-file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                      }}
                    />
                  </div>
                </TabsContent>

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
                <Label htmlFor="provider-select" className="text-sm font-medium flex items-center gap-1.5">
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
                    {PROVIDER_OPTIONS.map((opt) => (
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

                {/* Provider status badge */}
                {selectedProvider === "mock" && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
                    Demo mode — deterministic output, no API key needed.
                  </p>
                )}
                {selectedProvider === "auto" && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    Uses the best available key: OpenAI → Gemini → Mock.
                  </p>
                )}
                {selectedProvider === "openai" && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                    Falls back to auto-chain if OPENAI_API_KEY is not set.
                  </p>
                )}
                {selectedProvider === "gemini" && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-500" />
                    Falls back to auto-chain if GEMINI_API_KEY is not set.
                  </p>
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
                {isBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isRealProvider
                      ? "Extracting with AI…"
                      : "Extracting…"}
                  </>
                ) : (
                  "Extract Model"
                )}
              </Button>
              {isBusy && isRealProvider && (
                <p className="text-xs text-center text-muted-foreground animate-pulse">
                  Calling AI provider — this may take 10–30 seconds…
                </p>
              )}
              {isBusy && !isRealProvider && (
                <p className="text-xs text-center text-muted-foreground animate-pulse">
                  Creating project and running extraction…
                </p>
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
          </div>
        </div>
      </div>
    </div>
  );
}
