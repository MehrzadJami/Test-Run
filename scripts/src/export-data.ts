/**
 * Export all ChemAI Model Compiler data to a JSON file.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run export-data
 *   pnpm --filter @workspace/scripts run export-data -- --out /path/to/backup.json
 *
 * Requires DATABASE_URL in the environment (loaded from .env automatically).
 * Output file defaults to ./chemengai-export-<timestamp>.json in the current
 * working directory.
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { asc, eq } from "drizzle-orm";
import {
  db,
  pool,
  projectsTable,
  sourceDocumentsTable,
  extractionsTable,
  equationsTable,
  variablesTable,
  parametersTable,
  assumptionsTable,
} from "@workspace/db";

function resolveOutPath(): string {
  const argIdx = process.argv.indexOf("--out");
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return process.argv[argIdx + 1]!;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `chemengai-export-${ts}.json`;
}

async function main(): Promise<void> {
  const outPath = resolveOutPath();
  console.log("ChemAI Model Compiler — exporting data");
  console.log(`  target: ${outPath}`);

  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(asc(projectsTable.createdAt));

  console.log(`  projects found: ${projects.length}`);

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
                .orderBy(asc(variablesTable.ordinal), asc(variablesTable.id)),
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
          return { extraction, equations, variables, parameters, assumptions };
        }),
      );

      return { project, sourceDocuments, modelCards };
    }),
  );

  const payload = {
    exportedAt: new Date().toISOString(),
    version: "1",
    projectCount: projects.length,
    data,
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`  written ${Buffer.byteLength(JSON.stringify(payload))} bytes`);
  console.log("  done");
}

main()
  .catch((err) => {
    console.error("Export failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
