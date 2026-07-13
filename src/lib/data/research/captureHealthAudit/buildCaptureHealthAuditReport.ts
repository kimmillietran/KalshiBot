import {
  CAPTURE_HEALTH_AUDIT_CAVEATS,
  CAPTURE_HEALTH_AUDIT_DISCLAIMER,
} from "./captureHealthAuditConfig";
import { computeCaptureHealthMetrics } from "./computeCaptureHealthMetrics";
import type { CaptureHealthAuditConfig, CaptureHealthAuditReport } from "./captureHealthAuditTypes";
import { evaluateCaptureReadinessVerdict } from "./evaluateCaptureReadinessVerdict";
import { loadCaptureRunArtifacts } from "./loadCaptureRunArtifacts";
import type { CaptureHealthAuditIo } from "./captureHealthAuditTypes";
import { SELECTED_RUN_CAPTURE_HEALTH_ANALYSIS_VERSION } from "../selectedRunCaptureHealth/selectedRunCaptureHealthTypes";
import { resolveSelectedRunId } from "../selectedRunCaptureHealth/selectedRunCaptureHealthUtils";

/** Loads capture artifacts and builds the full capture health audit report. */
export async function buildCaptureHealthAuditReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  captureRunDir: string;
  config: CaptureHealthAuditConfig;
  io: CaptureHealthAuditIo;
}): Promise<CaptureHealthAuditReport> {
  const loaded = await loadCaptureRunArtifacts({
    captureRunDir: input.captureRunDir,
    io: input.io,
  });

  const metrics = computeCaptureHealthMetrics({
    config: input.config,
    topOfBookRecords: loaded.topOfBookRecords,
    btcSpotRecords: loaded.btcSpotRecords,
    captureHealth: loaded.captureHealth,
  });

  const evaluation = evaluateCaptureReadinessVerdict({
    config: input.config,
    loaded,
    metrics,
  });

  const warnings = [...loaded.loadWarnings];
  if (loaded.captureHealth?.config?.dryRun) {
    warnings.push("Source capture run was dry-run/mock; live liquidity was not observed.");
  }
  if (evaluation.blockingReasons.length > 0 && evaluation.verdict !== "capture-research-ready") {
    warnings.push(...evaluation.blockingReasons);
  }

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: CAPTURE_HEALTH_AUDIT_DISCLAIMER,
    caveats: [...CAPTURE_HEALTH_AUDIT_CAVEATS],
    warnings,
    captureRunDir: loaded.artifacts.captureRunDir,
    selectedRunId: resolveSelectedRunId(loaded.artifacts.captureRunDir),
    sourceRunIds: [resolveSelectedRunId(loaded.artifacts.captureRunDir)],
    analysisVersion: SELECTED_RUN_CAPTURE_HEALTH_ANALYSIS_VERSION,
    inputArtifactIdentities: [
      { path: loaded.artifacts.topOfBookPath ?? "", role: "top-of-book" },
      { path: loaded.artifacts.btcSpotPath ?? "", role: "btc-spot" },
      { path: loaded.artifacts.rawMessagesPath ?? "", role: "raw-messages" },
      { path: loaded.artifacts.marketMetadataPath ?? "", role: "market-metadata" },
      { path: loaded.artifacts.captureHealthPath ?? "", role: "native-capture-health" },
    ].filter((entry) => entry.path.length > 0),
    recordsScanned: loaded.topOfBookRecords.length,
    artifacts: loaded.artifacts,
    config: input.config,
    summary: {
      verdict: evaluation.verdict,
      recommendedNextAction: evaluation.recommendedNextAction,
      runDurationSeconds: metrics.runDurationSeconds,
      rawMessageCount: loaded.rawMessageCount,
      topOfBookCount: loaded.topOfBookRecords.length,
      btcSpotCount: loaded.btcSpotRecords.length,
      marketsCovered: metrics.marketsCovered,
      eventTickersCovered: metrics.eventTickersCovered,
      firstTimestamp: metrics.firstTimestamp,
      lastTimestamp: metrics.lastTimestamp,
      continuity: metrics.continuity,
      bookState: metrics.bookState,
      spread: metrics.spread,
      btcJoin: metrics.btcJoin,
    },
    segments: metrics.segments,
  };
}
