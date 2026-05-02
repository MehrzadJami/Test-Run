import { useParams, Link } from "wouter";
import {
  useGetModelCardByProject,
  useGetProject,
} from "@workspace/api-client-react";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  FileText,
  Database,
  Code2,
  Download,
  Sparkles,
  Play,
  Info,
} from "lucide-react";

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

function ConfidenceBadge({ value }: { value?: Confidence }) {
  if (!value) return null;
  return (
    <Badge
      variant={
        value === "high"
          ? "default"
          : value === "medium"
            ? "secondary"
            : "destructive"
      }
      className="text-[10px] uppercase ml-2"
    >
      {value}
    </Badge>
  );
}

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

export default function ModelCardDetail() {
  const params = useParams();
  const projectId = Number(params.id);

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

  const project = projectQuery.data;
  const { extraction, equations, variables, parameters, assumptions } =
    cardQuery.data;
  const assumptionItems = assumptions.filter((a) => a.kind === "assumption");
  const limitationItems = assumptions.filter((a) => a.kind === "limitation");

  const raw = extraction.rawExtractionJson as RawExtraction | null | undefined;
  const modelCard = raw?.model_card;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
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
        </div>
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
            {raw?.model_card?.can_generate_ode_template && (
              <Link href="/simulation">
                <Button
                  variant="default"
                  size="default"
                  data-testid="btn-run-simulation"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Run Simulation
                </Button>
              </Link>
            )}
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

      {/* Tabs */}
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
          <TabsTrigger value="ode" data-testid="tab-ode">
            ODE Template
          </TabsTrigger>
          <TabsTrigger value="raw" data-testid="tab-raw">
            Raw JSON
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
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

        {/* Variables */}
        <TabsContent value="variables" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>State &amp; Input Variables</CardTitle>
              <CardDescription>
                Symbols, units, roles, and source context extracted from the
                paper.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden md:table-cell w-1/3">
                      Source Quote
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variables.map((v, i) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono font-bold text-primary">
                        {v.symbol}
                      </TableCell>
                      <TableCell className="font-medium">
                        {v.name}
                        <ConfidenceBadge
                          value={raw?.state_variables?.[i]?.confidence}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted/50 rounded px-2 py-1">
                          {v.unit || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={v.role === "state" ? "default" : "outline"}
                          className="text-[10px] uppercase"
                        >
                          {v.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground italic hidden md:table-cell">
                        "{v.sourceQuote}"
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Parameters */}
        <TabsContent value="parameters" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Model Parameters</CardTitle>
              <CardDescription>
                Numerical values, units, confidence scores, and source quotes.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="hidden md:table-cell w-1/4">
                      Source Quote
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parameters.map((p, i) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-bold text-primary">
                        {p.symbol}
                      </TableCell>
                      <TableCell className="font-medium">
                        {raw?.parameters?.[i]?.name ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {p.value}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted/50 rounded px-2 py-1">
                          {p.unit || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ConfidenceBadge value={p.confidence as Confidence} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground italic hidden md:table-cell">
                        "{p.sourceQuote}"
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Equations */}
        <TabsContent value="equations" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Governing Equations</CardTitle>
              <CardDescription>
                Extracted mathematical relationships with LaTeX, plaintext, and
                source context.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">LaTeX</TableHead>
                    <TableHead className="w-[20%]">Plaintext</TableHead>
                    <TableHead className="w-[25%]">Meaning</TableHead>
                    <TableHead className="w-[10%]">Confidence</TableHead>
                    <TableHead className="w-[15%]">Source Quote</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equations.map((eq, i) => (
                    <TableRow key={eq.id}>
                      <TableCell className="font-mono text-sm bg-muted/30 whitespace-pre-wrap font-medium">
                        {eq.latex}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {raw?.equations?.[i]?.equation_plaintext ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {eq.description}
                      </TableCell>
                      <TableCell>
                        <ConfidenceBadge
                          value={raw?.equations?.[i]?.confidence}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground italic border-l border-border pl-3">
                        "{eq.sourceQuote}"
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assumptions */}
        <TabsContent value="assumptions" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-muted/30 border-muted-foreground/20">
              <CardHeader>
                <CardTitle className="text-base">Assumptions</CardTitle>
                <CardDescription>
                  Conditions taken as given in the model formulation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {assumptionItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No assumptions extracted.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {assumptionItems.map((item, i) => (
                      <li key={item.id} className="text-sm">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 text-muted-foreground">•</span>
                          <div>
                            {item.text}
                            <ConfidenceBadge
                              value={raw?.assumptions?.[i]?.confidence}
                            />
                            {raw?.assumptions?.[i]?.source_context ? (
                              <p className="text-xs text-muted-foreground italic mt-1">
                                "{raw.assumptions[i]!.source_context}"
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="bg-destructive/5 border-destructive/20">
              <CardHeader>
                <CardTitle className="text-base text-destructive">
                  Limitations
                </CardTitle>
                <CardDescription>
                  Known boundaries and weaknesses of the model.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {limitationItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No limitations extracted.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {limitationItems.map((item, i) => (
                      <li key={item.id} className="text-sm text-destructive/90">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5">•</span>
                          <div>
                            {item.text}
                            <ConfidenceBadge
                              value={raw?.limitations?.[i]?.confidence}
                            />
                            {raw?.limitations?.[i]?.source_context ? (
                              <p className="text-xs text-muted-foreground italic mt-1">
                                "{raw.limitations[i]!.source_context}"
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Missing Info */}
        <TabsContent value="missing" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-muted-foreground" />
                Missing Information
              </CardTitle>
              <CardDescription>
                Data, parameters, or conditions not present in the source
                material that would be needed for a complete model.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(modelCard?.missing_information ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No missing information identified — or no model card available
                  for this extraction.
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

        {/* ODE Template */}
        <TabsContent value="ode" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-muted-foreground" />
                Generated ODE Template (Python)
              </CardTitle>
              <CardDescription>
                Drop-in starting point using{" "}
                <code>scipy.integrate.solve_ivp</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted/50 rounded p-4 overflow-x-auto font-mono leading-relaxed">
                {extraction.odeTemplate}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Raw JSON */}
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
                  No raw extraction JSON available for this record (pre-migration
                  row).
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
