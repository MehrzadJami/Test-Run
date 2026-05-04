import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import {
  db,
  projectsTable,
  extractionsTable,
  equationsTable,
  variablesTable,
  parametersTable,
  assumptionsTable,
} from "@workspace/db";
import { GetPublicModelCardParams } from "@workspace/api-zod";
import { normalizeExtractionModelTypes } from "../lib/model-type-compat";

const router: IRouter = Router();

router.get(
  "/share/model-cards/:extractionId",
  async (req, res): Promise<void> => {
    const params = GetPublicModelCardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [extraction] = await db
      .select()
      .from(extractionsTable)
      .where(eq(extractionsTable.id, params.data.extractionId));

    if (!extraction) {
      res.status(404).json({ error: "Model card not found" });
      return;
    }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, extraction.projectId));

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Only publicly visible projects are accessible via the share endpoint.
    if (project.visibility !== "public") {
      res.status(403).json({ error: "This model card is not publicly shared" });
      return;
    }

    const [equations, variables, parameters, assumptions] = await Promise.all([
      db
        .select()
        .from(equationsTable)
        .where(eq(equationsTable.extractionId, extraction.id))
        .orderBy(asc(equationsTable.ordinal), asc(equationsTable.id)),
      db
        .select()
        .from(variablesTable)
        .where(eq(variablesTable.extractionId, extraction.id))
        .orderBy(asc(variablesTable.ordinal), asc(variablesTable.id)),
      db
        .select()
        .from(parametersTable)
        .where(eq(parametersTable.extractionId, extraction.id))
        .orderBy(asc(parametersTable.ordinal), asc(parametersTable.id)),
      db
        .select()
        .from(assumptionsTable)
        .where(eq(assumptionsTable.extractionId, extraction.id))
        .orderBy(asc(assumptionsTable.ordinal), asc(assumptionsTable.id)),
    ]);

    // Strip sensitive audit fields before returning public share data.
    const safeExtraction = normalizeExtractionModelTypes({
      ...extraction,
      systemPrompt: "",
      rawProviderResponse: null,
      promptTemplateSummary: "",
    });

    res.json({ extraction: safeExtraction, equations, variables, parameters, assumptions });
  },
);

export default router;
