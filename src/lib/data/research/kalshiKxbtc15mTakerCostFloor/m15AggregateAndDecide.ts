import {
  M15_DECISION_HOSTILE_MIN_CENTS,
  M15_DECISION_HORIZON_MS,
  M15_DECISION_PLAUSIBLE_MAX_CENTS,
  M15_HORIZONS_MS,
  M15_HURDLE_SHARE_BINS_CENTS,
  type M15HorizonAggregate,
  type M15HorizonMs,
  type M15MarketDayHorizonSummary,
  type M15ProgramDecision,
  type M15QuoteSampleHurdle,
} from "./m15CostFloorTypes";
import { buildM15IndependentUnitKey } from "./m15OrdinaryQuoteSampler";

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx]!;
}

export function aggregateHurdlesByMarketDayHorizon(
  hurdles: readonly M15QuoteSampleHurdle[],
): M15MarketDayHorizonSummary[] {
  const groups = new Map<string, M15QuoteSampleHurdle[]>();
  for (const row of hurdles) {
    const key = `${buildM15IndependentUnitKey({
      marketTicker: row.marketTicker,
      tradingDayUtc: row.tradingDayUtc,
    })}|${row.horizonMs}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const summaries: M15MarketDayHorizonSummary[] = [];
  for (const [, rows] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const first = rows[0]!;
    const feeInc = rows.map((r) => r.feeInclusiveHurdleCents);
    const spreadOnly = rows.map((r) => r.spreadOnlyHurdleCents);
    summaries.push({
      marketTicker: first.marketTicker,
      tradingDayUtc: first.tradingDayUtc,
      horizonMs: first.horizonMs,
      unitKey: buildM15IndependentUnitKey({
        marketTicker: first.marketTicker,
        tradingDayUtc: first.tradingDayUtc,
      }),
      samplePairCount: rows.length,
      medianSpreadOnlyCents: median(spreadOnly),
      medianFeeInclusiveCents: median(feeInc),
      p25FeeInclusiveCents: percentile(feeInc, 0.25),
      p75FeeInclusiveCents: percentile(feeInc, 0.75),
    });
  }
  return summaries;
}

export function aggregateAcrossMarketDays(
  summaries: readonly M15MarketDayHorizonSummary[],
): M15HorizonAggregate[] {
  return M15_HORIZONS_MS.map((horizonMs) => {
    const rows = summaries.filter((s) => s.horizonMs === horizonMs);
    const feeInc = rows
      .map((r) => r.medianFeeInclusiveCents)
      .filter((v): v is number => v != null);
    const spread = rows
      .map((r) => r.medianSpreadOnlyCents)
      .filter((v): v is number => v != null);
    const feeContrib = rows
      .map((r) => {
        if (r.medianFeeInclusiveCents == null || r.medianSpreadOnlyCents == null) {
          return null;
        }
        return r.medianFeeInclusiveCents - r.medianSpreadOnlyCents;
      })
      .filter((v): v is number => v != null);

    const share: Record<"1" | "2" | "3", number | null> = {
      "1": null,
      "2": null,
      "3": null,
    };
    if (feeInc.length > 0) {
      for (const bin of M15_HURDLE_SHARE_BINS_CENTS) {
        const count = feeInc.filter((v) => v <= bin).length;
        share[String(bin) as "1" | "2" | "3"] = count / feeInc.length;
      }
    }

    return {
      horizonMs,
      independentMarketDayN: rows.length,
      rawSamplePairCount: rows.reduce((sum, r) => sum + r.samplePairCount, 0),
      medianFeeInclusiveCents: median(feeInc),
      medianSpreadOnlyCents: median(spread),
      medianFeeContributionCents: median(feeContrib),
      p25FeeInclusiveCents: percentile(feeInc, 0.25),
      p75FeeInclusiveCents: percentile(feeInc, 0.75),
      shareMarketDaysMedianFeeInclusiveAtMost: share,
    };
  });
}

export function decideM15ProgramDecision(input: {
  perHorizon: readonly M15HorizonAggregate[];
  minIndependentMarketDays?: number;
}): { decision: M15ProgramDecision; rationale: string } {
  const primary = input.perHorizon.find(
    (row) => row.horizonMs === (M15_DECISION_HORIZON_MS as M15HorizonMs),
  );
  const minN = input.minIndependentMarketDays ?? 1;
  if (
    primary == null
    || primary.independentMarketDayN < minN
    || primary.medianFeeInclusiveCents == null
  ) {
    return {
      decision: "insufficient-observability",
      rationale:
        `Primary H=${M15_DECISION_HORIZON_MS}ms lacks sufficient independent `
        + `market-day medians (need ≥${minN}).`,
    };
  }

  const m = primary.medianFeeInclusiveCents;
  if (m <= M15_DECISION_PLAUSIBLE_MAX_CENTS) {
    return {
      decision: "short-horizon-taker-research-economically-plausible",
      rationale:
        `H=${M15_DECISION_HORIZON_MS}ms median fee-inclusive hurdle ${m}¢ ≤ `
        + `${M15_DECISION_PLAUSIBLE_MAX_CENTS}¢ (comfortably below historical `
        + `2¢ effect scale). Low hurdle ≠ proof of signal.`,
    };
  }
  if (m <= M15_DECISION_HOSTILE_MIN_CENTS) {
    return {
      decision: "short-horizon-taker-research-cost-constrained",
      rationale:
        `H=${M15_DECISION_HORIZON_MS}ms median fee-inclusive hurdle ${m}¢ is in `
        + `(${M15_DECISION_PLAUSIBLE_MAX_CENTS}, ${M15_DECISION_HOSTILE_MIN_CENTS}]¢ `
        + `— near the historical 2¢ effect scale.`,
    };
  }
  return {
    decision: "short-horizon-taker-research-economically-hostile",
    rationale:
      `H=${M15_DECISION_HORIZON_MS}ms median fee-inclusive hurdle ${m}¢ > `
      + `${M15_DECISION_HOSTILE_MIN_CENTS}¢ — ordinary friction alone consumes `
      + `the historical research effect scale. Strong reason to stop tiny `
      + `short-horizon taker signal research.`,
  };
}
