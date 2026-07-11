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
  buildForwardSettlementJoinReport,
  parseForwardSettlementJoinArgv,
  serializeForwardSettlementJoinHtml,
  serializeForwardSettlementJoinReport,
} from "@/lib/data/research/forwardSettlementJoin";
import { stableStringify } from "@/lib/trading/config/hashConfig";

function main(): void {
  const parsed = parseForwardSettlementJoinArgv(process.argv.slice(2));

  const report = buildForwardSettlementJoinReport({
    generatedAt: new Date().toISOString(),
    outputPath: parsed.outputPath,
    htmlOutputPath: parsed.htmlOutputPath,
    config: parsed.config,
    io: {
      readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
      fileExists: (path) => existsSync(path),
      readdir: (path) => readdirSync(path),
      isDirectory: (path) => statSync(path).isDirectory(),
    },
  });

  mkdirSync(dirname(parsed.outputPath), { recursive: true });
  mkdirSync(dirname(parsed.htmlOutputPath), { recursive: true });
  writeFileSync(parsed.outputPath, serializeForwardSettlementJoinReport(report), "utf8");
  writeFileSync(parsed.htmlOutputPath, serializeForwardSettlementJoinHtml(report), "utf8");

  process.stdout.write(
    `${stableStringify({
      outputPath: report.outputPath,
      htmlOutputPath: report.htmlOutputPath,
      overallVerdict: report.summary.overallVerdict,
      recommendedNextAction: report.summary.recommendedNextAction,
      capturedMarketCount: report.summary.capturedMarketCount,
      settlementKnownMarketCount: report.summary.settlementKnownMarketCount,
      settlementCoverageShare: report.summary.settlementCoverageShare,
      candidateEpisodeCount: report.summary.candidateEpisodeCount,
      settlementKnownEpisodeCount: report.summary.settlementKnownEpisodeCount,
      episodeSettlementCoverageShare: report.summary.episodeSettlementCoverageShare,
      warningCount: report.summary.warnings.length,
    })}\n`,
  );
}

if (process.env.VITEST !== "true") {
  main();
}
