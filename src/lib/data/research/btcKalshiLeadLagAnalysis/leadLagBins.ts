import type { BtcMagnitudeBin, BtcReturnHorizonMs, ImpliedProbabilityBin, TimeRemainingBin } from "./btcKalshiLeadLagAnalysisTypes";

const MAGNITUDE_BOUNDARIES_BPS = [5, 10, 20, 40] as const;

export function resolveBtcMagnitudeBin(absoluteBtcReturnBps: number): BtcMagnitudeBin {
  if (absoluteBtcReturnBps < 5) {
    return "less-than-5-bps";
  }
  if (absoluteBtcReturnBps < 10) {
    return "5-to-10-bps";
  }
  if (absoluteBtcReturnBps < 20) {
    return "10-to-20-bps";
  }
  if (absoluteBtcReturnBps < 40) {
    return "20-to-40-bps";
  }
  return "40-bps-or-greater";
}

export function magnitudeBoundaryForBin(bin: BtcMagnitudeBin): number {
  switch (bin) {
    case "less-than-5-bps":
      return 0;
    case "5-to-10-bps":
      return 5;
    case "10-to-20-bps":
      return 10;
    case "20-to-40-bps":
      return 20;
    case "40-bps-or-greater":
      return 40;
  }
}

export function crossedMagnitudeBoundary(
  previousAbsoluteBps: number,
  currentAbsoluteBps: number,
  boundaryBps: number,
): boolean {
  return previousAbsoluteBps < boundaryBps && currentAbsoluteBps >= boundaryBps;
}

export function resolveTimeRemainingBin(timeRemainingMs: number | null): TimeRemainingBin | null {
  if (timeRemainingMs === null || timeRemainingMs < 0) {
    return null;
  }
  const minutes = timeRemainingMs / 60_000;
  if (minutes <= 1) {
    return "0-to-1-minute";
  }
  if (minutes <= 3) {
    return "1-to-3-minutes";
  }
  if (minutes <= 5) {
    return "3-to-5-minutes";
  }
  if (minutes <= 10) {
    return "5-to-10-minutes";
  }
  return "10-to-15-minutes";
}

export function resolveImpliedProbabilityBin(yesMidCents: number | null): ImpliedProbabilityBin | null {
  if (yesMidCents === null) {
    return null;
  }
  const probability = yesMidCents / 100;
  if (probability <= 0.1) {
    return "0-to-10-percent";
  }
  if (probability <= 0.3) {
    return "10-to-30-percent";
  }
  if (probability <= 0.5) {
    return "30-to-50-percent";
  }
  if (probability <= 0.7) {
    return "50-to-70-percent";
  }
  if (probability <= 0.9) {
    return "70-to-90-percent";
  }
  return "90-to-100-percent";
}

export function resolveDistanceFromThresholdBps(
  btcPriceUsd: number,
  thresholdUsd: number,
): number {
  if (thresholdUsd <= 0) {
    return 0;
  }
  return ((btcPriceUsd - thresholdUsd) / thresholdUsd) * 10_000;
}

export function horizonLabel(horizonMs: BtcReturnHorizonMs): string {
  return `${horizonMs / 1000}s`;
}

export function responseWindowLabel(windowMs: number): string {
  if (windowMs === 0) {
    return "0s";
  }
  return `${windowMs / 1000}s`;
}

export { MAGNITUDE_BOUNDARIES_BPS };
