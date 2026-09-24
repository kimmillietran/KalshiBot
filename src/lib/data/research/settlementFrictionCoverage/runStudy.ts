/**
 * Run settlement-friction coverage calculation from normalized quote + label inputs.
 */

import { createHash } from "node:crypto";

import {
  aggregateByUtcDay,
  equalDayAggregate,
  pooledSampleAggregate,
  type FrictionSampleRow,
} from "./aggregate";
import {
  computeEntryFriction,
  computeRoundTripFriction,
  type FrictionQuote,
} from "./costs";
import type { EligibleCalendarAuthority } from "./eligibleCalendar";
import { assertDayEligible } from "./eligibleCalendar";
import {
  evaluateFrictionQuoteGates,
  matchResponseQuote,
  selectCadenceSamples,
  sortQuotesChronologically,
  type ExclusionReason,
} from "./sampling";
import {
  summarizeSettlementLabelCoverage,
  type SettlementLabelRecord,
} from "./settlementJoin";
import {
  SETTLEMENT_FRICTION_DISCLAIMER,
  SETTLEMENT_FRICTION_HORIZONS_MS,
  SETTLEMENT_FRICTION_RESPONSE_MATCH_TOLERANCE_MS,
  assertSettlementFrictionAdapterIdentity,
  assertSettlementFrictionFeeIdentity,
  buildSettlementFrictionConfig,
  type SettlementFrictionConfig,
  type SettlementFrictionHorizonMs,
} from "./types";

export type NormalizedQuoteEvent = FrictionQuote & {
  utcDayKey: string;
  marketTicker: string;
  openTimeMs?: number | null;
  closeTimeMs?: number | null;
  structuralGap?: boolean;
  sequence?: number;
};

export type DayAvailability = {
  utcDayKey: string;
  status: "processed" | "missing-local" | "rejected";
  reason: string | null;
  marketsSeen: number;
  retainedSamples: number;
  sessionCoverageNote: string;
};

export type StudyRunInput = {
  calendar: EligibleCalendarAuthority;
  quotes: readonly NormalizedQuoteEvent[];
  labels: readonly SettlementLabelRecord[];
  expectedFeeContractIdentity: string;
  expectedAdapterIdentity: string;
  codeAuthoritySha: string | null;
  generatedAtUtc: string;
  locallyAvailableUtcDays: readonly string[];
  dayNotes?: readonly DayAvailability[];
};

export type StudyRunResult = {
  config: SettlementFrictionConfig;
  disclaimer: typeof SETTLEMENT_FRICTION_DISCLAIMER;
  codeAuthoritySha: string | null;
  generatedAtUtc: string;
  calendar: EligibleCalendarAuthority;
  eligibleUtcDayCount: number;
  locallyAvailableUtcDayCount: number;
  successfullyProcessedUtcDayCount: number;
  missingOrRejectedUtcDays: DayAvailability[];
  exclusionCounts: Record<ExclusionReason, number>;
  samples: FrictionSampleRow[];
  samplesContentSha256: string;
  byDay: ReturnType<typeof aggregateByUtcDay>;
  pooled: ReturnType<typeof pooledSampleAggregate>;
  equalDay: ReturnType<typeof equalDayAggregate>;
  settlementCoverage: ReturnType<typeof summarizeSettlementLabelCoverage>;
  completionStatus: "complete" | "partial" | "blocked";
};

function emptyExclusions(): Record<ExclusionReason, number> {
  return {
    "missing-prices": 0,
    "crossed-book": 0,
    "locked-book": 0,
    "insufficient-size": 0,
    "stale-quote": 0,
    "missing-quote-age": 0,
    "unresolvable-mid": 0,
    "outside-session": 0,
    "structural-gap": 0,
  };
}

export function runSettlementFrictionCoverageStudy(
  input: StudyRunInput,
): StudyRunResult {
  assertSettlementFrictionFeeIdentity(input.expectedFeeContractIdentity);
  assertSettlementFrictionAdapterIdentity(input.expectedAdapterIdentity);

  const config = buildSettlementFrictionConfig();
  if (config.feeContractIdentity !== input.expectedFeeContractIdentity) {
    assertSettlementFrictionFeeIdentity(config.feeContractIdentity);
  }

  for (const day of input.locallyAvailableUtcDays) {
    assertDayEligible(day, input.calendar);
  }

  const exclusionCounts = emptyExclusions();
  const byMarket = new Map<string, NormalizedQuoteEvent[]>();
  for (const quote of input.quotes) {
    assertDayEligible(quote.utcDayKey, input.calendar);
    const key = `${quote.utcDayKey}::${quote.marketTicker}`;
    const list = byMarket.get(key) ?? [];
    list.push(quote);
    byMarket.set(key, list);
  }

  const samples: FrictionSampleRow[] = [];
  const sampleTickers = new Set<string>();

  for (const [, rawQuotes] of byMarket) {
    const sorted = sortQuotesChronologically(rawQuotes);
    const eligible: NormalizedQuoteEvent[] = [];
    for (const quote of sorted) {
      const gate = evaluateFrictionQuoteGates(quote, {
        openTimeMs: quote.openTimeMs,
        closeTimeMs: quote.closeTimeMs,
        structuralGap: quote.structuralGap,
      });
      if (!gate.eligible) {
        for (const reason of gate.reasons) {
          exclusionCounts[reason] += 1;
        }
        continue;
      }
      eligible.push(quote);
    }

    const selected = selectCadenceSamples({ sortedEligibleQuotes: eligible });
    for (const entry of selected) {
      const entryFriction = computeEntryFriction(entry);
      if (entryFriction == null) {
        exclusionCounts["unresolvable-mid"] += 1;
        continue;
      }
      sampleTickers.add(entry.marketTicker);
      const roundTripByHorizon: FrictionSampleRow["roundTripByHorizon"] = {};
      for (const horizonMs of SETTLEMENT_FRICTION_HORIZONS_MS) {
        const matched = matchResponseQuote({
          entryTimestampMs: entry.timestampMs,
          horizonMs,
          toleranceMs: SETTLEMENT_FRICTION_RESPONSE_MATCH_TOLERANCE_MS,
          sortedCandidates: eligible,
          isEligible: (q) =>
            evaluateFrictionQuoteGates(q, {
              openTimeMs: q.openTimeMs,
              closeTimeMs: q.closeTimeMs,
              structuralGap: q.structuralGap,
            }).eligible,
        });
        if (!matched) {
          roundTripByHorizon[horizonMs as SettlementFrictionHorizonMs] = {
            observable: false,
            roundTripFrictionCents: null,
            responseHalfSpreadCents: null,
            exitFeeCents: null,
            exitTimestampMs: null,
          };
          continue;
        }
        const rt = computeRoundTripFriction({
          entryQuote: entry,
          exitQuote: matched,
        });
        if (rt == null) {
          roundTripByHorizon[horizonMs as SettlementFrictionHorizonMs] = {
            observable: false,
            roundTripFrictionCents: null,
            responseHalfSpreadCents: null,
            exitFeeCents: null,
            exitTimestampMs: null,
          };
          continue;
        }
        roundTripByHorizon[horizonMs as SettlementFrictionHorizonMs] = {
          observable: true,
          roundTripFrictionCents: rt.roundTripFrictionCents,
          responseHalfSpreadCents: rt.responseHalfSpreadCents,
          exitFeeCents: rt.exitFeeCents,
          exitTimestampMs: matched.timestampMs,
        };
      }
      samples.push({
        utcDayKey: entry.utcDayKey,
        marketTicker: entry.marketTicker,
        entryTimestampMs: entry.timestampMs,
        entryFrictionCents: entryFriction.entryFrictionCents,
        entryHalfSpreadCents: entryFriction.entryHalfSpreadCents,
        entryFeeCents: entryFriction.entryFeeCents,
        complementDerivedAsk: entryFriction.complementDerivedAsk,
        roundTripByHorizon,
      });
    }
  }

  samples.sort((a, b) => {
    if (a.utcDayKey !== b.utcDayKey) return a.utcDayKey.localeCompare(b.utcDayKey);
    if (a.marketTicker !== b.marketTicker) {
      return a.marketTicker.localeCompare(b.marketTicker);
    }
    return a.entryTimestampMs - b.entryTimestampMs;
  });

  const byDay = aggregateByUtcDay(samples, SETTLEMENT_FRICTION_HORIZONS_MS);
  const pooled = pooledSampleAggregate({
    samples,
    horizonsMs: SETTLEMENT_FRICTION_HORIZONS_MS,
  });
  const equalDay = equalDayAggregate({
    daySummaries: byDay,
    horizonsMs: SETTLEMENT_FRICTION_HORIZONS_MS,
  });

  const settlementCoverage = summarizeSettlementLabelCoverage({
    denominatorTickers: [...sampleTickers].sort(),
    labels: input.labels,
  });

  const processedDays = new Set(byDay.map((d) => d.utcDayKey));
  const available = new Set(input.locallyAvailableUtcDays);
  const missingOrRejected: DayAvailability[] = [];
  for (const note of input.dayNotes ?? []) {
    if (note.status === "missing-local" || note.status === "rejected") {
      missingOrRejected.push(note);
    }
  }
  for (const day of input.calendar.eligibleUtcDays) {
    if (processedDays.has(day)) continue;
    if (missingOrRejected.some((d) => d.utcDayKey === day)) continue;
    missingOrRejected.push({
      utcDayKey: day,
      status: available.has(day) ? "rejected" : "missing-local",
      reason: available.has(day)
        ? "local-day-present-but-zero-retained-samples"
        : "local-raw-day-unavailable",
      marketsSeen: 0,
      retainedSamples: 0,
      sessionCoverageNote: "not processed as a complete session",
    });
  }

  const successfullyProcessedUtcDayCount = processedDays.size;
  let completionStatus: StudyRunResult["completionStatus"] = "complete";
  if (successfullyProcessedUtcDayCount === 0) {
    completionStatus = "blocked";
  } else if (
    successfullyProcessedUtcDayCount < input.calendar.eligibleUtcDays.length
  ) {
    completionStatus = "partial";
  }

  const samplesContentSha256 = createHash("sha256")
    .update(samples.map((s) => JSON.stringify(s)).join("\n"))
    .digest("hex");

  return {
    config,
    disclaimer: SETTLEMENT_FRICTION_DISCLAIMER,
    codeAuthoritySha: input.codeAuthoritySha,
    generatedAtUtc: input.generatedAtUtc,
    calendar: input.calendar,
    eligibleUtcDayCount: input.calendar.eligibleUtcDays.length,
    locallyAvailableUtcDayCount: input.locallyAvailableUtcDays.length,
    successfullyProcessedUtcDayCount,
    missingOrRejectedUtcDays: missingOrRejected.sort((a, b) =>
      a.utcDayKey.localeCompare(b.utcDayKey),
    ),
    exclusionCounts,
    samples,
    samplesContentSha256,
    byDay,
    pooled,
    equalDay,
    settlementCoverage,
    completionStatus,
  };
}
