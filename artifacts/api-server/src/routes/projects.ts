import { Router, type IRouter } from "express";
import { eq, desc, asc, sql } from "drizzle-orm";
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
  CreateExtractionBody,
  GetModelCardByProjectParams,
  ExportProjectParams,
} from "@workspace/api-zod";
import {
  runExtraction,
  mapExtractionToDb,
  ExtractionInputError,
  ExtractionProviderError,
} from "../lib/extractor";

const router: IRouter = Router();

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

  return { extraction, equations, variables, parameters, assumptions };
}

// ---------- projects ----------

router.get("/projects", async (_req, res): Promise<void> => {
  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(desc(projectsTable.updatedAt));

  if (projects.length === 0) {
    res.json([]);
    return;
  }

  // For each project, compute counts and the latest extraction title.
  const summaries = await Promise.all(
    projects.map(async (p) => {
      const [{ count: sourceCount } = { count: 0 }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sourceDocumentsTable)
        .where(eq(sourceDocumentsTable.projectId, p.id));

      const [{ count: extractionCount } = { count: 0 }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(extractionsTable)
        .where(eq(extractionsTable.projectId, p.id));

      const [latest] = await db
        .select({ title: extractionsTable.modelCardTitle })
        .from(extractionsTable)
        .where(eq(extractionsTable.projectId, p.id))
        .orderBy(desc(extractionsTable.createdAt))
        .limit(1);

      return {
        ...p,
        sourceDocumentCount: Number(sourceCount) || 0,
        extractionCount: Number(extractionCount) || 0,
        latestExtractionTitle: latest?.title ?? null,
      };
    }),
  );

  res.json(summaries);
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [project] = await db
    .insert(projectsTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? "",
    })
    .returning();
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
      createdAt: extractionsTable.createdAt,
      updatedAt: extractionsTable.updatedAt,
    })
    .from(extractionsTable)
    .where(eq(extractionsTable.projectId, project.id))
    .orderBy(desc(extractionsTable.createdAt));

  res.json({ ...project, sourceDocuments, extractions });
});

router.delete("/projects/:projectId", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(projectsTable)
    .where(eq(projectsTable.id, params.data.projectId))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.sendStatus(204);
});

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
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, params.data.projectId));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const [doc] = await db
      .insert(sourceDocumentsTable)
      .values({
        projectId: params.data.projectId,
        kind: parsed.data.kind,
        filename: parsed.data.filename ?? null,
        content: parsed.data.content,
      })
      .returning();
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
    const body = CreateExtractionBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [project] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, params.data.projectId));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Pick the source document: explicit id, else most recent for the project.
    let source;
    if (body.data.sourceDocumentId != null) {
      const [s] = await db
        .select()
        .from(sourceDocumentsTable)
        .where(eq(sourceDocumentsTable.id, body.data.sourceDocumentId));
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

    if (!source || source.projectId !== params.data.projectId) {
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
      extracted = await runExtraction(
        source.content,
        body.data.provider ?? undefined,
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
        res.status(err.status).json({ error: err.message });
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

    // 3. Persist atomically. Surface DB failure as a clean 500.
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
            // Preserve the full validated provider output for the frontend
            // and JSON export. Normalized tables remain the source of truth
            // for relational queries.
            rawExtractionJson: extracted.result,
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
