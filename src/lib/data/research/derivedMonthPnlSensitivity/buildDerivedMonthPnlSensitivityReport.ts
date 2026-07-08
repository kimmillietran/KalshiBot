import {
  DERIVED_MONTH_PNL_SENSITIVITY_CAVEATS,
  DERIVED_MONTH_PNL_SENSITIVITY_DISCLAIMER,
} from "./derivedMonthPnlSensitivityConfig";
import {
  buildVariantMetrics,
  computeVariantDelta,
  evaluateFamilyRecommendation,
  filterTradesForVariant,
  variantFilterDescription,
  variantLabel,
} from "./derivedMonthPnlSensitivityMath";
import type { LoadedDerivedMonthPnlSensitivityInputs } from "./loadDerivedMonthPnlSensitivityInputs";
import type {
  DerivedMonthPnlSensitivityConfig,
  DerivedMonthPnlSensitivityInputPaths,
  DerivedMonthPnlSensitivityInputStatus,
  DerivedMonthPnlSensitivityReport,
  DerivedMonthPnlSensitivityVariantId,
} from "./derivedMonthPnlSensitivityTypes";

const CORE_VARIANTS: DerivedMonthPnlSensitivityVariantId[] = [
  "full-corpus",
  "excluding-sensitive-month",
  "sensitive-month-only",
];

const OPTIONAL_VARIANTS: DerivedMonthPnlSensitivityVariantId[] = [
  "official-only",
  "derived-only",
];

export function buildDerivedMonthPnlSensitivityReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: DerivedMonthPnlSensitivityInputPaths;
  inputStatus: DerivedMonthPnlSensitivityInputStatus;
  config: DerivedMonthPnlSensitivityConfig;
  loadedInputs: LoadedDerivedMonthPnlSensitivityInputs;
}): DerivedMonthPnlSensitivityReport {
  const variantIds = [
    ...CORE_VARIANTS,
    ...OPTIONAL_VARIANTS,
  ] as DerivedMonthPnlSensitivityVariantId[];

  const variantMetrics = variantIds.map((variantId) => {
    const filteredTrades = filterTradesForVariant({
      trades: input.loadedInputs.trades,
      variantId,
      config: input.config,
      derivedMarketKeys: input.loadedInputs.derivedMarketKeys,
      usesSensitiveMonthHeuristic: input.loadedInputs.usesSensitiveMonthHeuristic,
    });

    return buildVariantMetrics({
      variantId,
      label: variantLabel(variantId, input.config.sensitiveMonth),
      filterDescription: variantFilterDescription(
        variantId,
        input.config.sensitiveMonth,
        input.loadedInputs.usesSensitiveMonthHeuristic,
      ),
      trades: filteredTrades,
      config: input.config,
      sensitiveMonth: input.config.sensitiveMonth,
    });
  });

  const fullCorpus = variantMetrics.find(
    (variant) => variant.variantId === "full-corpus",
  )!;
  const excludingSensitiveMonth =
    variantMetrics.find((variant) => variant.variantId === "excluding-sensitive-month")
    ?? null;
  const sensitiveMonthOnly =
    variantMetrics.find((variant) => variant.variantId === "sensitive-month-only")
    ?? null;

  const variants = variantMetrics.map((variant) => ({
    ...variant,
    deltaVsFullCorpus:
      variant.variantId === "full-corpus"
        ? null
        : computeVariantDelta({ fullCorpus, variant }),
  }));

  const excludingDelta =
    variants.find((variant) => variant.variantId === "excluding-sensitive-month")
      ?.deltaVsFullCorpus ?? null;

  const familyRecommendation = evaluateFamilyRecommendation({
    config: input.config,
    fullCorpus,
    excludingSensitiveMonth,
    sensitiveMonthOnly,
    excludingDelta,
  });

  const warnings: string[] = [];

  if (input.loadedInputs.usesSensitiveMonthHeuristic) {
    warnings.push(
      "Per-trade official/derived settlement flags are unavailable; official-only and derived-only variants use the known sensitive-month heuristic (2025-12).",
    );
  } else {
    warnings.push(
      `Derived settlement market keys discovered (${input.loadedInputs.derivedMarketKeys.size}); official-only and derived-only variants filter by market join key.`,
    );
  }

  if (
    input.loadedInputs.m11Summary
    && input.loadedInputs.m11Summary.filledTradeCount !== fullCorpus.filledTradeCount
  ) {
    warnings.push(
      `Re-derived filled trade count (${fullCorpus.filledTradeCount}) differs from M11.9 summary (${input.loadedInputs.m11Summary.filledTradeCount}).`,
    );
  }

  if (fullCorpus.netPnlCents <= 0) {
    warnings.push("Full-corpus family net PnL is not positive; sensitivity conclusions are limited.");
  }

  if (
    familyRecommendation === "collect-more-official-months"
    && excludingSensitiveMonth
    && excludingSensitiveMonth.netPnlCents > 0
    && (excludingSensitiveMonth.topMonthShare ?? 0)
      > input.config.topMonthMaxShareAfterExclusion
  ) {
    const dominant = excludingSensitiveMonth.monthBreakdown
      .slice()
      .sort((left, right) => right.netPnlCents - left.netPnlCents)[0];
    warnings.push(
      `Removing ${input.config.sensitiveMonth} does not eliminate positive PnL, but remaining PnL is still month-concentrated (${dominant?.calendarMonth ?? "unknown"} at ${((excludingSensitiveMonth.topMonthShare ?? 0) * 100).toFixed(1)}%).`,
    );
  }

  if ((excludingDelta?.flippedHypothesisIds.length ?? 0) > 0) {
    warnings.push(
      `Hypothesis sign flips after exclusion: ${excludingDelta!.flippedHypothesisIds.join(", ")}.`,
    );
  }

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: DERIVED_MONTH_PNL_SENSITIVITY_DISCLAIMER,
    caveats: [...DERIVED_MONTH_PNL_SENSITIVITY_CAVEATS],
    config: input.config,
    inputPaths: input.inputPaths,
    inputStatus: input.inputStatus,
    summary: {
      sensitiveMonth: input.config.sensitiveMonth,
      excludeMonth: input.config.excludeMonth,
      fullCorpusNetPnlCents: fullCorpus.netPnlCents,
      excludingSensitiveMonthNetPnlCents: excludingSensitiveMonth?.netPnlCents ?? null,
      sensitiveMonthOnlyNetPnlCents: sensitiveMonthOnly?.netPnlCents ?? null,
      netPnlRetentionShare: excludingDelta?.netPnlRetentionShare ?? null,
      hypothesisSignFlips: excludingDelta?.hypothesisSignFlips ?? 0,
      sideSignFlips: excludingDelta?.sideSignFlips ?? 0,
      flippedHypothesisIds: excludingDelta?.flippedHypothesisIds ?? [],
      topMonthShareAfterExclusion: excludingSensitiveMonth?.topMonthShare ?? null,
      familyRecommendation,
      recommendFullM12: familyRecommendation === "proceed-to-trade-pnl-oos",
      usesSensitiveMonthHeuristic: input.loadedInputs.usesSensitiveMonthHeuristic,
      derivedMarketKeysCount: input.loadedInputs.derivedMarketKeys.size,
      m11ForensicsVerdict:
        input.loadedInputs.m11Summary?.familyForensicsVerdict ?? null,
      m11RecommendedNextAction:
        input.loadedInputs.m11Summary?.recommendedNextAction ?? null,
    },
    variants,
    warnings,
  };
}
