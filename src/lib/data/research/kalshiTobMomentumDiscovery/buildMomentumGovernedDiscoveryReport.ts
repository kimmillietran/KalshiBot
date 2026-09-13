import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";
import { FAMILY_HYPOTHESIS_COUNT, MOMENTUM_FAMILY_ID } from "../kalshiTobMomentumFamily";
import {
  classifyContinuationDirectionConsistency,
  midpointOnlyCannotAuthorizeEconomicSupport,
  rankAndShortlistTrainCandidates,
  rejectReversalDirectionMutation,
  type MomentumCandidateDefinition,
} from "../momentumEvidenceContract";

import {
  buildMomentumResearchSplitManifest,
  sha256Hex,
} from "./buildMomentumResearchSplitManifest";
import { createTrainOnlyMomentumDiscoveryIo } from "./createTrainOnlyDiscoveryIo";
import {
  DEFAULT_MOMENTUM_DISCOVERY_HTML_ROOT,
  DEFAULT_MOMENTUM_DISCOVERY_JSON_ROOT,
  MOMENTUM_DISCOVERY_CELLS_FILENAME,
  MOMENTUM_DISCOVERY_DISCLAIMER,
  MOMENTUM_DISCOVERY_HTML_FILENAME,
  MOMENTUM_DISCOVERY_JSON_FILENAME,
  MOMENTUM_DISCOVERY_SPLIT_FILENAME,
  MOMENTUM_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
  MomentumGovernedDiscoveryError,
  type MomentumDiscoveryCandidateResult,
  type MomentumDiscoveryIo,
  type MomentumDiscoveryStatus,
  type MomentumGovernedDiscoveryReport,
  type MomentumTrainCaptureMetrics,
} from "./momentumDiscoveryTypes";
import {
  isDirectionConsistentWithFamily,
  printMomentumPreOpenSummary,
  sealMomentumPreOpenBundle,
  STRUCTURAL_SIMPLICITY_ORDERING_RULE,
} from "./preOpenGate";
import {
  loadCloseTimeByMarket,
  streamTrainMomentumDiscovery,
  summarizeCellMetrics,
} from "./streamTrainMomentumDiscovery";

export function resolveMomentumDiscoveryOutputPaths(input: {
  discoveryIdentity: string;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
}): {
  outputDir: string;
  outputPath: string;
  htmlOutputPath: string;
  cellsOutputPath: string;
  splitManifestPath: string;
} {
  const outputDir =
    input.outputPath != null
      ? input.outputPath.replace(/[/\\][^/\\]+$/, "")
      : join(DEFAULT_MOMENTUM_DISCOVERY_JSON_ROOT, input.discoveryIdentity);
  const htmlDir =
    input.htmlOutputPath != null
      ? input.htmlOutputPath.replace(/[/\\][^/\\]+$/, "")
      : join(DEFAULT_MOMENTUM_DISCOVERY_HTML_ROOT, input.discoveryIdentity);

  return {
    outputDir,
    outputPath: input.outputPath ?? join(outputDir, MOMENTUM_DISCOVERY_JSON_FILENAME),
    htmlOutputPath:
      input.htmlOutputPath ?? join(htmlDir, MOMENTUM_DISCOVERY_HTML_FILENAME),
    cellsOutputPath: join(outputDir, MOMENTUM_DISCOVERY_CELLS_FILENAME),
    splitManifestPath: join(outputDir, MOMENTUM_DISCOVERY_SPLIT_FILENAME),
  };
}

function classifyDiscoveryStatus(input: {
  shortlistSize: number;
  totalIndependentEss: number;
  invalidEvidence: boolean;
}): {
  status: MomentumDiscoveryStatus;
  recommendedNextAction: MomentumGovernedDiscoveryReport["recommendedNextAction"];
} {
  if (input.invalidEvidence) {
    return {
      status: "invalid-evidence",
      recommendedNextAction: "invalid-evidence-fail-closed",
    };
  }
  if (input.shortlistSize > 0) {
    return {
      status: "train-shortlist-produced",
      recommendedNextAction: "train-shortlist-produced-halt-no-validation-access",
    };
  }
  if (input.totalIndependentEss <= 0) {
    return {
      status: "insufficient-train-evidence",
      recommendedNextAction: "collect-more-train-incidence",
    };
  }
  return {
    status: "no-candidates-eligible",
    recommendedNextAction: "stop-no-validation",
  };
}

export async function buildMomentumGovernedDiscoveryReport(input: {
  io: MomentumDiscoveryIo;
  trainCaptureRunDir: string;
  validationCaptureRunDir: string;
  holdoutCaptureRunDir: string;
  captureRoot?: string;
  generatedAt?: string;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
  log?: (message: string) => void;
  /** Test-only: inject pre-streamed train result without reading capture TOB. */
  injectedTrainStream?: Awaited<ReturnType<typeof streamTrainMomentumDiscovery>>;
}): Promise<MomentumGovernedDiscoveryReport> {
  const log = input.log ?? (() => {});
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  log("M14.0b pre-open: sealing family definition + evidence contract + power + stopping");
  const preOpen = sealMomentumPreOpenBundle();
  if (preOpen.trainOutcomesOpened !== false) {
    throw new MomentumGovernedDiscoveryError("Pre-open bundle must seal before TRAIN access");
  }

  log("M14.0b pre-open: building immutable research split manifest + contamination audit");
  const splitManifest = buildMomentumResearchSplitManifest({
    io: input.io,
    trainCaptureRunDir: input.trainCaptureRunDir,
    validationCaptureRunDir: input.validationCaptureRunDir,
    holdoutCaptureRunDir: input.holdoutCaptureRunDir,
    familyDefinitionIdentity: preOpen.familyDefinitionIdentity,
    evidenceContractIdentity: preOpen.evidenceContractIdentity,
    captureRoot: input.captureRoot,
  });

  printMomentumPreOpenSummary(preOpen, log, {
    trainRunId: splitManifest.train.runId,
    trainContaminationRole: `${splitManifest.train.contaminationClassification} (role=contaminated-exploratory-train)`,
    validationQuarantined: true,
    holdoutQuarantined: true,
    shortlistCap: 3,
  });

  const hypothesisIds = preOpen.familyReport.searchUniverse.hypotheses.map(
    (cell) => cell.hypothesisId,
  );

  const discoveryIdentity = sha256Hex(
    stableStringify({
      analysisVersion: MOMENTUM_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
      familyId: MOMENTUM_FAMILY_ID,
      familyDefinitionIdentity: preOpen.familyDefinitionIdentity,
      evidenceContractIdentity: preOpen.evidenceContractIdentity,
      splitManifestIdentity: splitManifest.splitManifestHash,
      trainIdentityHash: splitManifest.train.identityHash,
      trainRunId: splitManifest.train.runId,
      hypothesisIds,
      responseMatchToleranceMs: preOpen.responseMatchToleranceMs,
      refractoryRule: preOpen.familyReport.refractoryPolicy.rule,
      independentUnit: preOpen.familyReport.independentUnitPolicy.primaryUnit,
      shortlistMaxK: 3,
      powerDesign: {
        materialEffectThresholdCents: preOpen.materialEffectThresholdCents,
        alpha: preOpen.alpha,
        targetPower: preOpen.targetPower,
        outcomeStandardDeviationCents: preOpen.outcomeStandardDeviationCents,
        requiredEffectiveN: preOpen.requiredEffectiveN,
      },
      directionConsistencyRule: preOpen.directionConsistencyRule,
      structuralSimplicityOrdering: preOpen.structuralSimplicityOrdering,
      authority: "content-addressed-not-latest-mtime",
    }),
  );

  const outputs = resolveMomentumDiscoveryOutputPaths({
    discoveryIdentity,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
  });

  const trainOnlyIo = createTrainOnlyMomentumDiscoveryIo({
    baseIo: input.io,
    quarantinedCaptureRunDirs: [
      splitManifest.validation.captureRunDir,
      splitManifest.holdout.captureRunDir,
    ],
  });

  for (const blocked of [
    join(splitManifest.validation.captureRunDir, "top-of-book.jsonl"),
    join(splitManifest.holdout.captureRunDir, "top-of-book.jsonl"),
  ]) {
    try {
      trainOnlyIo.fileExists(blocked);
      throw new MomentumGovernedDiscoveryError(
        `Expected quarantine to block ${blocked}, but probe succeeded`,
      );
    } catch (error) {
      if (
        !(error instanceof MomentumGovernedDiscoveryError)
        || !String(error.message).includes("quarantined")
      ) {
        throw error;
      }
    }
  }
  log("M14.0b quarantine: VALIDATION and HOLDOUT capture paths blocked");

  log(`M14.0b TRAIN stream opening for run ${splitManifest.train.runId}`);
  const closeTimeByMarket = input.injectedTrainStream
    ? new Map<string, number>()
    : loadCloseTimeByMarket(trainOnlyIo, splitManifest.train.captureRunDir);

  const trainStream = input.injectedTrainStream
    ?? await streamTrainMomentumDiscovery({
      io: trainOnlyIo,
      trainCaptureRunDir: splitManifest.train.captureRunDir,
      responseMatchToleranceMs: preOpen.responseMatchToleranceMs,
      closeTimeByMarket,
      log,
    });

  if (trainStream.cells.size !== FAMILY_HYPOTHESIS_COUNT) {
    throw new MomentumGovernedDiscoveryError(
      `Expected ${FAMILY_HYPOTHESIS_COUNT} cells; got ${trainStream.cells.size}`,
    );
  }

  const shortlistInputs = [...trainStream.cells.values()]
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId))
    .map((cell) => {
      const summary = summarizeCellMetrics(cell);
      rejectReversalDirectionMutation("continuation");
      const directionConsistent =
        classifyContinuationDirectionConsistency(summary.signedExecutableMedianCents)
        === "continuation-consistent"
        && isDirectionConsistentWithFamily(summary.signedExecutableMedianCents);
      const midpointGate = midpointOnlyCannotAuthorizeEconomicSupport({
        midpointContinuationCents: summary.signedMidpointMedianCents,
        executablePnlCents: summary.signedExecutableMedianCents,
        executableObservable:
          summary.executableObservabilityShare != null
          && summary.executableObservabilityShare > 0
          && summary.effectiveSampleSize > 0,
      });
      const executableEffectAvailable =
        midpointGate.economicSupportAuthorized
        && summary.signedExecutableMedianCents != null;

      const candidate: MomentumCandidateDefinition = {
        candidateId: cell.hypothesisId,
        hypothesisId: cell.hypothesisId,
        lookbackWindowMs: cell.lookbackWindowMs,
        thresholdCents: cell.thresholdCents,
        responseHorizonMs: cell.responseHorizonMs,
        direction: "continuation",
        discoveryRank: null,
      };

      return {
        candidate,
        independentTrainIncidence: summary.effectiveSampleSize,
        directionConsistentWithFamily: directionConsistent,
        executableObservabilityShare: summary.executableObservabilityShare ?? 0,
        executableEffectAvailable,
        independentMarketsTouched: summary.independentMarkets,
        independentMarketDaysTouched: summary.independentMarketDays,
        structuralSimplicityRank: cell.structuralSimplicityRank,
        cell,
        summary,
      };
    });

  const ranked = rankAndShortlistTrainCandidates({
    discoveryHypothesisCount: FAMILY_HYPOTHESIS_COUNT,
    candidates: shortlistInputs.map((row) => ({
      candidate: row.candidate,
      independentTrainIncidence: row.independentTrainIncidence,
      directionConsistentWithFamily: row.directionConsistentWithFamily,
      executableObservabilityShare: row.executableObservabilityShare,
      executableEffectAvailable: row.executableEffectAvailable,
      independentMarketsTouched: row.independentMarketsTouched,
      independentMarketDaysTouched: row.independentMarketDaysTouched,
      structuralSimplicityRank: row.structuralSimplicityRank,
    })),
    maxK: 3,
  });

  const shortlistIds = new Map(
    ranked.shortlist.map((row, index) => [row.candidate.candidateId, index + 1] as const),
  );

  const perCandidateResults: MomentumDiscoveryCandidateResult[] = shortlistInputs.map(
    (row) => {
      const rankedRow =
        ranked.shortlist.find((entry) => entry.candidate.candidateId === row.candidate.candidateId)
        ?? ranked.rejected.find(
          (entry) => entry.candidate.candidateId === row.candidate.candidateId,
        );
      const shortlistRank = shortlistIds.get(row.candidate.candidateId) ?? null;
      return {
        candidateId: row.candidate.candidateId,
        hypothesisId: row.candidate.hypothesisId,
        lookbackWindowMs: row.cell.lookbackWindowMs,
        thresholdCents: row.cell.thresholdCents,
        responseHorizonMs: row.cell.responseHorizonMs,
        direction: "continuation" as const,
        structuralSimplicityRank: row.structuralSimplicityRank,
        rawEvents: row.cell.rawEvents,
        refractoryEpisodes: row.cell.refractoryEpisodes,
        observableResponses: row.cell.observableResponses,
        executableObservableResponses: row.cell.executableObservableResponses,
        independentMarkets: row.summary.independentMarkets,
        independentMarketDays: row.summary.independentMarketDays,
        effectiveSampleSize: row.summary.effectiveSampleSize,
        signedExecutableMeanCents: row.summary.signedExecutableMeanCents,
        signedExecutableMedianCents: row.summary.signedExecutableMedianCents,
        signedMidpointMeanCents: row.summary.signedMidpointMeanCents,
        signedMidpointMedianCents: row.summary.signedMidpointMedianCents,
        directionalResponseShare: row.summary.directionalResponseShare,
        executableObservabilityShare: row.summary.executableObservabilityShare,
        directionConsistentWithFamily: row.directionConsistentWithFamily,
        executableEffectAvailable: row.executableEffectAvailable,
        shortlistEligible: rankedRow?.shortlistEligible ?? false,
        rejectionReasons: rankedRow?.rejectionReasons ?? [],
        rankingKey: rankedRow?.rankingKey ?? null,
        shortlisted: shortlistRank != null,
        shortlistRank,
      };
    },
  );

  const shortlist = perCandidateResults
    .filter((row) => row.shortlisted)
    .sort((a, b) => (a.shortlistRank ?? 99) - (b.shortlistRank ?? 99));

  if (shortlist.length > 3) {
    throw new MomentumGovernedDiscoveryError("Shortlist exceeded K=3");
  }

  const responseObservabilityByHorizonMs: MomentumTrainCaptureMetrics["responseObservabilityByHorizonMs"] =
    {};
  for (const [horizon, stats] of trainStream.responseObservabilityByHorizonMs.entries()) {
    responseObservabilityByHorizonMs[String(horizon)] = stats;
  }

  const totalExecObs = perCandidateResults.reduce(
    (sum, row) => sum + row.executableObservableResponses,
    0,
  );
  const totalRefractory = perCandidateResults.reduce(
    (sum, row) => sum + row.refractoryEpisodes,
    0,
  );

  const trainCaptureMetrics: MomentumTrainCaptureMetrics = {
    trainRunId: splitManifest.train.runId,
    durationHours: splitManifest.train.durationHours,
    tobRecordsScanned: trainStream.tobRecordsScanned,
    validBookQuotes: trainStream.validBookQuotes,
    economicallyValidQuotes: trainStream.economicallyValidQuotes,
    anchorResolvableQuotes: trainStream.anchorResolvableQuotes,
    firstCrossingEventsTotal: trainStream.firstCrossingEventsTotal,
    refractoryEpisodesTotal: trainStream.refractoryEpisodesTotal,
    marketsTouched: trainStream.marketsTouched.size,
    marketDaysTouched: trainStream.marketDaysTouched.size,
    responseObservabilityByHorizonMs,
    executableObservabilityShareOverall:
      totalRefractory === 0 ? null : totalExecObs / totalRefractory,
  };

  const totalIndependentEss = perCandidateResults.reduce(
    (sum, row) => sum + row.effectiveSampleSize,
    0,
  );
  const { status, recommendedNextAction } = classifyDiscoveryStatus({
    shortlistSize: shortlist.length,
    totalIndependentEss,
    invalidEvidence: false,
  });

  if (perCandidateResults.length !== 12) {
    throw new MomentumGovernedDiscoveryError("All 12 lineage cells must be retained");
  }

  return {
    analysisVersion: MOMENTUM_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
    disclaimer: MOMENTUM_DISCOVERY_DISCLAIMER,
    generatedAt,
    familyDefinitionIdentity: preOpen.familyDefinitionIdentity,
    evidenceContractIdentity: preOpen.evidenceContractIdentity,
    splitManifestIdentity: splitManifest.splitManifestHash,
    discoveryIdentity,
    discoveryIsolationStatus: "train-only-discovery",
    trainRunId: splitManifest.train.runId,
    trainCaptureRunDir: splitManifest.train.captureRunDir,
    powerDesign: {
      materialEffectThresholdCents: preOpen.materialEffectThresholdCents,
      alpha: preOpen.alpha,
      targetPower: preOpen.targetPower,
      outcomeStandardDeviationCents: preOpen.outcomeStandardDeviationCents,
      requiredEffectiveN: preOpen.requiredEffectiveN,
      requiredEffectiveNSource: "powerAnalysis.computeRequiredSampleSize",
      stoppingRule: {
        kind: "fixed-n",
        minimumEffectiveSampleSize: preOpen.requiredEffectiveN,
        interpretationIfNotReached: "inconclusive-underpowered",
      },
    },
    directionConsistencyAdapter: {
      rule: "median-signed-gross-executable-pnl-cents-strictly-greater-than-zero",
      boundBeforeTrainOutcomeAccess: true,
      zeroIsNotConsistent: true,
      meanCannotReplaceMedian: true,
    },
    structuralSimplicityOrdering: {
      rule: STRUCTURAL_SIMPLICITY_ORDERING_RULE,
      boundBeforeTrainOutcomeAccess: true,
    },
    searchUniverse: {
      hypothesisCount: 12,
      directionCount: 1,
      hypotheses: hypothesisIds,
    },
    captureHealthSummary: {
      nativeCaptureVerdict: splitManifest.train.nativeCaptureVerdict,
      durationHours: splitManifest.train.durationHours,
      topOfBookByteLength: splitManifest.train.topOfBookByteLength,
    },
    trainCaptureMetrics,
    contaminationAudit: {
      train: splitManifest.train.contaminationClassification,
      validation: splitManifest.validation.contaminationClassification,
      holdout: splitManifest.holdout.contaminationClassification,
      evidence: {
        train: splitManifest.train.contaminationEvidence,
        validation: splitManifest.validation.contaminationEvidence,
        holdout: splitManifest.holdout.contaminationEvidence,
      },
    },
    perCandidateResults,
    shortlist,
    discoveryStatus: status,
    recommendedNextAction,
    quarantine: {
      validationOutcomesRead: false,
      holdoutOutcomesRead: false,
      validationAccess: false,
      holdoutAccess: false,
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      freezeCreated: false,
      captureStarted: false,
      liveOrdersExecuted: false,
      gridMutated: false,
      directionFlipped: false,
    },
    outputPaths: {
      outputPath: outputs.outputPath,
      htmlOutputPath: outputs.htmlOutputPath,
      splitManifestPath: outputs.splitManifestPath,
      cellsOutputPath: outputs.cellsOutputPath,
    },
  };
}
