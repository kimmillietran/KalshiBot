import type { HistoricalCoveragePlanReport } from "@/lib/data/research/coveragePlanner/coveragePlannerTypes";
import { DERIVED_SETTLEMENT_SENSITIVE_MONTHS } from "@/lib/data/research/pnlForensicsGate";

import type {
  MonthCoverageAudit,
  MonthCoverageAuditEntry,
  MonthSettlementStatus,
  OfficialMonthExpansionRefreshConfig,
} from "./officialMonthExpansionRefreshTypes";

function classifySettlementStatus(
  month: string,
  sensitiveMonthSet: ReadonlySet<string>,
): MonthSettlementStatus {
  if (sensitiveMonthSet.has(month)) {
    return "derived-sensitive";
  }

  return "official";
}

function isOfficialImportTarget(
  month: string,
  sensitiveMonthSet: ReadonlySet<string>,
): boolean {
  return !sensitiveMonthSet.has(month);
}

export function buildMonthCoverageAudit(input: {
  generatedAt: string;
  config: OfficialMonthExpansionRefreshConfig;
  coveragePlan: HistoricalCoveragePlanReport | null;
  replayFillCountByMonth: ReadonlyMap<string, number>;
  observationCountByMonth: ReadonlyMap<string, number>;
  hypothesisCandidateCountByMonth: ReadonlyMap<string, number>;
}): MonthCoverageAudit {
  const sensitiveMonths = DERIVED_SETTLEMENT_SENSITIVE_MONTHS;
  const sensitiveMonthSet = new Set<string>(sensitiveMonths);
  const snapshot = input.coveragePlan?.snapshot;
  const monthEntriesFromPlan = snapshot?.monthCoverage ?? [];
  const allMonths = new Set<string>([
    ...monthEntriesFromPlan.map((entry) => entry.month),
    ...input.replayFillCountByMonth.keys(),
    ...input.observationCountByMonth.keys(),
  ]);
  const sortedMonths = [...allMonths].sort();

  const missingMonths = snapshot?.missingMonths ?? [];
  const underCoveredMonths = snapshot?.underCoveredMonths ?? [];
  const coveredMonths = snapshot?.coveredMonths ?? [];

  const importRecommendations = input.coveragePlan?.recommendations ?? [];
  const importableOfficialMonths = new Set<string>();

  for (const recommendation of importRecommendations) {
    for (const month of recommendation.missingMonths ?? []) {
      if (isOfficialImportTarget(month, sensitiveMonthSet)) {
        importableOfficialMonths.add(month);
      }
    }

    if (
      recommendation.startMonth
      && isOfficialImportTarget(recommendation.startMonth, sensitiveMonthSet)
    ) {
      importableOfficialMonths.add(recommendation.startMonth);
    }
  }

  for (const month of [...missingMonths, ...underCoveredMonths]) {
    if (isOfficialImportTarget(month, sensitiveMonthSet)) {
      importableOfficialMonths.add(month);
    }
  }

  const months: MonthCoverageAuditEntry[] = sortedMonths.map((calendarMonth) => {
    const planEntry = monthEntriesFromPlan.find((entry) => entry.month === calendarMonth);
    const settlementStatus = classifySettlementStatus(calendarMonth, sensitiveMonthSet);
    const importable =
      importableOfficialMonths.has(calendarMonth)
      && settlementStatus !== "derived-sensitive";
    let importableReason: string | null = null;
    if (importable) {
      importableReason = "Listed in coverage gap or under-covered import recommendations.";
    } else if (settlementStatus === "derived-sensitive") {
      importableReason = "Derived-settlement-sensitive month; excluded from official expansion.";
    } else if (coveredMonths.includes(calendarMonth)) {
      importableReason = "Already covered at depth thresholds.";
    }

    return {
      calendarMonth,
      settlementStatus,
      marketCount: planEntry?.marketCount ?? 0,
      tradingDayCount: planEntry?.tradingDayCount ?? 0,
      observationCount: input.observationCountByMonth.get(calendarMonth) ?? null,
      replayFillCount: input.replayFillCountByMonth.get(calendarMonth) ?? null,
      hypothesisCandidateCount:
        input.hypothesisCandidateCountByMonth.get(calendarMonth) ?? null,
      coverageStatus: planEntry?.coverageStatus ?? "unknown",
      importable,
      importableReason,
    };
  });

  const officialMonths = sortedMonths.filter(
    (month) => !sensitiveMonthSet.has(month),
  );
  const derivedSensitiveMonths = sortedMonths.filter((month) =>
    sensitiveMonthSet.has(month),
  );
  const alreadyImportedMonths = coveredMonths;

  const newOfficialMonthsAvailable = [...importableOfficialMonths].filter(
    (month) => !alreadyImportedMonths.includes(month),
  );
  const deepenOfficialMonths = [...importableOfficialMonths].filter((month) =>
    alreadyImportedMonths.includes(month),
  );

  let additionalOfficialMonthsReason: string;
  let additionalOfficialMonthsAvailable: boolean;

  if (newOfficialMonthsAvailable.length > 0) {
    additionalOfficialMonthsAvailable = true;
    additionalOfficialMonthsReason = `New official calendar months available to import: ${newOfficialMonthsAvailable.join(", ")}.`;
  } else if (deepenOfficialMonths.length > 0) {
    additionalOfficialMonthsAvailable = true;
    additionalOfficialMonthsReason = `No new calendar months, but official months can be deepened: ${deepenOfficialMonths.join(", ")}.`;
  } else {
    additionalOfficialMonthsAvailable = false;
    additionalOfficialMonthsReason =
      "No additional official/non-derived months are available to import at current horizon; corpus is bounded at 2025-12 (derived-sensitive earliest month).";
  }

  return {
    generatedAt: input.generatedAt,
    sensitiveMonths,
    availableCalendarMonths: sortedMonths,
    officialMonths,
    derivedSensitiveMonths,
    missingMonths,
    underCoveredMonths,
    importableOfficialMonths: [...importableOfficialMonths].sort(),
    alreadyImportedMonths,
    months,
    additionalOfficialMonthsAvailable,
    additionalOfficialMonthsReason,
  };
}
