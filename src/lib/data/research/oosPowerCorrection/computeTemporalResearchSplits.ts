import type {
  OosTemporalSplitId,
  OosTemporalSplitRanges,
} from "./oosPowerCorrectionTypes";

export type ExplicitSplitSpec = Partial<Record<OosTemporalSplitId, readonly string[]>>;

function parseMonthList(value: string): string[] {
  return value
    .split(",")
    .map((month) => month.trim())
    .filter((month) => /^\d{4}-\d{2}$/.test(month));
}

/** Parses `train=2025-01,2025-02,validation=2025-03,holdout=2025-04` split flags. */
export function parseExplicitTemporalSplitSpec(
  splitFlags: readonly string[],
): ExplicitSplitSpec | null {
  if (splitFlags.length === 0) {
    return null;
  }

  const spec: ExplicitSplitSpec = {};

  for (const flag of splitFlags) {
    const match = flag.match(/^(train|validation|holdout)=(.+)$/);
    if (!match) {
      continue;
    }

    const splitId = match[1] as OosTemporalSplitId;
    spec[splitId] = parseMonthList(match[2] ?? "");
  }

  return Object.keys(spec).length > 0 ? spec : null;
}

export function sortCalendarMonths(months: readonly string[]): string[] {
  return [...new Set(months)].sort((left, right) => left.localeCompare(right));
}

/** Deterministic 60/20/20 month split when explicit ranges are not provided. */
export function computeDefaultTemporalSplitRanges(
  availableMonths: readonly string[],
): OosTemporalSplitRanges {
  const sorted = sortCalendarMonths(availableMonths);

  if (sorted.length === 0) {
    return { trainMonths: [], validationMonths: [], holdoutMonths: [] };
  }

  if (sorted.length === 1) {
    return { trainMonths: sorted, validationMonths: [], holdoutMonths: [] };
  }

  if (sorted.length === 2) {
    return { trainMonths: [sorted[0]!], validationMonths: [], holdoutMonths: [sorted[1]!] };
  }

  const trainCount = Math.max(1, Math.floor(sorted.length * 0.6));
  const validationCount = Math.max(1, Math.floor(sorted.length * 0.2));
  const holdoutCount = Math.max(1, sorted.length - trainCount - validationCount);

  const adjustedTrainCount = sorted.length - validationCount - holdoutCount;

  return {
    trainMonths: sorted.slice(0, adjustedTrainCount),
    validationMonths: sorted.slice(adjustedTrainCount, adjustedTrainCount + validationCount),
    holdoutMonths: sorted.slice(adjustedTrainCount + validationCount),
  };
}

export function resolveTemporalSplitRanges(input: {
  availableMonths: readonly string[];
  explicit?: ExplicitSplitSpec | null;
}): { ranges: OosTemporalSplitRanges; splitMode: "explicit" | "deterministic-default" } {
  if (input.explicit) {
    const trainMonths = sortCalendarMonths(input.explicit.train ?? []);
    const validationMonths = sortCalendarMonths(input.explicit.validation ?? []);
    const holdoutMonths = sortCalendarMonths(input.explicit.holdout ?? []);

    if (trainMonths.length + validationMonths.length + holdoutMonths.length > 0) {
      return {
        ranges: { trainMonths, validationMonths, holdoutMonths },
        splitMode: "explicit",
      };
    }
  }

  return {
    ranges: computeDefaultTemporalSplitRanges(input.availableMonths),
    splitMode: "deterministic-default",
  };
}

export function monthBelongsToSplit(
  calendarMonth: string | null | undefined,
  split: OosTemporalSplitId,
  ranges: OosTemporalSplitRanges,
): boolean {
  if (!calendarMonth) {
    return false;
  }

  switch (split) {
    case "train":
      return ranges.trainMonths.includes(calendarMonth);
    case "validation":
      return ranges.validationMonths.includes(calendarMonth);
    case "holdout":
      return ranges.holdoutMonths.includes(calendarMonth);
    default:
      return false;
  }
}

/** Ensures holdout months never appear in train ranges (leakage guard). */
export function assertNoHoldoutLeakageIntoTrain(ranges: OosTemporalSplitRanges): boolean {
  const holdout = new Set(ranges.holdoutMonths);
  return ranges.trainMonths.every((month) => !holdout.has(month));
}
