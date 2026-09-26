/**
 * Day-cluster CR2 mean + two-sided 95% CI for pilot uncertainty.
 */

import { computeM16Cr2ClusterMeanInference } from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16Cr2ClusterMean";
import { studentTCdf } from "@/lib/data/research/statisticalSignificance/studentTTest";

import type { PilotUncertainty, SimulatedTrade } from "./types";

function studentTCriticalValue(df: number, twoSidedAlpha = 0.05): number {
  // Simple binary search on Student-t CDF for two-sided critical value.
  let lo = 0;
  let hi = 40;
  const target = 1 - twoSidedAlpha / 2;
  for (let i = 0; i < 64; i += 1) {
    const mid = (lo + hi) / 2;
    const cdf = studentTCdf(mid, df);
    if (cdf < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

export function summarizePrimaryUncertainty(
  trades: readonly SimulatedTrade[],
): PilotUncertainty {
  const included = trades.filter((t) => !t.excluded && t.controlKind === "primary");
  if (included.length === 0) {
    return {
      method: "cr2-cluster-robust-day-mean-two-sided-95ci",
      n: 0,
      g: 0,
      degreesOfFreedom: null,
      meanNetPnlCents: null,
      cr2StandardError: null,
      ciLowCents: null,
      ciHighCents: null,
    };
  }

  try {
    const inference = computeM16Cr2ClusterMeanInference(
      included.map((t) => ({
        clusterKey: t.utcDay,
        valueCents: t.netPnlCents,
      })),
    );
    const critical = studentTCriticalValue(inference.degreesOfFreedom);
    const half = critical * inference.cr2StandardError;
    return {
      method: "cr2-cluster-robust-day-mean-two-sided-95ci",
      n: inference.n,
      g: inference.g,
      degreesOfFreedom: inference.degreesOfFreedom,
      meanNetPnlCents: inference.sampleMeanCents,
      cr2StandardError: inference.cr2StandardError,
      ciLowCents: inference.sampleMeanCents - half,
      ciHighCents: inference.sampleMeanCents + half,
    };
  } catch {
    const mean =
      included.reduce((sum, t) => sum + t.netPnlCents, 0) / included.length;
    return {
      method: "cr2-cluster-robust-day-mean-two-sided-95ci",
      n: included.length,
      g: new Set(included.map((t) => t.utcDay)).size,
      degreesOfFreedom: null,
      meanNetPnlCents: mean,
      cr2StandardError: null,
      ciLowCents: null,
      ciHighCents: null,
    };
  }
}
