/**
 * ChemAI Extraction Benchmark runner.
 *
 * Usage:
 *   pnpm benchmark [--provider mock|openai|gemini|all] [--base-url URL] [--fixture NAME]
 *
 * Defaults:
 *   --provider  mock
 *   --base-url  http://localhost:80
 *   --fixture   (all fixtures)
 *
 * The server must be running. The benchmark creates a temporary project per
 * fixture, runs extraction, evaluates the result, then deletes the project.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "./evaluate.js";
import type {
  BenchmarkReport,
  BenchmarkResult,
  ExpectedExtraction,
  ApiModelCard,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---------- CLI arg parsing ----------

function parseArgs(): {
  providers: string[];
  baseUrl: string;
  fixtureFilter: string | null;
} {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
  };
  const providerArg = get("--provider") ?? "mock";
  const providers =
    providerArg === "all" ? ["mock", "openai", "gemini"] : [providerArg];
  return {
    providers,
    baseUrl: (get("--base-url") ?? "http://localhost:80").replace(/\/$/, ""),
    fixtureFilter: get("--fixture"),
  };
}

// ---------- HTTP helpers ----------

async function apiPost(
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiGet(baseUrl: string, path: string): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiDelete(baseUrl: string, path: string): Promise<void> {
  const res = await fetch(`${baseUrl}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    console.warn(`  WARN: DELETE ${path} → ${res.status}: ${text}`);
  }
}

// ---------- Extraction workflow ----------

async function runExtraction(
  baseUrl: string,
  fixtureText: string,
  provider: string,
  fixtureName: string,
): Promise<ApiModelCard | null> {
  let projectId: number | null = null;
  try {
    // 1. Create temporary project
    const project = (await apiPost(baseUrl, "/api/projects", {
      name: `[BENCHMARK] ${fixtureName} / ${provider} / ${new Date().toISOString()}`,
    })) as { id: number };
    projectId = project.id;

    // 2. Add source document
    const source = (await apiPost(
      baseUrl,
      `/api/projects/${projectId}/sources`,
      { kind: "text", content: fixtureText, filename: `${fixtureName}.txt` },
    )) as { id: number };

    // 3. Run extraction
    await apiPost(baseUrl, `/api/projects/${projectId}/extractions`, {
      sourceDocumentId: source.id,
      provider,
    });

    // 4. Fetch the model card
    const card = (await apiGet(
      baseUrl,
      `/api/projects/${projectId}/model-card`,
    )) as ApiModelCard;

    return card;
  } catch (err) {
    console.error(`  ERROR during extraction: ${(err as Error).message}`);
    return null;
  } finally {
    // 5. Always clean up the temporary project
    if (projectId !== null) {
      await apiDelete(baseUrl, `/api/projects/${projectId}`);
    }
  }
}

// ---------- Fixture loading ----------

function loadFixtures(fixtureFilter: string | null): string[] {
  const dir = path.join(ROOT, "fixtures");
  const all = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .sort();
  if (fixtureFilter) {
    return all.filter((f) => f.includes(fixtureFilter));
  }
  return all;
}

function loadExpected(fixtureName: string): ExpectedExtraction {
  const p = path.join(ROOT, "expected", fixtureName.replace(/\.txt$/, ".json"));
  if (!fs.existsSync(p)) {
    throw new Error(`No expected file found for fixture: ${fixtureName}`);
  }
  return JSON.parse(fs.readFileSync(p, "utf-8")) as ExpectedExtraction;
}

// ---------- Report formatting ----------

function pad(s: string, n: number, right = false): string {
  return right ? s.padStart(n) : s.padEnd(n);
}

function fmtScore(n: number): string {
  return (n * 100).toFixed(0).padStart(3) + "%";
}

function fmtBool(b: boolean): string {
  return b ? "✓" : "✗";
}

function printTable(results: BenchmarkResult[]): void {
  const bar = "─".repeat(90);
  const hdr =
    pad("Fixture", 28) +
    pad("Schema", 7) +
    pad("Vars", 6) +
    pad("Params", 7) +
    pad("Eqs", 6) +
    pad("Units", 7) +
    pad("Missing", 8) +
    pad("Overall", 8);

  console.log();
  console.log(bar);
  console.log(hdr);
  console.log(bar);

  for (const r of results) {
    const row =
      pad(r.fixture.slice(0, 27), 28) +
      pad(fmtBool(r.schemaValid), 7) +
      pad(fmtScore(r.variableScore), 6) +
      pad(fmtScore(r.parameterScore), 7) +
      pad(fmtScore(r.equationScore), 6) +
      pad(fmtScore(r.unitScore), 7) +
      pad(fmtScore(r.missingInfoScore), 8) +
      pad(fmtScore(r.overallScore), 8);
    console.log(row);
    for (const note of r.notes) {
      console.log("  " + note);
    }
  }

  console.log(bar);

  const mean = (key: keyof BenchmarkResult) =>
    results.reduce((acc, r) => acc + (r[key] as number), 0) / results.length;

  const meanRow =
    pad("MEAN", 28) +
    pad(
      `${results.filter((r) => r.schemaValid).length}/${results.length}`,
      7,
    ) +
    pad(fmtScore(mean("variableScore")), 6) +
    pad(fmtScore(mean("parameterScore")), 7) +
    pad(fmtScore(mean("equationScore")), 6) +
    pad(fmtScore(mean("unitScore")), 7) +
    pad(fmtScore(mean("missingInfoScore")), 8) +
    pad(fmtScore(mean("overallScore")), 8);
  console.log(meanRow);
  console.log(bar);
  console.log();
}

// ---------- Main ----------

async function main(): Promise<void> {
  const { providers, baseUrl, fixtureFilter } = parseArgs();
  const fixtureFiles = loadFixtures(fixtureFilter);

  if (fixtureFiles.length === 0) {
    console.error("No fixture files found. Check benchmark/fixtures/");
    process.exit(1);
  }

  // Verify server is reachable
  try {
    await apiGet(baseUrl, "/api/healthz");
  } catch {
    console.error(
      `\nERROR: Cannot reach API server at ${baseUrl}\n` +
        `Make sure the server is running: pnpm --filter @workspace/api-server run dev\n`,
    );
    process.exit(1);
  }

  const allResults: BenchmarkResult[] = [];

  for (const provider of providers) {
    const header = `━━━  ChemAI Extraction Benchmark  ·  provider: ${provider}  ·  ${new Date().toISOString()}  ━━━`;
    console.log("\n" + header);

    const providerResults: BenchmarkResult[] = [];

    for (const file of fixtureFiles) {
      const fixtureName = file.replace(/\.txt$/, "");
      process.stdout.write(`  Running ${fixtureName} (${provider})…`);

      const fixtureText = fs.readFileSync(
        path.join(ROOT, "fixtures", file),
        "utf-8",
      );
      const expected = loadExpected(file);

      const start = Date.now();
      const card = await runExtraction(baseUrl, fixtureText, provider, fixtureName);
      const elapsed = Date.now() - start;

      process.stdout.write(` ${elapsed}ms\n`);

      const result = evaluate(fixtureName, provider, card, expected);
      providerResults.push(result);
    }

    printTable(providerResults);
    allResults.push(...providerResults);

    // Save per-provider report
    saveReport(provider, baseUrl, providerResults);
  }
}

function saveReport(
  provider: string,
  baseUrl: string,
  results: BenchmarkResult[],
): void {
  const mean = (key: keyof BenchmarkResult) =>
    Math.round(
      (results.reduce((a, r) => a + (r[key] as number), 0) / results.length) *
        100,
    ) / 100;

  const report: BenchmarkReport = {
    runAt: new Date().toISOString(),
    provider,
    baseUrl,
    results,
    summary: {
      meanVariableScore: mean("variableScore"),
      meanParameterScore: mean("parameterScore"),
      meanEquationScore: mean("equationScore"),
      meanUnitScore: mean("unitScore"),
      meanMissingInfoScore: mean("missingInfoScore"),
      meanOverallScore: mean("overallScore"),
      schemaPassRate:
        Math.round(
          (results.filter((r) => r.schemaValid).length / results.length) * 100,
        ) / 100,
    },
  };

  const reportsDir = path.join(ROOT, "reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = path.join(reportsDir, `${provider}_${ts}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`  Report saved → ${path.relative(process.cwd(), outPath)}`);
}

main().catch((err: unknown) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
