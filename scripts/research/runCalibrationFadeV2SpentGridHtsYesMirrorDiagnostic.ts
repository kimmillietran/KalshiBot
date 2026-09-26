/**
 * Paired YES-side mirror diagnostic on PR #134's exact selected cohort.
 * Offline retained artifacts only. Simulated P&L at observed quotes.
 *
 * Does not re-run eligibility. Does not modify NO-side #134 outputs.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CF_V2_NO_GRID_EXPECTED,
  runYesMirrorDiagnostic,
  writeYesMirrorArtifacts,
  type NoSideTradeRow,
} from "@/lib/data/research/calibrationFadeV2SpentGridHtsYesMirrorDiagnostic";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "../.."));

const DEFAULT_SOURCE_DIR = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit/calibration-fade-v2-spent-grid-hts-exploratory",
);

const DEFAULT_OUT_DIR = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit/calibration-fade-v2-spent-grid-hts-yes-mirror-diagnostic",
);

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadJsonl<T>(path: string): T[] {
  const rows: T[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as T);
  }
  return rows;
}

function parseArgs(argv: string[]): { sourceDir: string; outDir: string } {
  let sourceDir = DEFAULT_SOURCE_DIR;
  let outDir = DEFAULT_OUT_DIR;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source-dir" && argv[i + 1]) {
      sourceDir = resolve(argv[++i]!);
    } else if (arg === "--out-dir" && argv[i + 1]) {
      outDir = resolve(argv[++i]!);
    }
  }
  return { sourceDir, outDir };
}

async function main(): Promise<void> {
  const { sourceDir, outDir } = parseArgs(process.argv.slice(2));
  const selectedPath = join(sourceDir, "selected-entries.jsonl");
  const tradesPath = join(sourceDir, "per-market-trades.jsonl");

  if (!existsSync(selectedPath) || !existsSync(tradesPath)) {
    console.error(
      "PR #134 cohort artifacts missing. Expected:\n"
        + `  ${selectedPath}\n`
        + `  ${tradesPath}\n`
        + "Implementation and fixture tests can still run; real-data mirror was not executed.\n"
        + "Reproduction:\n"
        + "  npx tsx scripts/research/runCalibrationFadeV2SpentGridHtsYesMirrorDiagnostic.ts "
        + `--source-dir ${DEFAULT_SOURCE_DIR} --out-dir ${DEFAULT_OUT_DIR}`,
    );
    process.exitCode = 2;
    return;
  }

  const selectedEntriesSha256 = sha256File(selectedPath);
  const perMarketTradesSha256 = sha256File(tradesPath);

  if (
    selectedEntriesSha256 !== CF_V2_NO_GRID_EXPECTED.selectedEntriesSha256
    || perMarketTradesSha256 !== CF_V2_NO_GRID_EXPECTED.perMarketTradesSha256
  ) {
    console.error("Source cohort hash mismatch — refusing to compute YES mirror.");
    console.error("selected-entries", selectedEntriesSha256);
    console.error("per-market-trades", perMarketTradesSha256);
    console.error("expected selected", CF_V2_NO_GRID_EXPECTED.selectedEntriesSha256);
    console.error("expected trades", CF_V2_NO_GRID_EXPECTED.perMarketTradesSha256);
    process.exitCode = 3;
    return;
  }

  const noTrades = loadJsonl<NoSideTradeRow>(tradesPath);
  const codeAuthoritySha = execSync("git rev-parse HEAD", {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const generatedAtUtc = new Date().toISOString();

  const { report, pairedRows } = runYesMirrorDiagnostic({
    generatedAtUtc,
    codeAuthoritySha,
    selectedEntriesSha256,
    perMarketTradesSha256,
    noTrades,
  });

  const hashes = await writeYesMirrorArtifacts({
    outDir,
    report,
    pairedRows,
  });

  const e = report.economics;
  const inf = e.inference;
  console.log(
    `paired N=${e.n} G=${e.g} YES meanNet=${e.meanNetPnlCents.toFixed(4)}¢ `
      + `CI=[${inf?.ci95LowerCents.toFixed(4) ?? "n/a"}, ${inf?.ci95UpperCents.toFixed(4) ?? "n/a"}] `
      + `identity=${report.accounting.identityHoldsForAllPairedRows} `
      + `status=${report.interpretation.status}`,
  );
  console.log(`wrote ${outDir}`);
  console.log(`hashes report.json=${hashes.reportJsonSha256}`);
  console.log(`hashes paired=${hashes.pairedSha256}`);
  console.log(`hashes manifest=${hashes.manifestSha256}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
