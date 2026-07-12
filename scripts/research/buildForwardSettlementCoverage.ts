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
  parseForwardSettlementCoverageArgv,
  serializeForwardSettlementCoverageHtml,
  serializeForwardSettlementCoverageReport,
} from "@/lib/data/research/forwardSettlementCoverage";
import { stableStringify } from "@/lib/trading/config/hashConfig";

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
    runBackfill: false,
  }).then((report) => {
    mkdirSync(dirname(parsed.outputPath), { recursive: true });
    mkdirSync(dirname(parsed.htmlOutputPath), { recursive: true });
    writeFileSync(parsed.outputPath, serializeForwardSettlementCoverageReport(report), "utf8");
    writeFileSync(parsed.htmlOutputPath, serializeForwardSettlementCoverageHtml(report), "utf8");

    process.stdout.write(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        selectedRunId: report.summary.selectedRunId,
        capturedMarketCount: report.summary.capturedMarketCount,
        settledMarketCount: report.summary.settledMarketCount,
        coverageShare: report.summary.coverageShare,
        recommendedNextAction: report.summary.recommendedNextAction,
        joinVerdict: report.joinIntegration.overallVerdict,
      })}\n`,
    );
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Forward settlement coverage failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

if (process.env.VITEST !== "true") {
  main();
}
