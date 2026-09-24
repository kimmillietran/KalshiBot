/**
 * Aggregate friction samples by UTC day and pooled means.
 */

import type { SettlementFrictionHorizonMs } from "./types";

export type FrictionSampleRow = {
  utcDayKey: string;
  marketTicker: string;
  entryTimestampMs: number;
  entryFrictionCents: number;
  entryHalfSpreadCents: number;
  entryFeeCents: number;
  complementDerivedAsk: boolean;
  roundTripByHorizon: Partial<
    Record<
      SettlementFrictionHorizonMs,
      {
        observable: boolean;
        roundTripFrictionCents: number | null;
        responseHalfSpreadCents: number | null;
        exitFeeCents: number | null;
        exitTimestampMs: number | null;
      }
    >
  >;
};

export type DayFrictionSummary = {
  utcDayKey: string;
  retainedSamples: number;
  meanEntryFrictionCents: number | null;
  roundTrip: Record<
    string,
    {
      observableN: number;
      unobservableN: number;
      meanRoundTripFrictionCents: number | null;
    }
  >;
};

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function aggregateByUtcDay(
  samples: readonly FrictionSampleRow[],
  horizonsMs: readonly SettlementFrictionHorizonMs[],
): DayFrictionSummary[] {
  const byDay = new Map<string, FrictionSampleRow[]>();
  for (const sample of samples) {
    const list = byDay.get(sample.utcDayKey) ?? [];
    list.push(sample);
    byDay.set(sample.utcDayKey, list);
  }
  const days = [...byDay.keys()].sort();
  return days.map((utcDayKey) => {
    const rows = byDay.get(utcDayKey)!;
    const roundTrip: DayFrictionSummary["roundTrip"] = {};
    for (const h of horizonsMs) {
      const key = String(h);
      let observableN = 0;
      let unobservableN = 0;
      const vals: number[] = [];
      for (const row of rows) {
        const cell = row.roundTripByHorizon[h];
        if (!cell || !cell.observable || cell.roundTripFrictionCents == null) {
          unobservableN += 1;
        } else {
          observableN += 1;
          vals.push(cell.roundTripFrictionCents);
        }
      }
      roundTrip[key] = {
        observableN,
        unobservableN,
        meanRoundTripFrictionCents: mean(vals),
      };
    }
    return {
      utcDayKey,
      retainedSamples: rows.length,
      meanEntryFrictionCents: mean(rows.map((r) => r.entryFrictionCents)),
      roundTrip,
    };
  });
}

export function equalDayAggregate(input: {
  daySummaries: readonly DayFrictionSummary[];
  horizonsMs: readonly SettlementFrictionHorizonMs[];
}): {
  dayCount: number;
  meanOfDayMeanEntryFrictionCents: number | null;
  roundTrip: Record<
    string,
    { meanOfDayMeanRoundTripFrictionCents: number | null; daysWithObservable: number }
  >;
} {
  const entryDayMeans = input.daySummaries
    .map((d) => d.meanEntryFrictionCents)
    .filter((v): v is number => v != null);
  const roundTrip: Record<
    string,
    { meanOfDayMeanRoundTripFrictionCents: number | null; daysWithObservable: number }
  > = {};
  for (const h of input.horizonsMs) {
    const key = String(h);
    const vals: number[] = [];
    for (const day of input.daySummaries) {
      const cell = day.roundTrip[key];
      if (cell?.meanRoundTripFrictionCents != null) {
        vals.push(cell.meanRoundTripFrictionCents);
      }
    }
    roundTrip[key] = {
      meanOfDayMeanRoundTripFrictionCents: mean(vals),
      daysWithObservable: vals.length,
    };
  }
  return {
    dayCount: input.daySummaries.length,
    meanOfDayMeanEntryFrictionCents: mean(entryDayMeans),
    roundTrip,
  };
}

export function pooledSampleAggregate(input: {
  samples: readonly FrictionSampleRow[];
  horizonsMs: readonly SettlementFrictionHorizonMs[];
}): {
  retainedSamples: number;
  meanEntryFrictionCents: number | null;
  roundTrip: Record<
    string,
    {
      observableN: number;
      unobservableN: number;
      meanRoundTripFrictionCents: number | null;
    }
  >;
} {
  const roundTrip: Record<
    string,
    {
      observableN: number;
      unobservableN: number;
      meanRoundTripFrictionCents: number | null;
    }
  > = {};
  for (const h of input.horizonsMs) {
    const key = String(h);
    const vals: number[] = [];
    let observableN = 0;
    let unobservableN = 0;
    for (const row of input.samples) {
      const cell = row.roundTripByHorizon[h];
      if (!cell || !cell.observable || cell.roundTripFrictionCents == null) {
        unobservableN += 1;
      } else {
        observableN += 1;
        vals.push(cell.roundTripFrictionCents);
      }
    }
    roundTrip[key] = {
      observableN,
      unobservableN,
      meanRoundTripFrictionCents: mean(vals),
    };
  }
  return {
    retainedSamples: input.samples.length,
    meanEntryFrictionCents: mean(input.samples.map((s) => s.entryFrictionCents)),
    roundTrip,
  };
}
