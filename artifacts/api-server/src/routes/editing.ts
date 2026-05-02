// M16 — Human Verification & Inline Editing
//
// PATCH routes for variables, parameters, equations, and assumptions.
// On the first edit of a row, the original DB values are snapshotted into
// `originalValue` (jsonb) so the audit trail is never lost. The POST /reset
// routes restore the snapshot and clear the editedByUser flag.
//
// rawExtractionJson is NEVER touched here — it is the immutable AI output.

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  variablesTable,
  parametersTable,
  equationsTable,
  assumptionsTable,
  extractionsTable,
} from "@workspace/db";
import { MODEL_TYPES } from "@workspace/domain-classifier";
import { z } from "zod/v4";
import {
  PatchVariableParams,
  PatchVariableBody,
  PatchParameterParams,
  PatchParameterBody,
  PatchEquationParams,
  PatchEquationBody,
  PatchAssumptionParams,
  PatchAssumptionBody,
  ResetVariableParams,
  ResetParameterParams,
  ResetEquationParams,
  ResetAssumptionParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ─── helper: rebuild description from label+meaning+plaintext ────────────────

function buildDescription(
  label: string,
  meaning: string,
  plaintext: string,
): string {
  const parts: string[] = [];
  if (label) parts.push(`[${label}]`);
  if (meaning) parts.push(meaning);
  if (plaintext && plaintext !== meaning) parts.push(`(${plaintext})`);
  return parts.join(" ");
}

// ─── PATCH /variables/:id ────────────────────────────────────────────────────

router.patch("/variables/:id", async (req, res): Promise<void> => {
  const params = PatchVariableParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = PatchVariableBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [current] = await db
    .select()
    .from(variablesTable)
    .where(eq(variablesTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Variable not found" });
    return;
  }

  const originalValue =
    current.editedByUser ? current.originalValue : { ...current };

  const [updated] = await db
    .update(variablesTable)
    .set({
      ...body.data,
      editedByUser: true,
      originalValue,
    })
    .where(eq(variablesTable.id, params.data.id))
    .returning();

  res.json(updated);
});

// ─── POST /variables/:id/reset ───────────────────────────────────────────────

router.post("/variables/:id/reset", async (req, res): Promise<void> => {
  const params = ResetVariableParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [current] = await db
    .select()
    .from(variablesTable)
    .where(eq(variablesTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Variable not found" });
    return;
  }

  if (!current.editedByUser || !current.originalValue) {
    res.json(current);
    return;
  }

  const snap = current.originalValue as Record<string, unknown>;

  const [updated] = await db
    .update(variablesTable)
    .set({
      symbol: typeof snap["symbol"] === "string" ? snap["symbol"] : current.symbol,
      name: typeof snap["name"] === "string" ? snap["name"] : current.name,
      meaning: typeof snap["meaning"] === "string" ? snap["meaning"] : current.meaning,
      unit: typeof snap["unit"] === "string" ? snap["unit"] : current.unit,
      role: (snap["role"] as "state" | "input" | "output") ?? current.role,
      confidence: (snap["confidence"] as "high" | "medium" | "low") ?? current.confidence,
      sourceQuote: typeof snap["sourceQuote"] === "string" ? snap["sourceQuote"] : current.sourceQuote,
      editedByUser: false,
      originalValue: null,
    })
    .where(eq(variablesTable.id, params.data.id))
    .returning();

  res.json(updated);
});

// ─── PATCH /parameters/:id ───────────────────────────────────────────────────

router.patch("/parameters/:id", async (req, res): Promise<void> => {
  const params = PatchParameterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = PatchParameterBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [current] = await db
    .select()
    .from(parametersTable)
    .where(eq(parametersTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Parameter not found" });
    return;
  }

  const originalValue =
    current.editedByUser ? current.originalValue : { ...current };

  const [updated] = await db
    .update(parametersTable)
    .set({
      ...body.data,
      editedByUser: true,
      originalValue,
    })
    .where(eq(parametersTable.id, params.data.id))
    .returning();

  res.json(updated);
});

// ─── POST /parameters/:id/reset ─────────────────────────────────────────────

router.post("/parameters/:id/reset", async (req, res): Promise<void> => {
  const params = ResetParameterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [current] = await db
    .select()
    .from(parametersTable)
    .where(eq(parametersTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Parameter not found" });
    return;
  }

  if (!current.editedByUser || !current.originalValue) {
    res.json(current);
    return;
  }

  const snap = current.originalValue as Record<string, unknown>;

  const [updated] = await db
    .update(parametersTable)
    .set({
      symbol: typeof snap["symbol"] === "string" ? snap["symbol"] : current.symbol,
      name: typeof snap["name"] === "string" ? snap["name"] : current.name,
      value: typeof snap["value"] === "number" ? snap["value"] : current.value,
      unit: typeof snap["unit"] === "string" ? snap["unit"] : current.unit,
      confidence: (snap["confidence"] as "high" | "medium" | "low") ?? current.confidence,
      sourceQuote: typeof snap["sourceQuote"] === "string" ? snap["sourceQuote"] : current.sourceQuote,
      editedByUser: false,
      originalValue: null,
    })
    .where(eq(parametersTable.id, params.data.id))
    .returning();

  res.json(updated);
});

// ─── PATCH /equations/:id ────────────────────────────────────────────────────

router.patch("/equations/:id", async (req, res): Promise<void> => {
  const params = PatchEquationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = PatchEquationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [current] = await db
    .select()
    .from(equationsTable)
    .where(eq(equationsTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Equation not found" });
    return;
  }

  const originalValue =
    current.editedByUser ? current.originalValue : { ...current };

  // Recompute description from the merged label/meaning/plaintext
  const newLabel = body.data.label ?? current.label;
  const newMeaning = body.data.meaning ?? current.meaning;
  const newPlaintext = body.data.plaintext ?? current.plaintext;
  const description = buildDescription(newLabel, newMeaning, newPlaintext);

  const [updated] = await db
    .update(equationsTable)
    .set({
      ...body.data,
      description,
      editedByUser: true,
      originalValue,
    })
    .where(eq(equationsTable.id, params.data.id))
    .returning();

  res.json(updated);
});

// ─── POST /equations/:id/reset ───────────────────────────────────────────────

router.post("/equations/:id/reset", async (req, res): Promise<void> => {
  const params = ResetEquationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [current] = await db
    .select()
    .from(equationsTable)
    .where(eq(equationsTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Equation not found" });
    return;
  }

  if (!current.editedByUser || !current.originalValue) {
    res.json(current);
    return;
  }

  const snap = current.originalValue as Record<string, unknown>;

  const label = typeof snap["label"] === "string" ? snap["label"] : current.label;
  const meaning = typeof snap["meaning"] === "string" ? snap["meaning"] : current.meaning;
  const plaintext = typeof snap["plaintext"] === "string" ? snap["plaintext"] : current.plaintext;

  const [updated] = await db
    .update(equationsTable)
    .set({
      label,
      latex: typeof snap["latex"] === "string" ? snap["latex"] : current.latex,
      plaintext,
      meaning,
      variablesInvolved: Array.isArray(snap["variablesInvolved"])
        ? (snap["variablesInvolved"] as string[])
        : current.variablesInvolved,
      confidence: (snap["confidence"] as "high" | "medium" | "low") ?? current.confidence,
      sourceQuote: typeof snap["sourceQuote"] === "string" ? snap["sourceQuote"] : current.sourceQuote,
      description: buildDescription(label, meaning, plaintext),
      editedByUser: false,
      originalValue: null,
    })
    .where(eq(equationsTable.id, params.data.id))
    .returning();

  res.json(updated);
});

// ─── PATCH /assumptions/:id ──────────────────────────────────────────────────

router.patch("/assumptions/:id", async (req, res): Promise<void> => {
  const params = PatchAssumptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = PatchAssumptionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [current] = await db
    .select()
    .from(assumptionsTable)
    .where(eq(assumptionsTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Assumption not found" });
    return;
  }

  const originalValue =
    current.editedByUser ? current.originalValue : { ...current };

  const [updated] = await db
    .update(assumptionsTable)
    .set({
      ...body.data,
      editedByUser: true,
      originalValue,
    })
    .where(eq(assumptionsTable.id, params.data.id))
    .returning();

  res.json(updated);
});

// ─── POST /assumptions/:id/reset ─────────────────────────────────────────────

router.post("/assumptions/:id/reset", async (req, res): Promise<void> => {
  const params = ResetAssumptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [current] = await db
    .select()
    .from(assumptionsTable)
    .where(eq(assumptionsTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Assumption not found" });
    return;
  }

  if (!current.editedByUser || !current.originalValue) {
    res.json(current);
    return;
  }

  const snap = current.originalValue as Record<string, unknown>;

  const [updated] = await db
    .update(assumptionsTable)
    .set({
      kind: (snap["kind"] as "assumption" | "limitation") ?? current.kind,
      text: typeof snap["text"] === "string" ? snap["text"] : current.text,
      sourceQuote: typeof snap["sourceQuote"] === "string" ? snap["sourceQuote"] : current.sourceQuote,
      confidence: (snap["confidence"] as "high" | "medium" | "low") ?? current.confidence,
      editedByUser: false,
      originalValue: null,
    })
    .where(eq(assumptionsTable.id, params.data.id))
    .returning();

  res.json(updated);
});

// ─── Model type override (M19) ────────────────────────────────────────────────

const ModelTypeOverrideParams = z.object({
  extractionId: z.coerce.number().int().positive(),
});

const ModelTypeOverrideBody = z.object({
  // null = clear override (revert to classifier result)
  modelTypeOverride: z
    .enum(MODEL_TYPES as [string, ...string[]])
    .nullable(),
});

router.patch(
  "/extractions/:extractionId/model-type",
  async (req, res): Promise<void> => {
    const params = ModelTypeOverrideParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = ModelTypeOverrideBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [updated] = await db
      .update(extractionsTable)
      .set({
        modelTypeOverride:
          body.data.modelTypeOverride as typeof extractionsTable.$inferSelect.modelTypeOverride,
      })
      .where(eq(extractionsTable.id, params.data.extractionId))
      .returning({ id: extractionsTable.id, modelTypeOverride: extractionsTable.modelTypeOverride });

    if (!updated) {
      res.status(404).json({ error: "Extraction not found" });
      return;
    }

    res.json({ ok: true, modelTypeOverride: updated.modelTypeOverride });
  },
);

export default router;
