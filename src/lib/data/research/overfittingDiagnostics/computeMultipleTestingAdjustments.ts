import {
  DEFAULT_MULTIPLE_TESTING_ALPHA,
  type FamilyWiseAdjustedPValue,
  type FdrAdjustedPValue,
  type MultipleTestingDiagnostics,
  type StrategyFamilyDiagnostics,
} from "./overfittingDiagnosticsTypes";

type RawPValueEntry = {
  strategyId: string;
  rawPValue: number | null;
};

function clampPValue(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sortByRawPValue(entries: readonly RawPValueEntry[]): RawPValueEntry[] {
  return [...entries].sort((left, right) => {
    if (left.rawPValue === null && right.rawPValue === null) {
      return left.strategyId.localeCompare(right.strategyId);
    }
    if (left.rawPValue === null) {
      return 1;
    }
    if (right.rawPValue === null) {
      return -1;
    }
    if (left.rawPValue !== right.rawPValue) {
      return left.rawPValue - right.rawPValue;
    }
    return left.strategyId.localeCompare(right.strategyId);
  });
}

/** Applies Bonferroni and Holm family-wise error rate corrections. */
export function computeFamilyWiseAdjustedPValues(
  entries: readonly RawPValueEntry[],
  alpha: number,
): FamilyWiseAdjustedPValue[] {
  const sorted = sortByRawPValue(entries);
  const validEntries = sorted.filter((entry) => entry.rawPValue !== null);
  const m = validEntries.length;

  const holmAdjusted = new Map<string, number>();
  let runningMax = 0;
  for (let index = 0; index < validEntries.length; index += 1) {
    const entry = validEntries[index]!;
    const rank = index + 1;
    const adjusted = clampPValue(entry.rawPValue! * (m - rank + 1));
    runningMax = Math.max(runningMax, adjusted);
    holmAdjusted.set(entry.strategyId, runningMax);
  }

  const holmRejected = new Map<string, boolean>();
  for (let index = 0; index < validEntries.length; index += 1) {
    const entry = validEntries[index]!;
    const rank = index + 1;
    holmRejected.set(entry.strategyId, entry.rawPValue! <= alpha / (m - rank + 1));
  }

  return sorted.map((entry) => {
    if (entry.rawPValue === null || m === 0) {
      return {
        strategyId: entry.strategyId,
        rawPValue: entry.rawPValue,
        bonferroniAdjustedPValue: null,
        holmAdjustedPValue: null,
        rejectedBonferroni: false,
        rejectedHolm: false,
      };
    }

    return {
      strategyId: entry.strategyId,
      rawPValue: entry.rawPValue,
      bonferroniAdjustedPValue: clampPValue(entry.rawPValue * m),
      holmAdjustedPValue: holmAdjusted.get(entry.strategyId) ?? null,
      rejectedBonferroni: clampPValue(entry.rawPValue * m) <= alpha,
      rejectedHolm: holmRejected.get(entry.strategyId) ?? false,
    };
  });
}

/** Applies Benjamini-Hochberg false discovery rate adjustment. */
export function computeBenjaminiHochbergFdr(
  entries: readonly RawPValueEntry[],
  alpha: number,
): FdrAdjustedPValue[] {
  const sorted = sortByRawPValue(entries);
  const validEntries = sorted.filter((entry) => entry.rawPValue !== null);
  const m = validEntries.length;

  const bhAdjusted = new Map<string, number>();
  let runningMinimum = 1;

  for (let index = m - 1; index >= 0; index -= 1) {
    const entry = validEntries[index]!;
    const rank = index + 1;
    const adjusted = clampPValue((entry.rawPValue! * m) / rank);
    runningMinimum = Math.min(runningMinimum, adjusted);
    bhAdjusted.set(entry.strategyId, runningMinimum);
  }

  let largestSignificantRank = 0;
  for (let index = 0; index < validEntries.length; index += 1) {
    const entry = validEntries[index]!;
    const rank = index + 1;
    if (entry.rawPValue! <= (alpha * rank) / m) {
      largestSignificantRank = rank;
    }
  }

  const significantIds = new Set(
    validEntries.slice(0, largestSignificantRank).map((entry) => entry.strategyId),
  );

  return sorted.map((entry) => {
    if (entry.rawPValue === null || m === 0) {
      return {
        strategyId: entry.strategyId,
        rawPValue: entry.rawPValue,
        bhAdjustedPValue: null,
        rejectedFdr: false,
      };
    }

    return {
      strategyId: entry.strategyId,
      rawPValue: entry.rawPValue,
      bhAdjustedPValue: bhAdjusted.get(entry.strategyId) ?? null,
      rejectedFdr: significantIds.has(entry.strategyId),
    };
  });
}

export function buildMultipleTestingDiagnostics(
  families: readonly StrategyFamilyDiagnostics[],
  alpha = DEFAULT_MULTIPLE_TESTING_ALPHA,
): MultipleTestingDiagnostics {
  const rawEntries: RawPValueEntry[] = families.map((family) => ({
    strategyId: family.strategyId,
    rawPValue: family.rawPValue,
  }));

  const validPValues = rawEntries.filter((entry) => entry.rawPValue !== null);

  if (validPValues.length === 0) {
    return {
      status: "unavailable",
      alpha,
      hypothesisCount: families.length,
      familyWise: computeFamilyWiseAdjustedPValues(rawEntries, alpha),
      fdr: computeBenjaminiHochbergFdr(rawEntries, alpha),
      warnings: [
        "No raw p-values available from statistical-significance.json; multiple-testing adjustments cannot be computed.",
      ],
    };
  }

  if (families.length < 2) {
    return {
      status: "unavailable",
      alpha,
      hypothesisCount: families.length,
      familyWise: computeFamilyWiseAdjustedPValues(rawEntries, alpha),
      fdr: computeBenjaminiHochbergFdr(rawEntries, alpha),
      warnings: [
        "Multiple-testing adjustments require at least two strategy families with p-values.",
      ],
    };
  }

  return {
    status: "computed",
    alpha,
    hypothesisCount: families.length,
    familyWise: computeFamilyWiseAdjustedPValues(rawEntries, alpha),
    fdr: computeBenjaminiHochbergFdr(rawEntries, alpha),
    warnings: [],
  };
}
