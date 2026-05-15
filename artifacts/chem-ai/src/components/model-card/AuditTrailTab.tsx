/**
 * M17 — Prompt Transparency & Extraction Audit Trail
 *
 * Why auditability matters:
 * Chemical-engineering models extracted by AI must be reproducible and
 * independently verifiable. The audit trail records every detail of the
 * extraction run — provider, model, exact prompts, raw response, repair
 * status, validation errors, and token usage — so researchers can:
 *
 *  1. Reproduce the extraction with the same model and prompt.
 *  2. Confirm the AI did not hallucinate or silently corrupt data.
 *  3. Track cost over time across providers.
 *  4. Detect if JSON repair changed the provider output.
 *
 * Security note: systemPrompt contains only instructional text sent to the
 * AI. API keys and secrets are NEVER stored or displayed here.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CheckCircle2,
  TriangleAlert,
  XCircle,
  Cpu,
  FileCode2,
  Zap,
  ShieldCheck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type RepairStatus = "not_needed" | "repaired" | "failed";

export interface AuditExtractionFields {
  id: number;
  providerUsed: string;
  providerModel: string;
  systemPrompt: string;
  promptTemplateSummary: string;
  rawProviderResponse: Record<string, unknown> | null;
  repairStatus: RepairStatus;
  validationErrors: string | null;
  tokenUsage: Record<string, unknown> | null;
  /** Accepts Date (from API client) or ISO string (from legacy serialisers). */
  createdAt: Date | string;
}

interface Props {
  extraction: AuditExtractionFields;
}

// ── Collapsible section ────────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none pb-3"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {title}
            {badge}
          </CardTitle>
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

// ── Repair status badge ────────────────────────────────────────────────────────

function RepairBadge({ status }: { status: RepairStatus }) {
  if (status === "not_needed") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 border text-[10px] uppercase font-mono">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        not needed
      </Badge>
    );
  }
  if (status === "repaired") {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-300 border text-[10px] uppercase font-mono">
        <TriangleAlert className="h-3 w-3 mr-1" />
        repaired
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-800 border-red-300 border text-[10px] uppercase font-mono">
      <XCircle className="h-3 w-3 mr-1" />
      failed
    </Badge>
  );
}

// ── Provider fallback chain display ────────────────────────────────────────────

interface ProviderFallbackEntry {
  from: string;
  to: string;
  reason: string;
}

function isProviderFallbackEntry(value: unknown): value is ProviderFallbackEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v["from"] === "string" && typeof v["to"] === "string";
}

function extractProviderFallbacks(
  usage: Record<string, unknown> | null,
): ProviderFallbackEntry[] {
  const raw = usage && Array.isArray(usage["providerFallbacks"])
    ? (usage["providerFallbacks"] as unknown[])
    : [];
  return raw.filter(isProviderFallbackEntry).map((entry) => ({
    from: entry.from,
    to: entry.to,
    reason: typeof entry.reason === "string" ? entry.reason : "",
  }));
}

function extractFinalizerWarnings(
  usage: Record<string, unknown> | null,
): string[] {
  const raw = usage && Array.isArray(usage["finalizerWarnings"])
    ? (usage["finalizerWarnings"] as unknown[])
    : [];
  return raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function extractSourceWarnings(usage: Record<string, unknown> | null): string[] {
  const raw = usage && Array.isArray(usage["sourceWarnings"])
    ? (usage["sourceWarnings"] as unknown[])
    : [];
  return raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function extractUnitWarnings(usage: Record<string, unknown> | null): string[] {
  const raw = usage && Array.isArray(usage["unitWarnings"])
    ? (usage["unitWarnings"] as unknown[])
    : [];
  return raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

interface ChunkTruncation {
  inputChunks: number;
  includedChunks: number;
  droppedChunks: number;
  droppedChars: number;
  budget: number;
  totalChars: number;
}

function extractChunkTruncation(
  usage: Record<string, unknown> | null,
): ChunkTruncation | null {
  if (!usage) return null;
  const raw = usage["chunkTruncation"];
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const numbers = ["inputChunks", "includedChunks", "droppedChunks", "droppedChars", "budget", "totalChars"];
  for (const key of numbers) {
    if (typeof v[key] !== "number") return null;
  }
  return {
    inputChunks: v["inputChunks"] as number,
    includedChunks: v["includedChunks"] as number,
    droppedChunks: v["droppedChunks"] as number,
    droppedChars: v["droppedChars"] as number,
    budget: v["budget"] as number,
    totalChars: v["totalChars"] as number,
  };
}

// ── Token usage display ────────────────────────────────────────────────────────

function TokenUsageCard({ usage }: { usage: Record<string, unknown> }) {
  const rows: { label: string; value: string }[] = [];

  // OpenAI shape
  if ("promptTokens" in usage)
    rows.push({ label: "Prompt tokens", value: String(usage["promptTokens"]) });
  if ("completionTokens" in usage)
    rows.push({ label: "Completion tokens", value: String(usage["completionTokens"]) });
  if ("totalTokens" in usage)
    rows.push({ label: "Total tokens", value: String(usage["totalTokens"]) });
  if ("estimatedCostUsd" in usage && usage["estimatedCostUsd"] != null)
    rows.push({
      label: "Est. cost (USD)",
      value: `$${Number(usage["estimatedCostUsd"]).toFixed(4)}`,
    });

  // Gemini shape
  if ("candidateTokens" in usage)
    rows.push({ label: "Candidate tokens", value: String(usage["candidateTokens"]) });

  // Fallback: any keys not already shown.
  // Skip keys that are rendered by their own dedicated sections to avoid
  // dumping arrays/objects as "[object Object]" strings.
  const shownKeys = new Set([
    "promptTokens",
    "completionTokens",
    "totalTokens",
    "estimatedCostUsd",
    "candidateTokens",
    "providerFallbacks",
    "finalizerWarnings",
    "sourceWarnings",
    "chunkTruncation",
    "unitWarnings",
  ]);
  for (const [k, v] of Object.entries(usage)) {
    if (!shownKeys.has(k)) {
      rows.push({ label: k, value: String(v) });
    }
  }

  if (rows.length === 0) return <p className="text-sm text-muted-foreground italic">No token metadata available.</p>;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {rows.map(({ label, value }) => (
        <div
          key={label}
          className="rounded-lg bg-muted/40 border border-border/50 p-3"
        >
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wide mb-1">
            {label}
          </p>
          <p className="text-sm font-semibold font-mono">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AuditTrailTab({ extraction }: Props) {
  const isLegacy =
    !extraction.providerModel &&
    !extraction.systemPrompt &&
    extraction.repairStatus === "not_needed";

  const providerFallbacks = extractProviderFallbacks(extraction.tokenUsage);
  const finalizerWarnings = extractFinalizerWarnings(extraction.tokenUsage);
  const sourceWarnings = extractSourceWarnings(extraction.tokenUsage);
  const chunkTruncation = extractChunkTruncation(extraction.tokenUsage);
  const unitWarnings = extractUnitWarnings(extraction.tokenUsage);

  const extractedAt = extraction.createdAt
    ? (extraction.createdAt instanceof Date
        ? extraction.createdAt
        : new Date(extraction.createdAt)
      ).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })
    : "—";

  return (
    <div className="space-y-4">
      {/* Why auditability matters */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Why Auditability Matters
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Every extraction records the provider, model, exact prompts, raw response,
            repair status, and token usage. This lets researchers independently reproduce
            the extraction, verify the AI did not hallucinate, detect silent JSON repairs,
            and track cost over time. The <code className="font-mono text-[11px]">raw_provider_response</code> (before
            validation) is stored separately from <code className="font-mono text-[11px]">raw_extraction_json</code> (after
            validation) to make any automatic corrections fully visible.
          </CardDescription>
        </CardHeader>
      </Card>

      {isLegacy && (
        <Card className="bg-amber-50/40 border-amber-200 dark:bg-amber-950/10 dark:border-amber-800/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2">
              <TriangleAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                This extraction was created before M17 audit fields were added. Prompt, model,
                and repair metadata are not available. Re-run the extraction to generate a full
                audit record.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extraction metadata */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            Extraction Metadata
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div className="space-y-0.5">
              <dt className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Provider</dt>
              <dd>
                <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                  {extraction.providerUsed}
                </Badge>
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Model ID</dt>
              <dd className="font-mono text-sm font-medium">
                {extraction.providerModel || <span className="text-muted-foreground italic">—</span>}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Extracted at</dt>
              <dd className="font-mono text-xs">{extractedAt}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs font-mono uppercase tracking-wide text-muted-foreground">JSON repair</dt>
              <dd><RepairBadge status={extraction.repairStatus} /></dd>
            </div>
            {extraction.promptTemplateSummary && (
              <div className="col-span-full space-y-0.5">
                <dt className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Prompt template</dt>
                <dd className="text-sm text-muted-foreground leading-relaxed">
                  {extraction.promptTemplateSummary}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Validation errors */}
      {extraction.validationErrors && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="h-4 w-4" />
              Validation Errors
            </CardTitle>
            <CardDescription>
              These errors were encountered when parsing the provider response.
              {extraction.repairStatus === "repaired"
                ? " JSON repair resolved them — the stored extraction is valid."
                : " The extraction may be incomplete."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-destructive/10 rounded p-3 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap">
              {extraction.validationErrors}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Token usage */}
      {extraction.tokenUsage ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-muted-foreground" />
              Token Usage &amp; Cost
            </CardTitle>
            <CardDescription>
              Reported by the provider. Cost estimates are approximate — verify
              in your provider dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TokenUsageCard usage={extraction.tokenUsage} />
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-muted/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="h-4 w-4" />
              Token usage not available{" "}
              {extraction.providerUsed === "mock"
                ? "(mock provider makes no API call)."
                : "for this extraction."}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Provider fallback chain — visible when the auto path tried multiple providers */}
      {providerFallbacks.length > 0 && (
        <Card
          className="border-amber-300/50 bg-amber-50/40 dark:border-amber-800/30 dark:bg-amber-950/10"
          data-testid="audit-provider-fallbacks"
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Provider Fallback Chain
            </CardTitle>
            <CardDescription>
              The auto extraction path tried multiple providers in sequence.
              Each row is one transition; the final provider is the one that
              produced this extraction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {providerFallbacks.map((entry, index) => (
                <li
                  key={`${entry.from}-${entry.to}-${index}`}
                  className="rounded-lg border bg-background/70 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      {entry.from}
                    </Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                      {entry.to}
                    </Badge>
                  </div>
                  {entry.reason && (
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed break-words">
                      <span className="font-medium text-foreground">Reason:</span> {entry.reason}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Finalizer warnings — emitted by the extraction-finalizer post-processing */}
      {finalizerWarnings.length > 0 && (
        <Card
          className="border-sky-300/50 bg-sky-50/40 dark:border-sky-800/30 dark:bg-sky-950/10"
          data-testid="audit-finalizer-warnings"
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TriangleAlert className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              Finalizer Warnings
            </CardTitle>
            <CardDescription>
              Notes emitted by the post-extraction finalizer (placeholder pruning,
              unit inference, etc). These do not block the extraction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {finalizerWarnings.map((warning, index) => (
                <li
                  key={`${index}-${warning.slice(0, 40)}`}
                  className="text-sm text-sky-800 dark:text-sky-300 leading-relaxed"
                >
                  • {warning}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* AUDIT-9: PDF source-content warnings (figures, tables) */}
      {sourceWarnings.length > 0 && (
        <Card
          className="border-amber-300/50 bg-amber-50/40 dark:border-amber-800/30 dark:bg-amber-950/10"
          data-testid="audit-source-warnings"
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Source Content Warnings
            </CardTitle>
            <CardDescription>
              The text-layer PDF parser cannot read figures, images, or visual
              tables. These warnings indicate where source content may not have
              been fully captured.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {sourceWarnings.map((warning, index) => (
                <li
                  key={`${index}-${warning.slice(0, 40)}`}
                  className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed"
                >
                  • {warning}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* AUDIT-6: unrecognised unit warnings */}
      {unitWarnings.length > 0 && (
        <Card
          className="border-amber-300/50 bg-amber-50/40 dark:border-amber-800/30 dark:bg-amber-950/10"
          data-testid="audit-unit-warnings"
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Unrecognised Units
            </CardTitle>
            <CardDescription>
              Units below did not match the v1 allow-list. Treat them as raw
              and verify against the source paper. (This is not a full UCUM
              check — it flags only obviously suspicious tokens.)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {unitWarnings.map((warning, index) => (
                <li
                  key={`${index}-${warning.slice(0, 40)}`}
                  className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed"
                >
                  • {warning}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* AUDIT-10: explicit chunk truncation report */}
      {chunkTruncation && (
        <Card
          className="border-red-300/50 bg-red-50/40 dark:border-red-800/30 dark:bg-red-950/10"
          data-testid="audit-chunk-truncation"
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TriangleAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
              Chunk Truncation
            </CardTitle>
            <CardDescription>
              The source exceeded the AI prompt's per-call character budget,
              so some content was dropped before reaching the AI. Consider
              splitting the source into focused excerpts and re-running.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs font-mono uppercase text-muted-foreground">Input chunks</dt>
                <dd className="font-mono">{chunkTruncation.inputChunks}</dd>
              </div>
              <div>
                <dt className="text-xs font-mono uppercase text-muted-foreground">Included</dt>
                <dd className="font-mono">{chunkTruncation.includedChunks}</dd>
              </div>
              <div>
                <dt className="text-xs font-mono uppercase text-muted-foreground">Dropped chunks</dt>
                <dd className="font-mono">{chunkTruncation.droppedChunks}</dd>
              </div>
              <div>
                <dt className="text-xs font-mono uppercase text-muted-foreground">Dropped chars</dt>
                <dd className="font-mono">{chunkTruncation.droppedChars}</dd>
              </div>
              <div>
                <dt className="text-xs font-mono uppercase text-muted-foreground">Budget</dt>
                <dd className="font-mono">{chunkTruncation.budget}</dd>
              </div>
              <div>
                <dt className="text-xs font-mono uppercase text-muted-foreground">Total chars</dt>
                <dd className="font-mono">{chunkTruncation.totalChars}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {/* System prompt — collapsible, default closed (it's long) */}
      {extraction.systemPrompt ? (
        <CollapsibleSection
          title="System Prompt"
          icon={<FileCode2 className="h-4 w-4 text-muted-foreground" />}
          defaultOpen={false}
          badge={
            <Badge variant="outline" className="text-[9px] font-mono ml-2">
              {extraction.systemPrompt.length} chars
            </Badge>
          }
        >
          <p className="text-xs text-muted-foreground mb-3">
            Instructional text sent to the AI provider. Contains no API keys
            or secrets. Stored verbatim so extractions can be reproduced with
            any compatible provider.
          </p>
          <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto border border-border/50">
            {extraction.systemPrompt}
          </pre>
        </CollapsibleSection>
      ) : (
        <Card className="bg-muted/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileCode2 className="h-4 w-4" />
              System prompt not recorded{" "}
              {extraction.providerUsed === "mock"
                ? "(mock provider uses deterministic logic, no AI call)."
                : "for this extraction (legacy row)."}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw provider response — collapsible, default closed (may be large) */}
      <CollapsibleSection
        title="Raw Provider Response"
        icon={<ClipboardList className="h-4 w-4 text-muted-foreground" />}
        defaultOpen={false}
        badge={
          extraction.rawProviderResponse ? (
            <Badge variant="outline" className="text-[9px] font-mono ml-2">
              {JSON.stringify(extraction.rawProviderResponse).length} chars
            </Badge>
          ) : undefined
        }
      >
        <p className="text-xs text-muted-foreground mb-3">
          The provider response <em>before</em> JSON repair and Zod validation.
          Compare with the validated <strong>Raw Extraction JSON</strong> tab
          to see if any automatic corrections were applied.
        </p>
        {extraction.rawProviderResponse ? (
          <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto font-mono leading-relaxed max-h-[500px] overflow-y-auto border border-border/50">
            {JSON.stringify(extraction.rawProviderResponse, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {extraction.providerUsed === "mock"
              ? "Mock provider makes no API call — there is no raw provider response. The mock result is deterministic and needs no repair."
              : "Raw provider response not available for this extraction (legacy row)."}
          </p>
        )}
      </CollapsibleSection>

      {/* Copy buttons row */}
      {(extraction.systemPrompt || extraction.rawProviderResponse) && (
        <div className="flex gap-2 flex-wrap pt-1">
          {extraction.systemPrompt && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => void navigator.clipboard.writeText(extraction.systemPrompt)}
            >
              Copy system prompt
            </Button>
          )}
          {extraction.rawProviderResponse && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() =>
                void navigator.clipboard.writeText(
                  JSON.stringify(extraction.rawProviderResponse, null, 2),
                )
              }
            >
              Copy raw response
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
