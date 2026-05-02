import { Link } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  FlaskConical,
  ArrowRight,
  UploadCloud,
  Cpu,
  Layers,
  ShieldOff,
  BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  const { data: projects } = useListProjects();
  const recentProjects = (projects ?? []).slice(0, 2);

  return (
    <div className="space-y-16 pb-16">
      {/* Hero Section */}
      <section className="flex flex-col items-center text-center space-y-6 py-12 md:py-20">
        <div className="bg-primary/10 p-4 rounded-full mb-4">
          <FlaskConical className="h-12 w-12 text-primary" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground max-w-3xl">
          Convert Scientific Literature into Simulation-Ready Model Packages
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl">
          ChemEngAI is a research tool that converts scientific
          literature and experimental notes into transparent, reproducible,
          simulation-ready engineering model packages.
        </p>
        <div className="flex gap-4 pt-4 flex-wrap justify-center">
          <Link href="/new">
            <Button
              size="lg"
              className="text-base h-12 px-8"
              data-testid="btn-hero-new"
            >
              New Extraction <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button
              variant="outline"
              size="lg"
              className="text-base h-12 px-8"
              data-testid="btn-hero-dashboard"
            >
              View Dashboard
            </Button>
          </Link>
        </div>
      </section>

      <Separator />

      {/* NotebookLM comparison */}
      <section className="max-w-3xl mx-auto text-center space-y-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wider">
            Not a NotebookLM clone
          </h2>
        </div>
        <p className="text-base text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">NotebookLM</span> helps
          you read and chat with sources.{" "}
          <span className="font-medium text-foreground">
            ChemEngAI
          </span>{" "}
          helps you{" "}
          <span className="text-primary font-medium">
            extract equations, variables, parameters, assumptions, missing
            information, and simulation-ready code
          </span>{" "}
          from those sources.
        </p>
      </section>

      {/* Not a black-box optimizer */}
      <section className="bg-muted/40 border border-border rounded-xl p-8 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-destructive/10 p-2 rounded-full">
            <ShieldOff className="h-5 w-5 text-destructive" />
          </div>
          <h2 className="text-xl font-bold">Not a black-box optimizer</h2>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Industrial platforms optimize validated bioprocesses from experimental
          data.{" "}
          <span className="font-medium text-foreground">
            ChemEngAI
          </span>{" "}
          helps researchers turn papers and notes into transparent model cards,
          equations, parameter tables, missing-information reports, and
          simulation-ready code.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          This tool focuses on{" "}
          <span className="font-medium text-foreground">transparency</span>,
          source snippets, units, assumptions, missing data, and
          reproducibility. It helps researchers understand and rebuild models{" "}
          <span className="font-medium text-foreground">
            before optimization
          </span>
          .
        </p>
      </section>

      {/* How it works */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-center">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="border-none shadow-md bg-card/50">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto bg-primary/10 w-12 h-12 flex items-center justify-center rounded-full mb-4">
                <UploadCloud className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>1. Ingest</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              Upload a PDF or paste methodology text from a published chemical
              or biochemical paper.
            </CardContent>
          </Card>
          <Card className="border-none shadow-md bg-card/50">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto bg-primary/10 w-12 h-12 flex items-center justify-center rounded-full mb-4">
                <Cpu className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>2. Extract</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              The AI engine identifies state variables, input parameters,
              governing ODEs, assumptions, and missing information.
            </CardContent>
          </Card>
          <Card className="border-none shadow-md bg-card/50">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto bg-primary/10 w-12 h-12 flex items-center justify-center rounded-full mb-4">
                <Layers className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>3. Simulate & Export</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              Review the transparent model card and export to Python, CSV, or
              Markdown for downstream simulation and reproducibility.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Recent Projects */}
      {recentProjects.length > 0 ? (
        <section className="space-y-6 pt-8 border-t border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Recent Projects</h2>
            <Link href="/model-cards">
              <Button
                variant="ghost"
                className="text-primary hover:text-primary/80"
                data-testid="btn-view-all"
              >
                View all <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recentProjects.map((project) => (
              <Card
                key={project.id}
                className="hover:shadow-md transition-shadow"
              >
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {project.extractionCount} extraction
                      {project.extractionCount === 1 ? "" : "s"}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {project.latestExtractionTitle ?? project.description}
                  </CardDescription>
                </CardHeader>
                <CardFooter>
                  <Link
                    href={`/model-cards/${project.id}`}
                    className="w-full"
                  >
                    <Button
                      variant="secondary"
                      className="w-full"
                      data-testid={`btn-view-${project.id}`}
                    >
                      View Model Card
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
