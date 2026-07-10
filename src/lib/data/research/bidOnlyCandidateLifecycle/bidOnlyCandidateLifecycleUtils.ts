import {
  median,
  percentile,
} from "../forwardCaptureReadiness/forwardCaptureReadinessMath";
import type { BidOnlyParityClassification } from "../staticParityScan/classifyBidOnlyParitySnapshot";

export function joinPath(root: string, child: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${child}`;
}

export function parseIsoTimestampMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function classificationFamily(classification: string): string {
  switch (classification) {
    case "bid-only-gross-candidate":
      return "gross-candidate";
    case "bid-only-buffer-adjusted-candidate":
      return "buffer-adjusted-candidate";
    case "bid-only-watch":
      return "watch";
    case "bid-only-no-signal":
      return "no-signal";
    case "bid-only-insufficient-depth":
      return "insufficient-depth";
    case "bid-only-invalid-price":
      return "invalid-price";
    default:
      return "unknown";
  }
}

export function isBidOnlyCandidateClassification(classification: string): boolean {
  return (
    classification === "bid-only-watch"
    || classification === "bid-only-gross-candidate"
    || classification === "bid-only-buffer-adjusted-candidate"
  );
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function stabilityScore(values: readonly number[]): number | null {
  if (values.length < 2) {
    return values.length === 1 ? 1 : null;
  }

  const avg = mean(values);
  if (avg === null || avg === 0) {
    return null;
  }

  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  const coefficientOfVariation = Math.sqrt(variance) / Math.abs(avg);
  return Math.max(0, Math.min(1, 1 - coefficientOfVariation));
}

export { median, percentile };

export function resolveTimeToCloseBucket(timeToCloseMs: number | null): import("./bidOnlyCandidateLifecycleTypes").TimeToCloseBucket {
  if (timeToCloseMs === null || !Number.isFinite(timeToCloseMs)) {
    return "unknown";
  }

  const minutes = timeToCloseMs / 60_000;
  if (minutes < 1) {
    return "0-1m";
  }
  if (minutes < 3) {
    return "1-3m";
  }
  if (minutes < 5) {
    return "3-5m";
  }
  if (minutes < 10) {
    return "5-10m";
  }
  if (minutes <= 15) {
    return "10-15m";
  }

  return "unknown";
}

export function resolveBtcMoveBucket(moveUsd: number | null): import("./bidOnlyCandidateLifecycleTypes").BtcMoveBucket {
  if (moveUsd === null || !Number.isFinite(moveUsd)) {
    return "unknown";
  }

  const abs = Math.abs(moveUsd);
  if (abs < 5) {
    return "flat";
  }
  if (abs < 25) {
    return moveUsd > 0 ? "small-up" : "small-down";
  }
  if (abs < 100) {
    return moveUsd > 0 ? "moderate-up" : "moderate-down";
  }

  return moveUsd > 0 ? "large-up" : "large-down";
}

export function frictionFromLifecycleConfig(
  config: import("./bidOnlyCandidateLifecycleTypes").BidOnlyCandidateLifecycleConfig,
) {
  return {
    pricingModel: config.pricingModel,
    feeBufferCents: config.feeBufferCents,
    minGrossEdgeCents: config.minGrossEdgeCents,
    minBidOnlyEdgeCents: config.minBidOnlyEdgeCents,
    minSizeContracts: config.minSizeContracts,
    requireBothSidesPresent: true,
    requireExecutableConfirmation: config.requireExecutableConfirmation,
  } as const;
}

export type { BidOnlyParityClassification };
