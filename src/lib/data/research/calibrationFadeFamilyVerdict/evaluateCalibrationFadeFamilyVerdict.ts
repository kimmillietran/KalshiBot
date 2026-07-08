import {
  CALIBRATION_FADE_FAMILY_CAVEATS,
  CALIBRATION_FADE_FAMILY_VERDICT_DISCLAIMER,
  CALIBRATION_FADE_FAMILY_VERDICT_THRESHOLDS,
  CALIBRATION_FADE_STRATEGY_FAMILIES,
  type CalibrationFadeEvidenceLayerStatus,
  type CalibrationFadeFamilyVerdictId,
  type CalibrationFadeFamilyVerdictSummary,
  type CalibrationFadeHypothesisGateResults,
  type CalibrationFadeHypothesisVerdictEntry,
  type CalibrationFadeHypothesisVerdictId,
  type CalibrationFadeRecommendedNextAction,
} from "./calibrationFadeFamilyVerdictTypes";
import type { LoadedCalibrationFadeFamilyVerdictInputs } from "./loadCalibrationFadeFamilyVerdictInputs";

const REPEATED_ENTRY_WARNING =
  "Filled trades are repeated step-level entries, not independent bets.";

function resolveEvidenceStatus(
  blocked: boolean,
  present: boolean,
): CalibrationFadeEvidenceLayerStatus {
  if (blocked) {
    return "missing";
  }

  return present ? "present" : "unknown";
}

function belongsToCalibrationFadeFamily(suggestedStrategyFamily: string): boolean {
  return (CALIBRATION_FADE_STRATEGY_FAMILIES as readonly string[]).includes(
    suggestedStrategyFamily,
  );
}

function evaluateCostGate(netPnlCents: number): boolean {
  return netPnlCents > 0;
}

function evaluateFillabilityGate(input: {
  filledTradeCount: number;
  uniqueMarketCount: number;
  uniqueTradingDayCount: number;
  averageTradesPerMarket: number | null;
}): { pass: boolean; reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const thresholds = CALIBRATION_FADE_FAMILY_VERDICT_THRESHOLDS;

  if (input.filledTradeCount < thresholds.minFilledTrades) {
    reasons.push(
      `filled trades ${input.filledTradeCount} below min ${thresholds.minFilledTrades}`,
    );
  }

  if (input.uniqueMarketCount < thresholds.minUniqueMarkets) {
    reasons.push(
      `unique markets ${input.uniqueMarketCount} below min ${thresholds.minUniqueMarkets}`,
    );
  }

  if (input.uniqueTradingDayCount < thresholds.minUniqueTradingDays) {
    reasons.push(
      `unique trading days ${input.uniqueTradingDayCount} below min ${thresholds.minUniqueTradingDays}`,
    );
  }

  if (
    input.averageTradesPerMarket !== null
    && input.averageTradesPerMarket > thresholds.maxAverageTradesPerMarketWarning
  ) {
    reasons.push(
      `warning: average trades per market ${input.averageTradesPerMarket.toFixed(1)} exceeds ${thresholds.maxAverageTradesPerMarketWarning}`,
    );
  }

  const hardFailures = reasons.filter((reason) => !reason.startsWith("warning:"));

  return {
    pass: hardFailures.length === 0,
    reasons: hardFailures,
    warnings: reasons.filter((reason) => reason.startsWith("warning:")),
  };
}

function evaluateOosGate(holdoutObservedNetEdge: number | null): boolean {
  if (holdoutObservedNetEdge === null) {
    return false;
  }

  return CALIBRATION_FADE_FAMILY_VERDICT_THRESHOLDS.requirePositiveHoldoutNetEdge
    ? holdoutObservedNetEdge > 0
    : true;
}

function evaluateDerivedSensitivityGate(input: {
  present: boolean;
  recommendation: string | null;
  derivedObservationShare: number | null;
}): { pass: boolean; unknown: boolean } {
  if (!input.present) {
    return { pass: false, unknown: true };
  }

  if (input.recommendation === "dominated-by-derived-data") {
    return { pass: false, unknown: false };
  }

  if (
    input.derivedObservationShare !== null
    && input.derivedObservationShare
      > CALIBRATION_FADE_FAMILY_VERDICT_THRESHOLDS.maxDerivedObservationShare
  ) {
    return { pass: false, unknown: false };
  }

  if (
    input.recommendation === "highly-sensitive"
    || input.recommendation === "moderately-sensitive"
  ) {
    return { pass: false, unknown: false };
  }

  return { pass: true, unknown: false };
}

function resolveHypothesisVerdict(input: {
  blocked: boolean;
  costPass: boolean;
  fillabilityPass: boolean;
  oosPass: boolean;
  powerPass: boolean;
  correctionPass: boolean;
  derivedPass: boolean;
  derivedUnknown: boolean;
  isUnderpowered: boolean;
  oosVerdict: string | null;
  fillabilityReasons: string[];
}): {
  verdict: CalibrationFadeHypothesisVerdictId;
  primaryFailureReason: string | null;
  secondaryFailureReasons: string[];
} {
  if (input.blocked) {
    return {
      verdict: "blocked-by-missing-artifacts",
      primaryFailureReason: "required-artifacts-missing",
      secondaryFailureReasons: [],
    };
  }

  const secondaryFailureReasons: string[] = [];

  if (input.isUnderpowered || input.oosVerdict === "underpowered") {
    return {
      verdict: "underpowered",
      primaryFailureReason: "underpowered-holdout-or-mde",
      secondaryFailureReasons: input.fillabilityReasons,
    };
  }

  if (!input.costPass) {
    return {
      verdict: "reject-cost",
      primaryFailureReason: "non-positive-net-replay-pnl",
      secondaryFailureReasons: [],
    };
  }

  if (!input.fillabilityPass) {
    return {
      verdict: "reject-fillability",
      primaryFailureReason: input.fillabilityReasons[0] ?? "fillability-threshold-failed",
      secondaryFailureReasons: input.fillabilityReasons.slice(1),
    };
  }

  if (!input.oosPass) {
    return {
      verdict: "reject-oos",
      primaryFailureReason: "holdout-calibration-edge-not-positive",
      secondaryFailureReasons: [],
    };
  }

  if (!input.powerPass) {
    return {
      verdict: "reject-power",
      primaryFailureReason: "does-not-clear-mde",
      secondaryFailureReasons: [],
    };
  }

  if (!input.correctionPass) {
    return {
      verdict: "reject-correction",
      primaryFailureReason: "fails-dependence-aware-correction",
      secondaryFailureReasons: [],
    };
  }

  if (input.derivedUnknown) {
    return {
      verdict: "insufficient-data",
      primaryFailureReason: "derived-sensitivity-unknown",
      secondaryFailureReasons: [],
    };
  }

  if (!input.derivedPass) {
    return {
      verdict: "reject-derived-sensitivity",
      primaryFailureReason: "derived-settlement-sensitivity-failed",
      secondaryFailureReasons: [],
    };
  }

  if (
    input.costPass
    && input.fillabilityPass
    && input.oosPass
    && input.powerPass
    && input.correctionPass
    && input.derivedPass
  ) {
    return {
      verdict: "promote",
      primaryFailureReason: null,
      secondaryFailureReasons,
    };
  }

  return {
    verdict: "insufficient-data",
    primaryFailureReason: "incomplete-evidence",
    secondaryFailureReasons,
  };
}

function buildEvidenceSummary(input: {
  netPnlCents: number;
  holdoutEdge: number | null;
  finalStatisticalVerdict: string | null;
  derivedStatus: string;
}): string {
  return [
    `In-sample net replay PnL: ${input.netPnlCents}¢ (step-level, not independent bets).`,
    `Holdout calibration edge: ${input.holdoutEdge ?? "n/a"}.`,
    `M11.7 statistical verdict: ${input.finalStatisticalVerdict ?? "n/a"}.`,
    `Derived sensitivity: ${input.derivedStatus}.`,
  ].join(" ");
}

function resolveFamilyVerdict(input: {
  blocked: boolean;
  hypotheses: readonly CalibrationFadeHypothesisVerdictEntry[];
}): CalibrationFadeFamilyVerdictId {
  if (input.blocked) {
    return "blocked-by-missing-artifacts";
  }

  if (input.hypotheses.length === 0) {
    return "insufficient-data";
  }

  const promoted = input.hypotheses.filter((entry) => entry.verdict === "promote");
  if (promoted.length > 0) {
    return "promote-family";
  }

  const underpowered = input.hypotheses.filter(
    (entry) => entry.verdict === "underpowered",
  );
  const rejected = input.hypotheses.filter((entry) =>
    entry.verdict.startsWith("reject-"),
  );
  const positiveReplay = input.hypotheses.filter(
    (entry) => entry.tradeReplayEvidence.netPnlCents > 0,
  );

  if (underpowered.length === input.hypotheses.length) {
    return "underpowered";
  }

  if (
    rejected.length === input.hypotheses.length
    && underpowered.length === 0
    && positiveReplay.length === 0
  ) {
    return "reject-family";
  }

  if (positiveReplay.length > 0 && underpowered.length > 0) {
    return "continue-research";
  }

  if (underpowered.length > 0) {
    return "underpowered";
  }

  if (rejected.length === input.hypotheses.length) {
    return "reject-family";
  }

  return "continue-research";
}

function resolveRecommendedNextAction(input: {
  familyVerdict: CalibrationFadeFamilyVerdictId;
  hypotheses: readonly CalibrationFadeHypothesisVerdictEntry[];
}): CalibrationFadeRecommendedNextAction {
  if (input.familyVerdict === "blocked-by-missing-artifacts") {
    return "continue-collecting-data";
  }

  if (input.familyVerdict === "promote-family") {
    return "proceed-to-execution-realism";
  }

  const positiveReplay = input.hypotheses.some(
    (entry) => entry.tradeReplayEvidence.netPnlCents > 0,
  );
  const allUnderpowered = input.hypotheses.every(
    (entry) => entry.verdict === "underpowered",
  );
  const dependenceHeavy = input.hypotheses.some((entry) =>
    entry.tradeReplayEvidence.dependenceWarnings.length > 0
    || (entry.tradeReplayEvidence.averageTradesPerMarket ?? 0)
      > CALIBRATION_FADE_FAMILY_VERDICT_THRESHOLDS.maxAverageTradesPerMarketWarning,
  );
  const failedOos = input.hypotheses.some((entry) => entry.verdict === "reject-oos");

  if (allUnderpowered && positiveReplay) {
    return "add-trade-pnl-oos-overlay";
  }

  if (allUnderpowered) {
    return "continue-collecting-data";
  }

  if (dependenceHeavy) {
    return "tighten-position-model";
  }

  if (failedOos && positiveReplay) {
    return "pause-calibration-fade-family";
  }

  if (input.familyVerdict === "underpowered") {
    return "continue-collecting-data";
  }

  if (input.familyVerdict === "reject-family") {
    return "pivot-cross-strike-no-arb";
  }

  return "continue-collecting-data";
}

/** Evaluates precommitted promotion gates for calibration-fade family hypotheses. */
export function evaluateCalibrationFadeFamilyVerdict(
  loadedInputs: LoadedCalibrationFadeFamilyVerdictInputs,
  familyId: string,
): {
  disclaimer: string;
  caveats: readonly string[];
  hypotheses: CalibrationFadeHypothesisVerdictEntry[];
  summary: CalibrationFadeFamilyVerdictSummary;
} {
  const blocked = loadedInputs.missingRequiredArtifacts.length > 0;

  const candidates = (loadedInputs.hypothesisCandidates?.candidates ?? []).filter(
    (candidate) => belongsToCalibrationFadeFamily(candidate.suggestedStrategyFamily),
  );

  const validationById = new Map(
    (loadedInputs.hypothesisValidation?.validations ?? []).map((entry) => [
      entry.hypothesisId,
      entry,
    ]),
  );
  const replayById = new Map(
    (loadedInputs.hypothesisTradeReplay?.entries ?? []).map((entry) => [
      entry.hypothesisId,
      entry,
    ]),
  );
  const oosById = new Map(
    (loadedInputs.oosPowerCorrection?.entries ?? []).map((entry) => [
      entry.hypothesisId,
      entry,
    ]),
  );
  const derivedById = new Map(
    (loadedInputs.derivedSettlementSensitivity?.entries ?? []).map((entry) => [
      entry.hypothesisId,
      entry,
    ]),
  );

  const atlasBuckets = loadedInputs.costAwareAtlas?.buckets ?? [];

  const hypotheses: CalibrationFadeHypothesisVerdictEntry[] = candidates
    .map((candidate) => {
      const hypothesisId = candidate.candidateId;
      const validation = validationById.get(hypothesisId);
      const replay = replayById.get(hypothesisId);
      const oos = oosById.get(hypothesisId);
      const derived = derivedById.get(hypothesisId);
      const bucketId = candidate.bucketMetadata?.bucketId ?? null;
      const groupId = candidate.bucketMetadata?.groupId ?? null;
      const atlasBucket = atlasBuckets.find((bucket) => bucket.bucketId === bucketId);

      const metrics = replay?.metrics;
      const holdout = oos?.splitMetrics.holdout;

      const costPass = blocked ? false : evaluateCostGate(metrics?.netPnlCents ?? 0);
      const fillability = blocked
        ? { pass: false, reasons: ["required-artifacts-missing"] as string[], warnings: [] as string[] }
        : evaluateFillabilityGate({
            filledTradeCount: metrics?.tradeCount ?? 0,
            uniqueMarketCount: metrics?.uniqueMarketCount ?? 0,
            uniqueTradingDayCount: metrics?.uniqueTradingDayCount ?? 0,
            averageTradesPerMarket: metrics?.averageTradesPerMarket ?? null,
          });
      const oosPass = blocked
        ? false
        : evaluateOosGate(holdout?.observedNetEdge ?? null);
      const powerPass = blocked
        ? false
        : Boolean(oos?.clearsMde && !oos?.isUnderpowered);
      const correctionPass = blocked ? false : Boolean(oos?.passesCorrected);
      const derivedEvaluation = evaluateDerivedSensitivityGate({
        present: derived !== undefined,
        recommendation: derived?.recommendation ?? null,
        derivedObservationShare:
          derived?.allObservations.derivedObservationShare ?? null,
      });

      const gateResults: CalibrationFadeHypothesisGateResults = {
        costAwareReplayPass: costPass,
        fillabilityPass: fillability.pass,
        outOfSamplePass: oosPass,
        powerPass,
        correctionPass,
        derivedSensitivityPass: derivedEvaluation.pass,
        allPromotionGatesPass:
          costPass
          && fillability.pass
          && oosPass
          && powerPass
          && correctionPass
          && derivedEvaluation.pass
          && !derivedEvaluation.unknown,
      };

      const resolved = resolveHypothesisVerdict({
        blocked,
        costPass,
        fillabilityPass: fillability.pass,
        oosPass,
        powerPass,
        correctionPass,
        derivedPass: derivedEvaluation.pass,
        derivedUnknown: derivedEvaluation.unknown,
        isUnderpowered: oos?.isUnderpowered ?? false,
        oosVerdict: oos?.finalStatisticalVerdict ?? null,
        fillabilityReasons: [...fillability.reasons, ...fillability.warnings],
      });

      const dependenceWarnings = [
        ...(oos?.dependenceWarnings ?? []),
        ...(replay?.warnings ?? []),
      ];

      return {
        hypothesisId,
        hypothesis: candidate.hypothesis,
        axisGroupId: groupId,
        bucketIds: bucketId ? [bucketId] : [],
        direction: candidate.bucketMetadata?.calibrationDirection ?? null,
        suggestedStrategyFamily: candidate.suggestedStrategyFamily,
        robustnessScore: validation?.robustnessScore ?? null,
        validationPasses: validation?.passes ?? null,
        verdict: resolved.verdict,
        primaryFailureReason: resolved.primaryFailureReason,
        secondaryFailureReasons: resolved.secondaryFailureReasons,
        evidenceSummary: buildEvidenceSummary({
          netPnlCents: metrics?.netPnlCents ?? 0,
          holdoutEdge: holdout?.observedNetEdge ?? null,
          finalStatisticalVerdict: oos?.finalStatisticalVerdict ?? null,
          derivedStatus: derived
            ? derived.recommendation
            : derivedEvaluation.unknown
              ? "unknown"
              : "missing",
        }),
        gateResults,
        costAwareAtlasEvidence: {
          status: resolveEvidenceStatus(blocked, atlasBucket !== undefined),
          bucketId,
          groupId,
          tradeability: atlasBucket?.primaryCohort?.tradeability ?? null,
          grossExpectedValueCents:
            atlasBucket?.primaryCohort?.grossExpectedValueCents ?? null,
          spreadAdjustedExpectedValueCents:
            atlasBucket?.primaryCohort?.spreadAdjustedExpectedValueCents ?? null,
          feeAdjustedExpectedValueCents:
            atlasBucket?.primaryCohort?.feeAdjustedExpectedValueCents ?? null,
        },
        tradeReplayEvidence: {
          status: resolveEvidenceStatus(blocked, replay !== undefined),
          filledTradeCount: metrics?.tradeCount ?? 0,
          skippedTradeCount: metrics?.skippedCount ?? 0,
          uniqueMarketCount: metrics?.uniqueMarketCount ?? 0,
          uniqueTradingDayCount: metrics?.uniqueTradingDayCount ?? 0,
          averageTradesPerMarket: metrics?.averageTradesPerMarket ?? null,
          maxTradesPerMarket: metrics?.maxTradesPerMarket ?? 0,
          grossPnlCents: metrics?.grossPnlCents ?? 0,
          netPnlCents: metrics?.netPnlCents ?? 0,
          averageNetPnlCents: metrics?.averagePnlCentsPerTrade ?? null,
          winRate: metrics?.winRate ?? null,
          averageFeeCents: metrics?.averageFeeCents ?? null,
          skipReasonBreakdown: Object.fromEntries(
            Object.entries(metrics?.skipReasons ?? {}).map(([key, value]) => [
              key,
              Number(value),
            ]),
          ),
          dependenceWarnings,
          repeatedEntryWarning: REPEATED_ENTRY_WARNING,
        },
        oosCalibrationEvidence: {
          status: resolveEvidenceStatus(blocked, oos !== undefined),
          holdoutObservedNetEdge: holdout?.observedNetEdge ?? null,
          holdoutEffectiveSampleSize: holdout?.effectiveSampleSizeEstimate ?? null,
          holdoutRawObservationCount: holdout?.rawObservationCount ?? 0,
          holdoutIndependentMarketCount: holdout?.independentMarketCount ?? 0,
          holdoutMarketDayCount: holdout?.marketDayCount ?? 0,
          minimumDetectableEffect: holdout?.minimumDetectableEffect ?? null,
          confidenceInterval95: holdout?.confidenceInterval95 ?? null,
          passesCorrected: oos?.passesCorrected ?? false,
          clearsMde: oos?.clearsMde ?? false,
          isUnderpowered: oos?.isUnderpowered ?? false,
          correctedPValue: oos?.correctedPValue ?? null,
          qValue: oos?.qValue ?? null,
          finalStatisticalVerdict: oos?.finalStatisticalVerdict ?? null,
        },
        powerEvidence: {
          status: resolveEvidenceStatus(blocked, oos !== undefined),
          isUnderpowered: oos?.isUnderpowered ?? false,
          clearsMde: oos?.clearsMde ?? false,
          underpoweredReason: holdout?.underpoweredReason ?? null,
        },
        correctionEvidence: {
          status: resolveEvidenceStatus(blocked, oos !== undefined),
          passesCorrected: oos?.passesCorrected ?? false,
          correctionMethod: oos?.correctionMethod ?? null,
          qValue: oos?.qValue ?? null,
        },
        derivedSensitivityEvidence: {
          status: resolveEvidenceStatus(false, derived !== undefined),
          recommendation: derived?.recommendation ?? null,
          derivedObservationShare:
            derived?.allObservations.derivedObservationShare ?? null,
          deltaRobustness: derived?.deltaRobustness ?? null,
          officialOnlyPasses: derived?.officialOnlyObservations.passes ?? null,
          limitationNote: derived?.notes?.join(" ") ?? null,
        },
      };
    })
    .sort((left, right) => left.hypothesisId.localeCompare(right.hypothesisId));

  const familyVerdict = resolveFamilyVerdict({ blocked, hypotheses });

  const primaryFailureReasonHistogram: Record<string, number> = {};
  for (const entry of hypotheses) {
    if (entry.primaryFailureReason) {
      primaryFailureReasonHistogram[entry.primaryFailureReason] =
        (primaryFailureReasonHistogram[entry.primaryFailureReason] ?? 0) + 1;
    }
  }

  const summary: CalibrationFadeFamilyVerdictSummary = {
    familyId,
    familyVerdict,
    hypothesisCount: hypotheses.length,
    promotedHypothesisCount: hypotheses.filter((entry) => entry.verdict === "promote")
      .length,
    rejectedHypothesisCount: hypotheses.filter((entry) =>
      entry.verdict.startsWith("reject-"),
    ).length,
    underpoweredHypothesisCount: hypotheses.filter(
      (entry) => entry.verdict === "underpowered",
    ).length,
    blockedHypothesisCount: hypotheses.filter(
      (entry) => entry.verdict === "blocked-by-missing-artifacts",
    ).length,
    positiveInSampleReplayCount: hypotheses.filter(
      (entry) => entry.tradeReplayEvidence.netPnlCents > 0,
    ).length,
    positiveHoldoutCount: hypotheses.filter(
      (entry) =>
        (entry.oosCalibrationEvidence.holdoutObservedNetEdge ?? 0) > 0,
    ).length,
    correctedPassCount: hypotheses.filter(
      (entry) => entry.correctionEvidence.passesCorrected,
    ).length,
    clearsMdeCount: hypotheses.filter((entry) => entry.powerEvidence.clearsMde)
      .length,
    primaryFailureReasonHistogram,
    recommendedNextAction: resolveRecommendedNextAction({ familyVerdict, hypotheses }),
    missingRequiredArtifacts: loadedInputs.missingRequiredArtifacts,
  };

  return {
    disclaimer: CALIBRATION_FADE_FAMILY_VERDICT_DISCLAIMER,
    caveats: CALIBRATION_FADE_FAMILY_CAVEATS,
    hypotheses,
    summary,
  };
}

export function compareCalibrationFadeHypothesisVerdictEntries(
  left: CalibrationFadeHypothesisVerdictEntry,
  right: CalibrationFadeHypothesisVerdictEntry,
): number {
  return left.hypothesisId.localeCompare(right.hypothesisId);
}
