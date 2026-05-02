/**
 * M19 — Domain Checklist Tab
 *
 * Shows the auto-detected model type, a manual override control, and a
 * domain-specific checklist comparing the extraction against expected variables
 * and parameters for the detected model type.
 *
 * Safety notes:
 *  - Classification is rule-based and transparent (confidence shown).
 *  - Users can always override the detected type via a dropdown.
 *  - Checklist items are guidelines, not hard constraints. Missing items show
 *    as warnings, not errors.
 *  - Never modifies rawExtractionJson or the normalized rows.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Lightbulb,
  Tag,
  Cpu,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import {
  getDomainTemplate,
  MODEL_TYPES,
  MODEL_TYPE_DISPLAY_NAMES,
} from "@workspace/domain-classifier";
import type { ModelType, ChecklistItem } from "@workspace/domain-classifier";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExtractionItem {
  symbol: string;
  name: string;
}

export interface DomainChecklistExtractionFields {
  id: number;
  modelType: string;
  modelTypeConfidence: number;
  modelTypeMatchedKeywords: string[];
  modelTypeOverride: string | null;
}

interface Props {
  extraction: DomainChecklistExtractionFields;
  variables: ExtractionItem[];
  parameters: ExtractionItem[];
  /** Called after a successful override so the parent can invalidate its query. */
  onOverrideSuccess?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function effectiveModelType(ext: DomainChecklistExtractionFields): ModelType {
  const raw = ext.modelTypeOverride ?? ext.modelType;
  return (MODEL_TYPES.includes(raw as ModelType) ? raw : "generic_ode") as ModelType;
}

function confidencePct(conf: number): string {
  return `${Math.round(conf * 100)}%`;
}

function confidenceColor(conf: number): string {
  if (conf >= 0.6) return "text-emerald-600 dark:text-emerald-400";
  if (conf >= 0.3) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

/** Returns true if the expected symbol / aliases appear in the extracted list. */
function isPresent(
  expectedSymbol: string,
  aliases: string[] | undefined,
  extracted: ExtractionItem[],
): boolean {
  const targets = [expectedSymbol.toLowerCase(), ...(aliases ?? []).map((a) => a.toLowerCase())];
  return extracted.some(
    (e) =>
      targets.includes(e.symbol.toLowerCase()) ||
      targets.some((t) => e.name.toLowerCase().includes(t)),
  );
}

// ── Severity icon ─────────────────────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: ChecklistItem["severity"] }) {
  if (severity === "critical") {
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />;
  }
  if (severity === "warning") {
    return <Info className="h-3.5 w-3.5 text-sky-500 shrink-0 mt-0.5" />;
  }
  return <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />;
}

// ── Collapsible section ────────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  icon,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none pb-3"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center justify-between gap-2">
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

// ── Expected item row ─────────────────────────────────────────────────────────

function ExpectedItemRow({
  symbol,
  name,
  unit,
  required,
  description,
  present,
}: {
  symbol: string;
  name: string;
  unit: string;
  required: boolean;
  description?: string;
  present: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0">
      <div className="mt-0.5 shrink-0">
        {present ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : required ? (
          <XCircle className="h-4 w-4 text-amber-500" />
        ) : (
          <XCircle className="h-4 w-4 text-muted-foreground/40" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold">{symbol}</span>
          <span className="text-sm text-muted-foreground">{name}</span>
          {unit && (
            <Badge variant="outline" className="text-[9px] font-mono">
              {unit}
            </Badge>
          )}
          {required && !present && (
            <Badge className="text-[9px] bg-amber-100 text-amber-800 border-amber-300 border">
              expected
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
    </div>
  );
}

// ── Checklist item row ────────────────────────────────────────────────────────

function ChecklistItemRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <SeverityIcon severity={item.severity} />
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-relaxed">{item.description}</p>
        {item.expectedUnit && (
          <span className="text-xs text-muted-foreground font-mono">
            Expected unit: {item.expectedUnit}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Override control ──────────────────────────────────────────────────────────

function ModelTypeOverride({
  extraction,
  onSuccess,
}: {
  extraction: DomainChecklistExtractionFields;
  onSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [selectValue, setSelectValue] = useState<string>(
    extraction.modelTypeOverride ?? "__auto__",
  );

  async function handleChange(value: string) {
    setSelectValue(value);
    const override = value === "__auto__" ? null : value;
    setSaving(true);
    try {
      await fetch(`/api/extractions/${extraction.id}/model-type`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelTypeOverride: override }),
      });
      onSuccess();
    } catch {
      /* silently revert on error */
      setSelectValue(extraction.modelTypeOverride ?? "__auto__");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground font-mono uppercase tracking-wide whitespace-nowrap">
        Override
      </label>
      <Select value={selectValue} onValueChange={handleChange} disabled={saving}>
        <SelectTrigger className="h-7 text-xs w-auto min-w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__auto__">
            <span className="text-muted-foreground italic">Auto (classifier)</span>
          </SelectItem>
          {MODEL_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {MODEL_TYPE_DISPLAY_NAMES[t as ModelType]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {extraction.modelTypeOverride && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Clear override"
          onClick={() => handleChange("__auto__")}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
      {saving && (
        <span className="text-xs text-muted-foreground animate-pulse">saving…</span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DomainChecklistTab({ extraction, variables, parameters, onOverrideSuccess }: Props) {
  const queryClient = useQueryClient();

  const effective = effectiveModelType(extraction);
  const template = getDomainTemplate(effective);
  const isOverridden = extraction.modelTypeOverride != null;
  const detectedType = extraction.modelType as ModelType;

  function handleOverrideSuccess() {
    void queryClient.invalidateQueries();
    onOverrideSuccess?.();
  }

  // Expected variable status
  const varItems = template.expectedVariables.map((ev) => ({
    ...ev,
    present: isPresent(ev.symbol, ev.aliases, variables),
  }));
  const paramItems = template.expectedParameters.map((ep) => ({
    ...ep,
    present: isPresent(ep.symbol, ep.aliases, parameters),
  }));

  const missingVars = varItems.filter((v) => !v.present && v.required).length;
  const missingParams = paramItems.filter((p) => !p.present && p.required).length;
  const criticalChecklist = template.checklistItems.filter(
    (c) => c.severity === "critical",
  ).length;

  return (
    <div className="space-y-4">
      {/* Model type banner */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Tag className="h-4 w-4 text-primary" />
                Detected Model Type
                {isOverridden && (
                  <Badge variant="outline" className="text-[9px] font-mono ml-1">
                    user override
                  </Badge>
                )}
              </CardTitle>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Badge className="text-sm px-3 py-1 bg-primary text-primary-foreground">
                  {MODEL_TYPE_DISPLAY_NAMES[effective]}
                </Badge>
                {isOverridden && detectedType !== effective && (
                  <span className="text-xs text-muted-foreground">
                    (classifier detected:{" "}
                    <span className="font-mono">{MODEL_TYPE_DISPLAY_NAMES[detectedType]}</span>)
                  </span>
                )}
              </div>
              <CardDescription className="mt-2 text-xs leading-relaxed max-w-prose">
                {template.description}
              </CardDescription>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs text-muted-foreground font-mono uppercase tracking-wide">
                Confidence
              </p>
              <p className={`text-xl font-bold font-mono ${confidenceColor(extraction.modelTypeConfidence)}`}>
                {confidencePct(extraction.modelTypeConfidence)}
              </p>
            </div>
          </div>

          {/* Matched keywords */}
          {extraction.modelTypeMatchedKeywords.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-1.5">
                <Cpu className="h-3 w-3 inline mr-1" />
                Classifier evidence ({extraction.modelTypeMatchedKeywords.length} keywords matched):
              </p>
              <div className="flex flex-wrap gap-1">
                {extraction.modelTypeMatchedKeywords.map((kw) => (
                  <Badge
                    key={kw}
                    variant="secondary"
                    className="text-[10px] font-mono py-0.5"
                  >
                    {kw}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {extraction.modelTypeMatchedKeywords.length === 0 && effective === "generic_ode" && (
            <p className="mt-2 text-xs text-muted-foreground italic">
              No domain-specific keywords detected. Defaulted to Generic ODE Model. Use the override below to set a specific type.
            </p>
          )}

          {/* Override control */}
          <div className="mt-4 pt-3 border-t border-border/40">
            <ModelTypeOverride extraction={extraction} onSuccess={handleOverrideSuccess} />
          </div>
        </CardHeader>
      </Card>

      {/* Summary of gaps */}
      {(missingVars > 0 || missingParams > 0) && (
        <Card className="bg-amber-50/40 border-amber-200 dark:bg-amber-950/10 dark:border-amber-800/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <strong>Potential gaps detected:</strong>{" "}
                {[
                  missingVars > 0 && `${missingVars} expected variable${missingVars > 1 ? "s" : ""} not found in extraction`,
                  missingParams > 0 && `${missingParams} expected parameter${missingParams > 1 ? "s" : ""} not found in extraction`,
                ]
                  .filter(Boolean)
                  .join(", ")}
                . Review the lists below and check the source document.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expected variables */}
      {template.expectedVariables.length > 0 && (
        <CollapsibleSection
          title="Expected State Variables"
          icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
          badge={
            missingVars > 0 ? (
              <Badge className="ml-1 text-[9px] bg-amber-100 text-amber-800 border-amber-300 border">
                {missingVars} missing
              </Badge>
            ) : (
              <Badge className="ml-1 text-[9px] bg-emerald-100 text-emerald-800 border-emerald-300 border">
                all present
              </Badge>
            )
          }
        >
          <div className="space-y-0.5">
            {varItems.map((v) => (
              <ExpectedItemRow key={v.symbol} {...v} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Expected parameters */}
      {template.expectedParameters.length > 0 && (
        <CollapsibleSection
          title="Expected Parameters"
          icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
          badge={
            missingParams > 0 ? (
              <Badge className="ml-1 text-[9px] bg-amber-100 text-amber-800 border-amber-300 border">
                {missingParams} missing
              </Badge>
            ) : (
              <Badge className="ml-1 text-[9px] bg-emerald-100 text-emerald-800 border-emerald-300 border">
                all present
              </Badge>
            )
          }
        >
          <div className="space-y-0.5">
            {paramItems.map((p) => (
              <ExpectedItemRow key={p.symbol} {...p} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Domain checklist */}
      {template.checklistItems.length > 0 && (
        <CollapsibleSection
          title="Domain Checklist"
          icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
          badge={
            <Badge variant="outline" className="text-[9px] ml-1">
              {criticalChecklist} critical item{criticalChecklist !== 1 ? "s" : ""}
            </Badge>
          }
        >
          <div className="space-y-0">
            {/* Group by severity */}
            {(["critical", "warning", "info"] as const).map((severity) => {
              const items = template.checklistItems.filter(
                (c) => c.severity === severity,
              );
              if (!items.length) return null;
              const labels = {
                critical: "Critical",
                warning: "Good Practice",
                info: "Informational",
              };
              return (
                <div key={severity} className="mb-4">
                  <p className="text-xs font-semibold font-mono uppercase tracking-wide text-muted-foreground mb-1.5">
                    {labels[severity]}
                  </p>
                  {items.map((item) => (
                    <ChecklistItemRow key={item.id} item={item} />
                  ))}
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* ODE hints */}
      {template.odeHints.length > 0 && (
        <CollapsibleSection
          title="ODE Template Hints"
          icon={<Lightbulb className="h-4 w-4 text-muted-foreground" />}
          defaultOpen={false}
        >
          <p className="text-xs text-muted-foreground mb-3">
            Reference equations for this model type. Compare with the extracted
            equations and the generated ODE template.
          </p>
          <div className="space-y-3">
            {template.odeHints.map((hint, i) => (
              <div key={i} className="space-y-1">
                <p className="text-sm font-medium">{hint.description}</p>
                {hint.example && (
                  <pre className="text-xs bg-muted/50 rounded px-3 py-2 font-mono overflow-x-auto border border-border/40">
                    {hint.example}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Unit rules */}
      {template.unitRules.length > 0 && (
        <CollapsibleSection
          title="Expected Units"
          icon={<Tag className="h-4 w-4 text-muted-foreground" />}
          defaultOpen={false}
        >
          <p className="text-xs text-muted-foreground mb-3">
            Canonical units for this model type. Verify the extraction matches these conventions.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {template.unitRules.map((rule) => (
              <div
                key={rule.symbol}
                className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2"
              >
                <span className="font-mono text-sm font-semibold w-12 shrink-0">
                  {rule.symbol}
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {rule.expectedUnit}
                </Badge>
                {rule.alternatives && rule.alternatives.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    or {rule.alternatives.join(", ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
