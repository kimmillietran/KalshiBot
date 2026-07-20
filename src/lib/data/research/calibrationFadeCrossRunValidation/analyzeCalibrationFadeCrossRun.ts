import {
  analyzeCalibrationFadeForwardForRun,
  loadFrozenHypothesisSpec,
  DEFAULT_CALIBRATION_FADE_FORWARD_EVENTS_PATH,
  DEFAULT_CALIBRATION_FADE_FORWARD_MARKETS_PATH,
  DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_HTML_PATH,
  DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH,
} from "@/lib/data/research/calibrationFadeForwardValidation";
import type {
  CalibrationFadeForwardValidationConfig,
  CalibrationFadeForwardValidationIo,
  CalibrationFadeForwardValidationReport,
  CalibrationFadeMarketRecord,
  FrozenHypothesisSpec,
} from "@/lib/data/research/calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import { RESEARCH_READY_CAPTURE_VERDICT } from "@/lib/data/research/selectedRunCaptureHealth";
import { resolveSelectedRunId } from "@/lib/data/research/selectedRunCaptureHealth";

import { aggregateCrossRunMetrics } from "./aggregateCrossRunMetrics";
import {
  CALIBRATION_FADE_CROSS_RUN_DISCLAIMER,
  CALIBRATION_FADE_CROSS_RUN_VALIDATION_VERSION,
  CalibrationFadeCrossRunValidationError,
  type CalibrationFadeCrossRunValidationConfig,
  type CalibrationFadeCrossRunValidationReport,
  type CrossRunRunSummary,
  type PerRunAnalysisResult,
} from "./calibrationFadeCrossRunValidationTypes";
import { classifyCalibrationFadeCrossRun } from "./classifyCalibrationFadeCrossRun";
import { computeRunSetHash } from "./computeRunSetHash";
import { deduplicateCandidateMarkets } from "./deduplicateCandidateMarkets";

export type AnalyzePerRunFn = (input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: CalibrationFadeForwardValidationConfig;
  io: CalibrationFadeForwardValidationIo;
  hypothesisId?: string;
}) => Promise<{
  report: CalibrationFadeForwardValidationReport;
  eventLines: string[];
  marketLines: string[];
}>;

function parseMarketLines(lines: readonly string[]): CalibrationFadeMarketRecord[] {
  const markets: CalibrationFadeMarketRecord[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      markets.push(JSON.parse(trimmed) as CalibrationFadeMarketRecord);
    } catch {
      // skip malformed
    }
  }
  return markets;
}

function isResearchReady(verdict: string | null): boolean {
  return verdict === RESEARCH_READY_CAPTURE_VERDICT || verdict === "capture-research-ready";
}

function buildLeaveOneRunOut(input: {
  applicable: boolean;
  perRunSummaries: readonly CrossRunRunSummary[];
  uniqueMarkets: CalibrationFadeCrossRunValidationReport["uniqueMarkets"];
  spec: FrozenHypothesisSpec;
  provenanceAvailable: boolean;
  runSetIncompatible: boolean;
}): CalibrationFadeCrossRunValidationReport["leaveOneRunOut"] {
  if (!input.applicable || input.perRunSummaries.length < 3) {
    return { applicable: false, folds: [] };
  }

  const folds = input.perRunSummaries.map((excluded) => {
    const remainingRuns = input.perRunSummaries.filter(
      (run) => run.selectedRunId !== excluded.selectedRunId,
    );
    const remainingMarkets = input.uniqueMarkets.filter(
      (market) => market.selectedCanonicalEntry.selectedRunId !== excluded.selectedRunId,
    );
    const metrics = aggregateCrossRunMetrics({
      uniqueMarkets: remainingMarkets,
      perRunSummaries: remainingRuns,
    });
    const classification = classifyCalibrationFadeCrossRun({
      spec: input.spec,
      provenanceAvailable: input.provenanceAvailable,
      runSetIncompatible: input.runSetIncompatible,
      perRunSummaries: remainingRuns,
      uniqueCandidateMarketCount: remainingMarkets.filter((market) => market.evaluated).length,
      settlementCoverage: metrics.settlementCoverage,
      calibration: metrics.calibration,
      executable: metrics.executable,
    });
    return {
      excludedRunId: excluded.selectedRunId,
      uniqueCandidateMarketCount: remainingMarkets.length,
      marketLevelSignedCalibrationGap: metrics.calibration.marketLevelSignedCalibrationGap,
      feeAdjustedReturnCents: metrics.executable.feeAdjustedReturnCents,
      classification: classification.classification,
    };
  });

  return { applicable: true, folds };
}

/** Aggregates explicitly selected runs under one frozen hypothesis without mutating M13.2 outputs. */
export async function analyzeCalibrationFadeCrossRun(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: CalibrationFadeCrossRunValidationConfig;
  io: CalibrationFadeForwardValidationIo;
  hypothesisId?: string;
  analyzePerRun?: AnalyzePerRunFn;
}): Promise<{
  report: CalibrationFadeCrossRunValidationReport;
  marketLines: string[];
  runLines: string[];
  appearanceLines: string[];
}> {
  const analyzePerRun = input.analyzePerRun ?? analyzeCalibrationFadeForwardForRun;

  const { spec, historicalBenchmark, provenanceAvailable, warnings: provenanceWarnings } =
    loadFrozenHypothesisSpec({
      io: input.io,
      hypothesisConfigPath: input.config.hypothesisConfigPath,
      hypothesisId: input.hypothesisId,
    });

  const runSetHash = computeRunSetHash({
    captureRunDirs: input.config.captureRunDirs,
    hypothesisId: spec.hypothesisId,
    hypothesisVersion: spec.hypothesisVersion,
    hypothesisConfigurationHash: spec.configurationHash,
  });

  const perRunResults: PerRunAnalysisResult[] = [];
  const warnings: string[] = [...provenanceWarnings];
  let runSetIncompatible = false;

  // Intentionally never reads data/research-results/calibration-fade-forward-validation.json
  for (const captureRunDir of input.config.captureRunDirs) {
    const runId = resolveSelectedRunId(captureRunDir);
    if (!input.io.isDirectory(captureRunDir)) {
      throw new CalibrationFadeCrossRunValidationError(
        `Unknown capture run directory: ${captureRunDir}`,
      );
    }

    const { report, marketLines } = await analyzePerRun({
      generatedAt: input.generatedAt,
      // Dummy paths — aggregation must not publish M13.2 global mutable outputs.
      outputPath: `${DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH}.cross-run-scratch.${runId}`,
      htmlOutputPath: `${DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_HTML_PATH}.cross-run-scratch.${runId}`,
      config: {
        captureRunDir,
        hypothesisConfigPath: input.config.hypothesisConfigPath,
        importsDir: input.config.importsDir,
        maximumBtcJoinAgeMs: input.config.maximumBtcJoinAgeMs,
        eventsOutputPath: `${DEFAULT_CALIBRATION_FADE_FORWARD_EVENTS_PATH}.cross-run-scratch.${runId}`,
        marketsOutputPath: `${DEFAULT_CALIBRATION_FADE_FORWARD_MARKETS_PATH}.cross-run-scratch.${runId}`,
      },
      io: input.io,
      hypothesisId: input.hypothesisId ?? spec.hypothesisId,
    });

    if (
      report.hypothesisId !== spec.hypothesisId
      || report.hypothesisVersion !== spec.hypothesisVersion
      || report.hypothesisConfigurationHash !== spec.configurationHash
    ) {
      runSetIncompatible = true;
      warnings.push(
        `Run ${runId} hypothesis identity mismatch (id=${report.hypothesisId}, version=${report.hypothesisVersion}, hash=${report.hypothesisConfigurationHash}).`,
      );
    }

    perRunResults.push({
      report,
      marketRecords: parseMarketLines(marketLines),
    });
    warnings.push(...report.warnings.map((warning) => `[${runId}] ${warning}`));
  }

  const appearanceInputs = perRunResults.flatMap((result) =>
    result.marketRecords.map((market) => ({
      market,
      selectedRunId: result.report.selectedRunId,
      selectedRunDirectory: result.report.selectedRunDirectory,
      hypothesisConfigurationHash: result.report.hypothesisConfigurationHash,
      targetOutcomeSide: spec.targetOutcomeSide,
    })),
  );

  const dedupe = deduplicateCandidateMarkets({ appearances: appearanceInputs });

  const perRunSummaries: CrossRunRunSummary[] = perRunResults.map((result) => {
    const runId = result.report.selectedRunId;
    const appearances = dedupe.appearances.filter((entry) => entry.selectedRunId === runId);
    const introduced = dedupe.uniqueMarkets.filter(
      (market) => market.selectedCanonicalEntry.selectedRunId === runId,
    ).length;
    const duplicates = appearances.filter((entry) => entry.suppressed).length;
    const executableEntryAvailableCount = result.marketRecords.filter(
      (market) => market.executableAvailable,
    ).length;
    const settlementJoinedCount = result.marketRecords.filter(
      (market) => market.settledOutcome === "yes" || market.settledOutcome === "no",
    ).length;
    const evaluatedExecutableCandidateCount = result.marketRecords.filter(
      (market) =>
        market.executableAvailable
        && (market.settledOutcome === "yes" || market.settledOutcome === "no"),
    ).length;
    const feeAdjusted = result.marketRecords
      .filter(
        (market) =>
          market.executableAvailable
          && (market.settledOutcome === "yes" || market.settledOutcome === "no"),
      )
      .map((market) => market.feeAdjustedReturnCents ?? 0);
    const gross = result.marketRecords
      .filter(
        (market) =>
          market.executableAvailable
          && (market.settledOutcome === "yes" || market.settledOutcome === "no"),
      )
      .map((market) => market.grossReturnCents ?? 0);

    return {
      selectedRunId: runId,
      selectedRunDirectory: result.report.selectedRunDirectory,
      captureHealthSource: result.report.selectedRunQuality.captureHealthSource ?? null,
      captureVerdict: result.report.selectedRunQuality.captureVerdict,
      runDurationSeconds: result.report.selectedRunQuality.runDurationSeconds,
      recordsScanned: result.report.recordsScanned,
      btcRecordsScanned: result.report.btcRecordsScanned,
      qualifyingObservationCount: result.report.qualifyingObservationCount,
      candidateEpisodeCount: result.report.candidateEpisodeCount,
      rawCandidateMarketAppearanceCount: appearances.length,
      uniqueCandidateMarketsIntroduced: introduced,
      duplicateCandidateAppearanceCount: duplicates,
      executableEntryAvailableCount,
      settlementJoinedCount,
      evaluatedExecutableCandidateCount,
      grossReturnCents: gross.length ? gross.reduce((a, b) => a + b, 0) : null,
      feeAdjustedReturnCents: feeAdjusted.length ? feeAdjusted.reduce((a, b) => a + b, 0) : null,
      interpretationClassification: result.report.summary.interpretationClassification,
      recommendedNextAction: result.report.summary.recommendedNextAction,
      warnings: result.report.warnings,
      hypothesisConfigurationHash: result.report.hypothesisConfigurationHash,
    };
  });

  const researchReadyRunCount = perRunSummaries.filter((run) =>
    isResearchReady(run.captureVerdict),
  ).length;

  const metrics = aggregateCrossRunMetrics({
    uniqueMarkets: dedupe.uniqueMarkets,
    perRunSummaries,
  });

  const evaluatedUniqueCount = dedupe.uniqueMarkets.filter((market) => market.evaluated).length;

  const classification = classifyCalibrationFadeCrossRun({
    spec,
    provenanceAvailable,
    runSetIncompatible,
    perRunSummaries,
    uniqueCandidateMarketCount: evaluatedUniqueCount,
    settlementCoverage: metrics.settlementCoverage,
    calibration: metrics.calibration,
    executable: metrics.executable,
  });

  const totalCaptureDurationSeconds = perRunSummaries.every(
    (run) => run.runDurationSeconds !== null,
  )
    ? perRunSummaries.reduce((sum, run) => sum + (run.runDurationSeconds ?? 0), 0)
    : null;

  const selectedRunIds = [...perRunSummaries.map((run) => run.selectedRunId)].sort((a, b) =>
    a.localeCompare(b),
  );
  const selectedRunDirectories = [...input.config.captureRunDirs]
    .map((dir) => dir.replace(/\\/g, "/").replace(/\/$/, ""))
    .sort((a, b) => a.localeCompare(b));

  const leaveOneRunOut = buildLeaveOneRunOut({
    applicable: perRunSummaries.length >= 3,
    perRunSummaries,
    uniqueMarkets: dedupe.uniqueMarkets,
    spec,
    provenanceAvailable,
    runSetIncompatible,
  });

  const report: CalibrationFadeCrossRunValidationReport = {
    analysisVersion: CALIBRATION_FADE_CROSS_RUN_VALIDATION_VERSION,
    analysisScope: "explicit-cross-run",
    artifactGeneratedAt: input.generatedAt,
    hypothesisId: spec.hypothesisId,
    hypothesisVersion: spec.hypothesisVersion,
    hypothesisConfigurationHash: spec.configurationHash,
    runSetHash,
    selectedRunIds,
    selectedRunDirectories,
    operatorProvidedRunOrder: input.config.operatorProvidedRunOrder,
    selectedRunCount: perRunSummaries.length,
    researchReadyRunCount,
    totalCaptureDurationSeconds,
    totalRecordsScanned: perRunSummaries.reduce((sum, run) => sum + run.recordsScanned, 0),
    totalBtcRecordsScanned: perRunSummaries.reduce((sum, run) => sum + run.btcRecordsScanned, 0),
    totalQualifyingObservationCount: perRunSummaries.reduce(
      (sum, run) => sum + run.qualifyingObservationCount,
      0,
    ),
    totalCandidateEpisodeCount: perRunSummaries.reduce(
      (sum, run) => sum + run.candidateEpisodeCount,
      0,
    ),
    rawCandidateMarketAppearanceCount: dedupe.rawCandidateMarketAppearanceCount,
    duplicateCandidateAppearanceCount: dedupe.duplicateCandidateAppearanceCount,
    uniqueCandidateMarketCount: dedupe.uniqueCandidateMarketCount,
    conflictingCandidateMarketCount: dedupe.conflictingCandidateMarketCount,
    executableEntryAvailableCount: metrics.executableEntryAvailableCount,
    settlementJoinedCount: metrics.settlementJoinedCount,
    evaluatedExecutableCandidateCount: metrics.evaluatedExecutableCandidateCount,
    executableCandidateCount: metrics.evaluatedExecutableCandidateCount,
    unavailableExecutablePriceCount: metrics.unavailableExecutablePriceCount,
    settlementCoverageShare: metrics.settlementCoverage.settlementCoverageShare,
    warnings,
    classification: classification.classification,
    recommendedNextAction: classification.recommendedNextAction,
    rationale: classification.rationale,
    inputArtifactIdentities: perRunResults.flatMap(
      (result) => result.report.inputArtifactIdentities as readonly Record<string, unknown>[],
    ),
    historicalBenchmark,
    frozenHypothesis: {
      hypothesisId: spec.hypothesisId,
      hypothesisVersion: spec.hypothesisVersion,
      description: spec.description,
      configurationHash: spec.configurationHash,
      targetOutcomeSide: spec.targetOutcomeSide,
      calibrationDirection: spec.calibrationDirection,
      eligibilityRules: spec.eligibilityRules,
      minimumEvidenceRequirements: spec.minimumEvidenceRequirements,
    },
    perRunSummaries,
    uniqueMarkets: dedupe.uniqueMarkets,
    appearances: dedupe.appearances,
    calibration: metrics.calibration,
    executable: metrics.executable,
    settlementCoverage: metrics.settlementCoverage,
    runFunnel: [
      { stageId: "selected-runs", label: "Selected runs", count: perRunSummaries.length },
      { stageId: "research-ready-runs", label: "Research-ready runs", count: researchReadyRunCount },
      {
        stageId: "successfully-analyzed-runs",
        label: "Successfully analyzed runs",
        count: perRunSummaries.length,
      },
    ],
    candidateFunnel: [
      {
        stageId: "raw-appearances",
        label: "Raw candidate market appearances",
        count: dedupe.rawCandidateMarketAppearanceCount,
      },
      {
        stageId: "unique-markets",
        label: "Unique candidate markets",
        count: dedupe.uniqueCandidateMarketCount,
      },
      {
        stageId: "executable-entries",
        label: "Executable entries available",
        count: metrics.executableEntryAvailableCount,
      },
      {
        stageId: "settlements-joined",
        label: "Settlements joined",
        count: metrics.settlementJoinedCount,
      },
      {
        stageId: "evaluated-candidates",
        label: "Evaluated executable candidates",
        count: metrics.evaluatedExecutableCandidateCount,
      },
    ],
    runContributions: metrics.runContributions,
    leaveOneRunOut,
    missingSettlementMarkets: metrics.missingSettlementMarkets,
    recommendedBackfillRunIds: metrics.recommendedBackfillRunIds,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    marketsOutputPath: input.config.marketsOutputPath,
    runsOutputPath: input.config.runsOutputPath,
    appearancesOutputPath: input.config.appearancesOutputPath,
    disclaimer: CALIBRATION_FADE_CROSS_RUN_DISCLAIMER,
  };

  return {
    report,
    marketLines: dedupe.uniqueMarkets.map((market) => JSON.stringify(market)),
    runLines: perRunSummaries.map((run) => JSON.stringify(run)),
    appearanceLines: dedupe.appearances.map((appearance) => JSON.stringify(appearance)),
  };
}
