import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  FileSearch,
  Info,
  ListChecks,
  Route,
  ShieldAlert,
} from "lucide-react";
import type {
  ChemEBrainDisplayModel,
  ChemEBrainEvidenceRow,
} from "@/lib/cheme-brain-report";
import {
  CHEME_BRAIN_COMPARISON_NOTICE,
  CHEME_BRAIN_SHADOW_NOTICE,
} from "@/lib/cheme-brain-report";
import {
  CHEME_BRAIN_DEMO_SOURCE_WARNING,
  CHEME_BRAIN_RULE_BASED_SOURCE_WARNING,
  CHEME_BRAIN_V1_SCOPE_NOTICE,
  isMockProvider,
  isRuleBasedProvider,
} from "@/lib/mock-provider-disclosure";

interface Props {
  display: ChemEBrainDisplayModel;
  /** Provider that produced the underlying extraction. Used to surface
   *  mock/rule-based provenance so the audit is not mistaken for an AI audit. */
  providerUsed?: string | null;
}

function statusClass(status: string): string {
  if (status === "Observed in source") return "border-emerald-500/40 text-emerald-700 dark:text-emerald-300";
  if (status === "Inferred by ChemE rules") return "border-sky-500/40 text-sky-700 dark:text-sky-300";
  if (status === "Missing for simulation") return "border-amber-500/50 text-amber-700 dark:text-amber-300";
  if (status === "Conflicting evidence") return "border-red-500/50 text-red-700 dark:text-red-300";
  return "border-muted-foreground/40 text-muted-foreground";
}

function verdictClass(verdict: string): string {
  if (verdict === "runnable") return "border-emerald-500/50 bg-emerald-500/10";
  if (verdict === "supported_not_ready") return "border-amber-500/50 bg-amber-500/10";
  if (verdict === "scaffold_only") return "border-blue-500/50 bg-blue-500/10";
  return "border-muted-foreground/30 bg-muted/30";
}

function comparisonClass(severity: string): string {
  if (severity === "critical") return "border-red-500/50 bg-red-500/10";
  if (severity === "warning") return "border-amber-500/50 bg-amber-500/10";
  if (severity === "info") return "border-sky-500/50 bg-sky-500/10";
  return "border-emerald-500/40 bg-emerald-500/10";
}

function EvidenceList({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  rows: ChemEBrainEvidenceRow[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{empty}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={`${row.label}-${row.status}-${index}`} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={statusClass(row.status)}>
                    {row.status}
                  </Badge>
                  {row.severity ? (
                    <Badge variant="secondary" className="uppercase text-[10px]">
                      {row.severity}
                    </Badge>
                  ) : null}
                  {row.category ? (
                    <Badge variant="outline" className="uppercase text-[10px]">
                      {row.category.replace(/_/g, " ")}
                    </Badge>
                  ) : null}
                  <span className="font-medium">{row.label}</span>
                </div>
                <p className="mt-2 text-muted-foreground">{row.detail}</p>
                {row.reason ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Reason:</span> {row.reason}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ChemEBrainTab({ display, providerUsed }: Props) {
  const isMock = isMockProvider(providerUsed);
  const isRuleBased = isRuleBasedProvider(providerUsed);

  return (
    <div className="space-y-6" data-testid="cheme-brain-tab">
      <Card
        className="border-amber-500/40 bg-amber-500/5"
        data-testid="cheme-brain-scope-notice"
      >
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
              <span className="font-semibold">Scope of v1.</span>{" "}
              {CHEME_BRAIN_V1_SCOPE_NOTICE}
            </p>
          </div>
        </CardContent>
      </Card>

      {isMock ? (
        <Card
          className="border-amber-500/50 bg-amber-500/10"
          data-testid="cheme-brain-mock-source-warning"
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                {CHEME_BRAIN_DEMO_SOURCE_WARNING}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isRuleBased ? (
        <Card
          className="border-amber-500/50 bg-amber-500/10"
          data-testid="cheme-brain-rule-based-source-warning"
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                {CHEME_BRAIN_RULE_BASED_SOURCE_WARNING}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className={`border ${verdictClass(display.verdict)}`}>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                ChemE Brain verdict
              </CardTitle>
              <CardDescription className="mt-1">
                Professor-style shadow audit from extracted evidence.
              </CardDescription>
            </div>
            <Badge variant="outline" className="uppercase">
              {display.verdict.replace(/_/g, " ")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-background/70 p-3 text-sm">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p>{CHEME_BRAIN_SHADOW_NOTICE}</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed">{display.verdictReason}</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground font-mono">Extracted model type</p>
              <p className="font-mono text-sm mt-1">{display.extractedModelType}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground font-mono">ChemE Brain type</p>
              <p className="font-mono text-sm mt-1">{display.canonicalModelType}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase text-muted-foreground font-mono">Confidence</p>
              <p className="font-mono text-sm mt-1">{display.confidence}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={`border ${comparisonClass(display.assemblyComparison.severity)}`}>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                Assembly vs ChemE Brain — Shadow Comparison
              </CardTitle>
              <CardDescription>{CHEME_BRAIN_COMPARISON_NOTICE}</CardDescription>
            </div>
            <Badge variant="outline" className="uppercase">
              {display.assemblyComparison.severity}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{display.assemblyComparison.recommended_action}</p>
          {display.assemblyComparison.disagreements.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No shadow disagreement was detected for the checked assembly conditions.
            </p>
          ) : (
            <div className="space-y-3">
              {display.assemblyComparison.disagreements.map((item) => (
                <div key={item.id} className="rounded-lg border bg-background/70 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="uppercase text-[10px]">
                      {item.category.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="secondary" className="uppercase text-[10px]">
                      {item.severity}
                    </Badge>
                  </div>
                  <p className="mt-2">
                    <span className="font-medium">Model assembly says:</span> {item.assembly_says}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium">ChemE Brain says:</span> {item.cheme_brain_says}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    <span className="font-medium text-foreground">Why it matters:</span> {item.why_it_matters}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    <span className="font-medium text-foreground">Recommended action:</span> {item.recommended_action}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <EvidenceList
          title="What was observed"
          description="Observed in source: explicit evidence already present in extracted rows or raw source context."
          rows={display.observedRows}
          empty="No observed checklist evidence was identified."
        />
        <EvidenceList
          title="What was inferred"
          description="Inferred by ChemE rules: advisory reasoning derived from observed evidence."
          rows={display.inferredRows}
          empty="No ChemE rule-based inferences were needed."
        />
      </div>

      <EvidenceList
        title="What is missing"
        description="Missing for simulation: required information absent from the current extraction."
        rows={display.missingRows}
        empty="No missing ChemE Brain requirements were identified."
      />

      {display.conflictingRows.length > 0 || display.unsupportedRows.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <EvidenceList
            title="Conflicting evidence"
            description="Items where extracted evidence and ChemE rules disagree."
            rows={display.conflictingRows}
            empty="No conflicts were identified."
          />
          <EvidenceList
            title="Unsupported by current simulator"
            description="Items that are useful for review but outside current simulator support."
            rows={display.unsupportedRows}
            empty="No unsupported checklist items were identified."
          />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-5 w-5 text-muted-foreground" />
            Role corrections
          </CardTitle>
          <CardDescription>
            Advisory variable and parameter role review. Existing model-card values are not changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {display.roleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No role review rows available.</p>
          ) : (
            <div className="space-y-2">
              {display.roleRows.map((row, index) => (
                <div key={`${row.symbol}-${index}`} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold">{row.symbol}</span>
                    <Badge variant="outline">{row.extractedRole}</Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant="secondary">{row.recommendedRole}</Badge>
                    <Badge variant="outline" className={statusClass(row.status)}>
                      {row.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-muted-foreground">{row.reason}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-5 w-5 text-muted-foreground" />
            Equation classification
          </CardTitle>
          <CardDescription>
            Distinguishes dynamic ODEs from algebraic, rate, reporting, and control relationships.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {display.equationRows.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No equations were available for classification.</p>
          ) : (
            <div className="space-y-2">
              {display.equationRows.map((row, index) => (
                <div key={`${row.equation}-${index}`} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{row.classification}</Badge>
                    <Badge variant="outline" className={statusClass(row.status)}>
                      {row.status}
                    </Badge>
                  </div>
                  <p className="mt-2 font-mono text-xs break-all">{row.equation}</p>
                  <p className="mt-2 text-muted-foreground">{row.reason}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSearch className="h-5 w-5 text-muted-foreground" />
            Unit/convention review
          </CardTitle>
          <CardDescription>
            Inferred unit expectations and convention issues from the shadow audit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {display.unitRows.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No inferred unit expectations were produced.</p>
          ) : (
            <div className="space-y-2">
              {display.unitRows.map((row, index) => (
                <div key={`${row.symbol}-${index}`} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold">{row.symbol}</span>
                    <Badge variant="secondary">{row.expectedUnit}</Badge>
                    <Badge variant="outline" className={statusClass(row.status)}>
                      {row.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-muted-foreground">{row.note}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              Recommended next sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            {display.recommendedSources.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No additional source requests were generated.</p>
            ) : (
              <ul className="space-y-2">
                {display.recommendedSources.map((source, index) => (
                  <li key={`${source.sourceType}-${index}`} className="rounded-lg border p-3 text-sm">
                    <span className="font-mono font-semibold">{source.sourceType.replace(/_/g, " ")}</span>
                    <p className="mt-1 text-muted-foreground">{source.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
              Safety notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {display.safetyNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No safety notes were generated.</p>
            ) : (
              <ul className="space-y-2">
                {display.safetyNotes.map((note, index) => (
                  <li key={`${note}-${index}`} className="flex gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit trail</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {display.auditTrail.map((item, index) => (
              <li key={`${item}-${index}`} className="text-sm text-muted-foreground">
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
