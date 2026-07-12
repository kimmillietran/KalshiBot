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
  buildBidOnlyCandidateLifecycleReport,
  createBidOnlyCandidateLifecycleConfig,
  parseBidOnlyCandidateLifecycleArgv,
  serializeBidOnlyCandidateLifecycleHtml,
  serializeBidOnlyCandidateLifecycleReport,
} from "@/lib/data/research/bidOnlyCandidateLifecycle";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeBidOnlyCandidateLifecycleArgv } from "../lib/cliArgvSchemas";

function main(): void {
  const argv = normalizeBidOnlyCandidateLifecycleArgv(process.argv.slice(2));
  const parsed = parseBidOnlyCandidateLifecycleArgv(argv);

  const config = createBidOnlyCandidateLifecycleConfig({
    forwardQuotesDir: parsed.forwardQuotesDir,
    staticParityScanPath: parsed.staticParityScanPath,
    captureRunDir: parsed.configOverrides.captureRunDir ?? null,
    ...(parsed.configOverrides.maxGapMs !== undefined
      ? { maxGapMs: parsed.configOverrides.maxGapMs }
      : {}),
    ...(parsed.configOverrides.minEpisodeDurationMs !== undefined
      ? { minEpisodeDurationMs: parsed.configOverrides.minEpisodeDurationMs }
      : {}),
    ...(parsed.configOverrides.minEdgeCents !== undefined
      ? { minEdgeCents: parsed.configOverrides.minEdgeCents }
      : {}),
    ...(parsed.configOverrides.minSizeContracts !== undefined
      ? { minSizeContracts: parsed.configOverrides.minSizeContracts }
      : {}),
  });

  const report = buildBidOnlyCandidateLifecycleReport({
    generatedAt: new Date().toISOString(),
    outputPath: parsed.outputPath,
    htmlOutputPath: parsed.htmlOutputPath,
    config,
    io: {
      readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
      fileExists: (path) => existsSync(path),
      readdir: (path) => readdirSync(path),
      isDirectory: (path) => statSync(path).isDirectory(),
    },
  });

  mkdirSync(dirname(parsed.outputPath), { recursive: true });
  mkdirSync(dirname(parsed.htmlOutputPath), { recursive: true });
  writeFileSync(parsed.outputPath, serializeBidOnlyCandidateLifecycleReport(report), "utf8");
  writeFileSync(parsed.htmlOutputPath, serializeBidOnlyCandidateLifecycleHtml(report), "utf8");

  process.stdout.write(
    `${stableStringify({
      outputPath: report.outputPath,
      htmlOutputPath: report.htmlOutputPath,
      runsScanned: report.metrics.runsScanned,
      recordsScanned: report.metrics.recordsScanned,
      bidOnlyCandidateRecords: report.metrics.bidOnlyCandidateRecords,
      episodesBuilt: report.metrics.episodesBuilt,
      persistentCandidateEpisodes: report.metrics.persistentCandidateEpisodes,
      grossCandidateEpisodes: report.metrics.grossCandidateEpisodes,
      bufferAdjustedCandidateEpisodes: report.metrics.bufferAdjustedCandidateEpisodes,
      recommendedNextAction: report.summary.recommendedNextAction,
      warningCount: report.metrics.warnings.length,
    })}\n`,
  );
}

if (process.env.VITEST !== "true") {
  main();
}
