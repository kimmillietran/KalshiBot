#!/usr/bin/env npx tsx
/**
 * Cloud ingestion benchmark runner. Does not touch the Mac empirical pilot.
 *
 *   npm run research:external-btc-ingestion-benchmark
 *   npm run research:external-btc-ingestion-benchmark -- --native-path /abs/sample.txt.zst
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { runExternalBtcIngestionBenchmark } from "@/lib/data/research/externalBtcIngestionBenchmark";

function repoRoot(): string {
  const out = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error("git rev-parse failed");
  }
  return out.stdout.trim();
}

function pinnedSha(root: string): string {
  const out = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  if (out.status !== 0) throw new Error("git rev-parse HEAD failed");
  return out.stdout.trim();
}

async function main(): Promise<void> {
  const root = repoRoot();
  const nativePath =
    process.env.EXTERNAL_BTC_BENCH_NATIVE_PATH
    ?? readFlag(process.argv, "--native-path");
  if (nativePath) {
    if (!existsSync(nativePath)) {
      throw new Error(`native sample missing: ${nativePath}`);
    }
    console.error(
      "Native path supplied, but this runner version still executes the synthetic suite "
        + "and records the path for Mac reproduction. Full native wiring is the next step "
        + `after opening the benchmark PR. path=${nativePath}`,
    );
  }

  const workDir = join(
    root,
    "data/research-results/external-kalshi-data-audit/external-btc-ingestion-benchmark/work",
  );
  const outDir = join(
    root,
    "data/research-results/external-kalshi-data-audit/external-btc-ingestion-benchmark",
  );

  const report = await runExternalBtcIngestionBenchmark({
    workDir,
    outDir,
    pinnedCommitSha: pinnedSha(root),
    maxTotalWallMs: 14 * 60_000,
    profiledRepeats: 2,
    unprofiledRepeats: 3,
  });

  console.log(
    JSON.stringify(
      {
        studyId: report.studyId,
        pinnedCommitSha: report.pinnedCommitSha,
        syntheticUsed: report.dataProvenance.syntheticUsed,
        runCount: report.runs.length,
        allParityOk: report.parity.every((p) => p.result.matched),
        largestOpportunity: report.recommendations.largestOpportunity,
        bestLowRiskChange: report.recommendations.bestLowRiskChange,
        nextImplementationChange: report.recommendations.nextImplementationChange,
        outDir,
      },
      null,
      2,
    ),
  );
}

function readFlag(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx < 0) return null;
  return argv[idx + 1] ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
