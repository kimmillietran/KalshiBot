import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";

import {
  buildForwardSettlementCoverageReport,
  createProductionForwardSettlementBackfillDeps,
  parseForwardSettlementCoverageArgv,
  serializeForwardSettlementCoverageHtml,
  serializeForwardSettlementCoverageReport,
} from "@/lib/data/research/forwardSettlementCoverage";
import { stableStringify } from "@/lib/trading/config/hashConfig";
import type { ForwardSettlementBackfillMarketResult } from "@/lib/data/research/forwardSettlementCoverage/forwardSettlementCoverageTypes";

function summarizeBackfillFailures(
  results: readonly ForwardSettlementBackfillMarketResult[],
): readonly {
  errorCategory: string;
  affectedMarketCount: number;
  retryDeferredMarketCount: number;
  sampleErrorMessage: string | null;
}[] {
  const failed = results.filter((result) => result.status === "failed");
  const grouped = new Map<string, ForwardSettlementBackfillMarketResult[]>();

  for (const result of failed) {
    const key = result.errorCategory ?? "unknown";
    const bucket = grouped.get(key) ?? [];
    bucket.push(result);
    grouped.set(key, bucket);
  }

  return [...grouped.entries()]
    .map(([errorCategory, bucket]) => ({
      errorCategory,
      affectedMarketCount: bucket.length,
      retryDeferredMarketCount: bucket.filter((entry) => Boolean(entry.nextEligibleRetryAt)).length,
      sampleErrorMessage: bucket[0]?.errorMessage ?? null,
    }))
    .sort((left, right) => right.affectedMarketCount - left.affectedMarketCount);
}

function main(): void {
  const parsed = parseForwardSettlementCoverageArgv(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const io = {
    readFile: (path: string) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path: string) => existsSync(path),
    readdir: (path: string) => readdirSync(path),
    isDirectory: (path: string) => statSync(path).isDirectory(),
    writeFile: (path: string, data: string) => {
      writeFileSync(path, data, "utf8");
    },
    mkdirSync: (path: string, options?: { recursive?: boolean }) => {
      mkdirSync(path, options);
    },
  };

  buildForwardSettlementCoverageReport({
    generatedAt,
    config: parsed,
    io,
    joinOutputPath: "data/research-results/forward-settlement-join-selected-run.json",
    runBackfill: true,
    backfillDeps: parsed.dryRun
      ? {
          runMarketImport: async ({ dryRun }) => ({
            success: true,
            skipped: !dryRun,
          }),
        }
      : createProductionForwardSettlementBackfillDeps({
          io,
          evaluatedAt: generatedAt,
          importsDir: parsed.importsDir,
          staleAfterCaptureObservation: parsed.staleAfterCaptureObservation,
        }),
  }).then((report) => {
    mkdirSync(dirname(parsed.outputPath), { recursive: true });
    mkdirSync(dirname(parsed.htmlOutputPath), { recursive: true });
    writeFileSync(parsed.outputPath, serializeForwardSettlementCoverageReport(report), "utf8");
    writeFileSync(parsed.htmlOutputPath, serializeForwardSettlementCoverageHtml(report), "utf8");

    process.stdout.write(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        dryRun: parsed.dryRun,
        capturedMarketCount: report.summary.capturedMarketCount,
        settledMarketCount: report.summary.settledMarketCount,
        coverageShare: report.summary.coverageShare,
        importedMarketCount: report.backfill?.importedMarketCount ?? 0,
        failedMarketCount: report.backfill?.failedMarketCount ?? 0,
        checkpointPath: report.backfill?.checkpointPath ?? parsed.checkpointPath,
        recommendedNextAction: report.summary.recommendedNextAction,
        backfillFailureDiagnostics: summarizeBackfillFailures(report.backfill?.marketResults ?? []),
      })}\n`,
    );

    if ((report.backfill?.failedMarketCount ?? 0) > 0) {
      process.exitCode = 1;
    }
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Forward settlement backfill failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

if (process.env.VITEST !== "true") {
  main();
}
