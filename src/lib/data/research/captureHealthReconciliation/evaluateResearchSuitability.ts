import type {
  ConnectionAttributionSummary,
  DownstreamArtifactScopeCheck,
  DurationMetrics,
  ResearchSuitabilityAssessment,
  ResearchSuitabilityVerdict,
  SuspensionDetectionSummary,
  ValidBookMetricReconciliation,
} from "./captureHealthReconciliationTypes";

function verdictFromBlindShare(blindShare: number | null): ResearchSuitabilityVerdict {
  if (blindShare === null) {
    return "unknown";
  }

  if (blindShare <= 0.05) {
    return "ready";
  }

  if (blindShare <= 0.15) {
    return "ready-with-warnings";
  }

  if (blindShare <= 0.35) {
    return "degraded-but-usable";
  }

  return "not-ready";
}

function rawValidShare(metrics: readonly ValidBookMetricReconciliation[]): number | null {
  return metrics.find((metric) => metric.metricId === "rawTopOfBookValidShare")?.value ?? null;
}

/** Evaluates research suitability dimensions for the selected run. */
export function evaluateResearchSuitability(input: {
  durations: DurationMetrics;
  validBookMetrics: readonly ValidBookMetricReconciliation[];
  suspension: SuspensionDetectionSummary;
  connection: ConnectionAttributionSummary;
  downstreamArtifacts: readonly DownstreamArtifactScopeCheck[];
  throttleMs: number | null;
  watchdog?: {
    terminalWebSocketFailure: boolean;
    kalshiSilentWhileBtcActiveSeconds: number;
    wsRecoverySuccessCount: number;
    wsStallDetectedCount: number;
  } | null;
}): ResearchSuitabilityAssessment {
  const rationale: string[] = [];
  const eventSpan = input.durations.eventWallClockSpanSeconds ?? 0;
  const blindShare =
    eventSpan > 0 && input.durations.unknownBlindSeconds !== null
      ? input.durations.unknownBlindSeconds / eventSpan
      : null;
  const suspensionShare =
    eventSpan > 0 ? input.suspension.suspectedSystemSleepSeconds / eventSpan : null;
  const validShare = rawValidShare(input.validBookMetrics);

  if (suspensionShare !== null && suspensionShare > 0.1) {
    rationale.push(
      `Probable host suspension accounts for ~${(suspensionShare * 100).toFixed(1)}% of event span.`,
    );
  }

  if (validShare !== null && validShare < 0.9) {
    rationale.push(`Raw valid-book share is ${(validShare * 100).toFixed(1)}%.`);
  }

  const mixedScope = input.downstreamArtifacts.some(
    (artifact) => artifact.present && !artifact.matchesSelectedRun,
  );
  if (mixedScope) {
    rationale.push("Downstream artifacts include mixed-scope or stale inputs.");
  }

  if (input.watchdog?.terminalWebSocketFailure) {
    rationale.push("Explicit watchdog reported terminal WebSocket failure.");
  }

  if ((input.watchdog?.kalshiSilentWhileBtcActiveSeconds ?? 0) > 300) {
    rationale.push(
      `Kalshi stream silent for ${input.watchdog?.kalshiSilentWhileBtcActiveSeconds}s while BTC remained active.`,
    );
  }

  const explicitWatchdogDegraded =
    input.watchdog?.terminalWebSocketFailure === true
    || (input.watchdog?.kalshiSilentWhileBtcActiveSeconds ?? 0) > 300;

  const descriptiveAnalysisSuitability =
    validShare !== null && validShare >= 0.8
      ? suspensionShare !== null && suspensionShare > 0.2
        ? "ready-with-warnings"
        : "ready"
      : "degraded-but-usable";

  const continuousMicrostructureSuitability = verdictFromBlindShare(
    suspensionShare !== null && blindShare !== null
      ? Math.max(suspensionShare, blindShare)
      : suspensionShare ?? blindShare,
  );

  const throttleMs = input.throttleMs ?? 1000;
  const transientEventDetectionSuitability: ResearchSuitabilityVerdict =
    explicitWatchdogDegraded
      ? "not-ready"
      : continuousMicrostructureSuitability === "ready"
      && throttleMs <= 1000
      && (suspensionShare ?? 1) <= 0.05
        ? "ready-with-warnings"
        : continuousMicrostructureSuitability === "not-ready"
          ? "not-ready"
          : "degraded-but-usable";

  if (throttleMs >= 1000) {
    rationale.push(
      `Top-of-book throttle ${throttleMs}ms limits sub-second transient parity detection.`,
    );
  }

  const forwardPathSuitability =
    mixedScope ? "not-ready" : descriptiveAnalysisSuitability;

  let zeroCandidateInterpretation: ResearchSuitabilityAssessment["zeroCandidateInterpretation"] =
    "candidate-result-not-interpretable";

  if (mixedScope) {
    zeroCandidateInterpretation = "zero-candidates-on-mixed-scope-inputs";
  } else if (
    explicitWatchdogDegraded
    || (suspensionShare ?? 0) > 0.1
    || continuousMicrostructureSuitability === "not-ready"
  ) {
    zeroCandidateInterpretation = "zero-candidates-with-material-blind-windows";
  } else if (continuousMicrostructureSuitability === "ready" || continuousMicrostructureSuitability === "ready-with-warnings") {
    zeroCandidateInterpretation = "zero-candidates-on-clean-observation";
  }

  return {
    descriptiveAnalysisSuitability,
    continuousMicrostructureSuitability,
    transientEventDetectionSuitability,
    forwardPathSuitability,
    zeroCandidateInterpretation,
    rationale,
  };
}
