import type {
  CaptureHealthAuditConfig,
  CaptureReadinessNextAction,
  CaptureReadinessVerdict,
} from "./captureHealthAuditTypes";
import type { ComputedCaptureMetrics } from "./computeCaptureHealthMetrics";
import type { LoadedCaptureRunArtifacts } from "./loadCaptureRunArtifacts";

export type CaptureReadinessEvaluation = {
  verdict: CaptureReadinessVerdict;
  recommendedNextAction: CaptureReadinessNextAction;
  blockingReasons: string[];
};

function resolveNextAction(verdict: CaptureReadinessVerdict): CaptureReadinessNextAction {
  switch (verdict) {
    case "capture-research-ready":
      return "proceed-offline-microstructure-research";
    case "capture-too-short":
      return "extend-capture-duration";
    case "capture-gappy":
      return "fix-capture-gaps";
    case "capture-no-btc-spot":
      return "enable-or-fix-btc-spot-capture";
    case "capture-zero-spread-suspicious":
      return "investigate-zero-spread-quotes";
    case "capture-empty":
      return "rerun-forward-capture";
    case "capture-invalid":
    default:
      return "inspect-capture-artifacts";
  }
}

/** Evaluates capture readiness verdict from loaded artifacts and computed metrics. */
export function evaluateCaptureReadinessVerdict(input: {
  config: CaptureHealthAuditConfig;
  loaded: LoadedCaptureRunArtifacts;
  metrics: ComputedCaptureMetrics;
}): CaptureReadinessEvaluation {
  const { config, loaded, metrics } = input;
  const thresholds = config.thresholds;
  const blockingReasons: string[] = [];

  const topOfBookCount = loaded.topOfBookRecords.length;
  const rawCount = loaded.rawMessageCount;

  if (topOfBookCount === 0 && rawCount === 0) {
    return {
      verdict: "capture-empty",
      recommendedNextAction: resolveNextAction("capture-empty"),
      blockingReasons: ["No raw messages or top-of-book records found."],
    };
  }

  if (!loaded.artifacts.topOfBookPath || topOfBookCount === 0) {
    blockingReasons.push("Top-of-book artifact is missing or empty.");
    return {
      verdict: "capture-invalid",
      recommendedNextAction: resolveNextAction("capture-invalid"),
      blockingReasons,
    };
  }

  if (loaded.topOfBookInvalidLineCount > 0 && loaded.topOfBookInvalidLineCount >= topOfBookCount) {
    blockingReasons.push("Top-of-book JSONL could not be parsed.");
    return {
      verdict: "capture-invalid",
      recommendedNextAction: resolveNextAction("capture-invalid"),
      blockingReasons,
    };
  }

  const durationSeconds = metrics.runDurationSeconds;
  if (durationSeconds === null || durationSeconds < thresholds.minDurationSeconds) {
    blockingReasons.push(
      `Run duration ${durationSeconds ?? "unknown"}s is below ${thresholds.minDurationSeconds}s minimum.`,
    );
    return {
      verdict: "capture-too-short",
      recommendedNextAction: resolveNextAction("capture-too-short"),
      blockingReasons,
    };
  }

  const validBookShare = metrics.bookState.validBookShare;
  const p90Gap = metrics.continuity.p90TopOfBookGapMs;
  const isGappy =
    (p90Gap !== null && p90Gap > thresholds.maxP90TopOfBookGapMs)
    || (validBookShare !== null && validBookShare < thresholds.minValidBookShare);

  if (isGappy) {
    if (p90Gap !== null && p90Gap > thresholds.maxP90TopOfBookGapMs) {
      blockingReasons.push(
        `P90 top-of-book gap ${p90Gap}ms exceeds ${thresholds.maxP90TopOfBookGapMs}ms.`,
      );
    }
    if (validBookShare !== null && validBookShare < thresholds.minValidBookShare) {
      blockingReasons.push(
        `Valid book share ${validBookShare} is below ${thresholds.minValidBookShare}.`,
      );
    }

    return {
      verdict: "capture-gappy",
      recommendedNextAction: resolveNextAction("capture-gappy"),
      blockingReasons,
    };
  }

  if (metrics.btcJoin.btcSpotRequested) {
    const joinCoverage = metrics.btcJoin.joinCoverageShare;
    if (
      joinCoverage === null
      || joinCoverage < thresholds.minBtcJoinCoverageShare
      || metrics.btcJoin.btcSpotRecordCount === 0
    ) {
      blockingReasons.push(
        `BTC spot join coverage ${joinCoverage ?? 0} is below ${thresholds.minBtcJoinCoverageShare}.`,
      );
      return {
        verdict: "capture-no-btc-spot",
        recommendedNextAction: resolveNextAction("capture-no-btc-spot"),
        blockingReasons,
      };
    }
  }

  const zeroSpreadShare = metrics.spread.zeroSpreadShare;
  if (zeroSpreadShare !== null && zeroSpreadShare > thresholds.maxZeroSpreadShare) {
    blockingReasons.push(
      `Zero spread share ${zeroSpreadShare} exceeds ${thresholds.maxZeroSpreadShare}.`,
    );
    return {
      verdict: "capture-zero-spread-suspicious",
      recommendedNextAction: resolveNextAction("capture-zero-spread-suspicious"),
      blockingReasons,
    };
  }

  const nonZeroSpreadShare = metrics.spread.nonZeroSpreadShare;
  if (nonZeroSpreadShare === null || nonZeroSpreadShare <= 0) {
    blockingReasons.push("No non-zero spread observations were found.");
    return {
      verdict: "capture-zero-spread-suspicious",
      recommendedNextAction: resolveNextAction("capture-zero-spread-suspicious"),
      blockingReasons,
    };
  }

  return {
    verdict: "capture-research-ready",
    recommendedNextAction: resolveNextAction("capture-research-ready"),
    blockingReasons: [],
  };
}
