import { describe, it, expect } from 'vitest';
import { buildAggregatedModelCard, detectConflicts } from '../multi-source';

const ex1 = {
  id: 1,
  modelCardTitle: 'Paper A',
  rawExtractionJson: {
    state_variables: [{ symbol: 'X', unit: 'g/L', meaning: 'Biomass' }],
    parameters: [{ symbol: 'mu_max', value: '0.4', unit: '1/h' }],
    equations: [{ label: '(1)', equation_plaintext: 'dX/dt=(mu-D)*X' }],
  },
};

const ex2 = {
  id: 2,
  modelCardTitle: 'Paper B',
  rawExtractionJson: {
    state_variables: [{ symbol: 'X', unit: 'mg/L', meaning: 'Biomass concentration' }],
    parameters: [{ symbol: 'mu_max', value: '0.6', unit: '1/day' }],
    equations: [{ label: '(1)', equation_plaintext: 'dX/dt=(mu-D)*X + k' }],
  },
};

describe('multi-source aggregation + conflict detection', () => {
  it('aggregates symbols across extractions', () => {
    const agg = buildAggregatedModelCard([ex1, ex2]);
    expect(agg.variables.find((v) => v.symbol === 'X')).toBeTruthy();
    expect(agg.parameters.find((p) => p.symbol === 'mu_max')).toBeTruthy();
  });

  it('detects value/unit/variable/equation conflicts', () => {
    const conflicts = detectConflicts([ex1, ex2]);
    expect(conflicts.some((c) => c.type === 'parameter_value')).toBe(true);
    expect(conflicts.some((c) => c.type === 'parameter_unit')).toBe(true);
    expect(conflicts.some((c) => c.type === 'variable_definition')).toBe(true);
    expect(conflicts.some((c) => c.type === 'equation')).toBe(true);
  });
});
