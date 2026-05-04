export type OdeState = Record<string, number>;
export type OdeParams = Record<string, number>;
export type OdeFunction = (state: OdeState, params: OdeParams, t: number) => OdeState;

export interface Rk4Options {
  initialState: OdeState;
  params: OdeParams;
  tFinal: number;
  dt: number;
  maxSteps?: number;
  maxOutputPoints?: number;
}

export interface SimulationPoint extends OdeState {
  t: number;
}

export interface MonodChemostatParams extends OdeParams {
  mumax: number;
  Ks: number;
  D: number;
  Sin: number;
  Yxs: number;
}

export interface BatchCultureParams extends OdeParams {
  mumax: number;
  Ks: number;
  Yxs: number;
}

export function rk4(ode: OdeFunction, options: Rk4Options): SimulationPoint[] {
  const stateKeys = Object.keys(options.initialState);
  const maxSteps = options.maxSteps ?? 50_000;
  const steps = Math.min(Math.ceil(options.tFinal / options.dt), maxSteps);
  if (steps <= 0 || !Number.isFinite(steps)) return [];

  const h = options.tFinal / steps;
  const decimation = Math.max(
    1,
    Math.floor(steps / (options.maxOutputPoints ?? 1_000)),
  );
  const points: SimulationPoint[] = [];

  let state = { ...options.initialState };
  let t = 0;

  const sample = () => {
    const point: SimulationPoint = { t: Number(t.toFixed(4)) };
    for (const key of stateKeys) {
      point[key] = Number(Math.max(0, state[key] ?? 0).toFixed(6));
    }
    points.push(point);
  };

  const addScaled = (base: OdeState, slope: OdeState, scale: number): OdeState => {
    const next: OdeState = {};
    for (const key of stateKeys) {
      next[key] = (base[key] ?? 0) + scale * (slope[key] ?? 0);
    }
    return next;
  };

  for (let i = 0; i <= steps; i++) {
    if (i % decimation === 0 || i === steps) sample();

    const k1 = ode(state, options.params, t);
    const k2 = ode(addScaled(state, k1, 0.5 * h), options.params, t + 0.5 * h);
    const k3 = ode(addScaled(state, k2, 0.5 * h), options.params, t + 0.5 * h);
    const k4 = ode(addScaled(state, k3, h), options.params, t + h);

    const next: OdeState = {};
    for (const key of stateKeys) {
      next[key] =
        (state[key] ?? 0) +
        (h / 6) *
          ((k1[key] ?? 0) + 2 * (k2[key] ?? 0) + 2 * (k3[key] ?? 0) + (k4[key] ?? 0));
    }

    if (Object.values(next).some((value) => !Number.isFinite(value))) break;
    state = next;
    t += h;
  }

  return points;
}

export function monodChemostatODE(
  state: OdeState,
  params: OdeParams,
): OdeState {
  const p = params as MonodChemostatParams;
  const X = state.X ?? 0;
  const S = Math.max(0, state.S ?? 0);
  const mu = (p.mumax * S) / (p.Ks + S);
  return {
    X: (mu - p.D) * X,
    S: p.D * (p.Sin - S) - (1 / p.Yxs) * mu * X,
  };
}

export function batchCultureODE(
  state: OdeState,
  params: OdeParams,
): OdeState {
  const p = params as BatchCultureParams;
  const X = state.X ?? 0;
  const S = Math.max(0, state.S ?? 0);
  const mu = (p.mumax * S) / (p.Ks + S);
  return {
    X: mu * X,
    S: -(1 / p.Yxs) * mu * X,
  };
}
