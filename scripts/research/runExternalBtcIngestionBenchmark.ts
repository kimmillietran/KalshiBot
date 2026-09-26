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

  const PR137_MERGE_SHA = "582ef668f269f87d6e06320a1ea0406ba90df3de";
  const report = await runExternalBtcIngestionBenchmark({
    workDir,
    outDir,
    pinnedCommitSha: process.env.EXTERNAL_BTC_BENCH_PINNED_SHA ?? PR137_MERGE_SHA,
    maxTotalWallMs: 14 * 60_000,
    // Repeats sized so each measured window is typically 30–120s on cloud 4-vCPU.
    profiledRepeats: 6,
    unprofiledRepeats: 8,
  });
  console.error(`harnessHEAD=${pinnedSha(root)} pinnedIngestion=${report.pinnedCommitSha}`);

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
