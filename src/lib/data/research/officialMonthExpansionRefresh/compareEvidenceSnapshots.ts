import type {
  EvidenceSnapshot,
  EvidenceSnapshotDelta,
} from "./officialMonthExpansionRefreshTypes";

function deltaNumber(
  after: number | null,
  before: number | null,
): number | null {
  if (after === null || before === null) {
    return null;
  }

  return after - before;
}

export function compareEvidenceSnapshots(input: {
  before: EvidenceSnapshot;
  after: EvidenceSnapshot;
}): EvidenceSnapshotDelta {
  const beforeOfficial = new Set(input.before.officialMonthsCovered);
  const afterOfficial = new Set(input.after.officialMonthsCovered);
  const beforeCalendar = new Set(input.before.calendarMonthsCovered);
  const afterCalendar = new Set(input.after.calendarMonthsCovered);

  return {
    calendarMonthsAdded: [...afterCalendar].filter((month) => !beforeCalendar.has(month)).sort(),
    officialMonthsAdded: [...afterOfficial].filter((month) => !beforeOfficial.has(month)).sort(),
    marketCountDelta: deltaNumber(input.after.marketCount, input.before.marketCount),
    observationCountDelta: deltaNumber(
      input.after.observationCount,
      input.before.observationCount,
    ),
    hypothesisCountDelta: deltaNumber(
      input.after.hypothesisCount,
      input.before.hypothesisCount,
    ),
    positiveNetReplayHypothesisCountDelta: deltaNumber(
      input.after.positiveNetReplayHypothesisCount,
      input.before.positiveNetReplayHypothesisCount,
    ),
    familyNetPnlCentsDelta: deltaNumber(
      input.after.familyNetPnlCents,
      input.before.familyNetPnlCents,
    ),
    excludingSensitiveMonthNetPnlCentsDelta: deltaNumber(
      input.after.excludingSensitiveMonthNetPnlCents,
      input.before.excludingSensitiveMonthNetPnlCents,
    ),
    topMonthShareDelta: deltaNumber(input.after.topMonthShare, input.before.topMonthShare),
    top3MonthShareDelta: deltaNumber(input.after.top3MonthShare, input.before.top3MonthShare),
    positiveMonthCountDelta: deltaNumber(
      input.after.positiveMonthCount,
      input.before.positiveMonthCount,
    ),
    negativeMonthCountDelta: deltaNumber(
      input.after.negativeMonthCount,
      input.before.negativeMonthCount,
    ),
    uniqueTradingDayCountDelta: deltaNumber(
      input.after.uniqueTradingDayCount,
      input.before.uniqueTradingDayCount,
    ),
  };
}
