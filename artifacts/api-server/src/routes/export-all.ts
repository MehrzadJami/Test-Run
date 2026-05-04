import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
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
import { isAdminUser, isFullExportEnabled } from "../lib/access-control";
import { normalizeExtractionModelTypes } from "../lib/model-type-compat";

const router: IRouter = Router();

/**
 * GET /api/export
 *
 * Exports the full database as a single JSON document.
 * Useful for backing up data before migrating to a different environment.
 *
 * Response shape:
 * {
 *   exportedAt: string,
 *   version: "1",
 *   projectCount: number,
 *   data: Array<{
 *     project: Project,
 *     sourceDocuments: SourceDocument[],
 *     modelCards: Array<{
 *       extraction: Extraction,
 *       equations: Equation[],
 *       variables: Variable[],
 *       parameters: Parameter[],
 *       assumptions: Assumption[],
 *     }>
 *   }>
 * }
 */
router.get("/export", async (req, res) => {
  if (!isFullExportEnabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (process.env.NODE_ENV === "production") {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!isAdminUser(req.user)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
  }

  try {
    const projects = await db
      .select()
      .from(projectsTable)
      .orderBy(asc(projectsTable.createdAt));

    const data = await Promise.all(
      projects.map(async (project) => {
        const sourceDocuments = await db
          .select()
          .from(sourceDocumentsTable)
          .where(eq(sourceDocumentsTable.projectId, project.id))
          .orderBy(asc(sourceDocumentsTable.createdAt));

        const extractions = await db
          .select()
          .from(extractionsTable)
          .where(eq(extractionsTable.projectId, project.id))
          .orderBy(asc(extractionsTable.createdAt));

        const modelCards = await Promise.all(
          extractions.map(async (extraction) => {
            const [equations, variables, parameters, assumptions] =
              await Promise.all([
                db
                  .select()
                  .from(equationsTable)
                  .where(eq(equationsTable.extractionId, extraction.id))
                  .orderBy(asc(equationsTable.ordinal), asc(equationsTable.id)),
                db
                  .select()
                  .from(variablesTable)
                  .where(eq(variablesTable.extractionId, extraction.id))
                  .orderBy(
                    asc(variablesTable.ordinal),
                    asc(variablesTable.id),
                  ),
                db
                  .select()
                  .from(parametersTable)
                  .where(eq(parametersTable.extractionId, extraction.id))
                  .orderBy(
                    asc(parametersTable.ordinal),
                    asc(parametersTable.id),
                  ),
                db
                  .select()
                  .from(assumptionsTable)
                  .where(eq(assumptionsTable.extractionId, extraction.id))
                  .orderBy(
                    asc(assumptionsTable.ordinal),
                    asc(assumptionsTable.id),
                  ),
              ]);
            return {
              extraction: normalizeExtractionModelTypes(extraction),
              equations,
              variables,
              parameters,
              assumptions,
            };
          }),
        );

        return { project, sourceDocuments, modelCards };
      }),
    );

    res.setHeader("Content-Disposition", "attachment; filename=chemengai-export.json");
    res.json({
      exportedAt: new Date().toISOString(),
      version: "1",
      projectCount: projects.length,
      data,
    });
  } catch (err) {
    req.log.error({ err }, "GET /api/export failed");
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;
