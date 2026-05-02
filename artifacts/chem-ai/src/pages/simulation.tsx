import { useState, useCallback, useMemo } from "react";
import { Link } from "wouter";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
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
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ActivitySquare,
  Play,
  RotateCcw,
  Download,
  AlertTriangle,
  Info,
  ExternalLink,
  FlaskConical,
  TrendingUp,
} from "lucide-react";

// ─── types ────────────────────────────────────────────────────────────────────

interface SimParams {
  mumax: number;
  Ks: number;
  D: number;
  Sin: number;
  Yxs: number;
  X0: number;
  S0: number;
  tFinal: number;
  dt: number;
}

interface SimPoint {
  t: number;
  X: number;
  S: number;
}

interface ValidationError {
  field: string;
  message: string;
}

interface Warning {
  id: string;
  message: string;
}

// ─── demo defaults ─────────────────────────────────────────────────────────────

const DEMO_PARAMS: SimParams = {
  mumax: 0.4,
  Ks: 0.1,
  D: 0.2,
  Sin: 10.0,
  Yxs: 0.5,
  X0: 0.5,
  S0: 5.0,
  tFinal: 50,
  dt: 0.1,
};

// ─── ODE / solver ─────────────────────────────────────────────────────────────

function chemostatDerivatives(
  X: number,
  S: number,
  p: SimParams
): [number, number] {
  const Ssafe = Math.max(0, S);
  const mu = (p.mumax * Ssafe) / (p.Ks + Ssafe);
  const dX = (mu - p.D) * X;
  const dS = p.D * (p.Sin - Ssafe) - (1 / p.Yxs) * mu * X;
  return [dX, dS];
}

function rungeKutta4(p: SimParams): SimPoint[] {
  const steps = Math.min(Math.ceil(p.tFinal / p.dt), 50_000);
  const h = p.tFinal / steps;
  const points: SimPoint[] = [];
  const decimation = Math.max(1, Math.floor(steps / 1000));

  let X = p.X0;
  let S = p.S0;
  let t = 0;

  for (let i = 0; i <= steps; i++) {
    if (i % decimation === 0 || i === steps) {
      points.push({
        t: parseFloat(t.toFixed(4)),
        X: parseFloat(Math.max(0, X).toFixed(6)),
        S: parseFloat(Math.max(0, S).toFixed(6)),
      });
    }

    const [k1X, k1S] = chemostatDerivatives(X, S, p);
    const [k2X, k2S] = chemostatDerivatives(
      X + 0.5 * h * k1X,
      S + 0.5 * h * k1S,
      p
    );
    const [k3X, k3S] = chemostatDerivatives(
      X + 0.5 * h * k2X,
      S + 0.5 * h * k2S,
      p
    );
    const [k4X, k4S] = chemostatDerivatives(X + h * k3X, S + h * k3S, p);

    X += (h / 6) * (k1X + 2 * k2X + 2 * k3X + k4X);
    S += (h / 6) * (k1S + 2 * k2S + 2 * k3S + k4S);
    t += h;

    if (!isFinite(X) || !isFinite(S)) break;
  }

  return points;
}

// ─── validation ───────────────────────────────────────────────────────────────

function validate(p: SimParams): ValidationError[] {
  const errors: ValidationError[] = [];
  if (p.mumax <= 0) errors.push({ field: "mumax", message: "μmax must be > 0" });
  if (p.Ks <= 0) errors.push({ field: "Ks", message: "Ks must be > 0 (prevents division by zero in growth rate)" });
  if (p.D < 0) errors.push({ field: "D", message: "Dilution rate D cannot be negative" });
  if (p.Sin < 0) errors.push({ field: "Sin", message: "Feed concentration S_in cannot be negative" });
  if (p.Yxs <= 0) errors.push({ field: "Yxs", message: "Yield Yxs must be > 0" });
  if (p.X0 < 0) errors.push({ field: "X0", message: "Initial biomass X₀ cannot be negative" });
  if (p.S0 < 0) errors.push({ field: "S0", message: "Initial substrate S₀ cannot be negative" });
  if (p.tFinal <= 0) errors.push({ field: "tFinal", message: "Simulation time must be > 0" });
  if (p.dt <= 0) errors.push({ field: "dt", message: "Time step must be > 0" });
  if (p.dt > 0 && p.tFinal > 0 && p.dt >= p.tFinal)
    errors.push({ field: "dt", message: "Time step must be smaller than final time" });
  return errors;
}

function getWarnings(p: SimParams): Warning[] {
  const warnings: Warning[] = [];
  const muMax_at_Sin = (p.mumax * p.Sin) / (p.Ks + p.Sin);
  if (p.D > muMax_at_Sin) {
    warnings.push({
      id: "washout",
      message: `Washout likely: D (${p.D.toFixed(3)} h⁻¹) exceeds maximum achievable μ at S_in (${muMax_at_Sin.toFixed(3)} h⁻¹). Biomass will decay to zero.`,
    });
  }
  if (p.D === 0) {
    warnings.push({
      id: "batch",
      message: "D = 0 means no inflow/outflow — this is batch mode, not chemostat.",
    });
  }
  if (p.dt > 0.5) {
    warnings.push({
      id: "dt",
      message: "Large time step may reduce accuracy. Consider Δt ≤ 0.5 h.",
    });
  }
  if (p.X0 === 0 && p.S0 === 0) {
    warnings.push({
      id: "trivial",
      message: "Both X₀ and S₀ are zero — the system has no dynamics to simulate.",
    });
  }
  return warnings;
}

// ─── CSV helper ───────────────────────────────────────────────────────────────

function downloadCsv(data: SimPoint[], params: SimParams) {
  const meta = [
    "# ChemEngAI Chemostat Simulation",
    `# mumax=${params.mumax} Ks=${params.Ks} D=${params.D} Sin=${params.Sin} Yxs=${params.Yxs}`,
    `# X0=${params.X0} S0=${params.S0} tFinal=${params.tFinal} dt=${params.dt}`,
    "",
  ].join("\n");
  const header = "time_h,X_g_per_L,S_g_per_L\n";
  const rows = data.map((pt) => `${pt.t},${pt.X},${pt.S}`).join("\n");
  const blob = new Blob([meta + header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chemostat_simulation.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── sub-components ───────────────────────────────────────────────────────────

interface ParamFieldProps {
  id: string;
  label: string;
  symbol: string;
  unit: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}

function ParamField({
  id,
  label,
  symbol,
  unit,
  value,
  error,
  onChange,
}: ParamFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}{" "}
        <span className="font-mono text-foreground font-semibold">{symbol}</span>
        {unit && (
          <span className="text-muted-foreground font-normal"> ({unit})</span>
        )}
      </Label>
      <Input
        id={id}
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-8 font-mono text-sm ${
          error ? "border-destructive focus-visible:ring-destructive" : ""
        }`}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: number;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-mono text-xs text-muted-foreground mb-1">
        t = {label} h
      </p>
      {payload.map((p) => (
        <p key={p.name} className="font-mono" style={{ color: p.color }}>
          {p.name} = {p.value.toFixed(4)} g/L
        </p>
      ))}
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toParams(raw: Record<string, string>): Partial<SimParams> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = parseFloat(v);
    if (!isNaN(n)) out[k] = n;
  }
  return out as Partial<SimParams>;
}

function isComplete(p: Partial<SimParams>): p is SimParams {
  return Object.keys(DEMO_PARAMS).every(
    (k) => k in p && isFinite((p as Record<string, number>)[k])
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function Simulation() {
  const [rawParams, setRawParams] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        Object.entries(DEMO_PARAMS).map(([k, v]) => [k, String(v)])
      )
  );
  const [simData, setSimData] = useState<SimPoint[] | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [lastParams, setLastParams] = useState<SimParams | null>(null);

  const parsed = useMemo(() => toParams(rawParams), [rawParams]);

  const errors = useMemo<ValidationError[]>(() => {
    if (!isComplete(parsed)) return [];
    return validate(parsed);
  }, [parsed]);

  const warnings = useMemo<Warning[]>(() => {
    if (!isComplete(parsed) || errors.length > 0) return [];
    return getWarnings(parsed);
  }, [parsed, errors]);

  const fieldError = useCallback(
    (field: string) => errors.find((e) => e.field === field)?.message,
    [errors]
  );

  const handleRun = useCallback(() => {
    if (!isComplete(parsed) || errors.length > 0) return;
    const data = rungeKutta4(parsed);
    setSimData(data);
    setLastParams({ ...parsed });
    setHasRun(true);
  }, [parsed, errors]);

  const handleReset = useCallback(() => {
    setRawParams(
      Object.fromEntries(
        Object.entries(DEMO_PARAMS).map(([k, v]) => [k, String(v)])
      )
    );
    setSimData(null);
    setHasRun(false);
    setLastParams(null);
  }, []);

  const set = (field: string) => (v: string) =>
    setRawParams((prev) => ({ ...prev, [field]: v }));

  const canRun = isComplete(parsed) && errors.length === 0;

  const steadyState = useMemo(() => {
    if (!lastParams) return null;
    const p = lastParams;
    if (p.D <= 0 || p.D >= p.mumax) return { washout: true };
    const SSS = (p.D * p.Ks) / (p.mumax - p.D);
    const XSS = p.Yxs * (p.Sin - SSS);
    if (SSS < 0 || XSS < 0) return { washout: true };
    return {
      washout: false,
      SSS: SSS.toFixed(4),
      XSS: XSS.toFixed(4),
      muSS: p.D.toFixed(4),
    };
  }, [lastParams]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">
              Simulation Playground
            </h1>
            <Badge variant="secondary" className="font-mono text-xs">
              RK4
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Chemostat / Monod kinetics — solved in-browser with 4th-order
            Runge-Kutta
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Reset to demo
          </Button>
          {simData && lastParams && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv(simData, lastParams)}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Download CSV
            </Button>
          )}
          <Button size="sm" onClick={handleRun} disabled={!canRun}>
            <Play className="h-4 w-4 mr-1.5" />
            Run simulation
          </Button>
        </div>
      </div>

      {/* ── validation errors ── */}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fix the following before running</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 mt-1 space-y-0.5 text-sm">
              {errors.map((e) => (
                <li key={e.field}>{e.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* ── warnings ── */}
      {warnings.map((w) => (
        <Alert
          key={w.id}
          className="border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20"
        >
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-sm">{w.message}</AlertDescription>
        </Alert>
      ))}

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
        {/* ══ left: parameter cards ══ */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Kinetic Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ParamField
                id="mumax"
                label="Max growth rate"
                symbol="μmax"
                unit="h⁻¹"
                value={rawParams.mumax}
                error={fieldError("mumax")}
                onChange={set("mumax")}
              />
              <ParamField
                id="Ks"
                label="Half-saturation"
                symbol="Ks"
                unit="g/L"
                value={rawParams.Ks}
                error={fieldError("Ks")}
                onChange={set("Ks")}
              />
              <ParamField
                id="Yxs"
                label="Biomass yield"
                symbol="Yxs"
                unit="g-X/g-S"
                value={rawParams.Yxs}
                error={fieldError("Yxs")}
                onChange={set("Yxs")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Operating Conditions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ParamField
                id="D"
                label="Dilution rate"
                symbol="D"
                unit="h⁻¹"
                value={rawParams.D}
                error={fieldError("D")}
                onChange={set("D")}
              />
              <ParamField
                id="Sin"
                label="Feed substrate"
                symbol="S_in"
                unit="g/L"
                value={rawParams.Sin}
                error={fieldError("Sin")}
                onChange={set("Sin")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Initial Conditions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ParamField
                id="X0"
                label="Initial biomass"
                symbol="X₀"
                unit="g/L"
                value={rawParams.X0}
                error={fieldError("X0")}
                onChange={set("X0")}
              />
              <ParamField
                id="S0"
                label="Initial substrate"
                symbol="S₀"
                unit="g/L"
                value={rawParams.S0}
                error={fieldError("S0")}
                onChange={set("S0")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Solver Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ParamField
                id="tFinal"
                label="Simulation time"
                symbol="t_final"
                unit="h"
                value={rawParams.tFinal}
                error={fieldError("tFinal")}
                onChange={set("tFinal")}
              />
              <ParamField
                id="dt"
                label="Time step"
                symbol="Δt"
                unit="h"
                value={rawParams.dt}
                error={fieldError("dt")}
                onChange={set("dt")}
              />
            </CardContent>
          </Card>

          {/* link to model card */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-4 pb-3 flex items-start gap-3">
              <ActivitySquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Chemostat model card</p>
                <p className="text-muted-foreground text-xs mb-2">
                  See the extracted equations and parameters this simulation is
                  based on.
                </p>
                <Link href="/model-cards/1">
                  <Button variant="outline" size="sm" className="text-xs h-7">
                    <ExternalLink className="h-3 w-3 mr-1.5" />
                    Open model card
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ══ right: chart + info ══ */}
        <div className="space-y-4">
          {/* chart card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    Concentration vs. Time
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Biomass{" "}
                    <span className="text-teal-600 dark:text-teal-400 font-semibold">
                      X
                    </span>{" "}
                    and substrate{" "}
                    <span className="text-orange-500 font-semibold">S</span>{" "}
                    trajectories — dashed lines show analytical steady state
                  </CardDescription>
                </div>
                {hasRun && simData && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {simData.length} pts
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!hasRun ? (
                <div className="flex flex-col items-center justify-center h-72 text-center text-muted-foreground space-y-3">
                  <div className="bg-muted/40 p-5 rounded-full">
                    <TrendingUp className="h-10 w-10 opacity-30" />
                  </div>
                  <p className="text-sm max-w-xs">
                    Set parameters and click{" "}
                    <strong className="text-foreground">Run simulation</strong>{" "}
                    to plot biomass and substrate trajectories.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart
                    data={simData ?? []}
                    margin={{ top: 8, right: 20, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted"
                    />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      label={{
                        value: "Time (h)",
                        position: "insideBottom",
                        offset: -12,
                        fontSize: 11,
                      }}
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
                      width={60}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
                    />
                    {/* steady-state reference lines */}
                    {steadyState && !steadyState.washout && "XSS" in steadyState && (
                      <ReferenceLine
                        y={parseFloat(steadyState.XSS as string)}
                        stroke="#0d9488"
                        strokeDasharray="5 4"
                        strokeOpacity={0.55}
                        label={{
                          value: `X*=${steadyState.XSS}`,
                          position: "insideTopRight",
                          fontSize: 10,
                          fill: "#0d9488",
                        }}
                      />
                    )}
                    {steadyState && !steadyState.washout && "SSS" in steadyState && (
                      <ReferenceLine
                        y={parseFloat(steadyState.SSS as string)}
                        stroke="#f97316"
                        strokeDasharray="5 4"
                        strokeOpacity={0.55}
                        label={{
                          value: `S*=${steadyState.SSS}`,
                          position: "insideBottomRight",
                          fontSize: 10,
                          fill: "#f97316",
                        }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="X"
                      name="X (biomass)"
                      stroke="#0d9488"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="S"
                      name="S (substrate)"
                      stroke="#f97316"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* steady-state summary */}
          {hasRun && steadyState && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Analytical Steady State
                </CardTitle>
                <CardDescription className="text-xs">
                  Predicted equilibrium at μ* = D (chemostat steady-state
                  condition).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {steadyState.washout ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                    Washout predicted — biomass washes out at this dilution rate.
                    Reduce D below μmax to sustain growth.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-teal-50 dark:bg-teal-950/30 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">
                        X* (steady state)
                      </p>
                      <p className="font-mono text-xl font-semibold text-teal-600 dark:text-teal-400">
                        {steadyState.XSS}
                      </p>
                      <p className="text-xs text-muted-foreground">g/L</p>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">
                        S* (steady state)
                      </p>
                      <p className="font-mono text-xl font-semibold text-orange-500">
                        {steadyState.SSS}
                      </p>
                      <p className="text-xs text-muted-foreground">g/L</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">
                        μ* = D at S.S.
                      </p>
                      <p className="font-mono text-xl font-semibold text-muted-foreground">
                        {steadyState.muSS}
                      </p>
                      <p className="text-xs text-muted-foreground">h⁻¹</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* model explanation */}
          <Card className="bg-muted/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Model Equations
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">
                    Monod growth rate
                  </p>
                  <code className="block bg-background border border-border rounded px-3 py-2 font-mono text-xs">
                    μ = μmax · S / (Ks + S)
                  </code>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">
                    Biomass ODE
                  </p>
                  <code className="block bg-background border border-border rounded px-3 py-2 font-mono text-xs">
                    dX/dt = (μ − D) · X
                  </code>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">
                    Substrate ODE
                  </p>
                  <code className="block bg-background border border-border rounded px-3 py-2 font-mono text-xs">
                    dS/dt = D·(S_in−S) − (μ·X)/Yxs
                  </code>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <p><span className="font-mono font-semibold text-foreground">X</span> — biomass (g/L)</p>
                <p><span className="font-mono font-semibold text-foreground">S</span> — substrate (g/L)</p>
                <p><span className="font-mono font-semibold text-foreground">D</span> — dilution rate (h⁻¹)</p>
                <p><span className="font-mono font-semibold text-foreground">Yxs</span> — yield (g-X/g-S)</p>
                <p><span className="font-mono font-semibold text-foreground">μmax</span> — max growth (h⁻¹)</p>
                <p><span className="font-mono font-semibold text-foreground">Ks</span> — half-saturation (g/L)</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Solver: 4th-order Runge-Kutta, capped at 50 000 steps, decimated to ≤ 1 000 plot points for performance.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
