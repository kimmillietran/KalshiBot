import {
  MIN_PBO_FOLDS,
  MIN_PBO_VARIANTS,
  type BacktestOverfittingDiagnostic,
  type FoldPerformanceMatrix,
} from "./overfittingDiagnosticsTypes";

function rankVariants(
  performances: Readonly<Record<string, number>>,
  variants: readonly string[],
): Map<string, number> {
  const sorted = [...variants].sort((left, right) => {
    const leftValue = performances[left] ?? Number.NEGATIVE_INFINITY;
    const rightValue = performances[right] ?? Number.NEGATIVE_INFINITY;
    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }
    return left.localeCompare(right);
  });

  const ranks = new Map<string, number>();
  for (let index = 0; index < sorted.length; index += 1) {
    ranks.set(sorted[index]!, index + 1);
  }
  return ranks;
}

/**
 * Approximates probability of backtest overfitting via rank degradation across folds.
 * When a variant is best on one fold, count how often it ranks in the bottom half elsewhere.
 */
export function computePboFromFoldMatrix(
  matrix: FoldPerformanceMatrix,
): BacktestOverfittingDiagnostic {
  const { folds, variants, performances } = matrix;
  const warnings: string[] = [];

  if (folds.length < MIN_PBO_FOLDS) {
    return {
      status: "unavailable",
      probabilityOfOverfitting: null,
      foldCount: folds.length,
      variantCount: variants.length,
      method: null,
      warnings: [
        `Backtest overfitting diagnostic requires at least ${MIN_PBO_FOLDS} folds; found ${folds.length}.`,
      ],
    };
  }

  if (variants.length < MIN_PBO_VARIANTS) {
    return {
      status: "unavailable",
      probabilityOfOverfitting: null,
      foldCount: folds.length,
      variantCount: variants.length,
      method: null,
      warnings: [
        `Backtest overfitting diagnostic requires at least ${MIN_PBO_VARIANTS} variants; found ${variants.length}.`,
      ],
    };
  }

  let degradationEvents = 0;
  let comparisons = 0;
  const medianRank = Math.ceil(variants.length / 2);

  for (const focusFold of folds) {
    const focusPerformances: Record<string, number> = {};
    for (const variant of variants) {
      focusPerformances[variant] = performances[variant]?.[focusFold] ?? Number.NEGATIVE_INFINITY;
    }

    const focusRanks = rankVariants(focusPerformances, variants);
    const bestVariant = [...variants].sort((left, right) => {
      const leftRank = focusRanks.get(left) ?? variants.length;
      const rightRank = focusRanks.get(right) ?? variants.length;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return left.localeCompare(right);
    })[0];

    if (!bestVariant) {
      continue;
    }

    for (const otherFold of folds) {
      if (otherFold === focusFold) {
        continue;
      }

      const otherPerformances: Record<string, number> = {};
      for (const variant of variants) {
        otherPerformances[variant] =
          performances[variant]?.[otherFold] ?? Number.NEGATIVE_INFINITY;
      }

      const otherRanks = rankVariants(otherPerformances, variants);
      const bestRankOnOther = otherRanks.get(bestVariant) ?? variants.length;

      comparisons += 1;
      if (bestRankOnOther > medianRank) {
        degradationEvents += 1;
      }
    }
  }

  if (comparisons === 0) {
    warnings.push("No cross-fold comparisons were possible for backtest overfitting.");
    return {
      status: "unavailable",
      probabilityOfOverfitting: null,
      foldCount: folds.length,
      variantCount: variants.length,
      method: null,
      warnings,
    };
  }

  return {
    status: "computed",
    probabilityOfOverfitting: degradationEvents / comparisons,
    foldCount: folds.length,
    variantCount: variants.length,
    method: "rank-degradation-across-folds",
    warnings,
  };
}

export function buildUnavailablePboDiagnostic(
  reason: string,
): BacktestOverfittingDiagnostic {
  return {
    status: "unavailable",
    probabilityOfOverfitting: null,
    foldCount: null,
    variantCount: null,
    method: null,
    warnings: [reason],
  };
}
