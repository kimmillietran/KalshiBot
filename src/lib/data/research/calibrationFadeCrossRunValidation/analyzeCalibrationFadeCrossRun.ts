import {
  analyzeCalibrationFadeForwardForRun,
  loadFrozenHypothesisSpec,
  validateCalibrationFadeMarketRecord,
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
import { CalibrationFadeForwardValidationError } from "@/lib/data/research/calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import {
  resolveSelectedRunId,
  SelectedRunCaptureHealthError,
} from "@/lib/data/research/selectedRunCaptureHealth";

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
import { collectRunSourceArtifactIdentities } from "./collectRunSourceArtifactIdentities";
import type { CrossRunSourceIdentity } from "./collectRunSourceArtifactIdentities";
import { computeRunSetHash } from "./computeRunSetHash";
import { deduplicateCandidateMarkets } from "./deduplicateCandidateMarkets";
import {
  describeSelectedRunHealthFailure,
  isSelectedRunResearchReady,
} from "./isSelectedRunResearchReady";

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

/**
 * Parses candidate market JSONL rows failing closed: blank lines are ignored,
 * but malformed JSON rows and syntactically valid rows with an invalid record
 * shape (including `{}`) are counted with their 1-based line numbers so the
 * run can be reported without dumping row payloads.
 */
function parseMarketLines(lines: readonly string[]): {
  markets: CalibrationFadeMarketRecord[];
  malformedLineNumbers: number[];
} {
  const markets: CalibrationFadeMarketRecord[] = [];
  const malformedLineNumbers: number[] = [];
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const validated = validateCalibrationFadeMarketRecord(parsed);
      if (!validated.record) {
        malformedLineNumbers.push(index + 1);
        continue;
      }
      markets.push(validated.record);
    } catch {
      malformedLineNumbers.push(index + 1);
    }
  }
  return { markets, malformedLineNumbers };
}

function buildLeaveOneRunOut(input: {
  applicable: boolean;
  perRunSummaries: readonly CrossRunRunSummary[];
  uniqueMarkets: CalibrationFadeCrossRunValidationReport["uniqueMarkets"];
  spec: FrozenHypothesisSpec;
  provenanceAvailable: boolean;
  runSetIncompatible: boolean;
  candidateParsingErrorCount: number;
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
      candidateParsingErrorCount: input.candidateParsingErrorCount,
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

  const perRunResults: PerRunAnalysisResult[] = [];
  const warnings: string[] = [...provenanceWarnings];
  let runSetIncompatible = false;
  const sourceIdentities: CrossRunSourceIdentity[] = [];
  const parsingErrorsByRun = new Map<string, number[]>();
  // Preserves the operator-provided run order across analyzed AND failed runs
  // so failed runs keep their original ledger position instead of being
  // appended at the end.
  type OrderedRunEntry =
    | { kind: "analyzed"; result: PerRunAnalysisResult }
    | { kind: "failed"; runId: string; runDir: string; reason: string };
  const orderedRunEntries: OrderedRunEntry[] = [];

  // Intentionally never reads data/research-results/calibration-fade-forward-validation.json.
  // analyzeCalibrationFadeForwardForRun returns in-memory report/lines only; scratch output
  // paths below are never published by this cross-run layer.
  for (const captureRunDir of input.config.captureRunDirs) {
    const normalizedDir = captureRunDir.replace(/\\/g, "/").replace(/\/$/, "");
    const runId = resolveSelectedRunId(normalizedDir);
    if (!input.io.isDirectory(normalizedDir) && !input.io.isDirectory(captureRunDir)) {
      throw new CalibrationFadeCrossRunValidationError(
        `Unknown capture run directory: ${captureRunDir}`,
      );
    }

    sourceIdentities.push(collectRunSourceArtifactIdentities(input.io, normalizedDir));

    let report: CalibrationFadeForwardValidationReport;
    let marketLines: string[];
    try {
      const analyzed = await analyzePerRun({
        generatedAt: input.generatedAt,
        outputPath: `${DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH}.cross-run-scratch.${runId}`,
        htmlOutputPath: `${DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_HTML_PATH}.cross-run-scratch.${runId}`,
        config: {
          captureRunDir: normalizedDir,
          hypothesisConfigPath: input.config.hypothesisConfigPath,
          importsDir: input.config.importsDir,
          maximumBtcJoinAgeMs: input.config.maximumBtcJoinAgeMs,
          eventsOutputPath: `${DEFAULT_CALIBRATION_FADE_FORWARD_EVENTS_PATH}.cross-run-scratch.${runId}`,
          marketsOutputPath: `${DEFAULT_CALIBRATION_FADE_FORWARD_MARKETS_PATH}.cross-run-scratch.${runId}`,
        },
        io: input.io,
        hypothesisId: input.hypothesisId ?? spec.hypothesisId,
      });
      report = analyzed.report;
      marketLines = analyzed.marketLines;
    } catch (error) {
      // Health/validation failures keep the selected run in the ledger instead of
      // silently subsetting the operator-provided run set.
      if (
        error instanceof CalibrationFadeForwardValidationError
        || error instanceof SelectedRunCaptureHealthError
      ) {
        orderedRunEntries.push({ kind: "failed", runId, runDir: normalizedDir, reason: error.message });
        warnings.push(`[${runId}] Selected run failed health validation: ${error.message}`);
        continue;
      }
      throw error;
    }

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

    const parsedMarkets = parseMarketLines(marketLines);
    if (parsedMarkets.malformedLineNumbers.length > 0) {
      parsingErrorsByRun.set(runId, parsedMarkets.malformedLineNumbers);
      warnings.push(
        `[${runId}] ${parsedMarkets.malformedLineNumbers.length} malformed candidate market rows at lines ${parsedMarkets.malformedLineNumbers.join(", ")}.`,
      );
    }

    const result: PerRunAnalysisResult = {
      report,
      marketRecords: parsedMarkets.markets,
    };
    perRunResults.push(result);
    orderedRunEntries.push({ kind: "analyzed", result });
    warnings.push(...report.warnings.map((warning) => `[${runId}] ${warning}`));
  }

  const candidateParsingErrorCount = [...parsingErrorsByRun.values()].reduce(
    (sum, lines) => sum + lines.length,
    0,
  );

  const runSetHash = computeRunSetHash({
    captureRunDirs: input.config.captureRunDirs,
    hypothesisId: spec.hypothesisId,
    hypothesisVersion: spec.hypothesisVersion,
    hypothesisConfigurationHash: spec.configurationHash,
    sourceIdentities,
  });

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

  const researchReadyByRunId = new Map<string, boolean>(
    perRunResults.map((result) => [
      result.report.selectedRunId,
      isSelectedRunResearchReady({
        captureHealthSource: result.report.selectedRunQuality.captureHealthSource ?? null,
        captureVerdict: result.report.selectedRunQuality.captureVerdict,
        researchReadyVerified: result.report.selectedRunQuality.researchReadyVerified,
      }),
    ]),
  );

  // Canonical candidates whose source run failed the research-ready gate are
  // preserved in the ledger but excluded from outcome evaluation.
  const uniqueMarkets = dedupe.uniqueMarkets.map((market) => {
    if (researchReadyByRunId.get(market.selectedCanonicalEntry.selectedRunId) !== false) {
      return market;
    }
    return { ...market, evaluated: false };
  });

  const buildAnalyzedRunSummary = (result: PerRunAnalysisResult): CrossRunRunSummary => {
    const runId = result.report.selectedRunId;
    const appearances = dedupe.appearances.filter((entry) => entry.selectedRunId === runId);
    const canonicalForRun = uniqueMarkets.filter(
      (market) => market.selectedCanonicalEntry.selectedRunId === runId,
    );
    const introduced = canonicalForRun.length;
    const duplicates = appearances.filter((entry) => entry.suppressed).length;
    // Run-local appearance counts remain visible; return attribution uses canonical evaluated entries only.
    const executableEntryAvailableCount = appearances.filter(
      (market) => !market.suppressed && market.executableAvailable,
    ).length;
    const settlementJoinedCount = appearances.filter(
      (market) =>
        !market.suppressed
        && (market.settledOutcome === "yes" || market.settledOutcome === "no"),
    ).length;
    const evaluatedCanonical = canonicalForRun.filter((market) => market.evaluated);
    const evaluatedExecutableCandidateCount = evaluatedCanonical.filter(
      (market) =>
        market.selectedCanonicalEntry.executableAvailable
        && (market.selectedCanonicalEntry.settledOutcome === "yes"
          || market.selectedCanonicalEntry.settledOutcome === "no"),
    ).length;
    const feeAdjusted = evaluatedCanonical
      .filter(
        (market) =>
          market.selectedCanonicalEntry.executableAvailable
          && (market.selectedCanonicalEntry.settledOutcome === "yes"
            || market.selectedCanonicalEntry.settledOutcome === "no"),
      )
      .map((market) => market.selectedCanonicalEntry.feeAdjustedReturnCents ?? 0);
    const gross = evaluatedCanonical
      .filter(
        (market) =>
          market.selectedCanonicalEntry.executableAvailable
          && (market.selectedCanonicalEntry.settledOutcome === "yes"
            || market.selectedCanonicalEntry.settledOutcome === "no"),
      )
      .map((market) => market.selectedCanonicalEntry.grossReturnCents ?? 0);

    const researchReady = researchReadyByRunId.get(runId) === true;
    const failedHealthReason = describeSelectedRunHealthFailure({
      captureHealthSource: result.report.selectedRunQuality.captureHealthSource ?? null,
      captureVerdict: result.report.selectedRunQuality.captureVerdict,
      researchReadyVerified: result.report.selectedRunQuality.researchReadyVerified,
    });

    return {
      selectedRunId: runId,
      selectedRunDirectory: result.report.selectedRunDirectory,
      captureHealthSource: result.report.selectedRunQuality.captureHealthSource ?? null,
      captureVerdict: result.report.selectedRunQuality.captureVerdict,
      researchReadyVerified: result.report.selectedRunQuality.researchReadyVerified,
      researchReady,
      failedHealthReason,
      contributedCandidates: appearances.length > 0,
      excludedFromOutcomeEvaluation: !researchReady,
      candidateParsingErrorCount: parsingErrorsByRun.get(runId)?.length ?? 0,
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
  };

  // Failed selected runs stay in the ledger in their original operator
  // position; they are never silently subset out or reordered to the end.
  const perRunSummaries: CrossRunRunSummary[] = orderedRunEntries.map((entry) => {
    if (entry.kind === "analyzed") {
      return buildAnalyzedRunSummary(entry.result);
    }
    return {
      selectedRunId: entry.runId,
      selectedRunDirectory: entry.runDir,
      captureHealthSource: null,
      captureVerdict: null,
      researchReadyVerified: false,
      researchReady: false,
      failedHealthReason: entry.reason,
      contributedCandidates: false,
      excludedFromOutcomeEvaluation: true,
      candidateParsingErrorCount: 0,
      runDurationSeconds: null,
      recordsScanned: 0,
      btcRecordsScanned: 0,
      qualifyingObservationCount: 0,
      candidateEpisodeCount: 0,
      rawCandidateMarketAppearanceCount: 0,
      uniqueCandidateMarketsIntroduced: 0,
      duplicateCandidateAppearanceCount: 0,
      executableEntryAvailableCount: 0,
      settlementJoinedCount: 0,
      evaluatedExecutableCandidateCount: 0,
      grossReturnCents: null,
      feeAdjustedReturnCents: null,
      interpretationClassification: "observation-quality-inconclusive",
      recommendedNextAction: "repair-or-replace-invalid-forward-runs",
      warnings: [entry.reason],
      hypothesisConfigurationHash: spec.configurationHash,
    };
  });

  const researchReadyRunCount = perRunSummaries.filter((run) =>
    isSelectedRunResearchReady(run),
  ).length;

  const invalidSelectedRuns = perRunSummaries
    .filter((run) => !run.researchReady)
    .map((run) => ({
      selectedRunId: run.selectedRunId,
      failedHealthReason:
        run.failedHealthReason ?? "Selected run failed required research-ready health checks.",
      contributedCandidates: run.contributedCandidates,
      excludedFromOutcomeEvaluation: run.excludedFromOutcomeEvaluation,
    }));

  const metrics = aggregateCrossRunMetrics({
    uniqueMarkets,
    perRunSummaries,
  });

  const evaluatedUniqueCount = uniqueMarkets.filter((market) => market.evaluated).length;

  const classification = classifyCalibrationFadeCrossRun({
    spec,
    provenanceAvailable,
    runSetIncompatible,
    candidateParsingErrorCount,
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
    uniqueMarkets,
    spec,
    provenanceAvailable,
    runSetIncompatible,
    candidateParsingErrorCount,
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
    candidateParsingErrorCount,
    invalidSelectedRuns,
    warnings,
    classification: classification.classification,
    interpretationClassification: classification.classification,
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
    uniqueMarkets,
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
        count: perRunResults.length,
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
    marketLines: uniqueMarkets.map((market) => JSON.stringify(market)),
    runLines: perRunSummaries.map((run) => JSON.stringify(run)),
    appearanceLines: dedupe.appearances.map((appearance) => JSON.stringify(appearance)),
  };
}
