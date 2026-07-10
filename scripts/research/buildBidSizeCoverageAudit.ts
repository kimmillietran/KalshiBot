import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildBidSizeCoverageAuditReport,
  parseBidSizeCoverageAuditArgv,
  serializeBidSizeCoverageAuditHtml,
  serializeBidSizeCoverageAuditReport,
} from "@/lib/data/research/bidSizeCoverageAudit";
import { stableStringify } from "@/lib/trading/config/hashConfig";

function main(): void {
  try {
    const { outputPath, htmlOutputPath, config } = parseBidSizeCoverageAuditArgv(
      process.argv.slice(2),
    );
    const report = buildBidSizeCoverageAuditReport({
      generatedAt: new Date().toISOString(),
      outputPath,
      htmlOutputPath,
      config,
      io: {
        readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
        fileExists: (path) => existsSync(path),
      },
    });

    mkdirSync(dirname(outputPath), { recursive: true });
    mkdirSync(dirname(htmlOutputPath), { recursive: true });
    writeFileSync(outputPath, serializeBidSizeCoverageAuditReport(report));
    writeFileSync(htmlOutputPath, serializeBidSizeCoverageAuditHtml(report));

    process.stdout.write(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        sizeLossClassification: report.summary.sizeLossClassification,
        recommendedNextFix: report.summary.recommendedNextFix,
        confidence: report.summary.confidence,
        bidPairWithSizeCount: report.summary.bidPairWithSizeCount,
        bidPairWithoutSizeCount: report.summary.bidPairWithoutSizeCount,
        topOfBookRecordsCompared: report.summary.topOfBookRecordsCompared,
        bidSizeCoverageShare: report.comparison.bidSizeCoverageShare,
      })}\n`,
    );
    process.exitCode = 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bid size coverage audit failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.env.VITEST !== "true") {
  main();
}
