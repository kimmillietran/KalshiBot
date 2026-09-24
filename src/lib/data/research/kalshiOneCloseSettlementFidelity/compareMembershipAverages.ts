import {
  parseOfficialNumericString,
} from "@/lib/data/research/kalshiBrtiAccessProbe/parseOfficialNumericString";

/** Frozen before capture — do not retune. */
export const TRAILING_WINDOW_LABEL = "[close−60s, close)" as const;
export const QUARTER_HOUR_WINDOW_LABEL = "(close−60s, close]" as const;

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
