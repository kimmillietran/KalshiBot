import { join } from "node:path";

import {
  CALIBRATION_FADE_V2_EVIDENCE_STRENGTH_ANALYSIS_VERSION,
  CalibrationFadeV2EvidenceStrengthError,
  V2_EVIDENCE_STRENGTH_DISCLAIMER,
  V2_EVIDENCE_STRENGTH_HTML_FILENAME,
  V2_EVIDENCE_STRENGTH_HTML_ROOT,
  V2_EVIDENCE_STRENGTH_JSON_FILENAME,
  V2_EVIDENCE_STRENGTH_JSON_ROOT,
  type CalibrationFadeV2EvidenceStrengthConfig,
  type CalibrationFadeV2EvidenceStrengthIo,
  type CalibrationFadeV2EvidenceStrengthReport,
  type FrozenCalibrationThresholds,
} from "./calibrationFadeV2EvidenceStrengthTypes";
import {
  assessLoroInformativeness,
  assessStoppingRule,
  buildMethodologyWarnings,
  recommendResearchAction,
} from "./assessEvidenceStrengthContext";
import {
  buildCandidateIncidence,
  buildRunConcentration,
  buildUtcHourConcentration,
} from "./buildConcentrationAndIncidence";
import {
  assessSourceArtifactAuthority,
  assessVolatilityWindowContiguity,
  buildDiscoveryMethodologyContext,
  buildEvidenceLayerDistinction,
  buildHistoricalLineageContext,
} from "./buildDiscoveryMethodologyContext";
import { buildPowerAnalysisSensitivity } from "./buildPowerAnalysisSensitivity";
import { enumerateExactCalibratedNull } from "./enumerateExactCalibratedNull";
import {
  loadCrossRunReport,
  loadEvaluatedMarketsFromJsonl,
  loadFrozenHypothesisThresholds,
  loadOptionalConfirmatoryIncidence,
  resolveMarketsPath,
} from "./loadEvidenceStrengthInputs";
import { loadCalibrationFadeV2Provenance } from "../calibrationFadeV2Preregistration/loadCalibrationFadeV2Provenance";

export function resolveEvidenceStrengthOutputPaths(input: {
  runSetHash: string;
  settlementSnapshotHash: string;
  outputPath: string | null;
  htmlOutputPath: string | null;
}): { outputPath: string; htmlOutputPath: string } {
  const identityFragment = join(
    input.runSetHash,
    "settlement-snapshots",
    input.settlementSnapshotHash,
  );
  return {
    outputPath:
      input.outputPath
      ?? join(V2_EVIDENCE_STRENGTH_JSON_ROOT, identityFragment, V2_EVIDENCE_STRENGTH_JSON_FILENAME),
    htmlOutputPath:
      input.htmlOutputPath
      ?? join(V2_EVIDENCE_STRENGTH_HTML_ROOT, identityFragment, V2_EVIDENCE_STRENGTH_HTML_FILENAME),
  };
}

export function buildCalibrationFadeV2EvidenceStrengthReport(input: {
  config: CalibrationFadeV2EvidenceStrengthConfig;
  io: CalibrationFadeV2EvidenceStrengthIo;
  generatedAt?: string;
}): CalibrationFadeV2EvidenceStrengthReport {
  const report = loadCrossRunReport(input.io, input.config.crossRunReportPath);
  const sourceArtifactAuthority = assessSourceArtifactAuthority({
    io: input.io,
    crossRunReportPath: input.config.crossRunReportPath,
    runSetHash: report.runSetHash,
    settlementSnapshotHash: report.settlementSnapshotHash,
  });
  const marketsPath = resolveMarketsPath({
    io: input.io,
    crossRunReportPath: input.config.crossRunReportPath,
    explicitMarketsPath: input.config.marketsPath,
    reportMarketsOutputPath: report.marketsOutputPath,
  });
  const markets = loadEvaluatedMarketsFromJsonl(input.io, marketsPath);
  const loadedThresholds = loadFrozenHypothesisThresholds(
    input.io,
    input.config.hypothesisConfigPath,
  );
  const thresholds: FrozenCalibrationThresholds = {
    minimumIndependentCandidateMarkets: loadedThresholds.minimumIndependentCandidateMarkets,
    materialRejectionCalibrationGap: loadedThresholds.materialRejectionCalibrationGap,
    materialSupportCalibrationGap: loadedThresholds.materialSupportCalibrationGap,
    calibrationDirection: loadedThresholds.calibrationDirection,
    minimumSettlementCoverageShare: loadedThresholds.minimumSettlementCoverageShare,
  };

  const enumerated = enumerateExactCalibratedNull({
    markets,
    thresholds,
    governedInterpretationClassification: report.interpretationClassification,
  });

  const runConcentration = buildRunConcentration(markets);
  const candidateCountByRun = new Map(
    runConcentration.map((row) => [row.selectedRunId, row.candidateCount] as const),
  );
  // Include selected runs with zero candidates for concentration completeness.
  for (const runId of report.selectedRunIds) {
    if (!candidateCountByRun.has(runId)) {
      candidateCountByRun.set(runId, 0);
    }
  }

  const loroAssessment = assessLoroInformativeness({
    selectedRunIds: report.selectedRunIds,
    candidateCountByRun,
    frozenMinimumCandidateCount: thresholds.minimumIndependentCandidateMarkets,
  });
  const stoppingRuleAssessment = assessStoppingRule(loadedThresholds);

  const powerAnalysis = buildPowerAnalysisSensitivity({
    impliedYesProbabilities: markets.map((market) => market.impliedYesProbability),
    rejectionGap: thresholds.materialRejectionCalibrationGap,
    supportGap: thresholds.materialSupportCalibrationGap,
    observedGapMagnitude:
      enumerated.distribution.observedSignedCalibrationGap !== 0
        ? Math.abs(enumerated.distribution.observedSignedCalibrationGap)
        : null,
  });

  const perRunIncidence = report.selectedRunIds.map((runId) => {
    const incidence = loadOptionalConfirmatoryIncidence(
      input.io,
      runId,
      input.config.crossRunReportPath,
    );
    return {
      selectedRunId: runId,
      captureDurationSeconds: incidence.runDurationSeconds,
      recordsScanned: incidence.recordsScanned,
      qualifyingObservationCount: incidence.qualifyingObservationCount,
      candidateEpisodeCount: incidence.candidateEpisodeCount,
      candidateMarketCount: candidateCountByRun.get(runId) ?? 0,
    };
  });
  const incidenceLoaded = perRunIncidence.some(
    (row) =>
      row.recordsScanned !== null
      || row.qualifyingObservationCount !== null
      || row.captureDurationSeconds !== null,
  );

  const candidateIncidence = buildCandidateIncidence({
    markets,
    selectedRunIds: report.selectedRunIds,
    perRun: perRunIncidence,
    source: incidenceLoaded
      ? "sealed-confirmatory-forward-validation-summaries"
      : "cross-run-report-and-markets-only",
  });

  const { provenance } = loadCalibrationFadeV2Provenance({
    io: input.io,
    provenancePath: input.config.provenancePath,
  });
  const historicalLineageContext = buildHistoricalLineageContext({
    observationCount: provenance.historicalCandidateLineage.observationCount,
    uniqueTradingDays: provenance.historicalCandidateLineage.uniqueTradingDays,
    passes: provenance.historicalCandidateLineage.passes,
    robustnessScore: provenance.historicalCandidateLineage.robustnessScore,
    role: provenance.historicalCandidateLineage.role,
    notes: provenance.historicalCandidateLineage.notes,
    limitations: provenance.limitations,
  });
  const discoveryMethodologyContext = buildDiscoveryMethodologyContext();
  const volatilityWindowContiguity = assessVolatilityWindowContiguity({
    missingMinuteBehavior: loadedThresholds.missingMinuteBehavior,
    returnIntervalMs: loadedThresholds.returnIntervalMs,
  });
  const evidenceLayerDistinction = buildEvidenceLayerDistinction({
    governedInterpretationClassification: report.interpretationClassification,
    inferentialStrengthSummary:
      `n=${markets.length}; observedGap=${String(enumerated.uncertainty.observedSignedCalibrationGap)}; `
      + `P(reject|calibrated-null)=${enumerated.distribution.probabilityOfReject}; `
      + `inconclusiveReachable=${String(enumerated.reachability.inconclusiveBandReachable)}.`,
    historicalPasses: historicalLineageContext.passes,
  });

  const methodologyWarnings = buildMethodologyWarnings({
    candidateMarketCount: markets.length,
    inconclusiveBandReachable: enumerated.reachability.inconclusiveBandReachable,
    stoppingRule: stoppingRuleAssessment,
    loro: loroAssessment,
    probabilityOfReject: enumerated.distribution.probabilityOfReject,
    candidateContributingRunCount: loroAssessment.candidateContributingRunCount,
    historicalLineage: historicalLineageContext,
    discovery: discoveryMethodologyContext,
    sourceArtifactAuthority,
    volatilityWindowContiguity,
  });

  const finiteRequiredNs = powerAnalysis.rows
    .map((row) => row.requiredN)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const minRequiredNAmongPowerRows =
    finiteRequiredNs.length > 0 ? Math.min(...finiteRequiredNs) : null;

  const recommendedResearchAction = recommendResearchAction({
    candidateMarketCount: markets.length,
    frozenMinimum: thresholds.minimumIndependentCandidateMarkets,
    settlementCoverageShare: report.settlementCoverageShare,
    minRequiredNAmongPowerRows,
    stoppingRule: stoppingRuleAssessment,
  });

  const outputPaths = resolveEvidenceStrengthOutputPaths({
    runSetHash: report.runSetHash,
    settlementSnapshotHash: report.settlementSnapshotHash,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
  });

  if (outputPaths.outputPath.includes("latest") || outputPaths.htmlOutputPath.includes("latest")) {
    throw new CalibrationFadeV2EvidenceStrengthError(
      "Evidence-strength outputs must not use mutable latest paths",
    );
  }

  return {
    analysisVersion: CALIBRATION_FADE_V2_EVIDENCE_STRENGTH_ANALYSIS_VERSION,
    disclaimer: V2_EVIDENCE_STRENGTH_DISCLAIMER,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceRunSetHash: report.runSetHash,
    sourceSettlementSnapshotHash: report.settlementSnapshotHash,
    sourceEvidenceMode: report.evidenceMode,
    sourceCrossRunReportPath: input.config.crossRunReportPath,
    sourceMarketsPath: marketsPath,
    governedInterpretationClassification: report.interpretationClassification,
    governedRecommendedNextAction: report.recommendedNextAction,
    candidateMarketCount: markets.length,
    selectedRunCount: report.selectedRunCount,
    candidateContributingRunCount: loroAssessment.candidateContributingRunCount,
    observedSignedCalibrationGap: enumerated.uncertainty.observedSignedCalibrationGap,
    frozenThresholds: thresholds,
    verdictReachability: enumerated.reachability,
    exactCalibratedNullDistribution: enumerated.distribution,
    uncertainty: enumerated.uncertainty,
    powerAnalysis,
    runConcentration: [
      ...report.selectedRunIds
        .filter((runId) => !runConcentration.some((row) => row.selectedRunId === runId))
        .map((selectedRunId) => ({
          selectedRunId,
          candidateCount: 0,
          candidateShare: markets.length > 0 ? 0 : null,
          meanSignedCalibrationGap: null,
        })),
      ...runConcentration,
    ].sort((left, right) => left.selectedRunId.localeCompare(right.selectedRunId)),
    utcHourConcentration: buildUtcHourConcentration(markets),
    candidateIncidence,
    stoppingRuleAssessment,
    historicalLineageContext,
    discoveryMethodologyContext,
    evidenceLayerDistinction,
    sourceArtifactAuthority,
    volatilityWindowContiguity,
    loroAssessment,
    methodologyWarnings,
    recommendedResearchAction,
    outputPath: outputPaths.outputPath,
    htmlOutputPath: outputPaths.htmlOutputPath,
  };
}
