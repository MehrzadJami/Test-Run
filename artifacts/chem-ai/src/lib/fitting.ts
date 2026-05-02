import type { ParsedCsvRow } from "./csv-parser";

// ─── types ────────────────────────────────────────────────────────────────────

export interface FitParams {
  mumax: number;
  Ks: number;
  Yxs: number;
}

export interface FixedParams {
  D: number;
  Sin: number;
  X0: number;
  S0: number;
}

export interface FitConfig {
  fitMumax: boolean;
  fitKs: boolean;
  fitYxs: boolean;
  fixed: FixedParams;
  guess: FitParams;
}

export interface FitResult {
  params: FitParams;
  fixed: FixedParams;
  rmseX: number;
  rmseS: number;
  r2X: number;
  r2S: number;
  converged: boolean;
  iterations: number;
  curve: { t: number; X: number; S: number }[];
}

// ─── RK4 solver ───────────────────────────────────────────────────────────────

function chemostatDerivatives(
  X: number,
  S: number,
  mumax: number,
  Ks: number,
  Yxs: number,
  D: number,
  Sin: number
): [number, number] {
  const Ss = Math.max(0, S);
  const mu = (mumax * Ss) / (Ks + Ss);
  const dX = (mu - D) * X;
  const dS = D * (Sin - Ss) - (1 / Yxs) * mu * X;
  return [dX, dS];
}

function rk4Step(
  X: number,
  S: number,
  h: number,
  mumax: number,
  Ks: number,
  Yxs: number,
  D: number,
  Sin: number
): [number, number] {
  const [k1X, k1S] = chemostatDerivatives(X, S, mumax, Ks, Yxs, D, Sin);
  const [k2X, k2S] = chemostatDerivatives(X + 0.5 * h * k1X, S + 0.5 * h * k1S, mumax, Ks, Yxs, D, Sin);
  const [k3X, k3S] = chemostatDerivatives(X + 0.5 * h * k2X, S + 0.5 * h * k2S, mumax, Ks, Yxs, D, Sin);
  const [k4X, k4S] = chemostatDerivatives(X + h * k3X, S + h * k3S, mumax, Ks, Yxs, D, Sin);
  const newX = X + (h / 6) * (k1X + 2 * k2X + 2 * k3X + k4X);
  const newS = S + (h / 6) * (k1S + 2 * k2S + 2 * k3S + k4S);
  return [Math.max(0, newX), Math.max(0, newS)];
}

// Run RK4 and interpolate at the requested observation times.
function simulateAtTimes(
  observedTimes: number[],
  mumax: number,
  Ks: number,
  Yxs: number,
  D: number,
  Sin: number,
  X0: number,
  S0: number
): { X: number; S: number }[] {
  const tMax = observedTimes[observedTimes.length - 1];
  const nSteps = Math.max(1000, Math.ceil(tMax / 0.02));
  const dt = tMax / nSteps;

  let X = X0;
  let S = S0;
  let t = 0;

  const result: { X: number; S: number }[] = [];
  let obsIdx = 0;

  for (let i = 0; i <= nSteps && obsIdx < observedTimes.length; i++) {
    const tNext = Math.min((i + 1) * dt, tMax);

    // capture any observation times in (t, tNext]
    while (obsIdx < observedTimes.length && observedTimes[obsIdx] <= tNext + 1e-9) {
      const frac = dt > 0 ? (observedTimes[obsIdx] - t) / (tNext - t) : 0;
      // linear interpolation between current and next step (good enough since dt is small)
      const [nX, nS] = rk4Step(X, S, observedTimes[obsIdx] - t, mumax, Ks, Yxs, D, Sin);
      result.push({ X: nX, S: nS });
      obsIdx++;
      // don't advance; continue from t
    }

    if (!isFinite(X) || !isFinite(S)) {
      // fill remaining with sentinel
      while (result.length < observedTimes.length) result.push({ X: 0, S: 0 });
      break;
    }

    [X, S] = rk4Step(X, S, dt, mumax, Ks, Yxs, D, Sin);
    t = tNext;
  }

  return result;
}

// Generate a smooth curve for plotting (dense time grid).
function simulateDenseCurve(
  tMax: number,
  mumax: number,
  Ks: number,
  Yxs: number,
  D: number,
  Sin: number,
  X0: number,
  S0: number
): { t: number; X: number; S: number }[] {
  const nSteps = Math.min(Math.max(500, Math.ceil(tMax / 0.05)), 5000);
  const dt = tMax / nSteps;
  const out: { t: number; X: number; S: number }[] = [];
  let X = X0;
  let S = S0;

  for (let i = 0; i <= nSteps; i++) {
    out.push({ t: parseFloat((i * dt).toFixed(4)), X, S });
    [X, S] = rk4Step(X, S, dt, mumax, Ks, Yxs, D, Sin);
    if (!isFinite(X) || !isFinite(S)) break;
  }

  return out;
}

// ─── statistics ───────────────────────────────────────────────────────────────

function rmse(obs: number[], pred: number[]): number {
  const n = obs.length;
  if (n === 0) return 0;
  const ss = obs.reduce((acc, o, i) => acc + (o - pred[i]) ** 2, 0);
  return Math.sqrt(ss / n);
}

function r2(obs: number[], pred: number[]): number {
  const n = obs.length;
  if (n === 0) return 0;
  const mean = obs.reduce((a, b) => a + b, 0) / n;
  const ssTot = obs.reduce((acc, o) => acc + (o - mean) ** 2, 0);
  const ssRes = obs.reduce((acc, o, i) => acc + (o - pred[i]) ** 2, 0);
  if (ssTot === 0) return 1;
  return 1 - ssRes / ssTot;
}

// ─── Nelder-Mead simplex ─────────────────────────────────────────────────────

function nelderMead(
  fn: (x: number[]) => number,
  x0: number[],
  maxIter = 1500,
  tol = 1e-9
): { x: number[]; fval: number; iters: number; converged: boolean } {
  const n = x0.length;
  if (n === 0) return { x: [], fval: fn([]), iters: 0, converged: true };

  // Build initial simplex — perturb each coordinate by 5 %
  const simplex: number[][] = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const v = x0.slice();
    v[i] = v[i] !== 0 ? v[i] * 1.05 : 0.025;
    simplex.push(v);
  }

  let fvals = simplex.map(fn);
  let iter = 0;

  while (iter < maxIter) {
    // Sort ascending
    const idx = fvals.map((f, i) => i).sort((a, b) => fvals[a] - fvals[b]);

    const fBest = fvals[idx[0]];
    const fWorst = fvals[idx[n]];

    if (fWorst - fBest < tol) {
      return { x: simplex[idx[0]], fval: fBest, iters: iter, converged: true };
    }

    // Centroid of all except worst
    const centroid = new Array(n).fill(0) as number[];
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < n; d++) centroid[d] += simplex[idx[i]][d] / n;
    }

    // Reflect
    const worst = simplex[idx[n]];
    const reflected = centroid.map((c, d) => c + (c - worst[d]));
    const fRefl = fn(reflected);

    if (fRefl < fBest) {
      // Try expansion
      const expanded = centroid.map((c, d) => c + 2 * (reflected[d] - c));
      const fExp = fn(expanded);
      if (fExp < fRefl) {
        simplex[idx[n]] = expanded;
        fvals[idx[n]] = fExp;
      } else {
        simplex[idx[n]] = reflected;
        fvals[idx[n]] = fRefl;
      }
    } else if (fRefl < fvals[idx[n - 1]]) {
      simplex[idx[n]] = reflected;
      fvals[idx[n]] = fRefl;
    } else {
      // Contract
      const contracted = centroid.map((c, d) => c + 0.5 * (worst[d] - c));
      const fContr = fn(contracted);
      if (fContr < fWorst) {
        simplex[idx[n]] = contracted;
        fvals[idx[n]] = fContr;
      } else {
        // Shrink toward best
        for (let i = 1; i <= n; i++) {
          const best = simplex[idx[0]];
          simplex[idx[i]] = best.map((b, d) => b + 0.5 * (simplex[idx[i]][d] - b));
          fvals[idx[i]] = fn(simplex[idx[i]]);
        }
      }
    }

    iter++;
  }

  const idx = fvals.map((_, i) => i).sort((a, b) => fvals[a] - fvals[b]);
  return { x: simplex[idx[0]], fval: fvals[idx[0]], iters: iter, converged: false };
}

// ─── main fit function ────────────────────────────────────────────────────────

// Parameter bounds (used to clamp after Nelder-Mead step)
const BOUNDS = {
  mumax: [0.001, 10.0],
  Ks: [0.0001, 100.0],
  Yxs: [0.001, 5.0],
};

export function fitMonodChemostat(data: ParsedCsvRow[], config: FitConfig): FitResult {
  const { fixed } = config;
  const tObs = data.map((r) => r.time);
  const xObs = data.map((r) => r.X);
  const sObs = data.map((r) => r.S);

  // Normalisation factors (avoid domination by larger concentrations)
  const varX = Math.max(1e-6, xObs.reduce((a, b) => a + b * b, 0) / xObs.length);
  const varS = Math.max(1e-6, sObs.reduce((a, b) => a + b * b, 0) / sObs.length);

  // Which parameters are free? We optimise in log-space to enforce positivity.
  const freeKeys: (keyof FitParams)[] = [];
  if (config.fitMumax) freeKeys.push("mumax");
  if (config.fitKs) freeKeys.push("Ks");
  if (config.fitYxs) freeKeys.push("Yxs");

  const baseParams: FitParams = { ...config.guess };

  function buildParams(logFree: number[]): FitParams {
    const p = { ...baseParams };
    freeKeys.forEach((k, i) => {
      const val = Math.exp(logFree[i]);
      p[k] = Math.max(BOUNDS[k][0], Math.min(BOUNDS[k][1], val));
    });
    return p;
  }

  function objective(logFree: number[]): number {
    const p = buildParams(logFree);
    const pred = simulateAtTimes(tObs, p.mumax, p.Ks, p.Yxs, fixed.D, fixed.Sin, fixed.X0, fixed.S0);
    let ss = 0;
    for (let i = 0; i < tObs.length; i++) {
      ss += (pred[i].X - xObs[i]) ** 2 / varX + (pred[i].S - sObs[i]) ** 2 / varS;
    }
    return ss;
  }

  let finalParams: FitParams;
  let converged: boolean;
  let iterations: number;

  if (freeKeys.length === 0) {
    // Nothing to fit — just simulate
    finalParams = baseParams;
    converged = true;
    iterations = 0;
  } else {
    const x0 = freeKeys.map((k) => Math.log(config.guess[k]));
    const result = nelderMead(objective, x0);
    finalParams = buildParams(result.x);
    converged = result.converged;
    iterations = result.iters;
  }

  // Compute fit quality at final parameters
  const pred = simulateAtTimes(
    tObs,
    finalParams.mumax,
    finalParams.Ks,
    finalParams.Yxs,
    fixed.D,
    fixed.Sin,
    fixed.X0,
    fixed.S0
  );
  const predX = pred.map((p) => p.X);
  const predS = pred.map((p) => p.S);

  const tMax = tObs[tObs.length - 1];
  const curve = simulateDenseCurve(
    tMax,
    finalParams.mumax,
    finalParams.Ks,
    finalParams.Yxs,
    fixed.D,
    fixed.Sin,
    fixed.X0,
    fixed.S0
  );

  return {
    params: finalParams,
    fixed,
    rmseX: rmse(xObs, predX),
    rmseS: rmse(sObs, predS),
    r2X: r2(xObs, predX),
    r2S: r2(sObs, predS),
    converged,
    iterations,
    curve,
  };
}
