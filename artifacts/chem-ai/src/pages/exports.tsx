import { DownloadCloud, FileCode2, FileJson, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";

export default function Exports() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Exports</h1>
        <p className="text-muted-foreground mt-2">
          Generate downstream simulation assets from extracted models.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="flex flex-col h-full opacity-80">
          <CardHeader>
            <div className="bg-primary/10 w-12 h-12 flex items-center justify-center rounded-full mb-4">
              <FileJson className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Markdown Model Card</CardTitle>
            <CardDescription>
              Export a complete human-readable model card containing equations, variables, and parameters formatted nicely in Markdown.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
              <li>LaTeX equation blocks</li>
              <li>Tables for variables & parameters</li>
              <li>Source quotes included</li>
            </ul>
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-3">
            <Button disabled className="w-full" data-testid="btn-export-markdown">
              <DownloadCloud className="mr-2 h-4 w-4" /> Download
            </Button>
            <span className="text-xs font-mono text-muted-foreground">Available in Milestone 5</span>
          </CardFooter>
        </Card>

        <Card className="flex flex-col h-full opacity-80">
          <CardHeader>
            <div className="bg-primary/10 w-12 h-12 flex items-center justify-center rounded-full mb-4">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>CSV Data Tables</CardTitle>
            <CardDescription>
              Download variables and parameters as flat CSV files for ingestion into other tools or spreadsheets.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
              <li>Variables CSV (symbols, units, roles)</li>
              <li>Parameters CSV (values, units)</li>
            </ul>
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-3">
            <Button disabled className="w-full" data-testid="btn-export-csv">
              <DownloadCloud className="mr-2 h-4 w-4" /> Download
            </Button>
            <span className="text-xs font-mono text-muted-foreground">Available in Milestone 5</span>
          </CardFooter>
        </Card>

        <Card className="flex flex-col h-full opacity-80">
          <CardHeader>
            <div className="bg-primary/10 w-12 h-12 flex items-center justify-center rounded-full mb-4">
              <FileCode2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Python ODE Stub</CardTitle>
            <CardDescription>
              Generate a ready-to-run Python script using SciPy to simulate the extracted equations.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
              <li>scipy.integrate.odeint setup</li>
              <li>Parameter variables initialized</li>
              <li>State vector mapping</li>
            </ul>
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-3">
            <Button disabled className="w-full" data-testid="btn-export-python">
              <DownloadCloud className="mr-2 h-4 w-4" /> Download
            </Button>
            <span className="text-xs font-mono text-muted-foreground">Available in Milestone 5</span>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
