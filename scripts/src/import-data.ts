/**
 * Import ChemEngAI data from a JSON export file into a fresh database.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run import-data -- --in chemengai-export-<timestamp>.json
 *
 * The database must already have the schema applied:
 *   pnpm --filter @workspace/db run push
 *
 * Existing projects with the same name are skipped (idempotent by name).
 * Requires DATABASE_URL in the environment (loaded from .env automatically).
 *
 * WARNING: this does NOT truncate the database first. Run on a fresh DB
 * or use --force to skip the empty-DB safety check.
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { eq } from "drizzle-orm";
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

function resolveInPath(): string {
  const argIdx = process.argv.indexOf("--in");
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return process.argv[argIdx + 1]!;
  }
  console.error("Usage: import-data --in <path-to-export.json>");
  process.exit(1);
}

type ExportPayload = {
  exportedAt: string;
  version: string;
  projectCount: number;
  data: Array<{
    project: {
      id: number;
      name: string;
      description: string | null;
      createdAt: string;
    };
    sourceDocuments: Array<{
      kind: string;
      filename: string | null;
      content: string | null;
      url: string | null;
    }>;
    modelCards: Array<{
      extraction: {
        providerUsed: string;
        status: string;
        modelCardTitle: string | null;
        domain: string | null;
        systemDescription: string | null;
        problemStatement: string | null;
        odeTemplate: string | null;
        rawExtractionJson: unknown;
      };
      equations: Array<{
        ordinal: number;
        latex: string;
        description: string | null;
        sourceQuote: string | null;
      }>;
      variables: Array<{
        ordinal: number;
        symbol: string;
        name: string | null;
        unit: string | null;
        role: string | null;
        sourceQuote: string | null;
      }>;
      parameters: Array<{
        ordinal: number;
        symbol: string;
        value: number | null;
        unit: string | null;
        confidence: string | null;
        sourceQuote: string | null;
      }>;
      assumptions: Array<{
        ordinal: number;
        kind: string;
        text: string;
      }>;
    }>;
  }>;
};

async function main(): Promise<void> {
  const inPath = resolveInPath();
  const force = process.argv.includes("--force");

  console.log("ChemEngAI — importing data");
  console.log(`  source: ${inPath}`);

  const raw = readFileSync(inPath, "utf-8");
  const payload = JSON.parse(raw) as ExportPayload;

  if (payload.version !== "1") {
    console.error(`Unsupported export version: ${payload.version}`);
    process.exit(1);
  }

  const existingProjects = await db
    .select({ id: projectsTable.id })
    .from(projectsTable);
  if (existingProjects.length > 0 && !force) {
    console.error(
      `Database already has ${existingProjects.length} project(s). ` +
        "Run with --force to import anyway (projects with the same name are skipped).",
    );
    process.exit(1);
  }

  console.log(`  importing ${payload.projectCount} project(s)...`);

  let projectsImported = 0;
  let projectsSkipped = 0;
  let extractionsImported = 0;

  for (const entry of payload.data) {
    const { project: orig } = entry;

    const existing = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.name, orig.name))
      .limit(1);

    if (existing.length > 0) {
      console.log(`  skipped (already exists): ${orig.name}`);
      projectsSkipped++;
      continue;
    }

    await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projectsTable)
        .values({ name: orig.name, description: orig.description ?? "" })
        .returning();
      if (!project) throw new Error("Failed to insert project");

      for (const sd of entry.sourceDocuments) {
        await tx.insert(sourceDocumentsTable).values({
          projectId: project.id,
          kind: (sd.kind === "pdf" ? "pdf" : "text") as "text" | "pdf",
          filename: sd.filename,
          content: sd.content ?? "",
        });
      }

      for (const mc of entry.modelCards) {
        const e = mc.extraction;
        const providerUsed = (
          ["openai", "gemini"].includes(e.providerUsed) ? e.providerUsed : "mock"
        ) as "mock" | "openai" | "gemini";
        const status = (
          ["pending", "failed"].includes(e.status) ? e.status : "ready"
        ) as "pending" | "ready" | "failed";

        const [extraction] = await tx
          .insert(extractionsTable)
          .values({
            projectId: project.id,
            sourceDocumentId: null,
            providerUsed,
            status,
            modelCardTitle: e.modelCardTitle ?? "",
            domain: e.domain ?? "",
            systemDescription: e.systemDescription ?? "",
            problemStatement: e.problemStatement ?? "",
            odeTemplate: e.odeTemplate ?? "",
            rawExtractionJson: e.rawExtractionJson,
          })
          .returning();
        if (!extraction) throw new Error("Failed to insert extraction");

        if (mc.equations.length > 0) {
          await tx.insert(equationsTable).values(
            mc.equations.map((r) => ({
              extractionId: extraction.id,
              ordinal: r.ordinal,
              latex: r.latex,
              description: r.description ?? "",
              sourceQuote: r.sourceQuote ?? "",
            })),
          );
        }

        if (mc.variables.length > 0) {
          await tx.insert(variablesTable).values(
            mc.variables.map((r) => ({
              extractionId: extraction.id,
              ordinal: r.ordinal,
              symbol: r.symbol,
              name: r.name ?? "",
              unit: r.unit ?? "",
              role: (
                ["input", "output"].includes(r.role ?? "")
                  ? r.role
                  : "state"
              ) as "state" | "input" | "output",
              sourceQuote: r.sourceQuote ?? "",
            })),
          );
        }

        if (mc.parameters.length > 0) {
          await tx.insert(parametersTable).values(
            mc.parameters.map((r) => ({
              extractionId: extraction.id,
              ordinal: r.ordinal,
              symbol: r.symbol,
              value: r.value ?? 0,
              unit: r.unit ?? "",
              confidence: (
                ["high", "low"].includes(r.confidence ?? "")
                  ? r.confidence
                  : "medium"
              ) as "high" | "medium" | "low",
              sourceQuote: r.sourceQuote ?? "",
            })),
          );
        }

        if (mc.assumptions.length > 0) {
          await tx.insert(assumptionsTable).values(
            mc.assumptions.map((r) => ({
              extractionId: extraction.id,
              ordinal: r.ordinal,
              kind: (r.kind === "limitation" ? "limitation" : "assumption") as
                | "assumption"
                | "limitation",
              text: r.text,
            })),
          );
        }

        extractionsImported++;
      }

      projectsImported++;
      console.log(`  imported: ${orig.name} (id=${project.id})`);
    });
  }

  console.log(
    `  done — ${projectsImported} imported, ${projectsSkipped} skipped, ${extractionsImported} extraction(s)`,
  );
}

main()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
