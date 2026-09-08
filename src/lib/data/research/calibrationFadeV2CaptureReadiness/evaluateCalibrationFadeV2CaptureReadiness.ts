import { parseIsoTimestampMs } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleUtils";
import { isTerminalCaptureRunState } from "@/lib/data/live/forwardQuoteCapture/captureRunStatus";
import { isRecord, readString } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";
import {
  CalibrationFadeV2PreregistrationError,
  isProspectiveConfirmatoryEvidenceEligible,
  requireFinalizedFreezeBoundary,
} from "../calibrationFadeV2Preregistration";

import {
  CALIBRATION_FADE_V2_CAPTURE_READINESS_CLASSIFICATION,
  CALIBRATION_FADE_V2_CAPTURE_READINESS_DISCLAIMER,
  CALIBRATION_FADE_V2_CAPTURE_READINESS_SCHEMA_VERSION,
  CalibrationFadeV2CaptureReadinessError,
  V2_CAPTURE_READINESS_VERDICT_PRECEDENCE,
  V2_READINESS_ADJACENT_SOURCE_GAP_POLICY,
  V2_READINESS_REQUIRED_CLOSE_COUNT,
  V2_READINESS_REQUIRED_GRANULARITY_MS,
  V2_READINESS_REQUIRED_PRODUCT_ID,
  V2_READINESS_REQUIRED_PROVIDER,
  V2_READINESS_REQUIRED_SOURCE,
  V2_READINESS_REQUIRED_SOURCE_RECORD_TYPE,
  type CalibrationFadeV2CaptureReadinessConfig,
  type CalibrationFadeV2CaptureReadinessIo,
  type CalibrationFadeV2CaptureReadinessOutputPaths,
  type CalibrationFadeV2CaptureReadinessRecommendedAction,
  type CalibrationFadeV2CaptureReadinessReport,
  type CalibrationFadeV2CaptureReadinessVerdict,
} from "./calibrationFadeV2CaptureReadinessTypes";
import {
  identifiesSelectedCandleWriterFailure,
  loadCalibrationFadeV2CaptureReadinessInputs,
  type CalibrationFadeV2CaptureReadinessInputs,
} from "./loadCalibrationFadeV2CaptureReadinessInputs";
import { parseStrictLiveCandleObservation } from "./parseStrictLiveCandleObservation";
import {
  isParseableReadinessQuoteRow,
  isParseableReadinessSpotRow,
  probeJsonlForFirstValidRecord,
} from "./probeQuoteAndSpotSources";

const VERDICT_REASONS: Record<Exclude<CalibrationFadeV2CaptureReadinessVerdict, "v2-capture-ready">, readonly string[]> = {
  "v2-run-identity-invalid": [
    "capture-run-dir-missing",
    "selected-run-id-invalid",
    "status-missing-or-unparseable",
    "status-run-id-mismatch",
    "health-unparseable",
    "health-run-id-mismatch",
    "conflicting-run-identity",
  ],
  "v2-capture-not-terminal": [
    "status-not-terminal",
    "status-ended-at-missing",
    "selected-run-lock-present",
  ],
  "v2-capture-started-at-unavailable": [
    "capture-started-at-missing",
    "capture-started-at-unparseable",
    "health-status-started-at-disagreement",
  ],
  "v2-candle-source-unavailable": [
    "candle-artifact-missing",
    "candle-artifact-empty",
  ],
  "v2-candle-identity-invalid": [
    "candle-jsonl-malformed",
    "candle-run-id-missing",
    "candle-run-id-mismatch",
    "candle-run-id-mixed",
    "candle-process-epoch-missing",
    "candle-process-epoch-mixed",
    "candle-health-epoch-mismatch",
    "candle-provider-invalid",
    "candle-product-invalid",
    "candle-source-record-type-invalid",
    "candle-source-alias-rejected",
    "candle-granularity-invalid",
    "candle-open-close-invalid",
    "candle-close-offset-invalid",
    "candle-in-progress",
    "candle-observer-clock-invalid",
    "candle-first-observation-clock-mismatch",
    "candle-ohlc-invalid",
    "candle-close-identity-conflict",
    "candle-writer-durability-failure",
  ],
  "v2-quote-source-unavailable": [
    "quote-artifact-missing",
    "quote-artifact-empty",
    "quote-artifact-unparseable-only",
  ],
  "v2-spot-join-source-unavailable": [
    "spot-artifact-missing",
    "spot-artifact-empty",
    "spot-artifact-unparseable-only",
  ],
  "v2-prospective-boundary-ineligible": [
    "freeze-identity-not-finalized",
    "capture-started-at-or-before-freeze",
  ],
  "v2-capture-diagnostic-only": [
    "insufficient-distinct-completed-minutes",
  ],
};

function addReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function verdictForReason(reason: string): CalibrationFadeV2CaptureReadinessVerdict | null {
  for (const verdict of V2_CAPTURE_READINESS_VERDICT_PRECEDENCE) {
    if (verdict === "v2-capture-ready") {
      continue;
    }
    if ((VERDICT_REASONS[verdict] as readonly string[]).includes(reason)) {
      return verdict;
    }
  }
  return null;
}

export function selectPrimaryReadinessVerdict(
  blockingReasons: readonly string[],
): CalibrationFadeV2CaptureReadinessVerdict {
  if (blockingReasons.length === 0) {
    return "v2-capture-ready";
  }
  for (const verdict of V2_CAPTURE_READINESS_VERDICT_PRECEDENCE) {
    if (verdict === "v2-capture-ready") {
      continue;
    }
    const mapped = VERDICT_REASONS[verdict];
    if (blockingReasons.some((reason) => (mapped as readonly string[]).includes(reason))) {
      return verdict;
    }
  }
  return "v2-run-identity-invalid";
}

export function recommendedActionForVerdict(
  verdict: CalibrationFadeV2CaptureReadinessVerdict,
): CalibrationFadeV2CaptureReadinessRecommendedAction {
  if (verdict === "v2-capture-ready") {
    return "evaluate-exact-run-under-governed-evidence-mode";
  }
  if (verdict === "v2-capture-diagnostic-only" || verdict === "v2-prospective-boundary-ineligible") {
    return "diagnostic-evaluator-only";
  }
  return "repair-producer-or-input-selection-before-evaluation";
}

function collectIdentityReasons(inputs: CalibrationFadeV2CaptureReadinessInputs, reasons: string[]): void {
  if (!inputs.selectedRunId) {
    addReason(reasons, "selected-run-id-invalid");
  }
  if (!inputs.directoryExists) {
    addReason(reasons, "capture-run-dir-missing");
  }
  if (!inputs.statusPresent || inputs.status === null) {
    addReason(reasons, "status-missing-or-unparseable");
  } else if (inputs.status.runId !== inputs.selectedRunId) {
    addReason(reasons, "status-run-id-mismatch");
  }
  if (inputs.healthPresent) {
    if (!inputs.health || !inputs.health.parseable) {
      addReason(reasons, "health-unparseable");
    } else if (!inputs.health.runId || inputs.health.runId !== inputs.selectedRunId) {
      addReason(reasons, "health-run-id-mismatch");
    }
  }
  if (
    inputs.status
    && inputs.health?.parseable
    && inputs.health.runId
    && inputs.status.runId !== inputs.health.runId
  ) {
    addReason(reasons, "conflicting-run-identity");
  }
}

function collectTerminalReasons(inputs: CalibrationFadeV2CaptureReadinessInputs, reasons: string[]): void {
  if (inputs.status) {
    if (!isTerminalCaptureRunState(inputs.status.state)) {
      addReason(reasons, "status-not-terminal");
    }
    if (!inputs.status.endedAt) {
      addReason(reasons, "status-ended-at-missing");
    }
  }
  if (inputs.lockPresent && inputs.lockRunId === inputs.selectedRunId) {
    addReason(reasons, "selected-run-lock-present");
  }
}

function resolveCaptureStartedAt(inputs: CalibrationFadeV2CaptureReadinessInputs, reasons: string[]): string | null {
  const statusStartedAt = inputs.status?.startedAt ?? null;
  const healthStartedAt = inputs.health?.parseable ? inputs.health.startedAt : null;

  if (!statusStartedAt && !healthStartedAt) {
    addReason(reasons, "capture-started-at-missing");
    return null;
  }

  const statusMs = statusStartedAt ? parseIsoTimestampMs(statusStartedAt) : null;
  const healthMs = healthStartedAt ? parseIsoTimestampMs(healthStartedAt) : null;

  if (statusStartedAt && statusMs === null) {
    addReason(reasons, "capture-started-at-unparseable");
  }
  if (healthStartedAt && healthMs === null) {
    addReason(reasons, "capture-started-at-unparseable");
  }
  if (statusStartedAt && healthStartedAt && statusMs !== null && healthMs !== null && statusMs !== healthMs) {
    addReason(reasons, "health-status-started-at-disagreement");
    return null;
  }
  if (statusMs === null && healthMs === null) {
    return null;
  }
  return statusStartedAt ?? healthStartedAt;
}

async function inspectCandles(input: {
  io: CalibrationFadeV2CaptureReadinessIo;
  inputs: CalibrationFadeV2CaptureReadinessInputs;
  reasons: string[];
}): Promise<{
  candleRecordCount: number;
  distinctValidCompletedMinutes: number;
  candleProcessEpochId: string | null;
}> {
  const { io, inputs, reasons } = input;
  if (identifiesSelectedCandleWriterFailure({ status: inputs.status, health: inputs.health })) {
    addReason(reasons, "candle-writer-durability-failure");
  }

  if (!io.fileExists(inputs.candleArtifactPath)) {
    addReason(reasons, "candle-artifact-missing");
    return { candleRecordCount: 0, distinctValidCompletedMinutes: 0, candleProcessEpochId: null };
  }

  const closeByOpen = new Map<number, number>();
  const rawCloseByOpen = new Map<string, string>();
  const validOpenTimes = new Set<number>();
  const runIds = new Set<string>();
  const epochs = new Set<string>();
  let candleRecordCount = 0;
  let malformed = false;

  await io.iterateJsonl(inputs.candleArtifactPath, {
    onLine: (line) => {
      candleRecordCount += 1;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        malformed = true;
        addReason(reasons, "candle-jsonl-malformed");
        return "continue";
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        malformed = true;
        addReason(reasons, "candle-jsonl-malformed");
        return "continue";
      }

      if (isRecord(parsed)) {
        const rawOpen = readString(parsed.candleOpenTime);
        const rawClose = readString(parsed.candleCloseTime);
        if (rawOpen && rawClose) {
          const existingRawClose = rawCloseByOpen.get(rawOpen);
          if (existingRawClose && existingRawClose !== rawClose) {
            addReason(reasons, "candle-close-identity-conflict");
          } else if (!existingRawClose) {
            rawCloseByOpen.set(rawOpen, rawClose);
          }
        }
      }

      const result = parseStrictLiveCandleObservation(parsed);
      if (!result.ok) {
        addReason(reasons, result.reason);
        return "continue";
      }

      const record = result.record;
      runIds.add(record.runId);
      epochs.add(record.processEpochId);

      if (record.runId !== inputs.selectedRunId) {
        addReason(reasons, "candle-run-id-mismatch");
      }

      const existingClose = closeByOpen.get(record.openTimeMs);
      if (existingClose !== undefined && existingClose !== record.closeTimeMs) {
        addReason(reasons, "candle-close-identity-conflict");
      } else {
        closeByOpen.set(record.openTimeMs, record.closeTimeMs);
      }
      validOpenTimes.add(record.openTimeMs);
      return "continue";
    },
  });

  if (!malformed && candleRecordCount === 0) {
    addReason(reasons, "candle-artifact-empty");
    return { candleRecordCount: 0, distinctValidCompletedMinutes: 0, candleProcessEpochId: null };
  }

  if (runIds.size > 1) {
    addReason(reasons, "candle-run-id-mixed");
  }
  if (epochs.size > 1) {
    addReason(reasons, "candle-process-epoch-mixed");
  }

  const candleProcessEpochId = epochs.size === 1 ? [...epochs][0]! : null;
  if (
    candleProcessEpochId
    && inputs.health?.processEpochId
    && inputs.health.processEpochId !== candleProcessEpochId
  ) {
    addReason(reasons, "candle-health-epoch-mismatch");
  }

  const identityBlocked = reasons.some((reason) =>
    (VERDICT_REASONS["v2-candle-identity-invalid"] as readonly string[]).includes(reason)
    || (VERDICT_REASONS["v2-candle-source-unavailable"] as readonly string[]).includes(reason),
  );
  if (
    !identityBlocked
    && validOpenTimes.size < V2_READINESS_REQUIRED_CLOSE_COUNT
  ) {
    addReason(reasons, "insufficient-distinct-completed-minutes");
  }

  return {
    candleRecordCount,
    distinctValidCompletedMinutes: validOpenTimes.size,
    candleProcessEpochId,
  };
}

function collectBoundaryReasons(input: {
  inputs: CalibrationFadeV2CaptureReadinessInputs;
  captureStartedAt: string | null;
  reasons: string[];
  freezeLoadError: string | null;
}): { freezeCommitSha: string | null; freezeTimestamp: string | null; confirmatoryEligibility: boolean } {
  if (input.freezeLoadError) {
    addReason(input.reasons, "freeze-identity-not-finalized");
    return { freezeCommitSha: null, freezeTimestamp: null, confirmatoryEligibility: false };
  }

  try {
    const freezeBoundary = requireFinalizedFreezeBoundary(input.inputs.provenance);
    const confirmatoryEligibility = input.captureStartedAt
      ? isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary,
        runStartIso: input.captureStartedAt,
        runId: input.inputs.selectedRunId,
      })
      : false;
    if (input.captureStartedAt && !confirmatoryEligibility) {
      addReason(input.reasons, "capture-started-at-or-before-freeze");
    }
    return {
      freezeCommitSha: freezeBoundary.freezeCommitSha,
      freezeTimestamp: freezeBoundary.freezeTimestamp,
      confirmatoryEligibility,
    };
  } catch (error) {
    if (error instanceof CalibrationFadeV2PreregistrationError) {
      addReason(input.reasons, "freeze-identity-not-finalized");
      return {
        freezeCommitSha: input.inputs.provenance.prospectiveEvidenceBoundary.freezeCommitSha,
        freezeTimestamp: input.inputs.provenance.prospectiveEvidenceBoundary.freezeTimestamp,
        confirmatoryEligibility: false,
      };
    }
    throw error;
  }
}

export async function evaluateCalibrationFadeV2CaptureReadiness(input: {
  generatedAt: string;
  config: CalibrationFadeV2CaptureReadinessConfig;
  paths: CalibrationFadeV2CaptureReadinessOutputPaths;
  io: CalibrationFadeV2CaptureReadinessIo;
}): Promise<CalibrationFadeV2CaptureReadinessReport> {
  const reasons: string[] = [];
  let inputs: CalibrationFadeV2CaptureReadinessInputs | null = null;
  let freezeLoadError: string | null = null;

  try {
    inputs = loadCalibrationFadeV2CaptureReadinessInputs({
      io: input.io,
      captureRunDir: input.config.captureRunDir,
      hypothesisConfigPath: input.config.hypothesisConfigPath,
      provenancePath: input.config.provenancePath,
    });
  } catch (error) {
    if (error instanceof CalibrationFadeV2PreregistrationError) {
      freezeLoadError = error.message;
    } else {
      throw error;
    }
  }

  if (!inputs) {
    throw new CalibrationFadeV2CaptureReadinessError(
      freezeLoadError ?? "Failed to load v2 capture readiness inputs",
    );
  }

  collectIdentityReasons(inputs, reasons);
  collectTerminalReasons(inputs, reasons);
  const captureStartedAt = resolveCaptureStartedAt(inputs, reasons);

  const candleInspection = await inspectCandles({ io: input.io, inputs, reasons });

  const quoteProbe = await probeJsonlForFirstValidRecord({
    io: input.io,
    path: inputs.quoteArtifactPath,
    isValid: isParseableReadinessQuoteRow,
  });
  if (!quoteProbe.artifactPresent) {
    addReason(reasons, "quote-artifact-missing");
  } else if (quoteProbe.nonblankLineCount === 0) {
    addReason(reasons, "quote-artifact-empty");
  } else if (quoteProbe.parseableRecordCount === 0) {
    addReason(reasons, "quote-artifact-unparseable-only");
  }

  const requireBtcJoin = inputs.spec.marketEligibilityRules.requireBtcJoin;
  const spotProbe = await probeJsonlForFirstValidRecord({
    io: input.io,
    path: inputs.spotArtifactPath,
    isValid: isParseableReadinessSpotRow,
  });
  if (requireBtcJoin) {
    if (!spotProbe.artifactPresent) {
      addReason(reasons, "spot-artifact-missing");
    } else if (spotProbe.nonblankLineCount === 0) {
      addReason(reasons, "spot-artifact-empty");
    } else if (spotProbe.parseableRecordCount === 0) {
      addReason(reasons, "spot-artifact-unparseable-only");
    }
  }

  const boundary = collectBoundaryReasons({
    inputs,
    captureStartedAt,
    reasons,
    freezeLoadError,
  });

  const orderedReasons = [...reasons].sort((left, right) => {
    const leftVerdict = verdictForReason(left);
    const rightVerdict = verdictForReason(right);
    const leftIndex = leftVerdict
      ? V2_CAPTURE_READINESS_VERDICT_PRECEDENCE.indexOf(leftVerdict)
      : Number.MAX_SAFE_INTEGER;
    const rightIndex = rightVerdict
      ? V2_CAPTURE_READINESS_VERDICT_PRECEDENCE.indexOf(rightVerdict)
      : Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    return left.localeCompare(right);
  });

  const verdict = selectPrimaryReadinessVerdict(orderedReasons);

  return {
    schemaVersion: CALIBRATION_FADE_V2_CAPTURE_READINESS_SCHEMA_VERSION,
    classification: CALIBRATION_FADE_V2_CAPTURE_READINESS_CLASSIFICATION,
    disclaimer: CALIBRATION_FADE_V2_CAPTURE_READINESS_DISCLAIMER,
    generatedAt: input.generatedAt,
    selectedRunId: inputs.selectedRunId,
    captureRunDir: inputs.captureRunDir,
    verdict,
    blockingReasons: orderedReasons,
    captureStartedAt,
    captureEndedAt: inputs.status?.endedAt ?? null,
    captureTerminalState: inputs.status?.state ?? null,
    freezeCommitSha: boundary.freezeCommitSha,
    freezeTimestamp: boundary.freezeTimestamp,
    confirmatoryEligibility: boundary.confirmatoryEligibility,
    candleArtifactPath: inputs.candleArtifactPath,
    candleRecordCount: candleInspection.candleRecordCount,
    distinctValidCompletedMinutes: candleInspection.distinctValidCompletedMinutes,
    candleProcessEpochId: candleInspection.candleProcessEpochId,
    quoteArtifactPath: inputs.quoteArtifactPath,
    parseableQuoteRecordCount: quoteProbe.parseableRecordCount,
    quoteProbe,
    spotArtifactPath: requireBtcJoin ? inputs.spotArtifactPath : inputs.spotArtifactPath,
    parseableSpotRecordCount: spotProbe.parseableRecordCount,
    spotProbe,
    sourceContract: {
      provider: V2_READINESS_REQUIRED_PROVIDER,
      productId: V2_READINESS_REQUIRED_PRODUCT_ID,
      sourceRecordType: V2_READINESS_REQUIRED_SOURCE_RECORD_TYPE,
      source: V2_READINESS_REQUIRED_SOURCE,
      granularityMs: V2_READINESS_REQUIRED_GRANULARITY_MS,
      requiredCloseCount: V2_READINESS_REQUIRED_CLOSE_COUNT,
      adjacentSourceGapPolicy: V2_READINESS_ADJACENT_SOURCE_GAP_POLICY,
      maximumSourceGapMs: inputs.spec.volatilityDefinition.maximumSourceGapMs,
      requireBtcJoin,
    },
    recommendedNextAction: recommendedActionForVerdict(verdict),
    jsonOutputPath: input.paths.jsonOutputPath,
    htmlOutputPath: input.paths.htmlOutputPath,
  };
}
