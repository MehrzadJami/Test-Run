import { Router, type IRouter, type Request } from "express";
import { eq, desc, asc, sql, or, and, inArray } from "drizzle-orm";
import {
  db,
  projectsTable,
  sourceDocumentsTable,
  extractionsTable,
  equationsTable,
  variablesTable,
  parametersTable,
  assumptionsTable,
} from "@workspace/db";
import {
  CreateProjectBody,
  GetProjectParams,
  DeleteProjectParams,
  AddSourceDocumentParams,
  AddSourceDocumentBody,
  CreateExtractionParams,
  GetModelCardByProjectParams,
  ExportProjectParams,
  UpdateProjectVisibilityParams,
  UpdateProjectVisibilityBody,
} from "@workspace/api-zod";
import { z } from "zod/v4";
import {
  runExtraction,
  mapExtractionToDb,
  ExtractionInputError,
  ExtractionProviderError,
} from "../lib/extractor";
import { classifyModel } from "@workspace/domain-classifier";
import { normalizeExtractionModelTypes } from "../lib/model-type-compat";
import { canMutateProject, canViewProject } from "../lib/access-control";
import { extractDocumentChunks } from "../lib/structured-document";

const router: IRouter = Router();
const CreateExtractionBodyLocal = z.object({
  provider: z.enum(["auto", "mock", "openai", "gemini", "groq", "ollama", "rule_based"]).optional(),
  sourceDocumentId: z.number().int().positive().optional(),
});
const ACCESS_DENIED_HINT =
  "Project was created under a different session/user. In local dev, enable DEV_AUTH_BYPASS or create an anonymous project.";

// ---------- helpers ----------

async function loadModelCard(extractionId: number) {
  const [extraction] = await db
    .select()
    .from(extractionsTable)
    .where(eq(extractionsTable.id, extractionId));
  if (!extraction) return null;

  const [equations, variables, parameters, assumptions] = await Promise.all([
    db
      .select()
      .from(equationsTable)
      .where(eq(equationsTable.extractionId, extractionId))
      .orderBy(asc(equationsTable.ordinal), asc(equationsTable.id)),
    db
      .select()
      .from(variablesTable)
      .where(eq(variablesTable.extractionId, extractionId))
      .orderBy(asc(variablesTable.ordinal), asc(variablesTable.id)),
    db
      .select()
      .from(parametersTable)
      .where(eq(parametersTable.extractionId, extractionId))
      .orderBy(asc(parametersTable.ordinal), asc(parametersTable.id)),
    db
      .select()
      .from(assumptionsTable)
      .where(eq(assumptionsTable.extractionId, extractionId))
      .orderBy(asc(assumptionsTable.ordinal), asc(assumptionsTable.id)),
  ]);

  return {
    extraction: normalizeExtractionModelTypes(extraction),
    equations,
    variables,
    parameters,
    assumptions,
  };
}

function reqSessionID(req: Request): string | null {
  return (req as Request & { sessionID?: string }).sessionID ?? null;
}

function logProjectAccessDebug(
  req: Request,
  event: string,
  project: { id: number; ownerId: string | null; visibility?: string | null },
) {
  if (process.env["DEBUG_ACCESS_CONTROL"] !== "true") return;
  req.log.debug(
    {
      projectId: project.id,
      projectOwnerId: project.ownerId,
      projectVisibility: project.visibility ?? null,
      requestUserId: req.user?.id ?? null,
      reqSessionID: reqSessionID(req),
    },
    event,
  );
}

function accessDeniedForProject(
  project: { id: number; ownerId: string | null },
  req: Request,
) {
  return {
    error: "Access denied",
    details: {
      projectId: project.id,
      hasOwner: project.ownerId !== null,
      hasRequestUser: req.user?.id != null,
      hint: ACCESS_DENIED_HINT,
    },
  };
}

// ---------- projects ----------

router.get("/projects", async (req, res): Promise<void> => {
  const userId = req.user?.id;
  const visibilityFilter = userId
    ? or(
        eq(projectsTable.visibility, "public"),
        eq(projectsTable.ownerId, userId),
      )
    : eq(projectsTable.visibility, "public");

  const projects = await db
    .select()
    .from(projectsTable)
    .where(visibilityFilter)
    .orderBy(desc(projectsTable.updatedAt));

  if (projects.length === 0) {
    res.json([]);
    return;
  }

  const projectIds = projects.map((p) => p.id);

  // Two aggregated queries instead of 3×N individual queries.
  // Uses Drizzle's inArray for type-safe array binding.
  const [countsRows, latestRows] = await Promise.all([
    db
      .select({
        projectId: projectsTable.id,
        sourceCount: sql<number>`count(distinct ${sourceDocumentsTable.id})::int`,
        extractionCount: sql<number>`count(distinct ${extractionsTable.id})::int`,
      })
      .from(projectsTable)
      .leftJoin(sourceDocumentsTable, eq(sourceDocumentsTable.projectId, projectsTable.id))
      .leftJoin(extractionsTable, eq(extractionsTable.projectId, projectsTable.id))
      .where(inArray(projectsTable.id, projectIds))
      .groupBy(projectsTable.id),

    // DISTINCT ON is a PostgreSQL extension not in Drizzle's query builder.
    db
      .select({
        projectId: extractionsTable.projectId,
        title: extractionsTable.modelCardTitle,
      })
      .from(extractionsTable)
      .where(inArray(extractionsTable.projectId, projectIds))
      .orderBy(extractionsTable.projectId, desc(extractionsTable.createdAt))
      .then((rows) => {
        // De-duplicate: keep only the first (latest) row per project.
        const seen = new Set<number>();
        return rows.filter((r) => {
          if (seen.has(r.projectId)) return false;
          seen.add(r.projectId);
          return true;
        });
      }),
  ]);

  const countMap = new Map(countsRows.map((r) => [r.projectId, r]));
  const titleMap = new Map(latestRows.map((r) => [r.projectId, r.title]));

  const summaries = projects.map((p) => ({
    ...p,
    sourceDocumentCount: countMap.get(p.id)?.sourceCount ?? 0,
    extractionCount: countMap.get(p.id)?.extractionCount ?? 0,
    latestExtractionTitle: titleMap.get(p.id) ?? null,
  }));

  res.json(summaries);
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.user?.id ?? null;
  const [project] = await db
    .insert(projectsTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      ownerId: userId,
      visibility: userId ? "private" : "public",
    })
    .returning();
  logProjectAccessDebug(req, "Project created", project);
  res.status(201).json(project);
});

router.get("/projects/:projectId", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.projectId));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!canViewProject(project, req.user?.id)) {
    res.status(403).json(accessDeniedForProject(project, req));
    return;
  }

  const sourceDocuments = await db
    .select()
    .from(sourceDocumentsTable)
    .where(eq(sourceDocumentsTable.projectId, project.id))
    .orderBy(desc(sourceDocumentsTable.createdAt));

  const extractions = await db
    .select({
      id: extractionsTable.id,
      projectId: extractionsTable.projectId,
      sourceDocumentId: extractionsTable.sourceDocumentId,
      providerUsed: extractionsTable.providerUsed,
      status: extractionsTable.status,
      modelCardTitle: extractionsTable.modelCardTitle,
      domain: extractionsTable.domain,
      modelType: extractionsTable.modelType,
      modelTypeConfidence: extractionsTable.modelTypeConfidence,
      modelTypeMatchedKeywords: extractionsTable.modelTypeMatchedKeywords,
      modelTypeOverride: extractionsTable.modelTypeOverride,
      createdAt: extractionsTable.createdAt,
      updatedAt: extractionsTable.updatedAt,
    })
    .from(extractionsTable)
    .where(eq(extractionsTable.projectId, project.id))
    .orderBy(desc(extractionsTable.createdAt));

  res.json({
    ...project,
    sourceDocuments,
    extractions: extractions.map(normalizeExtractionModelTypes),
  });
});

router.delete("/projects/:projectId", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [project] = await db
    .select({
      id: projectsTable.id,
      ownerId: projectsTable.ownerId,
      name: projectsTable.name,
      visibility: projectsTable.visibility,
    })
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!canMutateProject(project, req.user?.id)) {
    res.status(403).json(accessDeniedForProject(project, req));
    return;
  }
  await db.delete(projectsTable).where(eq(projectsTable.id, project.id));
  res.sendStatus(204);
});

router.patch(
  "/projects/:projectId/visibility",
  async (req, res): Promise<void> => {
    const params = UpdateProjectVisibilityParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateProjectVisibilityBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, params.data.projectId));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!canMutateProject(project, req.user?.id)) {
      res.status(403).json(accessDeniedForProject(project, req));
      return;
    }
    const [updated] = await db
      .update(projectsTable)
      .set({ visibility: body.data.visibility, updatedAt: new Date() })
      .where(eq(projectsTable.id, project.id))
      .returning();
    res.json(updated);
  },
);

// ---------- source documents ----------

router.post(
  "/projects/:projectId/sources",
  async (req, res): Promise<void> => {
    const params = AddSourceDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = AddSourceDocumentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, params.data.projectId));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    logProjectAccessDebug(req, "Project source upload permission check", project);
    if (!canMutateProject(project, req.user?.id)) {
      res.status(403).json(accessDeniedForProject(project, req));
      return;
    }

    // Lock the project row to serialize concurrent source uploads and prevent
    // the TOCTOU race where two requests both pass the duplicate check.
    const doc = await db.transaction(async (tx) => {
      await tx
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .where(eq(projectsTable.id, project.id))
        .for("update");

      const [existingSource] = await tx
        .select({ id: sourceDocumentsTable.id })
        .from(sourceDocumentsTable)
        .where(eq(sourceDocumentsTable.projectId, project.id))
        .limit(1);
      if (existingSource) return "conflict" as const;

      const [inserted] = await tx
        .insert(sourceDocumentsTable)
        .values({
          projectId: project.id,
          kind: parsed.data.kind,
          filename: parsed.data.filename ?? null,
          content: parsed.data.content,
          structuredDocument: parsed.data.structuredDocument ?? null,
        })
        .returning();
      return inserted;
    });

    if (doc === "conflict") {
      res.status(409).json({
        error:
          "This project already has a source document. Multi-source aggregation is not enabled yet. Create a new project for another source.",
      });
      return;
    }
    res.status(201).json(doc);
  },
);

// ---------- extractions ----------

router.post(
  "/projects/:projectId/extractions",
  async (req, res): Promise<void> => {
    const params = CreateExtractionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = CreateExtractionBodyLocal.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, params.data.projectId));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!canMutateProject(project, req.user?.id)) {
      res.status(403).json(accessDeniedForProject(project, req));
      return;
    }

    // Pick the source document: explicit id, else most recent for the project.
    let source;
    if (body.data.sourceDocumentId != null) {
      // Fetch by ID scoped to this project to prevent cross-project access.
      const [s] = await db
        .select()
        .from(sourceDocumentsTable)
        .where(
          and(
            eq(sourceDocumentsTable.id, body.data.sourceDocumentId),
            eq(sourceDocumentsTable.projectId, params.data.projectId),
          ),
        );
      if (!s) {
        res.status(404).json({ error: "Source document not found in this project" });
        return;
      }
      source = s;
    } else {
      const [s] = await db
        .select()
        .from(sourceDocumentsTable)
        .where(eq(sourceDocumentsTable.projectId, params.data.projectId))
        .orderBy(desc(sourceDocumentsTable.createdAt))
        .limit(1);
      source = s;
    }

    if (!source) {
      res
        .status(400)
        .json({ error: "No source document available for this project" });
      return;
    }

    // 1. Run the extraction (input validated, provider output re-validated
    //    by Zod inside runExtraction). Pass the caller's preferred provider
    //    (or undefined to use the auto fallback chain).
    let extracted;
    try {
      const allowRuntimeProviderKeys = process.env.NODE_ENV !== "production";
      const openaiApiKey = allowRuntimeProviderKeys
        ? req.header("x-openai-api-key") ?? undefined
        : undefined;
      const geminiApiKey = allowRuntimeProviderKeys
        ? req.header("x-gemini-api-key") ?? undefined
        : undefined;
      const ollamaBaseUrl = req.header("x-ollama-base-url") ?? undefined;
      const ollamaModel = req.header("x-ollama-model") ?? undefined;
      const documentChunks = extractDocumentChunks(source.structuredDocument);
      extracted = await runExtraction(
        source.content,
        body.data.provider ?? undefined,
        {
          openaiApiKey,
          geminiApiKey,
          ollamaBaseUrl,
          ollamaModel,
          documentChunks,
          sourceKind: source.kind,
        },
      );
    } catch (err) {
      if (err instanceof ExtractionInputError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      if (err instanceof ExtractionProviderError) {
        req.log.error(
          { err, providerName: err.providerName },
          "Extraction provider error",
        );
        res.status(err.status).json({
          error: err.message,
          ...(err.details ? { details: err.details } : {}),
        });
        return;
      }
      req.log.error({ err }, "Unexpected extraction error");
      res
        .status(500)
        .json({ error: "Unexpected error while running extraction" });
      return;
    }

    // 2. Map the validated result onto the existing DB row shapes.
    const mapped = mapExtractionToDb(extracted.result);

    // M19: Run the rule-based domain classifier against the source content and
    // extracted fields. This is a fast (~1 ms) pure in-process operation with
    // no external calls. Never throws; defaults to "unknown" on failure.
    const classification = classifyModel({
      sourceText: source.content,
      title: extracted.result.paper_title_or_topic,
      domain: extracted.result.system_type,
      variableNames: extracted.result.state_variables.map((v) => v.name),
      variableSymbols: extracted.result.state_variables.map((v) => v.symbol),
      parameterNames: extracted.result.parameters.map((p) => p.name),
      parameterSymbols: extracted.result.parameters.map((p) => p.symbol),
    });
    req.log.info(
      {
        modelType: classification.modelType,
        confidence: classification.confidence,
        matchedKeywords: classification.matchedKeywords,
      },
      "Domain classifier result",
    );

    // 3. Persist atomically.
    let newExtractionId: number;
    try {
      newExtractionId = await db.transaction(async (tx) => {
        const [extraction] = await tx
          .insert(extractionsTable)
          .values({
            projectId: params.data.projectId,
            sourceDocumentId: source.id,
            providerUsed: extracted.providerName,
            status: "ready",
            ...mapped.extraction,
            rawExtractionJson: extracted.result,
            providerModel: extracted.audit.providerModel,
            systemPrompt: extracted.audit.systemPrompt,
            promptTemplateSummary: extracted.audit.promptTemplateSummary,
            rawProviderResponse:
              extracted.audit.rawProviderResponse as Record<
                string,
                unknown
              > | null,
            repairStatus: extracted.audit.repairStatus,
            validationErrors: extracted.audit.validationErrors,
            tokenUsage: extracted.audit.tokenUsage,
            modelType: classification.modelType,
            modelTypeConfidence: classification.confidence,
            modelTypeMatchedKeywords: classification.matchedKeywords,
          })
          .returning();
        if (!extraction) throw new Error("Insert returned no extraction row");

        if (mapped.equations.length) {
          await tx.insert(equationsTable).values(
            mapped.equations.map((e) => ({
              extractionId: extraction.id,
              ...e,
            })),
          );
        }
        if (mapped.variables.length) {
          await tx.insert(variablesTable).values(
            mapped.variables.map((v) => ({
              extractionId: extraction.id,
              ...v,
            })),
          );
        }
        if (mapped.parameters.length) {
          await tx.insert(parametersTable).values(
            mapped.parameters.map((p) => ({
              extractionId: extraction.id,
              ...p,
            })),
          );
        }
        if (mapped.assumptions.length) {
          await tx.insert(assumptionsTable).values(
            mapped.assumptions.map((a) => ({
              extractionId: extraction.id,
              ...a,
            })),
          );
        }

        return extraction.id;
      });
    } catch (err) {
      req.log.error({ err }, "Failed to persist extraction");
      res
        .status(500)
        .json({ error: "Failed to save extraction to the database" });
      return;
    }

    const card = await loadModelCard(newExtractionId);
    if (!card) {
      res.status(500).json({ error: "Failed to load created model card" });
      return;
    }
    res.status(201).json(card);
  },
);

router.get(
  "/projects/:projectId/model-card",
  async (req, res): Promise<void> => {
    const params = GetModelCardByProjectParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, params.data.projectId));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!canViewProject(project, req.user?.id)) {
      res.status(403).json(accessDeniedForProject(project, req));
      return;
    }
    const [latest] = await db
      .select({ id: extractionsTable.id })
      .from(extractionsTable)
      .where(eq(extractionsTable.projectId, params.data.projectId))
      .orderBy(desc(extractionsTable.createdAt))
      .limit(1);
    if (!latest) {
      res.status(404).json({ error: "No model card for this project" });
      return;
    }
    const card = await loadModelCard(latest.id);
    if (!card) {
      res.status(404).json({ error: "Model card not found" });
      return;
    }
    res.json(card);
  },
);

// ---------- export ----------

router.get(
  "/projects/:projectId/export",
  async (req, res): Promise<void> => {
    const params = ExportProjectParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, params.data.projectId));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!canViewProject(project, req.user?.id)) {
      res.status(403).json(accessDeniedForProject(project, req));
      return;
    }

    const sourceDocuments = await db
      .select()
      .from(sourceDocumentsTable)
      .where(eq(sourceDocumentsTable.projectId, project.id))
      .orderBy(asc(sourceDocumentsTable.createdAt));

    const extractions = await db
      .select({ id: extractionsTable.id })
      .from(extractionsTable)
      .where(eq(extractionsTable.projectId, project.id))
      .orderBy(asc(extractionsTable.createdAt));

    const modelCards = (
      await Promise.all(extractions.map((e) => loadModelCard(e.id)))
    ).filter((c): c is NonNullable<typeof c> => c !== null);

    res.json({
      project,
      sourceDocuments,
      modelCards,
      exportedAt: new Date().toISOString(),
    });
  },
);

export default router;
