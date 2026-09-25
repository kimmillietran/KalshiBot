import { selectWindowObservations } from "@/lib/data/research/kalshiSettlementSampleMapping/windowBoundaries";
import type { CapturedBrtiObservation } from "@/lib/data/research/kalshiSettlementSampleMapping/runSynchronizedCapture";

import {
  DECLARED_DECIMAL_APPROX_TOLERANCE_RAW,
  compareMarketDecimals,
  exactDecimalDiffRaw,
  meanDecimalStrings,
  roundHalfEven2DecimalString,
} from "./decimalMarketValue";

/** Frozen before capture — do not retune. */
export const TRAILING_WINDOW_LABEL = "[close−60s, close)" as const;
export const QUARTER_HOUR_WINDOW_LABEL = "(close−60s, close]" as const;

/** Venue/Help settlement-minute sample count; do not invent samples to reach this. */
export const EXPECTED_SETTLEMENT_SAMPLE_COUNT = 60;

export type BrtiSourceStream = "cfb-1hz" | "cfb-5hz";

export type AverageAgreement = {
  fieldName: string;
  publishedRaw: string | null;
  recomputedFromSamplesRaw: string | null;
  /** Exact `===` on retained strings. */
  rawStringEqual: boolean | null;
  /**
   * Exact decimal equality after parsing (scale-normalized BigInt).
   * Not IEEE-754 `===` on Number.
   */
  exactDecimalEqual: boolean | null;
  /**
   * @deprecated Alias of exactDecimalEqual — kept so callers distinguishing
   * "numeric" from raw-string do not fall back to float equality.
   */
  numericEqual: boolean | null;
  /** |exactDiff| ≤ DECLARED_DECIMAL_APPROX_TOLERANCE_RAW. */
  approximateEqual: boolean | null;
  approximateToleranceRaw: typeof DECLARED_DECIMAL_APPROX_TOLERANCE_RAW;
  /** Exact decimal difference recomputed − published (string), when both parse. */
  exactDiffRaw: string | null;
  /** Float view of exactDiffRaw for legacy charts only — not used for equality. */
  unroundedDiff: number | null;
  diagnosticRound2HalfEvenEqual: boolean | null;
  sampleCount: number;
  limitation: string | null;
};

export type StreamMembershipComparison = AverageAgreement & {
  sourceStream: BrtiSourceStream;
  membership: typeof TRAILING_WINDOW_LABEL | typeof QUARTER_HOUR_WINDOW_LABEL;
  timestampDomain: "source";
  status: "compared" | "unavailable";
  unavailableReason: string | null;
  expectedSampleCount: number;
  verifiedSourceTimestampedInStream: number;
  verifiedSourceTimestampedInWindow: number;
  missingSourceTimestampInStream: number;
  receiptTimestampRangeMs: { min: number | null; max: number | null };
  sourceTimestampRangeMs: { min: number | null; max: number | null };
  vsOfficial?: {
    exactDiffRaw: string | null;
    unroundedDiff: number | null;
    rawStringEqual: boolean | null;
    exactDecimalEqual: boolean | null;
    approximateEqual: boolean | null;
    diagnosticRound2HalfEvenEqual: boolean | null;
  };
};

/** Diagnostic half-even to 2dp — not Kalshi's proven rule. Delegates to decimal path. */
export function roundHalfEven2(value: number): string {
  // Prefer an explicit decimal string; Number→string can be binary-noisy near .xx5.
  return roundHalfEven2DecimalString(value.toFixed(8)) ?? value.toFixed(2);
}

export function meanRawSamples(values: readonly string[]): {
  meanRaw: string | null;
  meanNumeric: number | null;
  count: number;
  parseFailures: number;
} {
  const mean = meanDecimalStrings(values, 8);
  return {
    meanRaw: mean.meanRaw,
    meanNumeric: mean.meanRaw == null ? null : Number(mean.meanRaw),
    count: mean.count,
    parseFailures: mean.parseFailures,
  };
}

function rangeOf(values: readonly number[]): { min: number | null; max: number | null } {
  if (values.length === 0) {
    return { min: null, max: null };
  }
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Observations for a single declared stream only. Rejects channelHint mismatches
 * and observations lacking a source timestamp (receipt time is never substituted).
 */
export function verifiedSourceTimestampedSamples(
  observations: readonly CapturedBrtiObservation[],
  sourceStream: BrtiSourceStream,
): {
  verified: CapturedBrtiObservation[];
  missingSourceTimestamp: number;
  wrongStream: number;
} {
  let missingSourceTimestamp = 0;
  let wrongStream = 0;
  const verified: CapturedBrtiObservation[] = [];
  for (const observation of observations) {
    if (observation.channelHint !== sourceStream) {
      wrongStream += 1;
      continue;
    }
    if (observation.sourceTsMs == null || observation.valueRaw == null || observation.valueRaw === "") {
      missingSourceTimestamp += 1;
      continue;
    }
    verified.push(observation);
  }
  return { verified, missingSourceTimestamp, wrongStream };
}

function emptyAgreement(
  fieldName: string,
  publishedRaw: string | null,
  limitation: string,
  sampleCount: number,
  recomputedFromSamplesRaw: string | null = null,
): AverageAgreement {
  return {
    fieldName,
    publishedRaw,
    recomputedFromSamplesRaw,
    rawStringEqual: null,
    exactDecimalEqual: null,
    numericEqual: null,
    approximateEqual: null,
    approximateToleranceRaw: DECLARED_DECIMAL_APPROX_TOLERANCE_RAW,
    exactDiffRaw: null,
    unroundedDiff: null,
    diagnosticRound2HalfEvenEqual: null,
    sampleCount,
    limitation,
  };
}

export function comparePublishedAverage(input: {
  fieldName: string;
  publishedRaw: string | null;
  sampleValueRaws: readonly string[];
  officialRaw?: string | null;
}): AverageAgreement & {
  vsOfficial?: NonNullable<StreamMembershipComparison["vsOfficial"]>;
} {
  const recomputed = meanDecimalStrings(input.sampleValueRaws, 8);
  if (input.publishedRaw == null) {
    return emptyAgreement(
      input.fieldName,
      null,
      "published-average-missing",
      recomputed.count,
      recomputed.meanRaw,
    );
  }
  if (recomputed.meanRaw == null) {
    return emptyAgreement(
      input.fieldName,
      input.publishedRaw,
      recomputed.count === 0 && recomputed.parseFailures > 0
        ? "published-average-unparseable-or-no-samples"
        : "no-samples-for-declared-membership",
      recomputed.count,
    );
  }

  const vsPublished = compareMarketDecimals(recomputed.meanRaw, input.publishedRaw);
  const exactDiffRaw = exactDecimalDiffRaw(recomputed.meanRaw, input.publishedRaw);
  const base: AverageAgreement = {
    fieldName: input.fieldName,
    publishedRaw: input.publishedRaw,
    recomputedFromSamplesRaw: recomputed.meanRaw,
    rawStringEqual: vsPublished.rawStringEqual,
    exactDecimalEqual: vsPublished.exactDecimalEqual,
    numericEqual: vsPublished.exactDecimalEqual,
    approximateEqual: vsPublished.approximateEqual,
    approximateToleranceRaw: DECLARED_DECIMAL_APPROX_TOLERANCE_RAW,
    exactDiffRaw,
    unroundedDiff: vsPublished.approximateDiffNumber,
    diagnosticRound2HalfEvenEqual: vsPublished.diagnosticRound2HalfEvenEqual,
    sampleCount: recomputed.count,
    limitation: recomputed.parseFailures > 0 ? "some-samples-failed-parse" : null,
  };

  if (input.officialRaw == null) {
    return base;
  }
  const vsOfficialCmp = compareMarketDecimals(input.publishedRaw, input.officialRaw);
  return {
    ...base,
    vsOfficial: {
      exactDiffRaw: exactDecimalDiffRaw(input.publishedRaw, input.officialRaw),
      unroundedDiff: vsOfficialCmp.approximateDiffNumber,
      rawStringEqual: vsOfficialCmp.rawStringEqual,
      exactDecimalEqual: vsOfficialCmp.exactDecimalEqual,
      approximateEqual: vsOfficialCmp.approximateEqual,
      diagnosticRound2HalfEvenEqual: vsOfficialCmp.diagnosticRound2HalfEvenEqual,
    },
  };
}

/**
 * Membership comparison for one published field against one declared stream.
 * Never mixes streams. Uses source timestamps only for window membership.
 */
export function comparePublishedAverageForStream(input: {
  fieldName: string;
  publishedRaw: string | null;
  officialRaw?: string | null;
  sourceStream: BrtiSourceStream;
  membership: typeof TRAILING_WINDOW_LABEL | typeof QUARTER_HOUR_WINDOW_LABEL;
  closeMs: number;
  /** Must already be the declared stream's collection (not a combined array). */
  streamObservations: readonly CapturedBrtiObservation[];
}): StreamMembershipComparison {
  const partitioned = verifiedSourceTimestampedSamples(
    input.streamObservations,
    input.sourceStream,
  );
  if (partitioned.wrongStream > 0) {
    throw new Error(
      `stream-contamination: ${partitioned.wrongStream} observations do not match ${input.sourceStream}`,
    );
  }

  const windowKind = input.membership === TRAILING_WINDOW_LABEL
    ? "payload-start-inclusive-end-exclusive"
    : "documented-live-accumulation";

  const timed = partitioned.verified.map((observation) => ({
    timeRaw: observation.sourceTsMs,
    timeMs: observation.sourceTsMs,
    valueRaw: observation.valueRaw,
    value: observation.valueRaw != null ? Number(observation.valueRaw) : null,
  })).filter((row) => (
    row.timeMs != null
    && row.value != null
    && Number.isFinite(row.value)
    && row.valueRaw != null
  ));

  const inWindow = selectWindowObservations(timed, input.closeMs, windowKind);
  const sampleValueRaws = inWindow.map((row) => row.valueRaw as string);

  const receiptRange = rangeOf(input.streamObservations.map((row) => row.localReceivedAtMs));
  const sourceRange = rangeOf(
    partitioned.verified
      .map((row) => row.sourceTsMs)
      .filter((value): value is number => value != null),
  );

  const baseMeta = {
    sourceStream: input.sourceStream,
    membership: input.membership,
    timestampDomain: "source" as const,
    expectedSampleCount: EXPECTED_SETTLEMENT_SAMPLE_COUNT,
    verifiedSourceTimestampedInStream: partitioned.verified.length,
    verifiedSourceTimestampedInWindow: inWindow.length,
    missingSourceTimestampInStream: partitioned.missingSourceTimestamp,
    receiptTimestampRangeMs: receiptRange,
    sourceTimestampRangeMs: sourceRange,
  };

  if (inWindow.length < EXPECTED_SETTLEMENT_SAMPLE_COUNT) {
    const vsOfficial = input.publishedRaw != null && input.officialRaw != null
      ? (() => {
        const cmp = compareMarketDecimals(input.publishedRaw!, input.officialRaw!);
        return {
          exactDiffRaw: exactDecimalDiffRaw(input.publishedRaw!, input.officialRaw!),
          unroundedDiff: cmp.approximateDiffNumber,
          rawStringEqual: cmp.rawStringEqual,
          exactDecimalEqual: cmp.exactDecimalEqual,
          approximateEqual: cmp.approximateEqual,
          diagnosticRound2HalfEvenEqual: cmp.diagnosticRound2HalfEvenEqual,
        };
      })()
      : undefined;
    return {
      ...emptyAgreement(
        input.fieldName,
        input.publishedRaw,
        "insufficient-verified-source-timestamped-samples",
        inWindow.length,
      ),
      status: "unavailable",
      unavailableReason:
        `need-${EXPECTED_SETTLEMENT_SAMPLE_COUNT}-verified-${input.sourceStream}-source-ts-in-window;have-${inWindow.length}`,
      ...baseMeta,
      ...(vsOfficial ? { vsOfficial } : {}),
    };
  }

  const compared = comparePublishedAverage({
    fieldName: input.fieldName,
    publishedRaw: input.publishedRaw,
    sampleValueRaws,
    officialRaw: input.officialRaw,
  });
  return {
    ...compared,
    ...baseMeta,
    status: "compared",
    unavailableReason: null,
  };
}
