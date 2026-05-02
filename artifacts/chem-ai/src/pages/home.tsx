import { Link } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FlaskConical,
  ArrowRight,
  UploadCloud,
  Cpu,
  Layers,
  ShieldOff,
  BookOpen,
  AlertTriangle,
  Package,
  TrendingUp,
  FileCode2,
  ShieldCheck,
  Play,
  ExternalLink,
} from "lucide-react";

export default function Home() {
  const { data: projects } = useListProjects();
  const recentProjects = (projects ?? []).slice(0, 2);

  return (
    <div className="space-y-20 pb-20">

      {/* ── Hero ── */}
      <section className="flex flex-col items-center text-center space-y-6 py-14 md:py-20">
        <div className="flex items-center gap-2 flex-wrap justify-center mb-1">
          <Badge variant="outline" className="text-xs font-mono text-primary border-primary/30 bg-primary/5">
            Open Research Tool
          </Badge>
          <Badge variant="outline" className="text-xs font-mono text-muted-foreground border-muted/40 bg-muted/10">
            Demo Mode — MockProvider
          </Badge>
        </div>

        <div className="bg-primary/10 p-5 rounded-full">
          <FlaskConical className="h-14 w-14 text-primary" />
        </div>

        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground max-w-4xl leading-tight">
          Convert Scientific Literature
          <br className="hidden md:block" />
          into{" "}
          <span className="text-primary">Simulation-Ready</span>
          <br className="hidden md:block" />
          Model Packages
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
          ChemEngAI extracts equations, variables, parameters, assumptions, and
          missing-information reports from chemical engineering papers — then
          generates transparent, reproducible model packages with Python ODE
          templates, unit checks, and reproducibility scores.
        </p>

        <div className="flex gap-3 pt-2 flex-wrap justify-center">
          <Link href="/new">
            <Button size="lg" className="text-base h-12 px-8 shadow-sm">
              New Extraction <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="/model-cards/1">
            <Button variant="outline" size="lg" className="text-base h-12 px-8">
              <Play className="mr-2 h-4 w-4" />
              View Demo Model
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Scientific accuracy note ── */}
      <section className="max-w-3xl mx-auto">
        <div className="border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-700/40 rounded-xl px-6 py-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
            <span className="font-semibold">Scientific accuracy note: </span>
            AI-extracted models must be manually verified before use in
            research, engineering, or decision-making. This tool is an
            extraction and reproducibility aid — not a validated simulation
            platform or certified digital twin.
          </p>
        </div>
      </section>

      <Separator />

      {/* ── NotebookLM vs ChemEngAI ── */}
      <section className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2 mb-1">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Not a NotebookLM clone
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Different tools for different jobs.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card className="border-muted/50 bg-muted/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                NotebookLM
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1.5 text-muted-foreground">
              <p>✓ Summarise and chat with research papers</p>
              <p>✓ Ask questions across multiple sources</p>
              <p>✓ Audio overviews and study guides</p>
              <p className="opacity-50">✗ Cannot extract structured equations</p>
              <p className="opacity-50">✗ Cannot generate simulation scaffolds</p>
              <p className="opacity-50">✗ Cannot report missing parameters</p>
            </CardContent>
          </Card>

          <Card className="border-primary/25 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-primary flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                ChemEngAI
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1.5">
              <p className="opacity-40 text-muted-foreground">✗ Not a general Q&amp;A assistant</p>
              <p className="opacity-40 text-muted-foreground">✗ Not a document summariser</p>
              <p className="font-medium">✓ LaTeX equations with source quotes</p>
              <p className="font-medium">✓ Variables + parameters tables with units</p>
              <p className="font-medium">✓ Reproducibility score and gap report</p>
              <p className="font-medium">✓ Python ODE scaffold + 14-file model package</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Not a black-box optimizer ── */}
      <section className="bg-muted/25 border border-border rounded-xl p-8 max-w-4xl mx-auto">
        <div className="flex items-start gap-4 mb-4">
          <div className="bg-destructive/10 p-2.5 rounded-full shrink-0 mt-0.5">
            <ShieldOff className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-1">Not a black-box optimizer</h2>
            <p className="text-muted-foreground leading-relaxed text-sm md:text-base">
              Industrial platforms optimize validated bioprocesses from
              experimental data.{" "}
              <span className="font-medium text-foreground">ChemEngAI</span>{" "}
              is a research scaffold tool. It helps you turn papers into
              transparent model cards with equations, parameter tables,
              missing-information reports, and simulation-ready code —
              before optimization can even begin.
            </p>
          </div>
        </div>
        <div className="pl-14 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-muted-foreground">
          {["Transparency over automation", "Source traceability on every field", "Explicit units, assumptions & gaps"].map((t) => (
            <div key={t} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              {t}
            </div>
          ))}
        </div>
      </section>

      {/* ── Core workflow ── */}
      <section className="space-y-8 max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center tracking-tight">
          Core workflow
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: "1",
              icon: UploadCloud,
              title: "Ingest",
              description:
                "Paste the methodology section from a published chemical or biochemical paper. Plain text, methodology excerpts, and equation blocks all work.",
            },
            {
              step: "2",
              icon: Cpu,
              title: "Extract",
              description:
                "The extraction engine identifies state variables, governing ODEs, input parameters, assumptions, and flags missing information with severity levels.",
            },
            {
              step: "3",
              icon: Layers,
              title: "Simulate & Export",
              description:
                "Review the 10-tab model card, run the browser RK4 simulator, and download a 14-file reproducible model package: Python scaffold, CSV tables, unit check, reproducibility report.",
            },
          ].map(({ step, icon: Icon, title, description }) => (
            <Card key={step} className="border-none shadow-sm bg-card/80 relative overflow-hidden">
              <div className="absolute top-2 right-3 text-7xl font-black text-muted/8 select-none leading-none pointer-events-none">
                {step}
              </div>
              <CardHeader className="pb-2">
                <div className="bg-primary/10 w-10 h-10 flex items-center justify-center rounded-full mb-3">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground leading-relaxed">
                {description}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Example output ── */}
      <section className="max-w-5xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Example output
          </h2>
          <p className="text-muted-foreground text-sm md:text-base">
            What ChemEngAI produces from a single chemostat paper excerpt
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              icon: TrendingUp,
              value: "100/100",
              label: "Repro score",
              sub: "Equations, params, units, ICs",
              color: "text-emerald-600 dark:text-emerald-400",
              bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
            },
            {
              icon: Package,
              value: "14 files",
              label: "Model package",
              sub: "ZIP with all outputs",
              color: "text-primary",
              bg: "bg-primary/5",
            },
            {
              icon: FileCode2,
              value: "Python",
              label: "ODE scaffold",
              sub: "scipy.integrate ready",
              color: "text-violet-600 dark:text-violet-400",
              bg: "bg-violet-50/60 dark:bg-violet-950/20",
            },
            {
              icon: ShieldCheck,
              value: "0H / 5M",
              label: "Unit check",
              sub: "0 high-severity issues",
              color: "text-teal-600 dark:text-teal-400",
              bg: "bg-teal-50/60 dark:bg-teal-950/20",
            },
          ].map(({ icon: Icon, value, label, sub, color, bg }) => (
            <Card key={label} className={`text-center border-none shadow-sm ${bg}`}>
              <CardContent className="pt-6 pb-5">
                <Icon className={`h-6 w-6 mx-auto mb-2 ${color}`} />
                <p className={`text-xl md:text-2xl font-bold font-mono ${color}`}>
                  {value}
                </p>
                <p className="text-xs font-semibold text-foreground mt-1">{label}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center">
          <Link href="/model-cards/1">
            <Button variant="outline" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Open demo model card
            </Button>
          </Link>
        </div>
      </section>

      <Separator />

      {/* ── Recent projects ── */}
      {recentProjects.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Recent Projects</h2>
            <Link href="/model-cards">
              <Button variant="ghost" className="text-primary hover:text-primary/80 text-sm">
                View all <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {recentProjects.map((project) => (
              <Card key={project.id} className="hover:shadow-md transition-all duration-200 group border-border/60">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {project.extractionCount} extraction
                      {project.extractionCount === 1 ? "" : "s"}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <CardTitle className="text-base group-hover:text-primary transition-colors">
                    {project.name}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 text-xs">
                    {project.latestExtractionTitle ?? project.description}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="pt-0">
                  <Link href={`/model-cards/${project.id}`} className="w-full">
                    <Button variant="secondary" className="w-full text-sm h-9">
                      View Model Card
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
