import {
  computeM16Cr2ClusterMeanInference,
  M16_CR2_INFERENCE_METHOD,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16Cr2ClusterMean";
import { studentTCdf } from "@/lib/data/research/statisticalSignificance/studentTTest";

import type { Cr2TwoSidedInference, DayClusterStats, EvaluableTrade } from "./types";

/** Two-sided Student-t critical value via CDF binary search (df = G−1). */
export function studentTCriticalTwoSided95(degreesOfFreedom: number): number {
  if (degreesOfFreedom < 1) {
    throw new Error("studentTCriticalTwoSided95 requires df >= 1");
  }
  const target = 0.975;
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, degreesOfFreedom) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function buildDayClusterStats(
  trades: readonly EvaluableTrade[],
): DayClusterStats[] {
  const byDay = new Map<string, number[]>();
  for (const trade of trades) {
    const list = byDay.get(trade.utcDayKey) ?? [];
    list.push(trade.netPnlCents);
    byDay.set(trade.utcDayKey, list);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([utcDayKey, values]) => {
      const total = values.reduce((s, v) => s + v, 0);
      return {
        utcDayKey,
        marketCount: values.length,
        meanNetPnlCents: total / values.length,
        totalNetPnlCents: total,
      };
    });
}

export function leaveOneDayOutMeans(
  trades: readonly EvaluableTrade[],
): Array<{ heldOutUtcDayKey: string; meanNetPnlCents: number; nRemaining: number }> {
  const days = [...new Set(trades.map((t) => t.utcDayKey))].sort();
  return days.map((heldOut) => {
    const remaining = trades.filter((t) => t.utcDayKey !== heldOut);
    const mean =
      remaining.length === 0
        ? Number.NaN
        : remaining.reduce((s, t) => s + t.netPnlCents, 0) / remaining.length;
    return {
      heldOutUtcDayKey: heldOut,
      meanNetPnlCents: mean,
      nRemaining: remaining.length,
    };
  });
}

/**
 * CR2 cluster-robust SE with two-sided 95% CI (df = G−1).
 * Reuses the validated M16 CR2 intercept-only implementation for SE;
 * CI is mean ± t_{G−1, 0.975} × SE — not an IID / row-level SE.
 */
export function computeCr2TwoSidedMeanInference(
  trades: readonly EvaluableTrade[],
): Cr2TwoSidedInference {
  const cr2 = computeM16Cr2ClusterMeanInference(
    trades.map((t) => ({
      clusterKey: t.utcDayKey,
      valueCents: t.netPnlCents,
    })),
  );
  const tCriticalTwoSided95 = studentTCriticalTwoSided95(cr2.degreesOfFreedom);
  const half = tCriticalTwoSided95 * cr2.cr2StandardError;
  return {
    method: M16_CR2_INFERENCE_METHOD,
    n: cr2.n,
    g: cr2.g,
    degreesOfFreedom: cr2.degreesOfFreedom,
    sampleMeanCents: cr2.sampleMeanCents,
    cr2StandardError: cr2.cr2StandardError,
    tStatistic: cr2.tStatistic,
    tCriticalTwoSided95,
    ci95LowerCents: cr2.sampleMeanCents - half,
    ci95UpperCents: cr2.sampleMeanCents + half,
    workingModel:
      "Intercept-only mean of market-level net P&L cents; clusters = utcDayKey; "
      + "CR2 sandwich variance from M16 computeM16Cr2ClusterMeanInference; "
      + "two-sided 95% CI uses Student-t critical value with df = G−1. "
      + "Not labeled as ordinary row-level SE.",
  };
}
