import { DERIVED_SETTLEMENT_SENSITIVE_MONTHS } from "@/lib/data/research/pnlForensicsGate";

import type { EvidenceSnapshot } from "./officialMonthExpansionRefreshTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseMonthlyPnlFromForensics(
  artifact: unknown,
): { positiveMonthCount: number; negativeMonthCount: number; topMonthShare: number | null; top3MonthShare: number | null; calendarMonths: string[] } {
  if (!isRecord(artifact) || !Array.isArray(artifact.monthlyPnl)) {
    return {
      positiveMonthCount: 0,
      negativeMonthCount: 0,
      topMonthShare: null,
      top3MonthShare: null,
      calendarMonths: [],
    };
  }

  const months = artifact.monthlyPnl
    .filter(isRecord)
    .map((entry) => ({
      calendarMonth: readString(entry.calendarMonth) ?? "",
      netPnlCents: readNumber(entry.netPnlCents) ?? 0,
      shareOfTotalPnl: readNumber(entry.shareOfTotalPnl),
    }))
    .filter((entry) => entry.calendarMonth.length > 0);

  const positiveMonthCount = months.filter((month) => month.netPnlCents > 0).length;
  const negativeMonthCount = months.filter((month) => month.netPnlCents < 0).length;
  const sortedShares = months
    .map((month) => month.shareOfTotalPnl ?? 0)
    .sort((left, right) => right - left);
  const topMonthShare = sortedShares[0] ?? null;
  const top3MonthShare =
    sortedShares.length > 0
      ? sortedShares.slice(0, 3).reduce((sum, share) => sum + share, 0)
      : null;

  return {
    positiveMonthCount,
    negativeMonthCount,
    topMonthShare,
    top3MonthShare,
    calendarMonths: months.map((month) => month.calendarMonth).sort(),
  };
}

export function extractEvidenceSnapshot(input: {
  capturedAt: string;
  hypothesisCandidates: unknown | null;
  hypothesisValidation: unknown | null;
  hypothesisTradeReplay: unknown | null;
  calibrationFadeFamilyVerdict: unknown | null;
  pnlForensicsGate: unknown | null;
  derivedMonthPnlSensitivity: unknown | null;
  mispricingAtlas: unknown | null;
}): EvidenceSnapshot {
  const sensitiveMonths = DERIVED_SETTLEMENT_SENSITIVE_MONTHS;
  const sensitiveMonthSet = new Set<string>(sensitiveMonths);

  const hypothesisCount = isRecord(input.hypothesisCandidates)
    && Array.isArray(input.hypothesisCandidates.candidates)
    ? input.hypothesisCandidates.candidates.length
    : null;

  const observationCount = isRecord(input.mispricingAtlas)
    && readNumber(input.mispricingAtlas.totalObservations) !== null
    ? readNumber(input.mispricingAtlas.totalObservations)
    : isRecord(input.hypothesisValidation)
      && readNumber(input.hypothesisValidation.totalObservationCount) !== null
      ? readNumber(input.hypothesisValidation.totalObservationCount)
      : null;

  const replaySummary = isRecord(input.hypothesisTradeReplay)
    ? input.hypothesisTradeReplay.summary
    : null;
  const positiveNetReplayHypothesisCount =
    isRecord(replaySummary)
      ? readNumber(replaySummary.positiveNetHypothesisCount)
      : null;

  const familyVerdictArtifact = input.calibrationFadeFamilyVerdict;
  const familyVerdict = isRecord(familyVerdictArtifact)
    ? readString(familyVerdictArtifact.familyVerdict)
      ?? readString(
        isRecord(familyVerdictArtifact.summary)
          ? familyVerdictArtifact.summary.familyVerdict
          : null,
      )
    : null;

  const forensicsSummary = isRecord(input.pnlForensicsGate)
    ? input.pnlForensicsGate.summary
    : null;
  const forensicsVerdict = isRecord(forensicsSummary)
    ? readString(forensicsSummary.familyForensicsVerdict)
    : null;
  const familyNetPnlFromForensics = isRecord(forensicsSummary)
    ? readNumber(forensicsSummary.familyNetPnlCents)
    : null;
  const uniqueTradingDayCount = isRecord(forensicsSummary)
    ? readNumber(forensicsSummary.uniqueTradingDayCount)
    : null;
  const marketCount = isRecord(forensicsSummary)
    ? readNumber(forensicsSummary.uniqueMarketCount)
    : null;

  const monthlyFromForensics = parseMonthlyPnlFromForensics(input.pnlForensicsGate);

  const sensitivitySummary = isRecord(input.derivedMonthPnlSensitivity)
    ? input.derivedMonthPnlSensitivity.summary
    : null;
  const derivedMonthSensitivityRecommendation = isRecord(sensitivitySummary)
    ? readString(sensitivitySummary.familyRecommendation)
    : null;
  const excludingSensitiveMonthNetPnlCents = isRecord(sensitivitySummary)
    ? readNumber(sensitivitySummary.excludingSensitiveMonthNetPnlCents)
    : null;
  const recommendFullM12 = isRecord(sensitivitySummary)
    ? readBoolean(sensitivitySummary.recommendFullM12)
    : isRecord(forensicsSummary)
      ? readBoolean(forensicsSummary.recommendFullM12)
      : null;

  const familyNetPnlCents =
    isRecord(sensitivitySummary)
      ? readNumber(sensitivitySummary.fullCorpusNetPnlCents) ?? familyNetPnlFromForensics
      : familyNetPnlFromForensics;

  const topMonthShare =
    isRecord(sensitivitySummary) && isRecord(input.derivedMonthPnlSensitivity)
      ? (() => {
        const variants = Array.isArray(input.derivedMonthPnlSensitivity!.variants)
          ? input.derivedMonthPnlSensitivity!.variants
          : [];
        const full = variants.find(
          (variant) =>
            isRecord(variant) && variant.variantId === "full-corpus",
        );
        return isRecord(full) ? readNumber(full.topMonthShare) : monthlyFromForensics.topMonthShare;
      })()
      : monthlyFromForensics.topMonthShare;

  const calendarMonthsCovered = monthlyFromForensics.calendarMonths;
  const officialMonthsCovered = calendarMonthsCovered.filter(
    (month) => !sensitiveMonthSet.has(month),
  );
  const derivedSensitiveMonthsCovered = calendarMonthsCovered.filter((month) =>
    sensitiveMonthSet.has(month),
  );

  const excludingVariant = isRecord(input.derivedMonthPnlSensitivity)
    && Array.isArray(input.derivedMonthPnlSensitivity.variants)
    ? input.derivedMonthPnlSensitivity.variants.find(
      (variant) => isRecord(variant) && variant.variantId === "excluding-sensitive-month",
    )
    : null;
  const officialPositiveMonthCount = isRecord(excludingVariant)
    ? readNumber(excludingVariant.nonSensitivePositiveMonthCount)
      ?? readNumber(excludingVariant.positiveCalendarMonthCount)
    : null;
  const excludingVariantTopMonthShare = isRecord(excludingVariant)
    ? readNumber(excludingVariant.topMonthShare)
    : null;

  return {
    capturedAt: input.capturedAt,
    calendarMonthsCovered,
    officialMonthsCovered,
    derivedSensitiveMonthsCovered,
    marketCount,
    observationCount,
    hypothesisCount,
    positiveNetReplayHypothesisCount,
    familyNetPnlCents,
    excludingSensitiveMonthNetPnlCents,
    topMonthShare,
    top3MonthShare: monthlyFromForensics.top3MonthShare,
    positiveMonthCount: monthlyFromForensics.positiveMonthCount,
    negativeMonthCount: monthlyFromForensics.negativeMonthCount,
    uniqueTradingDayCount,
    familyVerdict,
    forensicsVerdict,
    derivedMonthSensitivityRecommendation,
    recommendFullM12,
    officialPositiveMonthCount,
    excludingVariantTopMonthShare,
  };
}

export function countReplayFillsByMonth(
  pnlForensicsGate: unknown | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  if (!isRecord(pnlForensicsGate) || !Array.isArray(pnlForensicsGate.monthlyPnl)) {
    return counts;
  }

  for (const entry of pnlForensicsGate.monthlyPnl) {
    if (!isRecord(entry)) {
      continue;
    }

    const month = readString(entry.calendarMonth);
    const filledTradeCount = readNumber(entry.filledTradeCount);
    if (month && filledTradeCount !== null) {
      counts.set(month, filledTradeCount);
    }
  }

  return counts;
}
