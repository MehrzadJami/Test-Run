import { useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetModelCardByProject,
  useGetProject,
  useUpdateProjectVisibility,
  getGetModelCardByProjectQueryKey,
  getGetProjectQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertCircle,
  FileText,
  Database,
  Code2,
  Download,
  Sparkles,
  Play,
  Info,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  CheckCircle2,
  XCircle,
  TriangleAlert,
  Package,
  Loader2,
  Globe,
  Lock,
  Share2,
  Check,
} from "lucide-react";
import {
  analyzeReproducibility,
  type ReproducibilityReport,
  type MissingSeverity,
} from "@/lib/reproducibility";
import { runUnitCheck, type UnitCheckReport, type UnitWarnSeverity } from "@/lib/unit-checker";
import {
  analyzeModelAssembly,
  type MissingRequirementSeverity,
  type ModelAssemblyReport,
} from "@/lib/model-assembly";
import {
  runFormalDimensionalAnalysis,
  type FormalCheckReport,
  type FormalEqResult,
} from "@/lib/dimensional-analysis";
import { generatePythonOdeTemplate } from "@/lib/python-generator";
import { generateJupyterNotebook } from "@/lib/notebook-generator";
import { buildAggregatedModelCard, detectConflicts } from "@/lib/multi-source";
import { matchTemplates, type TemplateScanResult, type RunnableTemplateStatus } from "@/lib/template-matcher";
import { generateModelPackage } from "@/lib/package-generator";
import { isMockProvider, MOCK_PROVIDER_WARNING } from "@/lib/mock-provider-disclosure";
import {
  isSupportedSimulationModel,
  SIMULATION_UNSUPPORTED_MESSAGE,
} from "@/lib/simulation-support";
import { VariablesTab } from "@/components/model-card/VariablesTab";
import { ParametersTab } from "@/components/model-card/ParametersTab";
import { EquationsTab } from "@/components/model-card/EquationsTab";
import { AssumptionsTab } from "@/components/model-card/AssumptionsTab";
import { AuditTrailTab } from "@/components/model-card/AuditTrailTab";
import { DomainChecklistTab } from "@/components/model-card/DomainChecklistTab";
import { MODEL_TYPE_DISPLAY_NAMES, MODEL_TYPES } from "@workspace/domain-classifier";
import type { ModelType } from "@workspace/domain-classifier";

// ─── Local raw-extraction passthrough types ────────────────────────────────────

type Confidence = "high" | "medium" | "low";

type RawStateVariable = {
  symbol?: string;
  name?: string;
  meaning?: string;
  unit?: string;
  role?: string;
  source_context?: string;
  confidence?: Confidence;
};

type RawParameter = {
  symbol?: string;
  name?: string;
  value?: string;
  unit?: string;
  source_context?: string;
  confidence?: Confidence;
};

type RawEquation = {
  label?: string;
  equation_latex?: string;
  equation_plaintext?: string;
  meaning?: string;
  variables_involved?: string[];
  source_context?: string;
  confidence?: Confidence;
};

type RawAssumption = {
  assumption?: string;
  source_context?: string;
  confidence?: Confidence;
};

type RawLimitation = {
  limitation?: string;
  source_context?: string;
  confidence?: Confidence;
};

type RawModelCard = {
  short_summary?: string;
  model_type?: string;
  inputs?: string[];
  outputs?: string[];
  control_variables?: string[];
  missing_information?: string[];
  can_generate_ode_template?: boolean;
};

type RawExtraction = {
  paper_title_or_topic?: string;
  system_type?: string;
  process_description?: string;
  state_variables?: RawStateVariable[];
  parameters?: RawParameter[];
  equations?: RawEquation[];
  assumptions?: RawAssumption[];
  limitations?: RawLimitation[];
  model_card?: RawModelCard;
};

type ReviewStatus =
  | "extracted"
  | "needs_review"
  | "reviewed"
  | "verified"
  | "rejected";

type LocalReviewData = {
  status: ReviewStatus;
  reviewer_name?: string;
  review_notes: string;
  reviewed_at?: string;
  verification_status?: string;
  issues_found: string[];
  checklist: {
    equations_checked: boolean;
    units_checked: boolean;
    parameters_checked: boolean;
    initial_conditions_checked: boolean;
    assumptions_checked: boolean;
    code_scaffold_checked: boolean;
  };
};

// ─── Small shared display components ─────────────────────────────────────────

function ChipList({ items }: { items: string[] }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground italic">—</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s, i) => (
        <span
          key={`${s}-${i}`}
          className="inline-flex items-center font-mono text-xs bg-muted/50 rounded px-2 py-1"
        >
          {s}
        </span>
      ))}
    </div>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
      <AlertCircle className="w-12 h-12 text-destructive" />
      <h2 className="text-2xl font-bold">{message}</h2>
      <Link href="/model-cards">
        <Button variant="outline">Back to Model Cards</Button>
      </Link>
    </div>
  );
}

// ─── Reproducibility-tab sub-components ───────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-400";
  return "bg-destructive";
}

function scoreTextColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function ScoreBar({
  label,
  score,
  description,
}: {
  label: string;
  score: number;
  description?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={`font-mono font-bold ${scoreTextColor(score)}`}>
          {score}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function ReadinessBadge({
  readiness,
}: {
  readiness: ReproducibilityReport["simulation_readiness"];
}) {
  if (readiness === "ready") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold text-sm">Simulation Ready</p>
          <p className="text-xs opacity-80">
            Equations, parameters, units, and initial conditions are
            sufficiently complete.
          </p>
        </div>
      </div>
    );
  }
  if (readiness === "partial") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400">
        <ShieldAlert className="h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold text-sm">Partially Ready</p>
          <p className="text-xs opacity-80">
            Some critical information is missing. Review blockers before
            attempting simulation.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
      <ShieldOff className="h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold text-sm">Not Ready for Simulation</p>
        <p className="text-xs opacity-80">
          Critical information is missing. The model cannot be reliably
          reproduced or simulated without further extraction.
        </p>
      </div>
    </div>
  );
}

const SEVERITY_CONFIG: Record<
  MissingSeverity,
  {
    icon: typeof XCircle;
    classes: string;
    label: string;
  }
> = {
  critical: {
    icon: XCircle,
    classes:
      "bg-destructive/10 border-destructive/30 text-destructive dark:text-destructive",
    label: "Critical",
  },
  warning: {
    icon: TriangleAlert,
    classes:
      "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300",
    label: "Warning",
  },
  info: {
    icon: Info,
    classes:
      "bg-muted/50 border-border text-muted-foreground",
    label: "Info",
  },
};

function assemblyStatusClass(status: ModelAssemblyReport["assembly_status"]): string {
  if (status === "complete") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-400";
  }
  if (status === "partial") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300";
  }
  return "border-destructive/30 bg-destructive/10 text-destructive";
}

const ASSEMBLY_SEVERITY_CONFIG: Record<
  MissingRequirementSeverity,
  { classes: string; label: string }
> = {
  critical: {
    classes: "border-destructive/30 bg-destructive/10 text-destructive",
    label: "Critical",
  },
  warning: {
    classes:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300",
    label: "Warning",
  },
  info: {
    classes: "border-border bg-muted/50 text-muted-foreground",
    label: "Info",
  },
};

// ─── Main page component ───────────────────────────────────────────────────────

export default function ModelCardDetail() {
  const params = useParams();
  const projectId = Number(params.id);
  const { user } = useAuth();

  const cardQuery = useGetModelCardByProject(projectId);
  const projectQuery = useGetProject(projectId);

  if (!Number.isFinite(projectId)) {
    return <NotFound message="Invalid project id" />;
  }

  if (cardQuery.isLoading || projectQuery.isLoading) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto">
        <p className="text-muted-foreground">Loading model card…</p>
      </div>
    );
  }

  if (cardQuery.isError || !cardQuery.data) {
    return <NotFound message="Model Card Not Found" />;
  }

  const project = projectQuery.data ?? null;
  const { extraction, equations, variables, parameters, assumptions } =
    cardQuery.data;
  const assumptionItems = assumptions.filter((a) => a.kind === "assumption");
  const limitationItems = assumptions.filter((a) => a.kind === "limitation");

  const raw = extraction.rawExtractionJson as RawExtraction | null | undefined;
  const modelCard = raw?.model_card;

  const isOwner =
    !!user?.id &&
    project !== null &&
    "ownerId" in project &&
    project.ownerId !== null &&
    project.ownerId === user.id;

  return (
    <ModelCardDetailInner
      projectId={projectId}
      project={project}
      extractionId={extraction.id}
      isOwner={isOwner}
      extraction={extraction}
      equations={equations}
      variables={variables}
      parameters={parameters}
      assumptionItems={assumptionItems}
      limitationItems={limitationItems}
      raw={raw}
      modelCard={modelCard}
    />
  );
}

// Split into inner component so useMemo hooks are always called unconditionally

function ModelCardDetailInner({
  projectId,
  project,
  extractionId,
  isOwner,
  extraction,
  equations,
  variables,
  parameters,
  assumptionItems,
  limitationItems,
  raw,
  modelCard,
}: {
  projectId: number;
  project: { name: string; ownerId: string | null; visibility: string } | null | undefined;
  extractionId: number;
  isOwner: boolean;
  extraction: {
    id: number;
    domain: string;
    providerUsed: string;
    status: string;
    modelCardTitle: string;
    systemDescription: string;
    problemStatement: string;
    odeTemplate: string;
    rawExtractionJson: unknown;
    // M17 audit fields (empty/null for legacy rows)
    providerModel: string;
    systemPrompt: string;
    promptTemplateSummary: string;
    rawProviderResponse: Record<string, unknown> | null;
    repairStatus: "not_needed" | "repaired" | "failed";
    validationErrors: string | null;
    tokenUsage: Record<string, unknown> | null;
    // M19 domain classifier fields (defaults for legacy rows)
    modelType: string;
    modelTypeConfidence: number | null;
    modelTypeMatchedKeywords: unknown;
    modelTypeOverride: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  equations: { id: number; ordinal: number; label: string; latex: string; plaintext: string; meaning: string; variablesInvolved: string[]; confidence: string; description: string; sourceQuote: string; editedByUser: boolean; originalValue?: Record<string, unknown> | null }[];
  variables: { id: number; ordinal: number; symbol: string; name: string; meaning: string; unit: string; role: string; confidence: string; sourceQuote: string; editedByUser: boolean; originalValue?: Record<string, unknown> | null }[];
  parameters: { id: number; ordinal: number; symbol: string; name: string; value: number; unit: string; confidence: string; sourceQuote: string; editedByUser: boolean; originalValue?: Record<string, unknown> | null }[];
  assumptionItems: { id: number; ordinal: number; kind: string; text: string; sourceQuote: string; confidence: string; editedByUser: boolean; originalValue?: Record<string, unknown> | null }[];
  limitationItems: { id: number; ordinal: number; kind: string; text: string; sourceQuote: string; confidence: string; editedByUser: boolean; originalValue?: Record<string, unknown> | null }[];
  raw: RawExtraction | null | undefined;
  modelCard: RawModelCard | null | undefined;
}) {
  const queryClient = useQueryClient();

  // ── Visibility & sharing ──────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const visibility = project?.visibility ?? "public";
  const isPublic = visibility === "public";
  const isMockModelCard = isMockProvider(extraction.providerUsed);
  const supportsSimulation = isSupportedSimulationModel({
    modelType: extraction.modelType,
    modelTypeOverride: extraction.modelTypeOverride,
    modelCardTitle: extraction.modelCardTitle,
    systemType: raw?.system_type,
    domain: extraction.domain,
  });
  const showSimulationControl = Boolean(
    raw?.model_card?.can_generate_ode_template || supportsSimulation,
  );

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const shareUrl = `${window.location.origin}${base}/share/model-cards/${extractionId}`;

  const visibilityMutation = useUpdateProjectVisibility({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: getGetProjectQueryKey(projectId),
        });
        void queryClient.invalidateQueries({
          queryKey: getGetModelCardByProjectQueryKey(projectId),
        });
      },
    },
  });

  function toggleVisibility() {
    visibilityMutation.mutate({
      projectId,
      data: { visibility: isPublic ? "private" : "public" },
    });
  }

  function copyShareLink() {
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Reproducibility analysis (memoized — runs only when data changes) ──────
  const report = useMemo(
    () =>
      analyzeReproducibility(
        equations,
        variables,
        parameters,
        [...assumptionItems, ...limitationItems],
        raw ?? null,
        extraction.systemDescription ?? "",
        extraction.problemStatement ?? "",
        extraction.odeTemplate ?? ""
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, cardQuery_nonce(equations, variables, parameters)]
  );

  // ── Unit & dimension check (memoized) ────────────────────────────────────
  const unitReport = useMemo(
    () => runUnitCheck(equations, variables, parameters, raw ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, cardQuery_nonce(equations, variables, parameters)]
  );

  // ── Model assembly readiness (memoized) ─────────────────────────────────
  const assemblyReport = useMemo(
    () =>
      analyzeModelAssembly({
        equations,
        variables,
        parameters,
        assumptions: [...assumptionItems, ...limitationItems],
        raw: raw ?? null,
        systemDescription: extraction.systemDescription ?? "",
        problemStatement: extraction.problemStatement ?? "",
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, cardQuery_nonce(equations, variables, parameters)]
  );

  // ── Formal dimensional analysis — M21 (memoized) ─────────────────────────
  const formalReport = useMemo(
    () => runFormalDimensionalAnalysis(equations, variables, parameters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, cardQuery_nonce(equations, variables, parameters)]
  );

  // ── Template matcher — M22 (memoized) ────────────────────────────────────
  const templateResult = useMemo<TemplateScanResult>(
    () => matchTemplates(equations, variables, parameters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, cardQuery_nonce(equations, variables, parameters)]
  );

  // ── Python ODE template (memoized) ───────────────────────────────────────
  const pythonCode = useMemo(
    () =>
      generatePythonOdeTemplate({
        title: extraction.modelCardTitle,
        projectName: project?.name ?? "Unknown project",
        providerUsed: extraction.providerUsed,
        systemType: raw?.system_type ?? extraction.domain,
        systemDescription: extraction.systemDescription,
        equations,
        variables,
        parameters,
        assumptions: [...assumptionItems, ...limitationItems],
        raw: raw ?? null,
        report,
        unitReport,
        templateResult,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, cardQuery_nonce(equations, variables, parameters), report.overall_score, unitReport.unit_check_status, templateResult]
  );

  // ── Model Package download (M9) ─────────────────────────────────────────
  const [downloading, setDownloading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [reviewData, setReviewData] = useState<LocalReviewData>(() =>
    loadLocalReview(projectId),
  );
  const projectExtractions = ((project as any)?.extractions ?? []) as any[];
  const filteredExtractions =
    sourceFilter === "all"
      ? projectExtractions
      : projectExtractions.filter((e) => String(e.id) === sourceFilter);
  const aggregated = useMemo(
    () => buildAggregatedModelCard(filteredExtractions),
    [filteredExtractions],
  );
  const conflicts = useMemo(
    () => detectConflicts(filteredExtractions),
    [filteredExtractions],
  );

  async function handleDownloadPackage() {
    setDownloading(true);
    try {
      const files = generateModelPackage({
        title: extraction.modelCardTitle,
        projectName: project?.name ?? "Unknown project",
        providerUsed: extraction.providerUsed,
        domain: extraction.domain,
        systemType: raw?.system_type ?? extraction.domain,
        systemDescription: extraction.systemDescription,
        problemStatement: extraction.problemStatement,
        equations,
        variables,
        parameters,
        assumptionItems,
        limitationItems,
        raw: raw ?? null,
        report,
        unitReport,
        pythonCode,
        review: reviewData,
      });

      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const folder = zip.folder("model_package")!;
      for (const [filename, content] of Object.entries(files)) {
        folder.file(filename, content);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const safeName = extraction.modelCardTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .slice(0, 40)
        .replace(/_+$/, "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chemengai_${safeName}_package.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  // Count edited items for tab badge
  const editedCount =
    variables.filter((v) => v.editedByUser).length +
    parameters.filter((p) => p.editedByUser).length +
    equations.filter((e) => e.editedByUser).length +
    [...assumptionItems, ...limitationItems].filter((a) => a.editedByUser).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* ── Header ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className="font-mono text-[10px] uppercase tracking-wider"
          >
            {extraction.domain}
          </Badge>
          <Badge
            variant="secondary"
            className="font-mono text-[10px] uppercase tracking-wider bg-primary/10 text-primary"
          >
            {extraction.providerUsed}
          </Badge>
          <Badge
            variant={extraction.status === "ready" ? "default" : "secondary"}
            className="text-[10px] uppercase"
          >
            {extraction.status}
          </Badge>
          <Badge variant="outline" className="text-[10px] uppercase border-blue-400 text-blue-700">
            Review: {reviewData.status.replace("_", " ")}
          </Badge>
          {/* Reproducibility score badge in header */}
          <Badge
            variant="outline"
            className={`text-[10px] font-mono ${scoreTextColor(report.overall_score)}`}
          >
            Repro: {report.overall_score}/100
          </Badge>
          {/* Unit check status badge in header */}
          <Badge
            variant="outline"
            className={`text-[10px] font-mono ${
              unitReport.unit_check_status === "pass"
                ? "text-emerald-600 border-emerald-400"
                : unitReport.unit_check_status === "warning"
                ? "text-amber-600 border-amber-400"
                : "text-red-600 border-red-400"
            }`}
          >
            Units:{" "}
            {unitReport.unit_check_status === "pass"
              ? "✓ pass"
              : `${unitReport.warnings.filter((w) => w.severity === "high").length}H / ${unitReport.warnings.filter((w) => w.severity === "medium").length}M`}
          </Badge>
          {/* M19: Domain model type badge */}
          {(() => {
            const rawType = extraction.modelTypeOverride ?? extraction.modelType;
            const effectiveType = (MODEL_TYPES.includes(rawType as ModelType) ? rawType : "generic_ode") as ModelType;
            const isOverride = !!extraction.modelTypeOverride;
            return (
              <Badge
                variant="outline"
                className={`text-[10px] font-mono ${
                  effectiveType === "generic_ode"
                    ? "text-muted-foreground border-muted-foreground/30"
                    : "text-violet-700 border-violet-400 dark:text-violet-400"
                }`}
                title={
                  isOverride
                    ? `User override — classifier detected: ${MODEL_TYPE_DISPLAY_NAMES[extraction.modelType as ModelType] ?? extraction.modelType}`
                    : `Auto-detected (${Math.round((extraction.modelTypeConfidence ?? 0) * 100)}% confidence)`
                }
              >
                {isOverride ? "★ " : ""}
                {MODEL_TYPE_DISPLAY_NAMES[effectiveType]}
              </Badge>
            );
          })()}
          {editedCount > 0 && (
            <Badge variant="outline" className="text-[10px] font-mono text-amber-600 border-amber-400">
              {editedCount} field{editedCount !== 1 ? "s" : ""} edited
            </Badge>
          )}
        </div>
        {isMockModelCard ? (
          <div
            className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
            data-testid="mock-provider-warning"
          >
            <TriangleAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
              {MOCK_PROVIDER_WARNING}
            </p>
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary mb-2">
              {extraction.modelCardTitle}
            </h1>
            {project ? (
              <p className="text-muted-foreground font-mono text-sm border-l-2 border-primary/30 pl-4 py-1">
                Project: {project.name}
              </p>
            ) : null}
            {raw?.system_type ? (
              <p className="text-sm text-muted-foreground mt-1">
                System type:{" "}
                <span className="font-medium text-foreground">
                  {raw.system_type}
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {/* Visibility toggle — owner only */}
            {isOwner && (
              <Button
                variant="outline"
                size="default"
                onClick={toggleVisibility}
                disabled={visibilityMutation.isPending}
                title={isPublic ? "Click to make private" : "Click to make public"}
                data-testid="btn-toggle-visibility"
              >
                {visibilityMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : isPublic ? (
                  <Globe className="h-4 w-4 mr-2 text-emerald-600" />
                ) : (
                  <Lock className="h-4 w-4 mr-2 text-muted-foreground" />
                )}
                {isPublic ? "Public" : "Private"}
              </Button>
            )}
            {/* Share link — visible whenever project is public */}
            {isPublic && (
              <Button
                variant="outline"
                size="default"
                onClick={copyShareLink}
                data-testid="btn-copy-share-link"
              >
                {copied ? (
                  <Check className="h-4 w-4 mr-2 text-emerald-600" />
                ) : (
                  <Share2 className="h-4 w-4 mr-2" />
                )}
                {copied ? "Copied!" : "Share Link"}
              </Button>
            )}
            {showSimulationControl && (
              <div className="flex flex-col items-end gap-1">
                {supportsSimulation ? (
                  <Link href={`/simulation?projectId=${projectId}`}>
                    <Button
                      variant="default"
                      size="default"
                      data-testid="btn-run-simulation"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Run Simulation
                    </Button>
                  </Link>
                ) : (
                  <Button
                    variant="outline"
                    size="default"
                    disabled
                    title={SIMULATION_UNSUPPORTED_MESSAGE}
                    data-testid="btn-run-simulation"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Run Simulation
                  </Button>
                )}
                {!supportsSimulation ? (
                  <p className="max-w-[220px] text-right text-xs text-muted-foreground">
                    {SIMULATION_UNSUPPORTED_MESSAGE}
                  </p>
                ) : null}
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => { void handleDownloadPackage(); }}
              disabled={downloading}
              data-testid="btn-download-package"
            >
              {downloading
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Package className="h-4 w-4 mr-2" />}
              {downloading ? "Building…" : "Download Package"}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadTextFile(
                  generateJupyterNotebook({
                    title: extraction.modelCardTitle,
                    projectName: project?.name ?? "Unknown project",
                    providerUsed: extraction.providerUsed,
                    systemType: raw?.system_type ?? extraction.domain,
                    systemDescription: extraction.systemDescription,
                    equations,
                    variables,
                    parameters,
                    assumptions: [...assumptionItems, ...limitationItems],
                    raw: raw ?? null,
                    report,
                    unitReport,
                    pythonCode,
                  }),
                  "model_notebook.ipynb",
                  "application/x-ipynb+json",
                )
              }
              data-testid="btn-download-notebook"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Jupyter Notebook
            </Button>
            <a
              href={`${import.meta.env.BASE_URL}api/projects/${projectId}/export`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="outline" data-testid="btn-export-json">
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
            </a>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 w-full lg:w-auto">
          <TabsTrigger value="overview" data-testid="tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="variables" data-testid="tab-variables">
            Variables ({variables.length})
          </TabsTrigger>
          <TabsTrigger value="parameters" data-testid="tab-parameters">
            Parameters ({parameters.length})
          </TabsTrigger>
          <TabsTrigger value="equations" data-testid="tab-equations">
            Equations ({equations.length})
          </TabsTrigger>
          <TabsTrigger value="assumptions" data-testid="tab-assumptions">
            Assumptions ({assumptionItems.length})
          </TabsTrigger>
          <TabsTrigger value="missing" data-testid="tab-missing">
            Missing Info
          </TabsTrigger>
          <TabsTrigger value="assembly" data-testid="tab-assembly">
            Assembly
            {assemblyReport.missing_requirements.filter((m) => m.severity === "critical").length > 0 && (
              <span className="ml-1 text-red-500 font-bold">
                ({assemblyReport.missing_requirements.filter((m) => m.severity === "critical").length})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="ode" data-testid="tab-ode">
            ODE Template
          </TabsTrigger>
          <TabsTrigger value="reproducibility" data-testid="tab-reproducibility">
            Reproducibility
          </TabsTrigger>
          <TabsTrigger value="unit-check" data-testid="tab-unit-check">
            Unit Check
            {unitReport.warnings.filter((w) => w.severity === "high").length > 0 && (
              <span className="ml-1 text-red-500 font-bold">
                ({unitReport.warnings.filter((w) => w.severity === "high").length})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="domain-checklist" data-testid="tab-domain-checklist">
            Domain Checklist
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">
            Audit Trail
          </TabsTrigger>
          <TabsTrigger value="review" data-testid="tab-review">
            Review
          </TabsTrigger>
          <TabsTrigger value="sources" data-testid="tab-sources">
            Sources
          </TabsTrigger>
          <TabsTrigger value="aggregated" data-testid="tab-aggregated">
            Aggregated
          </TabsTrigger>
          <TabsTrigger value="conflicts" data-testid="tab-conflicts">
            Conflicts
          </TabsTrigger>
          <TabsTrigger value="raw" data-testid="tab-raw">
            Raw JSON
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                System Description
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {extraction.systemDescription}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-muted-foreground" />
                Problem Statement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {extraction.problemStatement}
              </p>
            </CardContent>
          </Card>

          {modelCard ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-muted-foreground" />
                  Model Card Summary
                </CardTitle>
                {modelCard.model_type ? (
                  <CardDescription>
                    Type:{" "}
                    <span className="font-mono">{modelCard.model_type}</span>
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {modelCard.short_summary ? (
                  <p className="text-sm leading-relaxed">
                    {modelCard.short_summary}
                  </p>
                ) : null}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                      Inputs
                    </p>
                    <ChipList items={modelCard.inputs ?? []} />
                  </div>
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                      Outputs
                    </p>
                    <ChipList items={modelCard.outputs ?? []} />
                  </div>
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                      Control Variables
                    </p>
                    <ChipList items={modelCard.control_variables ?? []} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* ── Variables (inline editing) ── */}
        <TabsContent value="variables" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>State &amp; Input Variables</CardTitle>
              <CardDescription>
                Click the pencil icon to correct any field. Changes are tracked and can be reset to the original AI output.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <VariablesTab
                projectId={projectId}
                variables={variables as Parameters<typeof VariablesTab>[0]["variables"]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Parameters (inline editing) ── */}
        <TabsContent value="parameters" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Model Parameters</CardTitle>
              <CardDescription>
                Numerical values, units, confidence scores, and source quotes. Click the pencil icon to edit.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ParametersTab
                projectId={projectId}
                parameters={parameters as Parameters<typeof ParametersTab>[0]["parameters"]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Equations (inline editing) ── */}
        <TabsContent value="equations" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Governing Equations</CardTitle>
              <CardDescription>
                Extracted mathematical relationships. Click the pencil icon to correct LaTeX, meaning, or source context.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <EquationsTab
                projectId={projectId}
                equations={equations as Parameters<typeof EquationsTab>[0]["equations"]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Assumptions (inline editing) ── */}
        <TabsContent value="assumptions" className="mt-6 space-y-6">
          <AssumptionsTab
            projectId={projectId}
            assumptionItems={assumptionItems as Parameters<typeof AssumptionsTab>[0]["assumptionItems"]}
            limitationItems={limitationItems as Parameters<typeof AssumptionsTab>[0]["limitationItems"]}
          />
        </TabsContent>

        {/* ── Missing Info (from model card) ── */}
        <TabsContent value="missing" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-muted-foreground" />
                Missing Information
              </CardTitle>
              <CardDescription>
                Data, parameters, or conditions the AI provider identified as
                absent from the source material.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(modelCard?.missing_information ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No missing information identified by the AI provider — or no
                  model card available for this extraction. See the
                  Reproducibility tab for a rule-based analysis.
                </p>
              ) : (
                <ul className="space-y-2">
                  {modelCard!.missing_information!.map((m, i) => (
                    <li
                      key={`${m}-${i}`}
                      className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-sm"
                    >
                      <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      {m}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Model Assembly Readiness ── */}
        <TabsContent value="assembly" className="mt-6 space-y-6">
          <Card className={`border ${assemblyStatusClass(assemblyReport.assembly_status)}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5" />
                    Model Assembly Readiness
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Target: {assemblyReport.target_model_type}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="uppercase">
                    {assemblyReport.assembly_status}
                  </Badge>
                  <Badge variant={assemblyReport.can_generate_scaffold ? "default" : "secondary"}>
                    Scaffold: {assemblyReport.can_generate_scaffold ? "yes" : "no"}
                  </Badge>
                  <Badge variant={assemblyReport.can_generate_runnable_model ? "default" : "secondary"}>
                    Runnable: {assemblyReport.can_generate_runnable_model ? "yes" : "no"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                {assemblyReport.can_generate_runnable_model
                  ? "The extracted information appears sufficient for a runnable model, pending human review."
                  : assemblyReport.can_generate_scaffold
                    ? "The current source can support a scaffold, but missing requirements should be resolved before claiming a runnable dynamic model."
                    : "The current source does not contain enough structured information to assemble a model scaffold."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Available From Current Source</CardTitle>
              <CardDescription>
                Extracted equations, states, controls, parameters, and assumptions that can be used as model-building evidence.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assemblyReport.available_from_current_source.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No assembly-ready evidence detected in the extracted model data.
                </p>
              ) : (
                <div className="space-y-2">
                  {assemblyReport.available_from_current_source.map((item, i) => (
                    <div
                      key={`${item.type}-${item.item}-${i}`}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="uppercase text-[10px]">
                          {item.type}
                        </Badge>
                        <span className="font-medium">{item.item}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {item.confidence}
                        </Badge>
                      </div>
                      {item.source_context ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {item.source_context}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Missing Parameter Resolver</CardTitle>
              <CardDescription>
                Requirements still needed before this should be treated as a complete dynamic model.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assemblyReport.missing_requirements.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  No missing assembly requirements detected.
                </div>
              ) : (
                <div className="space-y-3">
                  {assemblyReport.missing_requirements.map((missing, i) => {
                    const cfg = ASSEMBLY_SEVERITY_CONFIG[missing.severity];
                    return (
                      <div
                        key={`${missing.category}-${missing.item}-${i}`}
                        className={`rounded-lg border p-3 text-sm ${cfg.classes}`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="uppercase text-[10px]">
                            {cfg.label}
                          </Badge>
                          <Badge variant="secondary" className="uppercase text-[10px]">
                            {missing.category.replace(/_/g, " ")}
                          </Badge>
                          <span className="font-semibold">{missing.item}</span>
                        </div>
                        <div className="mt-2 space-y-1 text-xs opacity-90">
                          <p>
                            <span className="font-semibold">Required for:</span>{" "}
                            {missing.required_for}
                          </p>
                          <p>
                            <span className="font-semibold">Why:</span>{" "}
                            {missing.why_needed}
                          </p>
                          <p>
                            <span className="font-semibold">Suggested source:</span>{" "}
                            {missing.suggested_source.replace(/_/g, " ")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle>Recommended Next Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {assemblyReport.recommended_next_actions.map((action, i) => (
                  <li key={`${action}-${i}`} className="flex items-start gap-3 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    {action}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ODE Template ── */}
        <TabsContent value="ode" className="mt-6 space-y-4">

          {/* ── Header row ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-muted-foreground" />
                    Python ODE Template
                  </CardTitle>
                  <CardDescription>
                    Auto-generated using <code>scipy.integrate.solve_ivp</code>.
                    Supported equations are runnable; unsupported ones keep honest{" "}
                    <code># TODO</code> stubs.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => downloadTextFile(pythonCode, "model_template.py")}
                  data-testid="btn-download-python"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download model_template.py
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* ── M22: Template status card ── */}
          {(() => {
            const s: RunnableTemplateStatus = templateResult.status;
            const borderCls =
              s === "full"
                ? "border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20"
                : s === "partial"
                ? "border-teal-300 bg-teal-50/40 dark:bg-teal-950/20"
                : "border-slate-300 bg-slate-50/30 dark:bg-slate-950/10";
            const icon =
              s === "full" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : s === "partial" ? (
                <Info className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Code2 className="h-5 w-5 text-slate-500 flex-shrink-0 mt-0.5" />
              );
            const badgeCls =
              s === "full"
                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                : s === "partial"
                ? "bg-teal-100 text-teal-800 border-teal-300"
                : "bg-slate-100 text-slate-600 border-slate-300";
            const heading =
              s === "full"
                ? "All equations runnable"
                : s === "partial"
                ? `${templateResult.runnableCount} of ${templateResult.totalEquations} equations runnable`
                : "No equations matched a supported template";
            const subtext =
              s === "full"
                ? "Every equation in this model matched a supported template and all required symbols were found. The generated code runs directly."
                : s === "partial"
                ? "Some equations matched supported templates and generated runnable code. Unsupported equations have # TODO stubs — translate them manually."
                : "None of the extracted equations matched a supported template. The generated code is a scaffold with # TODO stubs throughout. Supported templates are listed in the equation panel below.";
            return (
              <Card className={`border ${borderCls}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    {icon}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{heading}</p>
                        <Badge variant="outline" className={`text-[10px] px-2 ${badgeCls}`}>
                          {s === "full" ? "full" : s === "partial" ? "partial" : "scaffold only"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{subtext}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* ── M22: Equation recognition panel ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Equation Recognition
                <Badge variant="outline" className="text-[10px] px-2 bg-muted text-muted-foreground border-border">
                  {templateResult.matched.length + templateResult.derivatives.length} recognised
                  {templateResult.unmatched.length > 0 && ` · ${templateResult.unmatched.length} scaffold`}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Supported templates: Monod growth kinetics, chemostat biomass ODE, chemostat substrate ODE,
                first-order decay, gas–liquid transfer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">

              {/* Recognised equations */}
              {(templateResult.matched.length > 0 || templateResult.derivatives.length > 0) && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                    Recognised equations
                  </p>
                  {[
                    ...templateResult.matched.map((m) => ({
                      label: m.templateLabel,
                      eq: m.originalEquation,
                      isRunnable: m.isRunnable,
                      missing: m.missingSymbols,
                      kind: "intermediate" as const,
                    })),
                    ...templateResult.derivatives.map((d) => ({
                      label: d.templateLabel,
                      eq: d.comment,
                      isRunnable: d.isRunnable,
                      missing: d.missingSymbols,
                      kind: "ode" as const,
                    })),
                  ].map((item, i) => (
                    <div
                      key={i}
                      className={`rounded border px-3 py-2 flex items-start gap-2 ${
                        item.isRunnable
                          ? "border-emerald-200 bg-emerald-50/40"
                          : "border-amber-200 bg-amber-50/40"
                      }`}
                    >
                      {item.isRunnable ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <TriangleAlert className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] px-1.5 bg-emerald-50 text-emerald-700 border-emerald-200">
                            {item.label}
                          </Badge>
                          {item.kind === "ode" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 bg-slate-50 text-slate-500 border-slate-200">
                              derivative
                            </Badge>
                          )}
                          {item.isRunnable ? (
                            <span className="text-[10px] text-emerald-700">runnable</span>
                          ) : (
                            <span className="text-[10px] text-amber-700">
                              missing: {item.missing.join(", ")}
                            </span>
                          )}
                        </div>
                        <p
                          className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate"
                          title={item.eq}
                        >
                          {item.eq.length > 90 ? item.eq.slice(0, 90) + "…" : item.eq}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Unrecognised equations */}
              {templateResult.unmatched.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    Scaffold-only (no pattern matched)
                  </p>
                  {templateResult.unmatched.map((u, i) => (
                    <div
                      key={i}
                      className="rounded border border-slate-200 bg-slate-50/30 px-3 py-2 flex items-start gap-2"
                    >
                      <Code2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-[11px] font-mono text-muted-foreground truncate"
                          title={u.originalEquation}
                        >
                          {u.originalEquation.length > 90
                            ? u.originalEquation.slice(0, 90) + "…"
                            : u.originalEquation}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          → # TODO stub — translate manually
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {templateResult.matched.length === 0 &&
                templateResult.derivatives.length === 0 &&
                templateResult.unmatched.length === 0 && (
                <p className="text-xs text-muted-foreground italic text-center py-2">
                  No equations extracted — check the Equations tab.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Reproducibility / unit warnings (existing) ── */}
          {report.simulation_readiness !== "ready" && (
            <Card className="border-amber-300 bg-amber-50/40 dark:bg-amber-950/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                      Reproducibility:{" "}
                      {report.simulation_readiness === "partial"
                        ? "Partial — some data incomplete"
                        : "Not ready — significant gaps found"}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-500">
                      The template contains <code># TODO</code> stubs where
                      extracted data is missing. Resolve the blockers in the
                      Reproducibility tab before trusting simulation output.
                    </p>
                    {report.main_blockers.slice(0, 3).map((b, i) => (
                      <p key={i} className="text-xs text-amber-700 dark:text-amber-500">
                        • {b}
                      </p>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {unitReport.unit_check_status === "fail" && (
            <Card className="border-red-300 bg-red-50/40 dark:bg-red-950/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800 dark:text-red-400">
                      {unitReport.warnings.filter((w) => w.severity === "high").length} high-severity unit issue(s) — check Unit Check tab
                    </p>
                    <p className="text-xs text-red-700 dark:text-red-500 mt-1">
                      Missing or inconsistent units may cause silently wrong
                      simulation results. Fix before running.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Generated Python code ── */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-muted-foreground font-mono">
                  model_template.py
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    void navigator.clipboard.writeText(pythonCode);
                  }}
                >
                  Copy to clipboard
                </Button>
              </div>
              <pre className="text-xs bg-muted/50 rounded p-4 overflow-x-auto font-mono leading-relaxed max-h-[640px] overflow-y-auto border border-border/50">
                {pythonCode}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Reproducibility ── */}
        <TabsContent value="reproducibility" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6">
            <Card className="flex flex-col items-center justify-center px-10 py-8 text-center min-w-[180px]">
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Overall Score
              </p>
              <div
                className={`text-6xl font-bold tabular-nums ${scoreTextColor(report.overall_score)}`}
              >
                {report.overall_score}
              </div>
              <p className="text-xs text-muted-foreground mt-1">out of 100</p>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  Score Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScoreBar
                  label="Equations Completeness"
                  score={report.equations_completeness}
                  description="LaTeX notation, descriptions, and source quotes for each equation."
                />
                <ScoreBar
                  label="Parameters Completeness"
                  score={report.parameters_completeness}
                  description="Numerical values, units, and traceability for each parameter."
                />
                <ScoreBar
                  label="Units Completeness"
                  score={report.units_completeness}
                  description="Explicit physical units on all variables and parameters."
                />
                <ScoreBar
                  label="Initial Conditions"
                  score={report.initial_conditions_completeness}
                  description="Starting values for state variables and boundary/input conditions."
                />
                <ScoreBar
                  label="Source Traceability"
                  score={report.source_traceability}
                  description="Proportion of items linked back to source quotes in the paper."
                />
              </CardContent>
            </Card>
          </div>

          <ReadinessBadge readiness={report.simulation_readiness} />

          {report.main_blockers.length > 0 && (
            <Card className="border-destructive/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-destructive flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Main Blockers
                </CardTitle>
                <CardDescription>
                  These issues must be resolved before reliable simulation is
                  possible.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.main_blockers.map((b, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-destructive"
                    >
                      <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Detailed Missing Information Report
              </CardTitle>
              <CardDescription>
                {report.missing_items.length === 0
                  ? "No issues detected."
                  : `${report.missing_items.filter((m) => m.severity === "critical").length} critical · ${report.missing_items.filter((m) => m.severity === "warning").length} warnings · ${report.missing_items.filter((m) => m.severity === "info").length} informational`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.missing_items.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  No missing information detected.
                </div>
              ) : (
                <ul className="space-y-2">
                  {report.missing_items.map((item, i) => {
                    const cfg = SEVERITY_CONFIG[item.severity];
                    const Icon = cfg.icon;
                    return (
                      <li
                        key={i}
                        className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${cfg.classes}`}
                      >
                        <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold mr-2 text-xs uppercase tracking-wider opacity-70">
                            [{item.category}]
                          </span>
                          {item.description}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Recommended Next Steps
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {report.recommended_next_steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Unit Check ── */}
        <TabsContent value="unit-check" className="mt-6 space-y-6">

          {/* ── Section A: Formal Dimensional Analysis (M21) ── */}
          <div className="space-y-3">
            {/* Section header */}
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                Formal Dimensional Analysis
              </h3>
              <Badge variant="outline" className="text-[10px] px-2 bg-teal-50 text-teal-700 border-teal-300">
                v2 · pattern-based
              </Badge>
              {formalReport.formalCheckAvailable && (
                <Badge
                  variant="outline"
                  className={`text-[10px] px-2 ${
                    formalReport.status === "pass"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                      : formalReport.status === "warning"
                      ? "bg-amber-50 text-amber-700 border-amber-300"
                      : "bg-red-50 text-red-700 border-red-300"
                  }`}
                >
                  {formalReport.status === "pass" ? "✓ pass" : formalReport.status === "warning" ? "⚠ warning" : "✗ fail"}
                </Badge>
              )}
            </div>

            {/* Supported-patterns legend */}
            <Card className="border-teal-100 bg-teal-50/30">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-medium text-teal-800 mb-2">
                  Supported equation patterns ({formalReport.parsedCount} matched in this model):
                </p>
                <ul className="space-y-0.5">
                  {formalReport.supportedPatterns.map((p, i) => (
                    <li key={i} className="text-[11px] text-teal-700 font-mono">· {p}</li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground mt-3 italic">
                  Equations not matching a supported pattern are skipped — see the heuristic check below.
                </p>
              </CardContent>
            </Card>

            {/* Per-equation results */}
            {formalReport.equationResults.length === 0 || !formalReport.formalCheckAvailable ? (
              <Card className="border-dashed border-teal-200">
                <CardContent className="pt-6 pb-6 text-center">
                  <Info className="h-8 w-8 text-teal-400 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No equations matched a supported pattern.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Formal dimensional analysis requires recognised equation structures. Use the heuristic check below for general symbol and unit validation.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {formalReport.equationResults
                  .filter((r) => r.parsed)
                  .map((r: FormalEqResult, i: number) => {
                    const hasIssues = r.issues.length > 0;
                    const cardCls = r.dimensionsMatch === false
                      ? "border-red-200 bg-red-50/30"
                      : hasIssues
                      ? "border-amber-200 bg-amber-50/30"
                      : r.dimensionsMatch === true
                      ? "border-emerald-200 bg-emerald-50/30"
                      : "border-slate-200 bg-slate-50/20";
                    const statusIcon =
                      r.dimensionsMatch === false ? (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      ) : hasIssues ? (
                        <TriangleAlert className="h-4 w-4 text-amber-500 flex-shrink-0" />
                      ) : r.dimensionsMatch === true ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <Info className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      );
                    return (
                      <Card key={i} className={`border ${cardCls}`}>
                        <CardContent className="pt-4 pb-4 space-y-2">
                          <div className="flex items-start gap-2">
                            {statusIcon}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-[10px] px-1.5 bg-teal-50 text-teal-700 border-teal-200">
                                  {r.patternName}
                                </Badge>
                                {r.dimensionsMatch === true && (
                                  <span className="text-[11px] text-emerald-700 font-medium">dimensionally consistent</span>
                                )}
                                {r.dimensionsMatch === false && (
                                  <span className="text-[11px] text-red-700 font-medium">dimension mismatch</span>
                                )}
                                {r.dimensionsMatch === null && !hasIssues && (
                                  <span className="text-[11px] text-slate-500">LHS dimension inferred</span>
                                )}
                              </div>
                              <p className="text-xs font-mono text-muted-foreground mt-1 truncate" title={r.equation}>
                                {r.equation.length > 80 ? r.equation.slice(0, 80) + "…" : r.equation}
                              </p>
                            </div>
                          </div>

                          {/* Dimension comparison */}
                          {(r.lhsDimLabel || r.rhsDimLabel) && (
                            <div className="flex gap-4 flex-wrap pl-6 text-[11px]">
                              {r.lhsDimLabel && (
                                <span className="font-mono">
                                  <span className="text-muted-foreground">LHS: </span>
                                  <code className="bg-muted px-1 py-0.5 rounded">[{r.lhsDimLabel}]</code>
                                </span>
                              )}
                              {r.rhsDimLabel && (
                                <span className="font-mono">
                                  <span className="text-muted-foreground">RHS: </span>
                                  <code className="bg-muted px-1 py-0.5 rounded">[{r.rhsDimLabel}]</code>
                                </span>
                              )}
                            </div>
                          )}

                          {/* Issues */}
                          {r.issues.length > 0 && (
                            <div className="pl-6 space-y-1">
                              {r.issues.map((issue, j) => (
                                <p key={j} className="text-xs text-amber-800 leading-snug">
                                  · {issue}
                                </p>
                              ))}
                            </div>
                          )}

                          {/* Symbols checked */}
                          {r.symbolsChecked.length > 0 && (
                            <p className="pl-6 text-[10px] text-muted-foreground">
                              Symbols checked:{" "}
                              {r.symbolsChecked.map((s, j) => (
                                <code key={j} className="bg-muted px-1 rounded mr-1">{s}</code>
                              ))}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            )}
          </div>

          {/* ── Divider ── */}
          <div className="border-t border-dashed border-muted-foreground/20 pt-2" />

          {/* ── Section B: Heuristic Check (existing, M18) ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                Heuristic Check
              </h3>
              <Badge variant="outline" className="text-[10px] px-2 bg-slate-50 text-slate-600 border-slate-300">
                v1 · symbol &amp; convention rules
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] px-2 ${
                  unitReport.unit_check_status === "pass"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                    : unitReport.unit_check_status === "warning"
                    ? "bg-amber-50 text-amber-700 border-amber-300"
                    : "bg-red-50 text-red-700 border-red-300"
                }`}
              >
                {unitReport.unit_check_status === "pass"
                  ? "✓ pass"
                  : unitReport.unit_check_status === "warning"
                  ? "⚠ warning"
                  : "✗ fail"}
              </Badge>
            </div>

            <Card className="border-slate-100 bg-slate-50/20">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground italic">
                  Checks for missing units, undefined symbols, kinetic convention mismatches, and mixed time scales.
                  Applies to all equations regardless of pattern. Does not algebraically balance unit expressions.
                </p>
                <div className="flex gap-4 flex-wrap mt-3 text-sm">
                  {(["high", "medium", "low"] as UnitWarnSeverity[]).map((sev) => {
                    const count = unitReport.warnings.filter((w) => w.severity === sev).length;
                    const color = sev === "high" ? "text-red-600" : sev === "medium" ? "text-amber-600" : "text-slate-500";
                    return (
                      <span key={sev} className={`font-mono font-medium ${color}`}>
                        {count} {sev}
                      </span>
                    );
                  })}
                  <span className="text-muted-foreground">· {unitReport.warnings.length} total</span>
                </div>
              </CardContent>
            </Card>

            {unitReport.warnings.length === 0 ? (
              <Card>
                <CardContent className="pt-6 pb-6 text-center">
                  <CheckCircle2 className="h-9 w-9 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-emerald-700">No heuristic issues found.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All symbols have units, ODE derivative units are traceable, and no mixed time scales were detected.
                  </p>
                </CardContent>
              </Card>
            ) : (
              (["high", "medium", "low"] as UnitWarnSeverity[]).map((sev) => {
                const group = unitReport.warnings.filter((w) => w.severity === sev);
                if (group.length === 0) return null;
                const groupColor =
                  sev === "high"
                    ? "border-red-200 bg-red-50/40"
                    : sev === "medium"
                    ? "border-amber-200 bg-amber-50/40"
                    : "border-slate-200 bg-slate-50/30";
                const badgeColor =
                  sev === "high"
                    ? "bg-red-100 text-red-700 border-red-300"
                    : sev === "medium"
                    ? "bg-amber-100 text-amber-700 border-amber-300"
                    : "bg-slate-100 text-slate-600 border-slate-300";
                const icon =
                  sev === "high" ? (
                    <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                  ) : sev === "medium" ? (
                    <TriangleAlert className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  );
                return (
                  <Card key={sev} className={`border ${groupColor}`}>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
                        <Badge variant="outline" className={`text-[10px] px-2 ${badgeColor}`}>
                          {sev}
                        </Badge>
                        {sev === "high"
                          ? "High — must fix before simulation"
                          : sev === "medium"
                          ? "Medium — should verify"
                          : "Low — minor / informational"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {group.map((w, i) => (
                        <div
                          key={i}
                          className="rounded-md border border-white/60 bg-white/70 dark:bg-background/50 p-3 space-y-1.5"
                        >
                          <div className="flex items-start gap-2">
                            {icon}
                            <p className="text-sm font-medium leading-snug">{w.message}</p>
                          </div>
                          {w.equation_or_symbol && (
                            <p className="text-xs text-muted-foreground font-mono pl-6">
                              Affected:{" "}
                              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
                                {w.equation_or_symbol}
                              </code>
                            </p>
                          )}
                          {w.suggestion && (
                            <p className="text-xs text-muted-foreground pl-6 leading-relaxed">
                              <span className="font-medium text-foreground">Suggestion:</span>{" "}
                              {w.suggestion}
                            </p>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center italic pt-1">
            Formal analysis checks dimensional consistency for recognised patterns only.
            Heuristic analysis covers all symbols and flags convention violations.
            Neither replaces a domain expert or computer algebra system for definitive verification.
          </p>
        </TabsContent>

        {/* ── Domain Checklist (M19) ── */}
        <TabsContent value="domain-checklist" className="mt-6">
          <DomainChecklistTab
            extraction={{
              id: extraction.id,
              modelType: extraction.modelType,
              modelTypeConfidence: extraction.modelTypeConfidence ?? 0,
              modelTypeMatchedKeywords: (extraction.modelTypeMatchedKeywords as string[]) ?? [],
              modelTypeOverride: extraction.modelTypeOverride ?? null,
            }}
            variables={variables.map((v) => ({ symbol: v.symbol, name: v.name }))}
            parameters={parameters.map((p) => ({ symbol: p.symbol, name: p.name }))}
            onOverrideSuccess={() => queryClient.invalidateQueries({ queryKey: getGetModelCardByProjectQueryKey(projectId) })}
          />
        </TabsContent>

        {/* ── Audit Trail (M17) ── */}
        <TabsContent value="audit" className="mt-6">
          <AuditTrailTab extraction={extraction} />
        </TabsContent>

        <TabsContent value="review" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Model Review Workflow (M26)</CardTitle>
              <CardDescription>
                Verified means manually checked by the user against the provided source, not experimentally validated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Reviewer name (optional)"
                value={reviewData.reviewer_name ?? ""}
                onChange={(e) =>
                  setAndPersistReview(projectId, setReviewData, {
                    ...reviewData,
                    reviewer_name: e.target.value,
                  })
                }
              />
              <Textarea
                placeholder="Review notes"
                value={reviewData.review_notes}
                onChange={(e) =>
                  setAndPersistReview(projectId, setReviewData, {
                    ...reviewData,
                    review_notes: e.target.value,
                  })
                }
              />
              <div className="grid md:grid-cols-2 gap-2 text-sm">
                {(
                  [
                    ["equations_checked", "Equations checked against source"],
                    ["units_checked", "Units checked"],
                    ["parameters_checked", "Parameters checked"],
                    ["initial_conditions_checked", "Initial conditions checked"],
                    ["assumptions_checked", "Assumptions checked"],
                    ["code_scaffold_checked", "Code scaffold checked"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={reviewData.checklist[key]}
                      onChange={(e) =>
                        setAndPersistReview(projectId, setReviewData, {
                          ...reviewData,
                          checklist: { ...reviewData.checklist, [key]: e.target.checked },
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() =>
                    setAndPersistReview(projectId, setReviewData, {
                      ...reviewData,
                      status: "needs_review",
                      reviewed_at: new Date().toISOString(),
                    })
                  }
                >
                  Mark as Needs Review
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setAndPersistReview(projectId, setReviewData, {
                      ...reviewData,
                      status: "reviewed",
                      reviewed_at: new Date().toISOString(),
                    })
                  }
                >
                  Mark as Reviewed
                </Button>
                <Button
                  onClick={() =>
                    setAndPersistReview(projectId, setReviewData, {
                      ...reviewData,
                      status: "verified",
                      verification_status:
                        "Verified means manually checked by the user against the provided source, not experimentally validated.",
                      reviewed_at: new Date().toISOString(),
                    })
                  }
                >
                  Mark as Verified
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Project Sources</CardTitle>
              <CardDescription>All source documents and extraction history for this project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {(((project as any)?.sourceDocuments ?? []) as any[]).map((s) => (
                  <div key={s.id} className="rounded border p-3 text-sm">
                    <div><strong>{s.filename || `Source ${s.id}`}</strong> · {s.kind}</div>
                    <div className="text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()} · {String(s.content ?? "").length} chars
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Extractions</p>
                {projectExtractions.map((e) => (
                  <div key={e.id} className="rounded border p-3 text-sm flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{e.modelCardTitle || `Extraction ${e.id}`}</div>
                      <div className="text-muted-foreground">{e.providerUsed} · {e.status} · {new Date(e.createdAt).toLocaleString()}</div>
                    </div>
                    <Link href={`/model-cards/${e.projectId}`}>
                      <Button variant="outline" size="sm">Open model card</Button>
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aggregated" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Aggregated Model Card</CardTitle>
              <CardDescription>Merged across selected extractions in this project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <select className="border rounded px-2 py-1 text-sm" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="all">All extractions</option>
                {projectExtractions.map((e) => (
                  <option key={e.id} value={String(e.id)}>{e.modelCardTitle || `Extraction ${e.id}`}</option>
                ))}
              </select>
              <div className="text-sm">Variables merged: {aggregated.variables.length}</div>
              <div className="text-sm">Parameters merged: {aggregated.parameters.length}</div>
              <div className="text-sm">Equations merged: {aggregated.equations.length}</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conflicts" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Conflict Detection</CardTitle>
              <CardDescription>Symbol/unit/value-based conflicts across selected sources.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {conflicts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No conflicts detected.</p>
              ) : (
                conflicts.map((c, i) => (
                  <div key={`${c.type}-${c.symbol_or_label}-${i}`} className="rounded border p-3 text-sm">
                    <div className="font-medium">{c.type} · {c.symbol_or_label} · {c.severity}</div>
                    <div>{c.details}</div>
                    <div className="text-muted-foreground">Sources: {c.sources.join(", ")}</div>
                    <div className="text-muted-foreground">Recommendation: {c.recommendation}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Raw JSON ── */}
        <TabsContent value="raw" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-muted-foreground" />
                Raw Extraction JSON
              </CardTitle>
              <CardDescription>
                Full validated provider output as stored in{" "}
                <code>raw_extraction_json</code>. Use the Export button above
                to download the complete project package.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {raw ? (
                <pre className="text-xs bg-muted/50 rounded p-4 overflow-x-auto font-mono leading-relaxed max-h-[600px]">
                  {JSON.stringify(raw, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No raw extraction JSON available for this record
                  (pre-migration row).
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function reviewStorageKey(projectId: string | number): string {
  return `chemai_review_${projectId}`;
}

function defaultReview(): LocalReviewData {
  return {
    status: "extracted",
    review_notes: "",
    verification_status: "",
    issues_found: [],
    checklist: {
      equations_checked: false,
      units_checked: false,
      parameters_checked: false,
      initial_conditions_checked: false,
      assumptions_checked: false,
      code_scaffold_checked: false,
    },
  };
}

function loadLocalReview(projectId: string | number): LocalReviewData {
  try {
    const raw = localStorage.getItem(reviewStorageKey(projectId));
    if (!raw) return defaultReview();
    return { ...defaultReview(), ...JSON.parse(raw) } as LocalReviewData;
  } catch {
    return defaultReview();
  }
}

function setAndPersistReview(

  projectId: string | number,
  setState: (next: LocalReviewData) => void,
  next: LocalReviewData,
): void {
  const issues = Object.entries(next.checklist)
    .filter(([, v]) => !v)
    .map(([k]) => k.replaceAll("_", " "));
  const withIssues = { ...next, issues_found: issues };
  setState(withIssues);
  localStorage.setItem(reviewStorageKey(projectId), JSON.stringify(withIssues));
}

/** Trigger a browser download of a text file. */
function downloadTextFile(content: string, filename: string, mimeType = "text/plain"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Tiny cache-key helper: returns a number that changes whenever the data
 * arrays change identity.
 */
function cardQuery_nonce(
  equations: { id: number }[],
  variables: { id: number }[],
  parameters: { id: number }[]
): number {
  return (
    (equations[0]?.id ?? 0) * 1_000_000 +
    (variables[0]?.id ?? 0) * 1_000 +
    (parameters[0]?.id ?? 0)
  );
}
