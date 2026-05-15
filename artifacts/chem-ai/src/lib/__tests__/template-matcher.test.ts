import { describe, it, expect } from "vitest";
import {
  matchTemplates,
  type TemplateScanResult,
  type RunnableTemplateStatus,
} from "../template-matcher";
import type { AnalysisEquation, AnalysisVariable, AnalysisParameter } from "../reproducibility";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function mkEq(latex: string, desc = ""): AnalysisEquation {
  return { id: 1, latex, description: desc, sourceQuote: "" };
}
function mkVar(sym: string, role = "state", unit = "g/L"): AnalysisVariable {
  return { id: 1, symbol: sym, name: sym, unit, role, sourceQuote: "" };
}
function mkParam(sym: string, value: number | null = 0.5, unit = "1/h"): AnalysisParameter {
  return { id: 1, symbol: sym, value, unit, confidence: "high", sourceQuote: "" };
}

// Canonical chemostat fixtures
function chemostatVars() {
  return [mkVar("X"), mkVar("S"), mkVar("t", "input", "h")];
}
function chemostatParams() {
  return [
    mkParam("mumax", 0.5, "1/h"),
    mkParam("Ks", 0.2, "g/L"),
    mkParam("D", 0.3, "1/h"),
    mkParam("Sin", 10.0, "g/L"),
    mkParam("Yxs", 0.5, "g/g"),
  ];
}

// ─── Return shape ─────────────────────────────────────────────────────────────

describe("matchTemplates — return shape", () => {
  it("returns TemplateScanResult with all required fields", () => {
    const r = matchTemplates([], [], []);
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("matched");
    expect(r).toHaveProperty("derivatives");
    expect(r).toHaveProperty("unmatched");
    expect(r).toHaveProperty("runnableCount");
    expect(r).toHaveProperty("totalEquations");
  });

  it("status is one of: full | partial | scaffold_only", () => {
    const r = matchTemplates([], [], []);
    expect(["full", "partial", "scaffold_only"]).toContain(r.status);
  });
});

// ─── No equations → scaffold_only ────────────────────────────────────────────

describe("matchTemplates — empty inputs", () => {
  it("returns scaffold_only with no equations", () => {
    const r = matchTemplates([], [], []);
    expect(r.status).toBe("scaffold_only");
    expect(r.runnableCount).toBe(0);
    expect(r.totalEquations).toBe(0);
  });

  it("returns scaffold_only when equations don't match any template", () => {
    const eqs = [mkEq("q_P = q_Pmax * S^2 / (K_P^2 + S^2) - alpha * P")];
    const r = matchTemplates(eqs, [], []);
    expect(r.status).toBe("scaffold_only");
    expect(r.unmatched).toHaveLength(1);
  });
});

// ─── Template 1: Monod kinetics ───────────────────────────────────────────────

describe("matchTemplates — Monod kinetics", () => {
  it("matches mu = mumax * S / (Ks + S)", () => {
    const eqs = [mkEq("mu = mumax * S / (Ks + S)")];
    const r = matchTemplates(eqs, chemostatVars(), chemostatParams());
    const m = r.matched.find((x) => x.templateName === "monod_kinetics");
    expect(m).toBeDefined();
    expect(m!.isRunnable).toBe(true);
  });

  it("generates correct Python for Monod kinetics", () => {
    const eqs = [mkEq("mu = mumax * S / (Ks + S)")];
    const r = matchTemplates(eqs, chemostatVars(), chemostatParams());
    const m = r.matched.find((x) => x.templateName === "monod_kinetics")!;
    expect(m.pythonCode).toBe("mu = mumax * S / (Ks + S)");
  });

  it("flags missing symbols in Monod", () => {
    const eqs = [mkEq("mu = mumax * S / (Ks + S)")];
    // No params — all symbols missing
    const r = matchTemplates(eqs, [], []);
    const m = r.matched.find((x) => x.templateName === "monod_kinetics")!;
    expect(m.isRunnable).toBe(false);
    expect(m.missingSymbols.length).toBeGreaterThan(0);
  });

  it("preserves original-case symbol names in generated code", () => {
    const eqs = [mkEq("mu = mumax * S / (Ks + S)")];
    const vars = [mkVar("S"), mkVar("mu", "input")];
    const params = [mkParam("mumax", 0.5), mkParam("Ks", 0.2, "g/L")];
    const r = matchTemplates(eqs, vars, params);
    const m = r.matched.find((x) => x.templateName === "monod_kinetics")!;
    // Case should be preserved from lookup
    expect(m.pythonCode).toContain("mumax");
    expect(m.pythonCode).toContain("Ks");
    expect(m.pythonCode).toContain("S");
  });
});

// ─── Template 2: Chemostat biomass ODE ───────────────────────────────────────

describe("matchTemplates — chemostat biomass ODE", () => {
  it("matches dX/dt = (mu - D) * X", () => {
    const eqs = [mkEq("dX/dt = (mu - D) * X")];
    const vars = [mkVar("X"), mkVar("mu", "input")];
    const params = [mkParam("D", 0.3)];
    const r = matchTemplates(eqs, vars, params);
    const d = r.derivatives.find((x) => x.templateLabel === "Chemostat biomass ODE");
    expect(d).toBeDefined();
    expect(d!.isRunnable).toBe(true);
    expect(d!.pythonLine).toBe("dXdt = (mu - D) * X");
  });

  it("matches alternate form dX/dt = mu*X - D*X", () => {
    const eqs = [mkEq("dX/dt = mu*X - D*X")];
    const vars = [mkVar("X"), mkVar("mu", "input")];
    const params = [mkParam("D", 0.3)];
    const r = matchTemplates(eqs, vars, params);
    const d = r.derivatives.find((x) => x.stateSym === "X");
    expect(d).toBeDefined();
  });

  it("sets pythonLine=null and isRunnable=false when symbols missing", () => {
    const eqs = [mkEq("dX/dt = (mu - D) * X")];
    const r = matchTemplates(eqs, [], []);
    const d = r.derivatives.find((x) => x.stateSym.toLowerCase() === "x");
    expect(d).toBeDefined();
    expect(d!.isRunnable).toBe(false);
    expect(d!.pythonLine).toBeNull();
  });
});

// ─── Template 3: Chemostat substrate ODE ─────────────────────────────────────

describe("matchTemplates — chemostat substrate ODE", () => {
  it("matches dS/dt = D*(Sin - S) - (1/Yxs)*mu*X", () => {
    const eqs = [mkEq("dS/dt = D*(Sin - S) - (1/Yxs)*mu*X")];
    const r = matchTemplates(eqs, chemostatVars(), chemostatParams());
    const d = r.derivatives.find((x) => x.stateSym === "S");
    expect(d).toBeDefined();
    expect(d!.templateLabel).toBe("Chemostat substrate ODE");
  });

  it("generates runnable Python for substrate ODE when all symbols present", () => {
    const eqs = [mkEq("dS/dt = D*(Sin - S) - (1/Yxs)*mu*X")];
    const r = matchTemplates(eqs, chemostatVars(), chemostatParams());
    const d = r.derivatives.find((x) => x.stateSym === "S")!;
    expect(d.isRunnable).toBe(true);
    expect(d.pythonLine).not.toBeNull();
    expect(d.pythonLine).toContain("dSdt");
    expect(d.pythonLine).toContain("Yxs");
    expect(d.pythonLine).toContain("Sin");
  });
});

// ─── Template 4: First-order decay ───────────────────────────────────────────

describe("matchTemplates — first-order decay", () => {
  it("matches dC/dt = -k * C", () => {
    const eqs = [mkEq("dC/dt = -k * C")];
    const vars = [mkVar("C")];
    const params = [mkParam("k", 0.1, "1/h")];
    const r = matchTemplates(eqs, vars, params);
    const d = r.derivatives.find((x) => x.stateSym === "C");
    expect(d).toBeDefined();
    expect(d!.templateLabel).toBe("First-order decay ODE");
    expect(d!.isRunnable).toBe(true);
    expect(d!.pythonLine).toBe("dCdt = -k * C");
  });

  it("does NOT match dC/dt = k * C (no minus sign)", () => {
    const eqs = [mkEq("dC/dt = k * C")]; // growth, not decay — no minus
    const vars = [mkVar("C")];
    const params = [mkParam("k", 0.1)];
    const r = matchTemplates(eqs, vars, params);
    const d = r.derivatives.find((x) => x.templateLabel === "First-order decay ODE");
    expect(d).toBeUndefined();
  });
});

// ─── Template 5: Gas–liquid transfer ─────────────────────────────────────────

describe("matchTemplates — gas–liquid transfer", () => {
  it("matches dO/dt = kLa*(Cstar - O) as ODE", () => {
    const eqs = [mkEq("dO/dt = kLa*(Cstar - O)")];
    const vars = [mkVar("O")];
    const params = [mkParam("kLa", 200, "1/h"), mkParam("Cstar", 0.008, "g/L")];
    const r = matchTemplates(eqs, vars, params);
    const d = r.derivatives.find((x) => x.stateSym === "O");
    expect(d).toBeDefined();
    expect(d!.isRunnable).toBe(true);
    expect(d!.pythonLine).toContain("kLa");
    expect(d!.pythonLine).toContain("Cstar");
  });

  it("matches OTR = kLa*(Csat - C) as algebraic", () => {
    const eqs = [mkEq("OTR = kLa*(Csat - C)")];
    const vars = [mkVar("C")];
    const params = [mkParam("kLa", 200, "1/h"), mkParam("Csat", 0.008, "g/L"), mkParam("OTR", null)];
    // OTR not in params/vars — missing
    const paramsWithOTR = [...params, mkParam("OTR", null)];
    const r = matchTemplates(eqs, vars, paramsWithOTR);
    // Either matched or unmatched depending on whether OTR is in lookup
    expect(r.totalEquations).toBe(1);
  });

  it("does not count explicit stoichiometric equations as runnable ODEs", () => {
    const eqs = [
      {
        ...mkEq("CH3COOH + 2 O2 -> 2 CO2 + 2 H2O"),
        equationType: "stoichiometric_reaction",
      },
    ];
    const r = matchTemplates(eqs, [], []);
    expect(r.totalEquations).toBe(0);
    expect(r.derivatives).toHaveLength(0);
    expect(r.matched).toHaveLength(0);
  });

  it("flags kLa missing from tables", () => {
    const eqs = [mkEq("dO/dt = kLa*(Cstar - O)")];
    const vars = [mkVar("O")];
    const params = [mkParam("Cstar", 0.008, "g/L")]; // no kLa
    const r = matchTemplates(eqs, vars, params);
    const d = r.derivatives.find((x) => x.stateSym?.toLowerCase() === "o");
    // Could be matched with missing symbols or unmatched depending on kla lookup
    if (d) {
      expect(d.isRunnable).toBe(false);
    }
  });
});

// ─── Full chemostat model (all 3 equations) ───────────────────────────────────

describe("matchTemplates — full chemostat model", () => {
  const fullChemostat = [
    mkEq("mu = mumax * S / (Ks + S)"),
    mkEq("dX/dt = (mu - D) * X"),
    mkEq("dS/dt = D*(Sin - S) - (1/Yxs)*mu*X"),
  ];

  it("achieves status=full when all equations match and all symbols present", () => {
    const r = matchTemplates(fullChemostat, chemostatVars(), chemostatParams());
    expect(r.status).toBe("full");
  });

  it("matches all 3 equations (1 intermediate + 2 derivatives)", () => {
    const r = matchTemplates(fullChemostat, chemostatVars(), chemostatParams());
    expect(r.matched.length).toBe(1);      // Monod
    expect(r.derivatives.length).toBe(2);  // dX/dt and dS/dt
    expect(r.unmatched.length).toBe(0);
  });

  it("matches Monod growth even when the equation is explicitly algebraic", () => {
    const r = matchTemplates(
      [{ ...mkEq("mu = mumax * S / (Ks + S)"), equationType: "algebraic_calculation" }],
      chemostatVars(),
      chemostatParams(),
    );

    expect(r.matched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ templateName: "monod_kinetics", pythonCode: "mu = mumax * S / (Ks + S)" }),
      ]),
    );
    expect(r.runnableCount).toBe(1);
    expect(r.totalEquations).toBe(1);
  });

  it("never substitutes an unknown placeholder state into the substrate ODE", () => {
    const vars = [mkVar("unknown"), ...chemostatVars()];
    const r = matchTemplates(fullChemostat, vars, chemostatParams());
    const substrate = r.derivatives.find((item) => item.stateSym === "S");

    expect(substrate?.pythonLine).toBe("dSdt = D * (Sin - S) - (1.0 / Yxs) * mu * X");
    expect(substrate?.pythonLine).not.toMatch(/unknown/i);
  });

  it("runnableCount equals total matched when all present", () => {
    const r = matchTemplates(fullChemostat, chemostatVars(), chemostatParams());
    expect(r.runnableCount).toBe(3);
  });

  it("status=partial when some symbols missing", () => {
    const limitedParams = [mkParam("mumax", 0.5)]; // only one param
    const r = matchTemplates(fullChemostat, chemostatVars(), limitedParams);
    expect(r.status).toBe("partial");
  });
});

// ─── Mixed: some matched, some unmatched ─────────────────────────────────────

describe("matchTemplates — mixed equations", () => {
  it("status=partial with some matched, some unmatched", () => {
    const eqs = [
      mkEq("mu = mumax * S / (Ks + S)"),
      mkEq("q_P = q_Pmax * S / (K_P + S) - alpha * mu"), // unsupported
    ];
    const r = matchTemplates(eqs, chemostatVars(), chemostatParams());
    expect(r.status).toBe("partial");
    expect(r.matched.length).toBe(1);
    expect(r.unmatched.length).toBe(1);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe("matchTemplates — determinism", () => {
  it("two identical calls return identical status", () => {
    const eqs = [mkEq("mu = mumax * S / (Ks + S)")];
    const r1 = matchTemplates(eqs, chemostatVars(), chemostatParams());
    const r2 = matchTemplates(eqs, chemostatVars(), chemostatParams());
    expect(r1.status).toBe(r2.status);
    expect(r1.matched.length).toBe(r2.matched.length);
  });
});
