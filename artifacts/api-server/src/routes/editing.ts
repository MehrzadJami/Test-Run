// M16 — Human Verification & Inline Editing
//
// PATCH routes for variables, parameters, equations, and assumptions.
// On the first edit of a row, the original DB values are snapshotted into
// `originalValue` (jsonb) so the audit trail is never lost. The POST /reset
// routes restore the snapshot and clear the editedByUser flag.
//
// rawExtractionJson is NEVER touched here — it is the immutable AI output.

import { Router, type IRouter, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  variablesTable,
  parametersTable,
  equationsTable,
  assumptionsTable,
  extractionsTable,
  projectsTable,
} from "@workspace/db";
import {
  LEGACY_MODEL_TYPE_MAP,
  MODEL_TYPES,
  normalizeModelType,
} from "@workspace/domain-classifier";
import { z } from "zod/v4";
import { canMutateProject } from "../lib/access-control";
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

type MutationCheck = "allowed" | "denied" | "not_found";

async function checkExtractionMutationPermission(
  extractionId: number,
  userId: string | undefined,
): Promise<MutationCheck> {
  const [extraction] = await db
    .select({
      id: extractionsTable.id,
      projectId: extractionsTable.projectId,
    })
    .from(extractionsTable)
    .where(eq(extractionsTable.id, extractionId));

  if (!extraction) return "not_found";

  const [project] = await db
    .select({
      id: projectsTable.id,
      ownerId: projectsTable.ownerId,
      name: projectsTable.name,
      visibility: projectsTable.visibility,
    })
    .from(projectsTable)
    .where(eq(projectsTable.id, extraction.projectId));

  if (!project) return "not_found";

  return canMutateProject(project, userId) ? "allowed" : "denied";
}

async function requireExtractionMutationPermission(
  res: Response,
  extractionId: number,
  userId: string | undefined,
): Promise<boolean> {
  const result = await checkExtractionMutationPermission(extractionId, userId);
  if (result === "not_found") {
    res.status(404).json({ error: "Extraction not found" });
    return false;
  }
  if (result === "denied") {
    res.status(403).json({ error: "Access denied" });
    return false;
  }
  return true;
}

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
  if (
    !(await requireExtractionMutationPermission(
      res,
      current.extractionId,
      req.user?.id,
    ))
  ) {
    return;
  }

  // Lock the row and capture the snapshot atomically so a concurrent edit
  // cannot overwrite the true-original value.
  const updated = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(variablesTable)
      .where(eq(variablesTable.id, params.data.id))
      .for("update");
    if (!locked) return null;
    const originalValue = locked.editedByUser ? locked.originalValue : { ...locked };
    const [row] = await tx
      .update(variablesTable)
      .set({ ...body.data, editedByUser: true, originalValue })
      .where(eq(variablesTable.id, params.data.id))
      .returning();
    return row;
  });

  if (!updated) {
    res.status(404).json({ error: "Variable not found" });
    return;
  }
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
  if (
    !(await requireExtractionMutationPermission(
      res,
      current.extractionId,
      req.user?.id,
    ))
  ) {
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(variablesTable)
      .where(eq(variablesTable.id, params.data.id))
      .for("update");
    if (!locked) return null;
    if (!locked.editedByUser || !locked.originalValue) return locked;

    const snap = locked.originalValue as Record<string, unknown>;
    const [row] = await tx
      .update(variablesTable)
      .set({
        symbol: typeof snap["symbol"] === "string" ? snap["symbol"] : locked.symbol,
        name: typeof snap["name"] === "string" ? snap["name"] : locked.name,
        meaning: typeof snap["meaning"] === "string" ? snap["meaning"] : locked.meaning,
        unit: typeof snap["unit"] === "string" ? snap["unit"] : locked.unit,
        role: (snap["role"] as "state" | "input" | "output" | "parameter" | "control") ?? locked.role,
        confidence: (snap["confidence"] as "high" | "medium" | "low") ?? locked.confidence,
        sourceQuote: typeof snap["sourceQuote"] === "string" ? snap["sourceQuote"] : locked.sourceQuote,
        editedByUser: false,
        originalValue: null,
      })
      .where(eq(variablesTable.id, params.data.id))
      .returning();
    return row;
  });

  if (!updated) {
    res.status(404).json({ error: "Variable not found" });
    return;
  }
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
  if (
    !(await requireExtractionMutationPermission(
      res,
      current.extractionId,
      req.user?.id,
    ))
  ) {
    return;
  }

  // If a value key was provided it must be a finite number — null/NaN/Infinity
  // are silently ignored by the DB update, so we surface a clear 400 instead.
  if ("value" in body.data && (body.data.value === null || body.data.value === undefined || !Number.isFinite(body.data.value as number))) {
    res.status(400).json({ error: "value must be a finite number." });
    return;
  }

  // Lock the row and capture the snapshot atomically.
  const updated = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(parametersTable)
      .where(eq(parametersTable.id, params.data.id))
      .for("update");
    if (!locked) return null;
    const originalValue = locked.editedByUser ? locked.originalValue : { ...locked };
    const nextValue =
      typeof body.data.value === "number" && Number.isFinite(body.data.value)
        ? {
            value: body.data.value,
            valueRaw: String(body.data.value),
            valueNumeric: body.data.value,
          }
        : {};
    const [row] = await tx
      .update(parametersTable)
      .set({ ...body.data, ...nextValue, editedByUser: true, originalValue })
      .where(eq(parametersTable.id, params.data.id))
      .returning();
    return row;
  });

  if (!updated) {
    res.status(404).json({ error: "Parameter not found" });
    return;
  }
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
  if (
    !(await requireExtractionMutationPermission(
      res,
      current.extractionId,
      req.user?.id,
    ))
  ) {
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
      valueRaw: typeof snap["valueRaw"] === "string" ? snap["valueRaw"] : current.valueRaw,
      valueNumeric:
        typeof snap["valueNumeric"] === "number" || snap["valueNumeric"] === null
          ? snap["valueNumeric"]
          : current.valueNumeric,
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
  if (
    !(await requireExtractionMutationPermission(
      res,
      current.extractionId,
      req.user?.id,
    ))
  ) {
    return;
  }

  // Recompute description from the merged label/meaning/plaintext and reject if empty.
  const newLabel = body.data.label ?? current.label;
  const newMeaning = body.data.meaning ?? current.meaning;
  const newPlaintext = body.data.plaintext ?? current.plaintext;
  const description = buildDescription(newLabel, newMeaning, newPlaintext);
  if (!description.trim()) {
    res.status(400).json({ error: "Equation must have at least a label, meaning, or plaintext description." });
    return;
  }

  const originalValue =
    current.editedByUser ? current.originalValue : { ...current };

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
  if (
    !(await requireExtractionMutationPermission(
      res,
      current.extractionId,
      req.user?.id,
    ))
  ) {
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
      equationType:
        (snap["equationType"] as
          | "dynamic_ode"
          | "algebraic_calculation"
          | "stoichiometric_reaction"
          | "empirical_correlation"
          | "reported_experimental_result"
          | "control_law"
          | "unknown") ?? current.equationType,
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
  if (
    !(await requireExtractionMutationPermission(
      res,
      current.extractionId,
      req.user?.id,
    ))
  ) {
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
  if (
    !(await requireExtractionMutationPermission(
      res,
      current.extractionId,
      req.user?.id,
    ))
  ) {
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

const ACCEPTED_MODEL_TYPE_OVERRIDES = [
  ...MODEL_TYPES,
  ...Object.keys(LEGACY_MODEL_TYPE_MAP),
] as [string, ...string[]];

const ModelTypeOverrideBody = z.object({
  // null = clear override (revert to classifier result)
  modelTypeOverride: z
    .enum(ACCEPTED_MODEL_TYPE_OVERRIDES)
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

    if (
      !(await requireExtractionMutationPermission(
        res,
        params.data.extractionId,
        req.user?.id,
      ))
    ) {
      return;
    }

    const [updated] = await db
      .update(extractionsTable)
      .set({
        modelTypeOverride:
          body.data.modelTypeOverride == null
            ? null
            : normalizeModelType(body.data.modelTypeOverride),
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
