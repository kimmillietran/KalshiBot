import {
  parseOfficialNumericString,
} from "@/lib/data/research/kalshiBrtiAccessProbe/parseOfficialNumericString";
import { selectWindowObservations } from "@/lib/data/research/kalshiSettlementSampleMapping/windowBoundaries";
import type { CapturedBrtiObservation } from "@/lib/data/research/kalshiSettlementSampleMapping/runSynchronizedCapture";

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
  rawStringEqual: boolean | null;
  numericEqual: boolean | null;
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
    unroundedDiff: number | null;
    rawStringEqual: boolean | null;
    diagnosticRound2HalfEvenEqual: boolean | null;
  };
};

/** Diagnostic half-even to 2dp — not Kalshi's proven rule. */
export function roundHalfEven2(value: number): string {
  const scaled = value * 100;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded: number;
  if (diff > 0.5) {
    rounded = floor + 1;
  } else if (diff < 0.5) {
    rounded = floor;
  } else {
    rounded = floor % 2 === 0 ? floor : floor + 1;
  }
  return (rounded / 100).toFixed(2);
}

export function meanRawSamples(values: readonly string[]): {
  meanRaw: string | null;
  meanNumeric: number | null;
  count: number;
  parseFailures: number;
} {
  if (values.length === 0) {
    return { meanRaw: null, meanNumeric: null, count: 0, parseFailures: 0 };
  }
  let sum = 0;
  let ok = 0;
  let failures = 0;
  for (const value of values) {
    const parsed = parseOfficialNumericString(value);
    if (parsed.kind !== "ok") {
      failures += 1;
      continue;
    }
    sum += parsed.value;
    ok += 1;
  }
  if (ok === 0) {
    return { meanRaw: null, meanNumeric: null, count: 0, parseFailures: failures };
  }
  const mean = sum / ok;
  return {
    meanRaw: mean.toFixed(8),
    meanNumeric: mean,
    count: ok,
    parseFailures: failures,
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

export function comparePublishedAverage(input: {
  fieldName: string;
  publishedRaw: string | null;
  sampleValueRaws: readonly string[];
  officialRaw?: string | null;
}): AverageAgreement & {
  vsOfficial?: {
    unroundedDiff: number | null;
    rawStringEqual: boolean | null;
    diagnosticRound2HalfEvenEqual: boolean | null;
  };
} {
  const recomputed = meanRawSamples(input.sampleValueRaws);
  if (input.publishedRaw == null) {
    return {
      fieldName: input.fieldName,
      publishedRaw: null,
      recomputedFromSamplesRaw: recomputed.meanRaw,
      rawStringEqual: null,
      numericEqual: null,
      unroundedDiff: null,
      diagnosticRound2HalfEvenEqual: null,
      sampleCount: recomputed.count,
      limitation: "published-average-missing",
    };
  }
  const published = parseOfficialNumericString(input.publishedRaw);
  if (published.kind !== "ok") {
    return {
      fieldName: input.fieldName,
      publishedRaw: input.publishedRaw,
      recomputedFromSamplesRaw: recomputed.meanRaw,
      rawStringEqual: null,
      numericEqual: null,
      unroundedDiff: null,
      diagnosticRound2HalfEvenEqual: null,
      sampleCount: recomputed.count,
      limitation: "published-average-unparseable",
    };
  }
  if (recomputed.meanNumeric == null) {
    return {
      fieldName: input.fieldName,
      publishedRaw: input.publishedRaw,
      recomputedFromSamplesRaw: null,
      rawStringEqual: null,
      numericEqual: null,
      unroundedDiff: null,
      diagnosticRound2HalfEvenEqual: null,
      sampleCount: 0,
      limitation: "no-samples-for-declared-membership",
    };
  }
  const base: AverageAgreement = {
    fieldName: input.fieldName,
    publishedRaw: input.publishedRaw,
    recomputedFromSamplesRaw: recomputed.meanRaw,
    rawStringEqual: input.publishedRaw === recomputed.meanRaw,
    numericEqual: published.value === recomputed.meanNumeric,
    unroundedDiff: recomputed.meanNumeric - published.value,
    diagnosticRound2HalfEvenEqual:
      roundHalfEven2(published.value) === roundHalfEven2(recomputed.meanNumeric),
    sampleCount: recomputed.count,
    limitation: recomputed.parseFailures > 0 ? "some-samples-failed-parse" : null,
  };
  if (input.officialRaw == null) {
    return base;
  }
  const official = parseOfficialNumericString(input.officialRaw);
  if (official.kind !== "ok") {
    return {
      ...base,
      vsOfficial: {
        unroundedDiff: null,
        rawStringEqual: null,
        diagnosticRound2HalfEvenEqual: null,
      },
    };
  }
  return {
    ...base,
    vsOfficial: {
      unroundedDiff: published.value - official.value,
      rawStringEqual: input.publishedRaw === input.officialRaw,
      diagnosticRound2HalfEvenEqual:
        roundHalfEven2(published.value) === roundHalfEven2(official.value),
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
    const vsOfficial = officialVsPublishedOnly(input.publishedRaw, input.officialRaw ?? null);
    return {
      fieldName: input.fieldName,
      publishedRaw: input.publishedRaw,
      recomputedFromSamplesRaw: null,
      rawStringEqual: null,
      numericEqual: null,
      unroundedDiff: null,
      diagnosticRound2HalfEvenEqual: null,
      sampleCount: inWindow.length,
      limitation: "insufficient-verified-source-timestamped-samples",
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

function officialVsPublishedOnly(
  publishedRaw: string | null,
  officialRaw: string | null,
): StreamMembershipComparison["vsOfficial"] | null {
  if (publishedRaw == null || officialRaw == null) {
    return null;
  }
  const published = parseOfficialNumericString(publishedRaw);
  const official = parseOfficialNumericString(officialRaw);
  if (published.kind !== "ok" || official.kind !== "ok") {
    return {
      unroundedDiff: null,
      rawStringEqual: null,
      diagnosticRound2HalfEvenEqual: null,
    };
  }
  return {
    unroundedDiff: published.value - official.value,
    rawStringEqual: publishedRaw === officialRaw,
    diagnosticRound2HalfEvenEqual:
      roundHalfEven2(published.value) === roundHalfEven2(official.value),
  };
}
