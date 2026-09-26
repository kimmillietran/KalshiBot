/**
 * Fragile exploratory CR2 summaries for G≤5 Friday-only clusters.
 */

import { computeM16Cr2ClusterMeanInference } from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16Cr2ClusterMean";
import { studentTCdf } from "@/lib/data/research/statisticalSignificance/studentTTest";

import type { PilotUncertainty, SimulatedTrade } from "./types";

const FRAGILE_NOTE =
  "G≤5 Friday-only clusters: CR2 CI is a fragile exploratory summary only. "
  + "CI lower>0 alone is not sufficient evidence to proceed to confirmation. "
  + "Distinguish negative economics, inconclusive evidence, and incomplete simulation.";

function studentTCriticalValue(df: number, twoSidedAlpha = 0.05): number {
  let lo = 0;
  let hi = 40;
  const target = 1 - twoSidedAlpha / 2;
  for (let i = 0; i < 64; i += 1) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function summarizeCompletedTradeUncertainty(
  completedEnteredTrades: readonly SimulatedTrade[],
): PilotUncertainty {
  const included = completedEnteredTrades.filter(
    (t) =>
      t.entryStatus === "entered"
      && t.exitStatus === "completed"
      && t.completedNetPnlCents !== null
      && t.controlKind === "primary",
  );

  if (included.length === 0) {
    return {
      method: "cr2-cluster-robust-day-mean-two-sided-95ci-fragile-exploratory",
      label: "fragile-exploratory-G-le-5",
      n: 0,
      g: 0,
      degreesOfFreedom: null,
      meanNetPnlCents: null,
      cr2StandardError: null,
      ciLowCents: null,
      ciHighCents: null,
      note: FRAGILE_NOTE,
    };
  }

  try {
    const inference = computeM16Cr2ClusterMeanInference(
      included.map((t) => ({
        clusterKey: t.utcDay,
        valueCents: t.completedNetPnlCents as number,
      })),
    );
    const critical = studentTCriticalValue(inference.degreesOfFreedom);
    const half = critical * inference.cr2StandardError;
    return {
      method: "cr2-cluster-robust-day-mean-two-sided-95ci-fragile-exploratory",
      label: "fragile-exploratory-G-le-5",
      n: inference.n,
      g: inference.g,
      degreesOfFreedom: inference.degreesOfFreedom,
      meanNetPnlCents: inference.sampleMeanCents,
      cr2StandardError: inference.cr2StandardError,
      ciLowCents: inference.sampleMeanCents - half,
      ciHighCents: inference.sampleMeanCents + half,
      note: FRAGILE_NOTE,
    };
  } catch {
    const mean =
      included.reduce((sum, t) => sum + (t.completedNetPnlCents as number), 0)
      / included.length;
    return {
      method: "cr2-cluster-robust-day-mean-two-sided-95ci-fragile-exploratory",
      label: "fragile-exploratory-G-le-5",
      n: included.length,
      g: new Set(included.map((t) => t.utcDay)).size,
      degreesOfFreedom: null,
      meanNetPnlCents: mean,
      cr2StandardError: null,
      ciLowCents: null,
      ciHighCents: null,
      note: FRAGILE_NOTE,
    };
  }
}
