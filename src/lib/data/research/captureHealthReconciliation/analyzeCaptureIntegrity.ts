import { loadCaptureRunArtifacts } from "@/lib/data/research/captureHealthAudit/loadCaptureRunArtifacts";
import type { LoadedCaptureHealthJson } from "@/lib/data/research/captureHealthAudit/loadCaptureRunArtifacts";
import type { CaptureHealthAuditIo } from "@/lib/data/research/captureHealthAudit/captureHealthAuditTypes";

import { attributeConnectionEvents } from "./attributeConnectionEvents";
import type { CaptureHealthReconciliationConfig, CaptureHealthReconciliationIo } from "./captureHealthReconciliationTypes";
import {
  CAPTURE_HEALTH_RECONCILIATION_DISCLAIMER,
  CAPTURE_HEALTH_RECONCILIATION_VERSION,
  CaptureHealthReconciliationError,
  type CaptureHealthReconciliationReport,
  type CaptureTimelineAttributionReport,
  type SamplingSemantics,
} from "./captureHealthReconciliationTypes";
import { computeDurationMetrics } from "./computeDurationMetrics";
import { detectHostSuspension } from "./detectHostSuspension";
import { evaluateResearchSuitability } from "./evaluateResearchSuitability";
import { reconcileValidBookMetrics } from "./reconcileValidBookMetrics";
import { validateRunScopedArtifacts } from "./validateRunScopedArtifacts";

const DOWNSTREAM_ARTIFACT_PATHS = [
  "data/research-results/capture-health-audit.json",
  "data/research-results/bid-size-coverage-audit.json",
  "data/research-results/forward-capture-readiness.json",
  "data/research-results/static-parity-scan.json",
  "data/research-results/bid-only-candidate-lifecycle.json",
  "data/research-results/strategy-evaluation-readiness.json",
  "data/research-results/executable-confirmation-design.json",
] as const;

function resolveRunId(captureRunDir: string): string {
  return captureRunDir.replaceAll("\\", "/").split("/").pop() ?? captureRunDir;
}

function readAggregateValidShare(io: CaptureHealthReconciliationIo): number | null {
  const path = "data/research-results/forward-capture-readiness.json";
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    const parsed = JSON.parse(io.readFile(path)) as Record<string, unknown>;
    const aggregates = parsed.aggregates as Record<string, unknown> | undefined;
    const value = aggregates?.validBookShare;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

function buildSamplingSemantics(
  captureHealth: Record<string, unknown> | null,
): SamplingSemantics {
  const config = (captureHealth?.config ?? {}) as Record<string, unknown>;
  const throttleMs =
    typeof config.topOfBookThrottleMs === "number" ? config.topOfBookThrottleMs : null;

  return {
    topOfBookThrottleMs: throttleMs,
    rawUpdateCadence: "Continuous from raw orderbook_snapshot/orderbook_delta messages.",
    emittedTopOfBookCadence:
      throttleMs !== null
        ? `Throttled top-of-book emission at ~${throttleMs}ms per market (economic transitions bypass throttle).`
        : "Unthrottled top-of-book emission.",
    candidateScanInputSource: "Emitted top-of-book.jsonl snapshots (not raw per-delta replay).",
    minimumObservableEventDurationMs: throttleMs,
    subSecondParityDetectable: throttleMs === null ? true : throttleMs < 1000,
    notes: [
      "Internal order books update on every snapshot/delta; throttle applies only to emitted records.",
    ],
  };
}

function resolveOverallVerdict(
  researchSuitability: ReturnType<typeof evaluateResearchSuitability>,
): { verdict: string; recommendedNextAction: string } {
  if (researchSuitability.transientEventDetectionSuitability === "not-ready") {
    return {
      verdict: "degraded-capture",
      recommendedNextAction: "review-blind-windows-before-candidate-interpretation",
    };
  }

  if (researchSuitability.descriptiveAnalysisSuitability === "ready") {
    return {
      verdict: "capture-research-ready-with-caveats",
      recommendedNextAction: "proceed-offline-microstructure-research",
    };
  }

  return {
    verdict: "degraded-capture",
    recommendedNextAction: "reconcile-health-metrics-before-strategy-claims",
  };
}

function readWatchdogSummary(
  captureHealth: LoadedCaptureHealthJson | null,
): {
  terminalWebSocketFailure: boolean;
  kalshiSilentWhileBtcActiveSeconds: number;
  wsRecoverySuccessCount: number;
  wsStallDetectedCount: number;
} | null {
  const watchdog = (captureHealth as { watchdog?: Record<string, unknown> } | null)?.watchdog;
  if (!watchdog) {
    return null;
  }

  return {
    terminalWebSocketFailure: watchdog.terminalWebSocketFailure === true,
    kalshiSilentWhileBtcActiveSeconds:
      typeof watchdog.kalshiSilentWhileBtcActiveSeconds === "number"
        ? watchdog.kalshiSilentWhileBtcActiveSeconds
        : 0,
    wsRecoverySuccessCount:
      typeof watchdog.wsRecoverySuccessCount === "number"
        ? watchdog.wsRecoverySuccessCount
        : 0,
    wsStallDetectedCount:
      typeof watchdog.wsStallDetectedCount === "number"
        ? watchdog.wsStallDetectedCount
        : 0,
  };
}

/** Builds capture health reconciliation and timeline attribution for a selected run. */
export async function analyzeCaptureIntegrity(input: {
  io: CaptureHealthReconciliationIo;
  config: CaptureHealthReconciliationConfig;
  generatedAt: string;
  reconciliationOutputPath: string;
  reconciliationHtmlOutputPath: string;
  timelineOutputPath: string;
  timelineHtmlOutputPath: string;
}): Promise<{
  reconciliation: CaptureHealthReconciliationReport;
  timeline: CaptureTimelineAttributionReport;
}> {
  const captureRunDir = input.config.captureRunDir.replaceAll("\\", "/");
  if (!input.io.fileExists(captureRunDir) || !input.io.isDirectory(captureRunDir)) {
    throw new CaptureHealthReconciliationError(
      `Capture run directory not found: ${captureRunDir}`,
    );
  }

  const selectedRunId = resolveRunId(captureRunDir);
  const auditIo = input.io as CaptureHealthAuditIo;
  const loaded = await loadCaptureRunArtifacts({
    captureRunDir,
    io: auditIo,
  });

  const suspension = await detectHostSuspension({
    io: input.io,
    btcSpotPath: loaded.artifacts.btcSpotPath,
    config: input.config,
  });

  const durations = computeDurationMetrics({
    topOfBookRecords: loaded.topOfBookRecords,
    captureHealth: loaded.captureHealth,
    suspectedHostSuspensionSeconds: suspension.suspectedSystemSleepSeconds,
  });

  const validBookMetrics = reconcileValidBookMetrics({
    topOfBookRecords: loaded.topOfBookRecords,
    aggregateForwardReadinessValidShare: readAggregateValidShare(input.io),
  });

  const connectionAttribution = await attributeConnectionEvents({
    io: input.io,
    config: input.config,
    topOfBookRecords: loaded.topOfBookRecords,
    captureHealth: loaded.captureHealth,
    rawWsPath: loaded.artifacts.rawMessagesPath,
    btcSpotPath: loaded.artifacts.btcSpotPath,
    suspensionIntervals: suspension.intervals,
  });

  const downstreamArtifacts = validateRunScopedArtifacts({
    io: input.io,
    selectedRunId,
    artifactPaths: DOWNSTREAM_ARTIFACT_PATHS,
    evaluatedAt: input.generatedAt,
    staleAfterHours: input.config.artifactStaleAfterHours,
  });

  const captureConfig = (loaded.captureHealth ?? {}) as Record<string, unknown>;
  const sampling = buildSamplingSemantics(captureConfig);

  const researchSuitability = evaluateResearchSuitability({
    durations,
    validBookMetrics,
    suspension,
    connection: connectionAttribution,
    downstreamArtifacts,
    throttleMs: sampling.topOfBookThrottleMs,
    watchdog: readWatchdogSummary(loaded.captureHealth),
  });

  const overall = resolveOverallVerdict(researchSuitability);
  const warnings = [
    ...loaded.loadWarnings,
    ...durations.warnings,
    ...suspension.warnings,
    ...downstreamArtifacts.flatMap((artifact) => [...artifact.warnings]),
  ];

  const summary = {
    selectedRunId,
    selectedRunDirectory: captureRunDir,
    sourceRunIds: [selectedRunId],
    recordsScanned: loaded.topOfBookRecords.length,
    comparisonMode: "full" as const,
    overallVerdict: overall.verdict,
    recommendedNextAction: overall.recommendedNextAction,
    warnings,
  };

  const reconciliation: CaptureHealthReconciliationReport = {
    generatedAt: input.generatedAt,
    analysisVersion: CAPTURE_HEALTH_RECONCILIATION_VERSION,
    disclaimer: CAPTURE_HEALTH_RECONCILIATION_DISCLAIMER,
    outputPath: input.reconciliationOutputPath,
    htmlOutputPath: input.reconciliationHtmlOutputPath,
    config: input.config,
    captureConfig,
    summary,
    durations,
    validBookMetrics,
    suspension,
    connectionAttribution,
    sampling,
    downstreamArtifacts,
    researchSuitability,
  };

  const timeline: CaptureTimelineAttributionReport = {
    generatedAt: input.generatedAt,
    analysisVersion: CAPTURE_HEALTH_RECONCILIATION_VERSION,
    disclaimer: CAPTURE_HEALTH_RECONCILIATION_DISCLAIMER,
    outputPath: input.timelineOutputPath,
    htmlOutputPath: input.timelineHtmlOutputPath,
    summary,
    suspension,
    connectionAttribution,
    durations,
    researchSuitability,
  };

  return { reconciliation, timeline };
}
