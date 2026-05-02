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
} from "lucide-react";

// ---------- raw extraction passthrough types ----------
//
// `rawExtractionJson` is emitted by the API as an opaque object (any provider
// output that satisfied the canonical ExtractionResultSchema on the server).
// We re-state the shape here for read-only display; if the field is null —
// e.g. legacy extractions created before the column existed — we fall back
// to the normalized tables.

type Confidence = "high" | "medium" | "low";

type RawEquation = {
  label?: string;
  confidence?: Confidence;
};
type RawAssumption = { confidence?: Confidence };
type RawLimitation = { confidence?: Confidence };
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
    return (
      <p className="text-sm text-muted-foreground italic">—</p>
    );
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

  // Optional rich passthrough of the canonical provider output. Null for
  // pre-migration rows; we degrade gracefully and only render the extra
  // sections when present.
  const raw = extraction.rawExtractionJson as RawExtraction | null | undefined;
  const modelCard = raw?.model_card;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
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
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {raw?.model_card?.can_generate_ode_template && (
              <Link href="/simulation">
                <Button variant="default" size="default" data-testid="btn-run-simulation">
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

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5 lg:w-[720px]">
          <TabsTrigger value="overview" data-testid="tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="equations" data-testid="tab-equations">
            Equations ({equations.length})
          </TabsTrigger>
          <TabsTrigger value="variables" data-testid="tab-variables">
            Variables ({variables.length})
          </TabsTrigger>
          <TabsTrigger value="parameters" data-testid="tab-parameters">
            Parameters ({parameters.length})
          </TabsTrigger>
          <TabsTrigger value="ode" data-testid="tab-ode">
            ODE Template
          </TabsTrigger>
        </TabsList>

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
                  Model Card
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                      Missing Information
                    </p>
                    {(modelCard.missing_information ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">—</p>
                    ) : (
                      <ul className="list-disc pl-5 space-y-1 text-sm">
                        {modelCard.missing_information!.map((m, i) => (
                          <li key={`${m}-${i}`}>{m}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-muted/30 border-muted-foreground/20">
              <CardHeader>
                <CardTitle className="text-base">Assumptions</CardTitle>
              </CardHeader>
              <CardContent>
                {assumptionItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No assumptions extracted.
                  </p>
                ) : (
                  <ul className="list-disc pl-5 space-y-2 text-sm">
                    {assumptionItems.map((item, i) => (
                      <li key={item.id}>
                        {item.text}
                        <ConfidenceBadge
                          value={raw?.assumptions?.[i]?.confidence}
                        />
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
              </CardHeader>
              <CardContent>
                {limitationItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No limitations extracted.
                  </p>
                ) : (
                  <ul className="list-disc pl-5 space-y-2 text-sm text-destructive/90">
                    {limitationItems.map((item, i) => (
                      <li key={item.id}>
                        {item.text}
                        <ConfidenceBadge
                          value={raw?.limitations?.[i]?.confidence}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="equations" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Governing Equations</CardTitle>
              <CardDescription>
                Extracted mathematical relationships from the source material.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[35%]">Equation (LaTeX)</TableHead>
                    <TableHead className="w-[30%]">Description</TableHead>
                    <TableHead className="w-[10%]">Confidence</TableHead>
                    <TableHead className="w-[25%]">Source Quote</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equations.map((eq, i) => (
                    <TableRow key={eq.id}>
                      <TableCell className="font-mono text-sm bg-muted/30 whitespace-pre-wrap font-medium">
                        {eq.latex}
                      </TableCell>
                      <TableCell className="text-sm">
                        {eq.description}
                      </TableCell>
                      <TableCell>
                        {raw?.equations?.[i]?.confidence ? (
                          <ConfidenceBadge
                            value={raw.equations[i]!.confidence}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            —
                          </span>
                        )}
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

        <TabsContent value="variables" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>State & Input Variables</CardTitle>
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
                  {variables.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono font-bold text-primary">
                        {v.symbol}
                      </TableCell>
                      <TableCell className="font-medium">{v.name}</TableCell>
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

        <TabsContent value="parameters" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Model Parameters</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="hidden md:table-cell w-1/3">
                      Source Quote
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parameters.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-bold text-primary">
                        {p.symbol}
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
                        <Badge
                          variant={
                            p.confidence === "high"
                              ? "default"
                              : p.confidence === "medium"
                                ? "secondary"
                                : "destructive"
                          }
                          className="text-[10px] uppercase"
                        >
                          {p.confidence}
                        </Badge>
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

        <TabsContent value="ode" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-muted-foreground" />
                Generated ODE template (Python)
              </CardTitle>
              <CardDescription>
                Drop-in starting point using <code>scipy.integrate.solve_ivp</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted/50 rounded p-4 overflow-x-auto font-mono leading-relaxed">
                {extraction.odeTemplate}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
