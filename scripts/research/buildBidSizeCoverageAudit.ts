import { dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import {
  buildBidSizeCoverageAuditReport,
  createFilesystemBidSizeCoverageIo,
  parseBidSizeCoverageAuditArgv,
  serializeBidSizeCoverageAuditHtml,
  serializeBidSizeCoverageAuditReport,
} from "@/lib/data/research/bidSizeCoverageAudit";
import { stableStringify } from "@/lib/trading/config/hashConfig";

async function main(): Promise<void> {
  try {
    const { outputPath, htmlOutputPath, config } = parseBidSizeCoverageAuditArgv(
      process.argv.slice(2),
    );
    const report = await buildBidSizeCoverageAuditReport({
      generatedAt: new Date().toISOString(),
      outputPath,
      htmlOutputPath,
      config,
      io: createFilesystemBidSizeCoverageIo(),
    });

    mkdirSync(dirname(outputPath), { recursive: true });
    mkdirSync(dirname(htmlOutputPath), { recursive: true });
    writeFileSync(outputPath, serializeBidSizeCoverageAuditReport(report));
    writeFileSync(htmlOutputPath, serializeBidSizeCoverageAuditHtml(report));

    process.stdout.write(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        comparisonMode: report.summary.comparisonMode,
        sizeLossClassification: report.summary.sizeLossClassification,
        recommendedNextFix: report.summary.recommendedNextFix,
        confidence: report.summary.confidence,
        bidPairWithSizeCount: report.summary.bidPairWithSizeCount,
        bidPairWithoutSizeCount: report.summary.bidPairWithoutSizeCount,
        topOfBookRecordsCompared: report.summary.topOfBookRecordsCompared,
        bidSizeCoverageShare: report.comparison.bidSizeCoverageShare,
        messagesScanned: report.summary.messagesScanned,
        sampleLimit: report.config.sampleLimit,
        warnings: report.warnings,
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
  void main();
}
