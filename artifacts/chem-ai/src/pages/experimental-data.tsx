import { useState, useCallback, useMemo, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  FlaskConical,
  Upload,
  Play,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  FileText,
} from "lucide-react";
import { parseChemostatCsv, type ParsedCsvRow, type CsvParseResult } from "@/lib/csv-parser";
import { fitMonodChemostat, type FitResult, type FitConfig } from "@/lib/fitting";

// ─── chart tooltip ─────────────────────────────────────────────────────────────

interface TooltipPayload { color: string; name: string; value: number | null }

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (!visible.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-mono text-xs text-muted-foreground mb-1">t = {label} h</p>
      {visible.map((p) => (
        <p key={p.name} className="font-mono" style={{ color: p.color }}>
          {p.name}: {(p.value as number).toFixed(4)} g/L
        </p>
      ))}
    </div>
  );
}

// ─── numeric field ─────────────────────────────────────────────────────────────

function NumField({
  id,
  label,
  symbol,
  unit,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  symbol: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}{" "}
        <span className="font-mono font-semibold text-foreground">{symbol}</span>
        {unit && <span className="text-muted-foreground font-normal"> ({unit})</span>}
      </Label>
      <Input
        id={id}
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-8 font-mono text-sm"
      />
    </div>
  );
}

// ─── chart data helpers ────────────────────────────────────────────────────────

interface ChartPoint {
  t: number;
  Xfit: number | null;
  Sfit: number | null;
  Xmeas: number | null;
  Smeas: number | null;
}

function buildChartData(
  curve: { t: number; X: number; S: number }[],
  measured: ParsedCsvRow[]
): ChartPoint[] {
  const points: ChartPoint[] = curve.map((p) => ({
    t: p.t,
    Xfit: p.X,
    Sfit: p.S,
    Xmeas: null,
    Smeas: null,
  }));
  for (const obs of measured) {
    points.push({ t: obs.time, Xfit: null, Sfit: null, Xmeas: obs.X, Smeas: obs.S });
  }
  points.sort((a, b) => a.t - b.t);
  return points;
}

// ─── export helpers ────────────────────────────────────────────────────────────

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportParamsCsv(result: FitResult) {
  const lines = [
    "# ChemAI Model Compiler — Monod Chemostat Fitting v1 — Fitted Parameters",
    "parameter,value,unit",
    `mumax,${result.params.mumax.toFixed(6)},h⁻¹`,
    `Ks,${result.params.Ks.toFixed(6)},g/L`,
    `Yxs,${result.params.Yxs.toFixed(6)},g-X/g-S`,
    `D,${result.fixed.D.toFixed(6)},h⁻¹`,
    `Sin,${result.fixed.Sin.toFixed(6)},g/L`,
    `X0,${result.fixed.X0.toFixed(6)},g/L`,
    `S0,${result.fixed.S0.toFixed(6)},g/L`,
    "",
    "# Fit metrics",
    `rmse_X,${result.rmseX.toFixed(6)},g/L`,
    `rmse_S,${result.rmseS.toFixed(6)},g/L`,
    `r2_X,${result.r2X.toFixed(6)},`,
    `r2_S,${result.r2S.toFixed(6)},`,
  ].join("\n");
  downloadBlob(lines, "fitted_params_monod_chemostat.csv", "text/csv");
}

function exportParamsJson(result: FitResult) {
  const obj = {
    label: "Monod Chemostat Fitting v1",
    disclaimer:
      "Parameters estimated by least-squares fitting to experimental time-series data. This compares model predictions to data; it does not validate the model.",
    method: "Nelder-Mead simplex (client-side, log-space parameters, RK4 ODE solver)",
    fittedParameters: {
      mumax: { value: result.params.mumax, unit: "h⁻¹", description: "Maximum specific growth rate" },
      Ks: { value: result.params.Ks, unit: "g/L", description: "Monod half-saturation constant" },
      Yxs: { value: result.params.Yxs, unit: "g-X/g-S", description: "Biomass yield on substrate" },
    },
    fixedParameters: {
      D: { value: result.fixed.D, unit: "h⁻¹" },
      Sin: { value: result.fixed.Sin, unit: "g/L" },
      X0: { value: result.fixed.X0, unit: "g/L" },
      S0: { value: result.fixed.S0, unit: "g/L" },
    },
    fitMetrics: {
      rmseX: { value: result.rmseX, unit: "g/L" },
      rmseS: { value: result.rmseS, unit: "g/L" },
      r2X: { value: result.r2X },
      r2S: { value: result.r2S },
    },
    converged: result.converged,
    iterations: result.iterations,
  };
  downloadBlob(JSON.stringify(obj, null, 2), "fitted_params_monod_chemostat.json", "application/json");
}

// ─── main page ────────────────────────────────────────────────────────────────

type Step = "upload" | "configure" | "fitting" | "results";

const DEFAULT_FIXED = { D: "0.3", Sin: "10.0", X0: "", S0: "" };
const DEFAULT_GUESS = { mumax: "0.5", Ks: "0.5", Yxs: "0.5" };

export default function ExperimentalData() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CSV state
  const [csvResult, setCsvResult] = useState<CsvParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [step, setStep] = useState<Step>("upload");

  // Config state
  const [fitFlags, setFitFlags] = useState({ mumax: true, Ks: true, Yxs: true });
  const [fixedRaw, setFixedRaw] = useState<Record<string, string>>(DEFAULT_FIXED);
  const [guessRaw, setGuessRaw] = useState<Record<string, string>>(DEFAULT_GUESS);

  // Result state
  const [fitResult, setFitResult] = useState<FitResult | null>(null);
  const [fitError, setFitError] = useState<string | null>(null);

  // ── file handling ──

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setStep("upload");
    setFitResult(null);
    setFitError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseChemostatCsv(text);
      setCsvResult(result);
      if (result.ok) {
        // auto-fill X0/S0 from first row
        const first = result.rows[0];
        setFixedRaw((prev) => ({
          ...prev,
          X0: first.X.toString(),
          S0: first.S.toString(),
        }));
        setStep("configure");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // ── fitting ──

  const canFit = useMemo(() => {
    if (!csvResult?.ok) return false;
    const vals = [fixedRaw.D, fixedRaw.Sin, fixedRaw.X0, fixedRaw.S0];
    if (vals.some((v) => !isFinite(parseFloat(v)))) return false;
    return fitFlags.mumax || fitFlags.Ks || fitFlags.Yxs;
  }, [csvResult, fixedRaw, fitFlags]);

  const handleFit = useCallback(() => {
    if (!csvResult?.ok) return;
    setStep("fitting");
    setFitError(null);

    // Defer to next tick so React can render the loading state first
    setTimeout(() => {
      try {
        const config: FitConfig = {
          fitMumax: fitFlags.mumax,
          fitKs: fitFlags.Ks,
          fitYxs: fitFlags.Yxs,
          fixed: {
            D: parseFloat(fixedRaw.D),
            Sin: parseFloat(fixedRaw.Sin),
            X0: parseFloat(fixedRaw.X0),
            S0: parseFloat(fixedRaw.S0),
          },
          guess: {
            mumax: parseFloat(guessRaw.mumax) || 0.5,
            Ks: parseFloat(guessRaw.Ks) || 0.5,
            Yxs: parseFloat(guessRaw.Yxs) || 0.5,
          },
        };
        const result = fitMonodChemostat(csvResult.rows, config);
        setFitResult(result);
        setStep("results");
      } catch (err) {
        setFitError(err instanceof Error ? err.message : "Unknown fitting error.");
        setStep("configure");
      }
    }, 30);
  }, [csvResult, fitFlags, fixedRaw, guessRaw]);

  const handleReset = useCallback(() => {
    setCsvResult(null);
    setFileName("");
    setStep("upload");
    setFitResult(null);
    setFitError(null);
    setFitFlags({ mumax: true, Ks: true, Yxs: true });
    setFixedRaw(DEFAULT_FIXED);
    setGuessRaw(DEFAULT_GUESS);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── chart data ──

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!fitResult || !csvResult) return [];
    return buildChartData(fitResult.curve, csvResult.rows);
  }, [fitResult, csvResult]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* ── header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Experimental Data Fitting</h1>
            <Badge variant="secondary" className="font-mono text-xs">
              Monod Chemostat v1
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Upload time-series data and compare Monod chemostat model predictions to measurements.
          </p>
        </div>
        {step !== "upload" && (
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Start over
          </Button>
        )}
      </div>

      {/* ── disclaimer ── */}
      <Alert className="border-blue-400/40 bg-blue-50/40 dark:bg-blue-950/20">
        <Info className="h-4 w-4 text-blue-500" />
        <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
          <strong>Monod Chemostat Fitting v1</strong> — This tool helps compare model predictions
          to experimental data using least-squares parameter estimation. It does{" "}
          <em>not</em> validate the model. Results depend on data quality, initial guesses,
          and whether the Monod chemostat model is appropriate for your system.
        </AlertDescription>
      </Alert>

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 1 — Upload
      ══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
              ${step !== "upload" || csvResult?.ok
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"}`}>
              {csvResult?.ok ? <CheckCircle2 className="w-4 h-4" /> : "1"}
            </div>
            <CardTitle className="text-base">Upload Time-Series Data</CardTitle>
            {fileName && (
              <Badge variant="outline" className="font-mono text-xs ml-auto">
                <FileText className="w-3 h-3 mr-1" />
                {fileName}
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs mt-1">
            CSV with columns: <span className="font-mono font-semibold">time, X, S</span>
            {" "}— optional: <span className="font-mono">O2, CO2</span>.
            Time must be in hours, concentrations in g/L.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* dropzone */}
          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Drop a CSV file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">
              First row must be a header row. Lines starting with # are ignored.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>

          {/* sample download hint */}
          <p className="text-xs text-muted-foreground">
            No data yet?{" "}
            <button
              className="text-primary hover:underline font-medium"
              onClick={() => {
                const sampleUrl = "/samples/chemostat_sample.csv";
                const a = document.createElement("a");
                a.href = sampleUrl;
                a.download = "chemostat_sample.csv";
                a.click();
              }}
            >
              Download the sample CSV
            </button>{" "}
            (16 rows, synthetic Monod chemostat data).
          </p>

          {/* parse errors */}
          {csvResult && csvResult.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Could not parse file</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 mt-1 space-y-0.5 text-sm">
                  {csvResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* parse warnings */}
          {csvResult && csvResult.warnings.length > 0 && (
            <Alert className="border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-0.5 text-sm">
                  {csvResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* preview table */}
          {csvResult?.ok && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-widest">
                Preview — {csvResult.rows.length} rows
                {csvResult.hasO2 && " · O2 detected"}
                {csvResult.hasCO2 && " · CO2 detected"}
              </p>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="text-xs w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      {csvResult.rawHeaders.map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-mono font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvResult.rows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5 font-mono">{row.time}</td>
                        <td className="px-3 py-1.5 font-mono">{row.X}</td>
                        <td className="px-3 py-1.5 font-mono">{row.S}</td>
                        {csvResult.hasO2 && (
                          <td className="px-3 py-1.5 font-mono">{row.O2 ?? "—"}</td>
                        )}
                        {csvResult.hasCO2 && (
                          <td className="px-3 py-1.5 font-mono">{row.CO2 ?? "—"}</td>
                        )}
                      </tr>
                    ))}
                    {csvResult.rows.length > 10 && (
                      <tr className="border-t border-border bg-muted/20">
                        <td colSpan={csvResult.rawHeaders.length} className="px-3 py-1.5 text-center text-muted-foreground italic">
                          … {csvResult.rows.length - 10} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 2 — Configure
      ══════════════════════════════════════════════════════════════════════ */}
      {(step === "configure" || step === "fitting" || step === "results") && csvResult?.ok && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${step === "results"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted-foreground/20 text-muted-foreground"}`}>
                {step === "results" ? <CheckCircle2 className="w-4 h-4" /> : "2"}
              </div>
              <CardTitle className="text-base">Fitting Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* fixed parameters */}
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Fixed (known) parameters
                </p>
                <NumField
                  id="D"
                  label="Dilution rate"
                  symbol="D"
                  unit="h⁻¹"
                  value={fixedRaw.D}
                  onChange={(v) => setFixedRaw((p) => ({ ...p, D: v }))}
                  disabled={step === "fitting" || step === "results"}
                />
                <NumField
                  id="Sin"
                  label="Feed substrate"
                  symbol="S_in"
                  unit="g/L"
                  value={fixedRaw.Sin}
                  onChange={(v) => setFixedRaw((p) => ({ ...p, Sin: v }))}
                  disabled={step === "fitting" || step === "results"}
                />
                <NumField
                  id="X0"
                  label="Initial biomass"
                  symbol="X₀"
                  unit="g/L"
                  value={fixedRaw.X0}
                  onChange={(v) => setFixedRaw((p) => ({ ...p, X0: v }))}
                  disabled={step === "fitting" || step === "results"}
                />
                <NumField
                  id="S0"
                  label="Initial substrate"
                  symbol="S₀"
                  unit="g/L"
                  value={fixedRaw.S0}
                  onChange={(v) => setFixedRaw((p) => ({ ...p, S0: v }))}
                  disabled={step === "fitting" || step === "results"}
                />
              </div>

              {/* parameters to fit */}
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Parameters to fit
                </p>
                <p className="text-xs text-muted-foreground -mt-2">
                  Select parameters to estimate. Provide initial guesses (closer = faster convergence).
                </p>

                {(["mumax", "Ks", "Yxs"] as const).map((key) => {
                  const meta = {
                    mumax: { label: "Max growth rate", symbol: "μmax", unit: "h⁻¹" },
                    Ks: { label: "Half-saturation", symbol: "Ks", unit: "g/L" },
                    Yxs: { label: "Biomass yield", symbol: "Yxs", unit: "g-X/g-S" },
                  }[key];
                  return (
                    <div key={key} className="flex items-start gap-3">
                      <Checkbox
                        id={`fit-${key}`}
                        checked={fitFlags[key]}
                        onCheckedChange={(v) =>
                          setFitFlags((p) => ({ ...p, [key]: !!v }))
                        }
                        disabled={step === "fitting" || step === "results"}
                        className="mt-6"
                      />
                      <div className="flex-1">
                        <NumField
                          id={`guess-${key}`}
                          label={`${meta.label} (initial guess)`}
                          symbol={meta.symbol}
                          unit={meta.unit}
                          value={guessRaw[key]}
                          onChange={(v) => setGuessRaw((p) => ({ ...p, [key]: v }))}
                          disabled={!fitFlags[key] || step === "fitting" || step === "results"}
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="pt-2">
                  {step !== "results" ? (
                    <Button
                      className="w-full"
                      onClick={handleFit}
                      disabled={!canFit || step === "fitting"}
                    >
                      {step === "fitting" ? (
                        <>
                          <span className="animate-spin mr-2 inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                          Fitting…
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-1.5" />
                          Run fitting
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setFitResult(null);
                        setStep("configure");
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      Refit with new settings
                    </Button>
                  )}
                  {fitError && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-sm">{fitError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 3 — Results
      ══════════════════════════════════════════════════════════════════════ */}
      {step === "results" && fitResult && (
        <>
          {/* convergence status */}
          {fitResult.converged ? (
            <Alert className="border-emerald-400/40 bg-emerald-50/40 dark:bg-emerald-950/20">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-sm text-emerald-800 dark:text-emerald-200">
                Optimizer converged in <strong>{fitResult.iterations}</strong> iterations.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm">
                Optimizer reached maximum iterations ({fitResult.iterations}) without converging.
                Try different initial guesses or check that D and Sin are correct.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* fitted parameters */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Fitted Parameters</CardTitle>
                <CardDescription className="text-xs">
                  Monod kinetic parameters estimated from data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {[
                      { key: "μmax", val: fitResult.params.mumax, unit: "h⁻¹", fit: true },
                      { key: "Ks", val: fitResult.params.Ks, unit: "g/L", fit: true },
                      { key: "Yxs", val: fitResult.params.Yxs, unit: "g-X/g-S", fit: true },
                      { key: "D", val: fitResult.fixed.D, unit: "h⁻¹", fit: false },
                      { key: "S_in", val: fitResult.fixed.Sin, unit: "g/L", fit: false },
                      { key: "X₀", val: fitResult.fixed.X0, unit: "g/L", fit: false },
                      { key: "S₀", val: fitResult.fixed.S0, unit: "g/L", fit: false },
                    ].map(({ key, val, unit, fit }) => (
                      <tr key={key}>
                        <td className="py-1.5 font-mono font-semibold text-foreground">{key}</td>
                        <td className="py-1.5 font-mono text-right">{val.toFixed(5)}</td>
                        <td className="py-1.5 text-muted-foreground text-xs pl-2">{unit}</td>
                        <td className="py-1.5 pl-3">
                          {fit ? (
                            <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-0">fitted</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">fixed</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* fit metrics */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Fit Metrics</CardTitle>
                <CardDescription className="text-xs">
                  Lower RMSE and higher R² indicate better fit
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "RMSE (X)", val: fitResult.rmseX, unit: "g/L", color: "text-teal-600 dark:text-teal-400" },
                    { label: "RMSE (S)", val: fitResult.rmseS, unit: "g/L", color: "text-orange-500" },
                    { label: "R² (X)", val: fitResult.r2X, unit: "", color: "text-teal-600 dark:text-teal-400" },
                    { label: "R² (S)", val: fitResult.r2S, unit: "", color: "text-orange-500" },
                  ].map(({ label, val, unit, color }) => (
                    <div key={label} className="bg-muted/40 rounded-md px-3 py-2">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={`text-lg font-mono font-bold ${color}`}>
                        {val.toFixed(4)}{unit && <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>}
                      </p>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="space-y-1 text-xs text-muted-foreground">
                  <p><strong>Method:</strong> Nelder-Mead simplex, log-space parameters</p>
                  <p><strong>ODE solver:</strong> RK4 (dt ≈ 0.02 h)</p>
                  <p><strong>Objective:</strong> Normalized sum of squared residuals (X + S)</p>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => exportParamsCsv(fitResult)}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    CSV
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => exportParamsJson(fitResult)}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    JSON
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">Measured vs. Fitted Model</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Dots = measured data · Lines = fitted Monod chemostat model
                  </CardDescription>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-8 h-0.5 bg-teal-500 rounded" />
                    <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                    Biomass X
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-8 h-0.5 bg-orange-500 rounded" />
                    <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                    Substrate S
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={380}>
                <LineChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    label={{ value: "Time (h)", position: "insideBottom", offset: -14, fontSize: 11 }}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    label={{
                      value: "Concentration (g/L)",
                      angle: -90,
                      position: "insideLeft",
                      offset: 14,
                      fontSize: 11,
                    }}
                    tick={{ fontSize: 11 }}
                    width={62}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "14px" }} />

                  {/* Fitted curves — smooth lines */}
                  <Line
                    dataKey="Xfit"
                    name="X fitted"
                    stroke="#0d9488"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="Sfit"
                    name="S fitted"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />

                  {/* Measured data — dots only, no connecting line */}
                  <Line
                    dataKey="Xmeas"
                    name="X measured"
                    stroke="#0d9488"
                    strokeWidth={0}
                    dot={{ r: 5, fill: "#0d9488", stroke: "#fff", strokeWidth: 1.5 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                    legendType="circle"
                  />
                  <Line
                    dataKey="Smeas"
                    name="S measured"
                    stroke="#f97316"
                    strokeWidth={0}
                    dot={{ r: 5, fill: "#f97316", stroke: "#fff", strokeWidth: 1.5 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                    legendType="circle"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* model package note */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-4 pb-3 flex items-start gap-3">
              <FlaskConical className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Linking to a model card</p>
                <p className="text-muted-foreground text-xs mt-0.5 mb-2">
                  To include these fitted parameters in a model package, export the JSON file
                  and reference it in your model card, or manually enter the values using
                  the inline parameter editor on the model card detail page.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => exportParamsJson(fitResult)}
                  >
                    <Download className="h-3 w-3 mr-1.5" />
                    Export for model package
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
