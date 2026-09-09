import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import type { FrozenHypothesisSpec } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import { classifyCalibrationFadeInterpretation } from "../calibrationFadeForwardValidation/classifyCalibrationFadeInterpretation";
import { aggregateCrossRunMetrics } from "../calibrationFadeCrossRunValidation/aggregateCrossRunMetrics";
import { deduplicateCandidateMarkets } from "../calibrationFadeCrossRunValidation/deduplicateCandidateMarkets";
import type { CrossRunRunSummary } from "../calibrationFadeCrossRunValidation/calibrationFadeCrossRunValidationTypes";
import {
  CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
  CALIBRATION_FADE_V2_HYPOTHESIS_ID,
  CALIBRATION_FADE_V2_HYPOTHESIS_VERSION,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
  loadCalibrationFadeV2HypothesisSpec,
  loadCalibrationFadeV2Provenance,
  type CalibrationFadeV2HypothesisSpec,
} from "../calibrationFadeV2Preregistration";

import { admitAllV2ConfirmatoryRuns } from "./admitV2ConfirmatoryRuns";
import { applyOfflineSettlementOverlay } from "./applyOfflineSettlementOverlay";
import { assertV2CrossRunPublishCompatible } from "./assertV2CrossRunPublishCompatible";
import {
  CALIBRATION_FADE_V2_CROSS_RUN_ANALYSIS_VERSION,
  CalibrationFadeV2CrossRunValidationError,
  type CalibrationFadeV2CrossRunAppearanceLedger,
  type CalibrationFadeV2CrossRunOutputPaths,
  type CalibrationFadeV2CrossRunPerRunLedger,
  type CalibrationFadeV2CrossRunPerRunSummary,
  type CalibrationFadeV2CrossRunValidationIo,
  type V2CrossRunHashPayload,
} from "./calibrationFadeV2CrossRunValidationTypes";
import { computeV2RunSetHash } from "./computeV2RunSetHash";
import type { CalibrationFadeV2CrossRunCliConfig } from "./parseCalibrationFadeV2CrossRunValidationArgv";
import { resolveCalibrationFadeV2CrossRunOutputPaths } from "./resolveCalibrationFadeV2CrossRunOutputPaths";

export type CalibrationFadeV2CrossRunValidationReport = {
  analysisVersion: typeof CALIBRATION_FADE_V2_CROSS_RUN_ANALYSIS_VERSION;
  generatedAt: string;
  artifactGeneratedAt: string;
  runSetHash: string;
  evidenceMode: "confirmatory";
  hypothesisId: string;
  hypothesisVersion: "v2";
  configurationHash: string;
  hypothesisConfigurationHash: string;
  freezeCommitSha: string;
  sourceRecordType: typeof V2_REQUIRED_SOURCE_RECORD_TYPE;
  selectedRunIds: readonly string[];
  selectedRunCount: number;
  candidateEpisodeCount: number;
  rawCandidateAppearanceCount: number;
  uniqueCandidateMarketCount: number;
  evaluatedIndependentCandidateMarketCount: number;
  minimumIndependentCandidateMarkets: number;
  settlementCoverageShare: number | null;
  minimumSettlementCoverageShare: number;
  interpretationClassification: string;
  recommendedNextAction: string;
  rationale: string;
  perRunSummaries: readonly CalibrationFadeV2CrossRunPerRunSummary[];
  provenance: {
    confirmatoryArtifactConsumption: "sealed-published-v2-outputs";
    runSetHashPayload: V2CrossRunHashPayload;
    overlaySourceArtifacts: readonly string[];
    outputPaths: CalibrationFadeV2CrossRunOutputPaths;
  };
  outputPath: string;
  htmlOutputPath: string;
  marketsOutputPath: string;
  runsOutputPath: string;
  appearancesOutputPath: string;
};

function classificationViewFromV2(
  spec: CalibrationFadeV2HypothesisSpec,
  configurationHash: string,
): FrozenHypothesisSpec {
  return {
    hypothesisId: spec.hypothesisId,
    hypothesisVersion: spec.hypothesisVersion,
    description: spec.description,
    canonicalSourceArtifacts: spec.canonicalSourceArtifacts,
    sourceCandidateId: spec.sourceCandidateId,
    axisGroupId: spec.axisGroupId,
    bucketId: spec.bucketId,
    calibrationDirection: spec.calibrationDirection,
    targetOutcomeSide: spec.targetOutcomeSide,
    suggestedStrategyFamily: spec.suggestedStrategyFamily,
    eligibilityRules: spec.eligibilityRules,
    probabilityMeasure: spec.probabilityMeasure,
    volatilityDefinition: {
      sourceInstrument: spec.volatilityDefinition.sourceInstrument,
      returnIntervalMs: spec.volatilityDefinition.returnIntervalMs,
      lookbackBars: spec.volatilityDefinition.lookbackBars,
      method: spec.volatilityDefinition.method,
      causalOnly: true,
      maximumSourceGapMs: 0,
    },
    marketEligibilityRules: spec.marketEligibilityRules,
    deduplicationPolicy: spec.deduplicationPolicy,
    entryPriceMeasures: spec.entryPriceMeasures,
    settlementMapping: spec.settlementMapping,
    minimumEvidenceRequirements: spec.minimumEvidenceRequirements,
    classificationRules: {
      precedence: spec.classificationRules.precedence as FrozenHypothesisSpec["classificationRules"]["precedence"],
    },
    configurationHash,
  };
}

function jsonlLines(records: readonly unknown[]): string[] {
  return records.map((record) => JSON.stringify(record));
}

export function analyzeCalibrationFadeV2CrossRun(input: {
  config: CalibrationFadeV2CrossRunCliConfig;
  io: CalibrationFadeV2CrossRunValidationIo;
  generatedAt: string;
}): {
  report: CalibrationFadeV2CrossRunValidationReport;
  marketLines: string[];
  runLines: string[];
  appearanceLines: string[];
  outputPaths: CalibrationFadeV2CrossRunOutputPaths;
} {
  const { spec } = loadCalibrationFadeV2HypothesisSpec({
    io: input.io,
    hypothesisConfigPath: input.config.hypothesisConfigPath,
  });
  const { provenance } = loadCalibrationFadeV2Provenance({
    io: input.io,
    provenancePath: input.config.provenancePath,
  });
  if (spec.hypothesisId !== CALIBRATION_FADE_V2_HYPOTHESIS_ID) {
    throw new CalibrationFadeV2CrossRunValidationError("Frozen v2 hypothesisId mismatch");
  }
  if (input.config.hypothesisId && input.config.hypothesisId !== CALIBRATION_FADE_V2_HYPOTHESIS_ID) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `--hypothesis-id must match frozen v2 hypothesis ${CALIBRATION_FADE_V2_HYPOTHESIS_ID}`,
    );
  }

  const configurationHash = fnv1a32(stableStringify(spec));
  const admitted = admitAllV2ConfirmatoryRuns({
    io: input.io,
    captureRuns: input.config.captureRuns,
    configurationHash,
    provenance,
  });

  const selectedRunIds = [...admitted.map((entry) => entry.identity.runId)].sort((left, right) =>
    left.localeCompare(right),
  );
  const { runSetHash, payload } = computeV2RunSetHash({
    hypothesisId: CALIBRATION_FADE_V2_HYPOTHESIS_ID,
    configurationHash,
    freezeCommitSha: CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
    sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
    selectedRunIds,
    perRun: admitted.map((entry) => entry.identity),
  });
  const outputPaths = resolveCalibrationFadeV2CrossRunOutputPaths({
    runSetHash,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
    marketsOutputPath: input.config.marketsOutputPath,
    runsOutputPath: input.config.runsOutputPath,
    appearancesOutputPath: input.config.appearancesOutputPath,
  });

  const overlayAppearances = admitted.flatMap((entry) => {
    const overlay = applyOfflineSettlementOverlay({
      io: input.io,
      importsDir: input.config.importsDir,
      markets: entry.markets,
    });
    return overlay.markets.map((market) => ({
      market,
      selectedRunId: entry.captureRun.runId,
      selectedRunDirectory: entry.captureRun.captureRunDir,
      hypothesisConfigurationHash: configurationHash,
      targetOutcomeSide: market.sealedTargetOutcomeSide ?? spec.targetOutcomeSide,
      overlaySourceArtifacts: overlay.overlaySourceArtifacts,
    }));
  });
  const overlaySourceArtifacts = [
    ...new Set(overlayAppearances.flatMap((entry) => entry.overlaySourceArtifacts)),
  ].sort();

  const deduped = deduplicateCandidateMarkets({
    appearances: overlayAppearances.map((entry) => ({
      market: entry.market,
      selectedRunId: entry.selectedRunId,
      selectedRunDirectory: entry.selectedRunDirectory,
      hypothesisConfigurationHash: entry.hypothesisConfigurationHash,
      targetOutcomeSide: entry.targetOutcomeSide,
    })),
  });

  const perRunLedgers: CalibrationFadeV2CrossRunPerRunLedger[] = admitted
    .map((entry) => ({
      runId: entry.captureRun.runId,
      captureRunDir: entry.captureRun.captureRunDir,
      evidenceMode: "confirmatory" as const,
      confirmatoryEligibility: true as const,
      configurationHash,
      freezeCommitSha: CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
      sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
      analysisVersion: entry.identity.analysisVersion,
      captureStartedAt: entry.report.captureStartedAt,
      captureHealthVerdict: entry.report.selectedRunQuality.captureVerdict ?? "unknown",
      readinessVerdict: "v2-capture-ready" as const,
      candidateEpisodeCount: entry.report.candidateEpisodeCount,
      candidateMarketCount: entry.report.candidateMarketCount,
      confirmatoryReportSha: entry.confirmatoryReportSha,
      confirmatoryMarketsSha: entry.confirmatoryMarketsSha,
    }))
    .sort((left, right) => left.runId.localeCompare(right.runId));

  const perRunSummariesForMetrics: CrossRunRunSummary[] = perRunLedgers.map((ledger) => {
    const admittedRun = admitted.find((entry) => entry.captureRun.runId === ledger.runId)!;
    return {
      selectedRunId: ledger.runId,
      selectedRunDirectory: ledger.captureRunDir,
      captureHealthSource: admittedRun.report.selectedRunQuality.captureHealthSource,
      captureVerdict: ledger.captureHealthVerdict,
      researchReadyVerified: true,
      researchReady: true,
      failedHealthReason: null,
      contributedCandidates: ledger.candidateMarketCount > 0,
      excludedFromOutcomeEvaluation: false,
      candidateParsingErrorCount: 0,
      runDurationSeconds: admittedRun.report.selectedRunQuality.runDurationSeconds,
      recordsScanned: admittedRun.report.recordsScanned,
      btcRecordsScanned: admittedRun.report.btcSpotRecordsScanned,
      qualifyingObservationCount: admittedRun.report.qualifyingObservationCount,
      candidateEpisodeCount: ledger.candidateEpisodeCount,
      rawCandidateMarketAppearanceCount: admittedRun.markets.length,
      uniqueCandidateMarketsIntroduced: 0,
      duplicateCandidateAppearanceCount: 0,
      executableEntryAvailableCount: 0,
      settlementJoinedCount: 0,
      evaluatedExecutableCandidateCount: 0,
      grossReturnCents: null,
      feeAdjustedReturnCents: null,
      interpretationClassification: admittedRun.report.summary.interpretationClassification,
      recommendedNextAction: admittedRun.report.summary.recommendedNextAction,
      warnings: admittedRun.report.warnings,
      hypothesisConfigurationHash: configurationHash,
    };
  });

  const metrics = aggregateCrossRunMetrics({
    uniqueMarkets: deduped.uniqueMarkets,
    perRunSummaries: perRunSummariesForMetrics,
  });

  const classificationSpec = classificationViewFromV2(spec, configurationHash);
  const classification = classifyCalibrationFadeInterpretation({
    spec: classificationSpec,
    provenanceAvailable: true,
    featureIncompatible: false,
    candidateMarketCount: metrics.calibration.candidateMarketCount,
    settlementCoverage: metrics.settlementCoverage,
    selectedRunQuality: admitted[0]!.report.selectedRunQuality,
    calibration: metrics.calibration,
    executable: metrics.executable,
  });

  const appearanceLedgers: CalibrationFadeV2CrossRunAppearanceLedger[] = deduped.appearances
    .map((appearance) => ({
      runId: appearance.selectedRunId,
      marketTicker: appearance.marketTicker,
      entryTimestamp: appearance.entryTimestamp,
      canonical: !appearance.suppressed,
      suppressed: appearance.suppressed,
      suppressionReason: appearance.suppressionReason,
      conflicting: appearance.conflicting,
      conflictReasons: appearance.conflictReasons,
    }))
    .sort((left, right) => {
      const ticker = left.marketTicker.localeCompare(right.marketTicker);
      if (ticker !== 0) {
        return ticker;
      }
      const time = left.entryTimestamp.localeCompare(right.entryTimestamp);
      if (time !== 0) {
        return time;
      }
      return left.runId.localeCompare(right.runId);
    });

  const perRunSummaries: CalibrationFadeV2CrossRunPerRunSummary[] = perRunLedgers.map((ledger) => {
    const admittedRun = admitted.find((entry) => entry.captureRun.runId === ledger.runId)!;
    return {
      ...ledger,
      interpretationClassification: admittedRun.report.summary.interpretationClassification,
      recommendedNextAction: admittedRun.report.summary.recommendedNextAction,
    };
  });

  const report: CalibrationFadeV2CrossRunValidationReport = {
    analysisVersion: CALIBRATION_FADE_V2_CROSS_RUN_ANALYSIS_VERSION,
    generatedAt: input.generatedAt,
    artifactGeneratedAt: input.generatedAt,
    runSetHash,
    evidenceMode: "confirmatory",
    hypothesisId: CALIBRATION_FADE_V2_HYPOTHESIS_ID,
    hypothesisVersion: CALIBRATION_FADE_V2_HYPOTHESIS_VERSION,
    configurationHash,
    hypothesisConfigurationHash: configurationHash,
    freezeCommitSha: CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
    sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
    selectedRunIds,
    selectedRunCount: selectedRunIds.length,
    candidateEpisodeCount: perRunLedgers.reduce((sum, run) => sum + run.candidateEpisodeCount, 0),
    rawCandidateAppearanceCount: deduped.rawCandidateMarketAppearanceCount,
    uniqueCandidateMarketCount: deduped.uniqueCandidateMarketCount,
    evaluatedIndependentCandidateMarketCount: metrics.calibration.candidateMarketCount,
    minimumIndependentCandidateMarkets:
      spec.minimumEvidenceRequirements.minimumIndependentCandidateMarkets,
    settlementCoverageShare: metrics.settlementCoverage.settlementCoverageShare,
    minimumSettlementCoverageShare:
      spec.minimumEvidenceRequirements.minimumSettlementCoverageShare,
    interpretationClassification: classification.interpretationClassification,
    recommendedNextAction: classification.recommendedNextAction,
    rationale: classification.rationale,
    perRunSummaries,
    provenance: {
      confirmatoryArtifactConsumption: "sealed-published-v2-outputs",
      runSetHashPayload: payload,
      overlaySourceArtifacts,
      outputPaths,
    },
    outputPath: outputPaths.outputPath,
    htmlOutputPath: outputPaths.htmlOutputPath,
    marketsOutputPath: outputPaths.marketsOutputPath,
    runsOutputPath: outputPaths.runsOutputPath,
    appearancesOutputPath: outputPaths.appearancesOutputPath,
  };

  assertV2CrossRunPublishCompatible({
    io: input.io,
    outputPath: outputPaths.outputPath,
    identity: {
      runSetHash,
      evidenceMode: "confirmatory",
      configurationHash,
      freezeCommitSha: CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
      selectedRunIds,
    },
    semanticBody: report,
  });

  return {
    report,
    marketLines: jsonlLines(deduped.uniqueMarkets),
    runLines: jsonlLines(perRunLedgers),
    appearanceLines: jsonlLines(appearanceLedgers),
    outputPaths,
  };
}
