import { buildMonthCoverageAudit } from "./auditMonthCoverage";
import { compareEvidenceSnapshots } from "./compareEvidenceSnapshots";
import {
  evaluateRefreshRecommendation,
  resolveRecommendFullM12,
} from "./evaluateRefreshRecommendation";
import {
  countReplayFillsByMonth,
  extractEvidenceSnapshot,
} from "./extractEvidenceSnapshot";
import type { LoadedOfficialMonthExpansionRefreshArtifacts } from "./loadOfficialMonthExpansionRefreshInputs";
import {
  OFFICIAL_MONTH_EXPANSION_REFRESH_CAVEATS,
  OFFICIAL_MONTH_EXPANSION_REFRESH_DISCLAIMER,
} from "./officialMonthExpansionRefreshConfig";
import type {
  ExpansionExecutionSummary,
  OfficialMonthExpansionRefreshConfig,
  OfficialMonthExpansionRefreshInputPaths,
  OfficialMonthExpansionRefreshInputStatus,
  OfficialMonthExpansionRefreshReport,
} from "./officialMonthExpansionRefreshTypes";

function countObservationsByMonth(mispricingAtlas: unknown | null): Map<string, number> {
  const counts = new Map<string, number>();
  if (
    typeof mispricingAtlas !== "object"
    || mispricingAtlas === null
    || !("buckets" in mispricingAtlas)
    || !Array.isArray((mispricingAtlas as { buckets: unknown }).buckets)
  ) {
    return counts;
  }

  for (const bucket of (mispricingAtlas as { buckets: readonly unknown[] }).buckets) {
    if (typeof bucket !== "object" || bucket === null) {
      continue;
    }

    const record = bucket as Record<string, unknown>;
    const month = typeof record.calendarMonth === "string" ? record.calendarMonth : null;
    const observations = typeof record.observations === "number" ? record.observations : 0;
    if (month) {
      counts.set(month, (counts.get(month) ?? 0) + observations);
    }
  }

  return counts;
}

export function buildOfficialMonthExpansionRefreshReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: OfficialMonthExpansionRefreshInputPaths;
  inputStatus: OfficialMonthExpansionRefreshInputStatus;
  config: OfficialMonthExpansionRefreshConfig;
  beforeCapturedAt: string;
  afterCapturedAt: string;
  artifactsBefore: LoadedOfficialMonthExpansionRefreshArtifacts;
  artifactsAfter: LoadedOfficialMonthExpansionRefreshArtifacts;
  expansionExecution: ExpansionExecutionSummary;
}): OfficialMonthExpansionRefreshReport {
  const replayFillBefore = countReplayFillsByMonth(input.artifactsBefore.pnlForensicsGate);
  const observationByMonth = countObservationsByMonth(input.artifactsAfter.mispricingAtlas);

  const monthCoverageAudit = buildMonthCoverageAudit({
    generatedAt: input.generatedAt,
    config: input.config,
    coveragePlan: input.artifactsAfter.historicalCoveragePlan,
    replayFillCountByMonth: replayFillBefore,
    observationCountByMonth: observationByMonth,
    hypothesisCandidateCountByMonth: new Map(),
  });

  const before = extractEvidenceSnapshot({
    capturedAt: input.beforeCapturedAt,
    ...input.artifactsBefore,
  });
  const after = extractEvidenceSnapshot({
    capturedAt: input.afterCapturedAt,
    ...input.artifactsAfter,
  });
  const delta = compareEvidenceSnapshots({ before, after });

  const finalRecommendation = evaluateRefreshRecommendation({
    config: input.config,
    before,
    after,
    delta,
    monthCoverageAudit,
    expansionAttempted: input.expansionExecution.attempted,
    expansionSucceeded: input.expansionExecution.succeeded,
    importExecuted: input.expansionExecution.importExecuted,
  });
  const recommendFullM12 = resolveRecommendFullM12(finalRecommendation, after);

  const warnings: string[] = [];
  if (!input.inputStatus.derivedMonthPnlSensitivityPresent) {
    warnings.push("derived-month-pnl-sensitivity.json missing; run M11.10 before refresh.");
  }
  if (!input.inputStatus.pnlForensicsGatePresent) {
    warnings.push("pnl-forensics-gate.json missing; run M11.9 before refresh.");
  }
  if (monthCoverageAudit.derivedSensitiveMonths.includes(input.config.sensitiveMonth)) {
    warnings.push(
      `Sensitive month ${input.config.sensitiveMonth} is present and excluded from official expansion targets.`,
    );
  }

  const evidenceUnchanged =
    !input.expansionExecution.importExecuted
    && delta.calendarMonthsAdded.length === 0
    && delta.officialMonthsAdded.length === 0
    && (delta.familyNetPnlCentsDelta ?? 0) === 0
    && (delta.excludingSensitiveMonthNetPnlCentsDelta ?? 0) === 0
    && (delta.topMonthShareDelta ?? 0) === 0
    && (delta.uniqueTradingDayCountDelta ?? 0) === 0
    && (delta.marketCountDelta ?? 0) === 0;

  if (evidenceUnchanged) {
    warnings.push(
      input.expansionExecution.importExecuted
        ? "Import executed but evidence metrics are unchanged."
        : "No import executed. Evidence unchanged.",
    );
  }

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: OFFICIAL_MONTH_EXPANSION_REFRESH_DISCLAIMER,
    caveats: [...OFFICIAL_MONTH_EXPANSION_REFRESH_CAVEATS],
    config: input.config,
    inputPaths: input.inputPaths,
    inputStatus: input.inputStatus,
    monthCoverageAudit,
    before,
    after,
    delta,
    expansionExecution: input.expansionExecution,
    finalRecommendation,
    recommendFullM12,
    warnings,
  };
}
