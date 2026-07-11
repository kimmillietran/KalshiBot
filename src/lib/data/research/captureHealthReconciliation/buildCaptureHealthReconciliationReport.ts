import { stableStringify } from "@/lib/trading/config/hashConfig";

import { analyzeCaptureIntegrity } from "./analyzeCaptureIntegrity";
import {
  createCaptureHealthReconciliationConfig,
  DEFAULT_CAPTURE_HEALTH_RECONCILIATION_CONFIG,
} from "./captureHealthReconciliationConfig";
import {
  DEFAULT_CAPTURE_HEALTH_RECONCILIATION_HTML_PATH,
  DEFAULT_CAPTURE_HEALTH_RECONCILIATION_OUTPUT_PATH,
  DEFAULT_CAPTURE_TIMELINE_ATTRIBUTION_HTML_PATH,
  DEFAULT_CAPTURE_TIMELINE_ATTRIBUTION_OUTPUT_PATH,
  type CaptureHealthReconciliationIo,
  type CaptureHealthReconciliationReport,
} from "./captureHealthReconciliationTypes";
import {
  serializeCaptureHealthReconciliationHtml,
  serializeCaptureTimelineAttributionHtml,
} from "./serializeCaptureHealthReconciliationHtml";

export async function buildCaptureHealthReconciliationReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  timelineOutputPath: string;
  timelineHtmlOutputPath: string;
  config: ReturnType<typeof createCaptureHealthReconciliationConfig>;
  io: CaptureHealthReconciliationIo;
}): Promise<CaptureHealthReconciliationReport> {
  const result = await analyzeCaptureIntegrity({
    io: input.io,
    config: input.config,
    generatedAt: input.generatedAt,
    reconciliationOutputPath: input.outputPath,
    reconciliationHtmlOutputPath: input.htmlOutputPath,
    timelineOutputPath: input.timelineOutputPath,
    timelineHtmlOutputPath: input.timelineHtmlOutputPath,
  });

  return result.reconciliation;
}

export function serializeCaptureHealthReconciliationReport(
  report: CaptureHealthReconciliationReport,
): string {
  return stableStringify(report);
}

export async function buildCaptureTimelineAttributionReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  reconciliationOutputPath: string;
  reconciliationHtmlOutputPath: string;
  config: ReturnType<typeof createCaptureHealthReconciliationConfig>;
  io: CaptureHealthReconciliationIo;
}) {
  const result = await analyzeCaptureIntegrity({
    io: input.io,
    config: input.config,
    generatedAt: input.generatedAt,
    reconciliationOutputPath: input.reconciliationOutputPath,
    reconciliationHtmlOutputPath: input.reconciliationHtmlOutputPath,
    timelineOutputPath: input.outputPath,
    timelineHtmlOutputPath: input.htmlOutputPath,
  });

  return result.timeline;
}

export function serializeCaptureTimelineAttributionReport(
  report: Awaited<ReturnType<typeof buildCaptureTimelineAttributionReport>>,
): string {
  return stableStringify(report);
}

export {
  serializeCaptureHealthReconciliationHtml,
  serializeCaptureTimelineAttributionHtml,
  DEFAULT_CAPTURE_HEALTH_RECONCILIATION_CONFIG,
  DEFAULT_CAPTURE_HEALTH_RECONCILIATION_HTML_PATH,
  DEFAULT_CAPTURE_HEALTH_RECONCILIATION_OUTPUT_PATH,
  DEFAULT_CAPTURE_TIMELINE_ATTRIBUTION_HTML_PATH,
  DEFAULT_CAPTURE_TIMELINE_ATTRIBUTION_OUTPUT_PATH,
};
