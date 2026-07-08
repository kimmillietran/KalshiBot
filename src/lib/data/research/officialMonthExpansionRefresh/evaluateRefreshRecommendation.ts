import type {
  EvidenceSnapshot,
  EvidenceSnapshotDelta,
  MonthCoverageAudit,
  OfficialMonthExpansionRefreshConfig,
  OfficialMonthRefreshRecommendation,
} from "./officialMonthExpansionRefreshTypes";

const PAUSE_FORENSICS_VERDICTS = new Set([
  "pause-family-concentrated-pnl",
  "collect-more-data",
]);
const PAUSE_SENSITIVITY_RECOMMENDATIONS = new Set([
  "collect-more-official-months",
  "pause-family-derived-month-dependent",
  "reject-family-derived-month-artifact",
]);

export function evaluateRefreshRecommendation(input: {
  config: OfficialMonthExpansionRefreshConfig;
  before: EvidenceSnapshot;
  after: EvidenceSnapshot;
  delta: EvidenceSnapshotDelta;
  monthCoverageAudit: MonthCoverageAudit;
  expansionAttempted: boolean;
  expansionSucceeded: boolean;
  importExecuted: boolean;
}): OfficialMonthRefreshRecommendation {
  const { after, delta, monthCoverageAudit, importExecuted, expansionAttempted, expansionSucceeded } =
    input;

  if (expansionAttempted && !expansionSucceeded) {
    return "blocked-import-refresh";
  }

  const meaningfulNewMonths =
    delta.calendarMonthsAdded.length > 0 || delta.officialMonthsAdded.length > 0;
  const meaningfulDepthIncrease =
    (delta.marketCountDelta ?? 0) > 0
    || (delta.observationCountDelta ?? 0) > 0
    || (delta.uniqueTradingDayCountDelta ?? 0) > 0;

  if (
    importExecuted
    && !meaningfulNewMonths
    && !meaningfulDepthIncrease
    && (delta.familyNetPnlCentsDelta ?? 0) === 0
    && (delta.marketCountDelta ?? 0) === 0
    && (delta.observationCountDelta ?? 0) === 0
  ) {
    return "insufficient-new-data";
  }

  if (
    !importExecuted
    && !meaningfulNewMonths
    && !meaningfulDepthIncrease
    && !monthCoverageAudit.additionalOfficialMonthsAvailable
  ) {
    return "pivot-new-family";
  }

  if (
    !importExecuted
    && monthCoverageAudit.additionalOfficialMonthsAvailable
    && monthCoverageAudit.importableOfficialMonths.length > 0
  ) {
    return "collect-more-official-months";
  }

  if (!importExecuted && !monthCoverageAudit.additionalOfficialMonthsAvailable) {
    return "pivot-new-family";
  }

  const familyPositive = (after.familyNetPnlCents ?? 0) > 0;
  const excludingPositive = (after.excludingSensitiveMonthNetPnlCents ?? 0) > 0;
  const officialPositiveMonths = after.officialPositiveMonthCount ?? 0;
  const topMonthShare = after.excludingVariantTopMonthShare ?? after.topMonthShare ?? 1;
  const tradingDays = after.uniqueTradingDayCount ?? 0;
  const tradingDaysBefore = input.before.uniqueTradingDayCount ?? 0;
  const tradingDaysIncreased =
    tradingDays - tradingDaysBefore >= input.config.minUniqueTradingDayIncrease;

  const forensicsPaused =
    after.forensicsVerdict !== null
    && PAUSE_FORENSICS_VERDICTS.has(after.forensicsVerdict);
  const sensitivityPaused =
    after.derivedMonthSensitivityRecommendation !== null
    && PAUSE_SENSITIVITY_RECOMMENDATIONS.has(after.derivedMonthSensitivityRecommendation);

  if (!familyPositive || !excludingPositive) {
    return "pause-calibration-fade";
  }

  if (forensicsPaused || sensitivityPaused) {
    if (meaningfulNewMonths || meaningfulDepthIncrease) {
      return "collect-more-official-months";
    }

    return "pause-calibration-fade";
  }

  if (
    familyPositive
    && excludingPositive
    && officialPositiveMonths >= input.config.minOfficialPositiveMonths
    && topMonthShare <= input.config.topMonthMaxShare
    && tradingDaysIncreased
    && after.recommendFullM12 === true
  ) {
    return "proceed-to-trade-pnl-oos";
  }

  if (familyPositive && excludingPositive) {
    return "collect-more-official-months";
  }

  return "pause-calibration-fade";
}

export function resolveRecommendFullM12(
  recommendation: OfficialMonthRefreshRecommendation,
  after: EvidenceSnapshot,
): boolean {
  if (recommendation === "proceed-to-trade-pnl-oos") {
    return true;
  }

  return after.recommendFullM12 === true;
}
