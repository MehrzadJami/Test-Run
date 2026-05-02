import { Link } from "wouter";
import {
  Package,
  FileCode2,
  FileSpreadsheet,
  FileJson,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Exports() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            Exports
          </h1>
          <p className="text-muted-foreground mt-2">
            All exports are generated client-side from your model cards — no
            server processing required.
          </p>
        </div>
        <Link href="/model-cards/1">
          <Button size="sm" className="gap-2 shrink-0">
            <ExternalLink className="h-3.5 w-3.5" />
            Open demo model card
          </Button>
        </Link>
      </div>

      <Alert className="border-emerald-300/60 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-700/40">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <AlertDescription className="text-sm text-emerald-800 dark:text-emerald-300">
          All export formats are now available. Open any model card and use the
          header buttons to download.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Model Package ZIP */}
        <Card className="flex flex-col h-full border-primary/20 bg-primary/3">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="bg-primary/10 w-12 h-12 flex items-center justify-center rounded-full mb-4">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 text-xs font-mono">
                Available
              </Badge>
            </div>
            <CardTitle>Model Package ZIP</CardTitle>
            <CardDescription>
              A 14-file reproducible package: README, model card (Markdown),
              CSV tables, equations, Python ODE scaffold, reproducibility
              report, unit check, and source quotes.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="text-sm text-muted-foreground space-y-1.5 list-none">
              {[
                "README.md — overview, scores, missing gaps, run instructions",
                "simulate.py — Python ODE scaffold (scipy.integrate)",
                "variables.csv + parameters.csv",
                "reproducibility_report.json + unit_check_report.json",
                "source_excerpt.txt — traceability record",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-2">
            <Link href="/model-cards/1" className="w-full">
              <Button className="w-full gap-2">
                <Download className="h-4 w-4" />
                Open model card → Download Package
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground font-mono">
              Button: "Download Package" in model card header
            </p>
          </CardFooter>
        </Card>

        {/* Python ODE Template */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="bg-violet-100 dark:bg-violet-950/40 w-12 h-12 flex items-center justify-center rounded-full mb-4">
                <FileCode2 className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 text-xs font-mono">
                Available
              </Badge>
            </div>
            <CardTitle>Python ODE Template</CardTitle>
            <CardDescription>
              A honesty-first scaffold: extracted parameters pre-filled,
              equation bodies marked as TODO with LaTeX comments, and warning
              banners for any critical missing information.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="text-sm text-muted-foreground space-y-1.5 list-none">
              {[
                "scipy.integrate.solve_ivp call wired up",
                "params{} dict pre-filled with extracted values",
                "Readiness + unit-check warning banners",
                "matplotlib time-series plot included",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-2">
            <Link href="/model-cards/1" className="w-full">
              <Button variant="outline" className="w-full gap-2">
                <ArrowRight className="h-4 w-4" />
                Open model card → ODE Template tab
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground font-mono">
              Tab: "ODE Template" → "Download .py"
            </p>
          </CardFooter>
        </Card>

        {/* CSV Data Tables */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="bg-teal-100 dark:bg-teal-950/40 w-12 h-12 flex items-center justify-center rounded-full mb-4">
                <FileSpreadsheet className="h-6 w-6 text-teal-600 dark:text-teal-400" />
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 text-xs font-mono">
                Available (in ZIP)
              </Badge>
            </div>
            <CardTitle>CSV Data Tables</CardTitle>
            <CardDescription>
              Flat CSV files for variables and parameters — ready for ingestion
              into spreadsheets, data pipelines, or other tooling. Included in
              the model package ZIP.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="text-sm text-muted-foreground space-y-1.5 list-none">
              {[
                "variables.csv — symbol, name, unit, role, source_quote",
                "parameters.csv — symbol, value, unit, confidence, source_quote",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-2">
            <Link href="/model-cards/1" className="w-full">
              <Button variant="outline" className="w-full gap-2">
                <Package className="h-4 w-4" />
                Download via Model Package ZIP
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground font-mono">
              Inside model_package/ folder of the ZIP
            </p>
          </CardFooter>
        </Card>

        {/* Simulation CSV */}
        <Card className="flex flex-col h-full">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="bg-orange-100 dark:bg-orange-950/40 w-12 h-12 flex items-center justify-center rounded-full mb-4">
                <FileJson className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 text-xs font-mono">
                Available
              </Badge>
            </div>
            <CardTitle>Simulation CSV + Raw JSON</CardTitle>
            <CardDescription>
              Browser RK4 simulation output as a time-series CSV (t, X, S).
              Plus the full raw extraction JSON from the provider.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="text-sm text-muted-foreground space-y-1.5 list-none">
              {[
                "chemostat_simulation.csv — t, X_g/L, S_g/L columns",
                "Parameter metadata header included in CSV",
                "Raw JSON via model card Export JSON button",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-2">
            <Link href="/simulation" className="w-full">
              <Button variant="outline" className="w-full gap-2">
                <ArrowRight className="h-4 w-4" />
                Open Simulation → Download CSV
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground font-mono">
              After running simulation → "Download CSV" button
            </p>
          </CardFooter>
        </Card>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-6 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground text-sm">How exports work</p>
        <p>
          All exports are generated entirely in-browser — no server-side
          processing or file storage. The Model Package ZIP is assembled by
          JSZip from the data already loaded in your model card. Python
          templates and CSVs are generated on the fly from extracted model
          data.
        </p>
        <p className="text-xs">
          Future: standalone export API endpoint, multi-model batch export,
          MATLAB/Julia/Modelica stubs.
        </p>
      </div>
    </div>
  );
}
