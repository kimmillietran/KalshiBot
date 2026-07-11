import { dirname } from "node:path";
import { mkdirSync, statSync, writeFileSync } from "node:fs";

import { createFilesystemJsonlIo } from "@/lib/data/research/jsonl";
import {
  analyzeCaptureIntegrity,
  parseCaptureHealthReconciliationArgv,
  serializeCaptureHealthReconciliationHtml,
  serializeCaptureHealthReconciliationReport,
  serializeCaptureTimelineAttributionHtml,
  serializeCaptureTimelineAttributionReport,
} from "@/lib/data/research/captureHealthReconciliation";
import { stableStringify } from "@/lib/trading/config/hashConfig";

async function main(): Promise<void> {
  const parsed = parseCaptureHealthReconciliationArgv(process.argv.slice(2));
  const io = {
    ...createFilesystemJsonlIo(),
    isDirectory: (path: string) => statSync(path).isDirectory(),
  };

  const result = await analyzeCaptureIntegrity({
    io,
    config: parsed.config,
    generatedAt: new Date().toISOString(),
    reconciliationOutputPath: parsed.outputPath,
    reconciliationHtmlOutputPath: parsed.htmlOutputPath,
    timelineOutputPath: parsed.timelineOutputPath,
    timelineHtmlOutputPath: parsed.timelineHtmlOutputPath,
  });

  mkdirSync(dirname(parsed.outputPath), { recursive: true });
  mkdirSync(dirname(parsed.htmlOutputPath), { recursive: true });
  mkdirSync(dirname(parsed.timelineOutputPath), { recursive: true });
  mkdirSync(dirname(parsed.timelineHtmlOutputPath), { recursive: true });

  writeFileSync(
    parsed.outputPath,
    serializeCaptureHealthReconciliationReport(result.reconciliation),
    "utf8",
  );
  writeFileSync(
    parsed.htmlOutputPath,
    serializeCaptureHealthReconciliationHtml(result.reconciliation),
    "utf8",
  );
  writeFileSync(
    parsed.timelineOutputPath,
    serializeCaptureTimelineAttributionReport(result.timeline),
    "utf8",
  );
  writeFileSync(
    parsed.timelineHtmlOutputPath,
    serializeCaptureTimelineAttributionHtml(result.timeline),
    "utf8",
  );

  process.stdout.write(
    `${stableStringify({
      outputPath: parsed.outputPath,
      htmlOutputPath: parsed.htmlOutputPath,
      timelineOutputPath: parsed.timelineOutputPath,
      timelineHtmlOutputPath: parsed.timelineHtmlOutputPath,
      selectedRunId: result.reconciliation.summary.selectedRunId,
      overallVerdict: result.reconciliation.summary.overallVerdict,
      rawTopOfBookValidShare: result.reconciliation.validBookMetrics.find(
        (metric) => metric.metricId === "rawTopOfBookValidShare",
      )?.value,
      aggregateForwardReadinessValidShare: result.reconciliation.validBookMetrics.find(
        (metric) => metric.metricId === "aggregateForwardReadinessValidShare",
      )?.value,
      suspectedSystemSleepSeconds: result.reconciliation.suspension.suspectedSystemSleepSeconds,
      reconnectCount: result.reconciliation.connectionAttribution.reconnectCount,
      sequenceGapCount: result.reconciliation.connectionAttribution.sequenceGapCount,
      warningCount: result.reconciliation.summary.warnings.length,
    })}\n`,
  );
}

if (process.env.VITEST !== "true") {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Capture integrity analysis failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
