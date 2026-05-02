export interface ParsedCsvRow {
  time: number;
  X: number;
  S: number;
  O2?: number;
  CO2?: number;
}

export interface CsvParseResult {
  ok: boolean;
  rows: ParsedCsvRow[];
  errors: string[];
  warnings: string[];
  rawHeaders: string[];
  hasO2: boolean;
  hasCO2: boolean;
}

const MIN_ROWS = 5;
const MAX_ROWS = 10_000;

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

export function parseChemostatCsv(text: string): CsvParseResult {
  const result: CsvParseResult = {
    ok: false,
    rows: [],
    errors: [],
    warnings: [],
    rawHeaders: [],
    hasO2: false,
    hasCO2: false,
  };

  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines = rawLines.filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));

  if (lines.length < 2) {
    result.errors.push("File appears empty or has no data rows.");
    return result;
  }

  // parse headers
  const rawHeaders = lines[0].split(",").map((h) => h.trim());
  result.rawHeaders = rawHeaders;
  const normHeaders = rawHeaders.map(normalize);

  const colTime = normHeaders.findIndex((h) => h === "time" || h === "t");
  const colX = normHeaders.findIndex((h) => h === "x");
  const colS = normHeaders.findIndex((h) => h === "s");
  const colO2 = normHeaders.findIndex((h) => h === "o2" || h === "do");
  const colCO2 = normHeaders.findIndex((h) => h === "co2");

  if (colTime === -1) result.errors.push('Required column "time" (or "t") not found.');
  if (colX === -1) result.errors.push('Required column "X" (biomass) not found.');
  if (colS === -1) result.errors.push('Required column "S" (substrate) not found.');

  if (result.errors.length > 0) return result;

  result.hasO2 = colO2 !== -1;
  result.hasCO2 = colCO2 !== -1;

  const dataLines = lines.slice(1);

  if (dataLines.length > MAX_ROWS) {
    result.warnings.push(`File has ${dataLines.length} rows; only the first ${MAX_ROWS} will be used.`);
  }

  let prevTime = -Infinity;

  for (let i = 0; i < Math.min(dataLines.length, MAX_ROWS); i++) {
    const lineNum = i + 2;
    const cells = dataLines[i].split(",").map((c) => c.trim());

    if (cells.length < Math.max(colTime, colX, colS) + 1) {
      result.errors.push(`Row ${lineNum}: not enough columns (expected at least ${rawHeaders.length}, got ${cells.length}).`);
      continue;
    }

    const t = parseFloat(cells[colTime]);
    const X = parseFloat(cells[colX]);
    const S = parseFloat(cells[colS]);

    if (!isFinite(t)) {
      result.errors.push(`Row ${lineNum}: "time" value "${cells[colTime]}" is not a number.`);
      continue;
    }
    if (!isFinite(X)) {
      result.errors.push(`Row ${lineNum}: "X" value "${cells[colX]}" is not a number.`);
      continue;
    }
    if (!isFinite(S)) {
      result.errors.push(`Row ${lineNum}: "S" value "${cells[colS]}" is not a number.`);
      continue;
    }
    if (t <= prevTime) {
      result.errors.push(`Row ${lineNum}: time ${t} is not strictly increasing (previous = ${prevTime}).`);
      continue;
    }
    if (X < 0) result.warnings.push(`Row ${lineNum}: X = ${X} is negative; treated as 0.`);
    if (S < 0) result.warnings.push(`Row ${lineNum}: S = ${S} is negative; treated as 0.`);

    const row: ParsedCsvRow = { time: t, X: Math.max(0, X), S: Math.max(0, S) };

    if (colO2 !== -1 && cells[colO2] !== undefined) {
      const o = parseFloat(cells[colO2]);
      if (isFinite(o)) row.O2 = o;
    }
    if (colCO2 !== -1 && cells[colCO2] !== undefined) {
      const c = parseFloat(cells[colCO2]);
      if (isFinite(c)) row.CO2 = c;
    }

    prevTime = t;
    result.rows.push(row);
  }

  if (result.errors.length > 0) return result;

  if (result.rows.length < MIN_ROWS) {
    result.errors.push(
      `Only ${result.rows.length} valid row(s) found; at least ${MIN_ROWS} are required for fitting.`
    );
    return result;
  }

  result.ok = true;
  return result;
}
