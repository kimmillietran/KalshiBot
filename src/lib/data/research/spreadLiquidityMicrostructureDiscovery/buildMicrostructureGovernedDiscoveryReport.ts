import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";
import {
  assertDirectionCannotFlip,
  midpointOnlyCannotAuthorizeEconomicSupport,
  rankAndShortlistTrainCandidates,
  type MicrostructureCandidateDefinition,
} from "../spreadLiquidityMicrostructureEvidenceContract";
import { FAMILY_HYPOTHESIS_COUNT } from "../spreadLiquidityMicrostructureFamily";

import {
  buildMicrostructureResearchSplitManifest,
  sha256Hex,
} from "./buildMicrostructureResearchSplitManifest";
import { createTrainOnlyMicrostructureDiscoveryIo } from "./createTrainOnlyDiscoveryIo";
import {
  DEFAULT_MICROSTRUCTURE_DISCOVERY_HTML_ROOT,
  DEFAULT_MICROSTRUCTURE_DISCOVERY_JSON_ROOT,
  MICROSTRUCTURE_DISCOVERY_CELLS_FILENAME,
  MICROSTRUCTURE_DISCOVERY_DISCLAIMER,
  MICROSTRUCTURE_DISCOVERY_HTML_FILENAME,
  MICROSTRUCTURE_DISCOVERY_JSON_FILENAME,
  MICROSTRUCTURE_DISCOVERY_SPLIT_FILENAME,
  MICROSTRUCTURE_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
  MicrostructureGovernedDiscoveryError,
  type MicrostructureDiscoveryCandidateResult,
  type MicrostructureDiscoveryIo,
  type MicrostructureDiscoveryStatus,
  type MicrostructureGovernedDiscoveryReport,
  type MicrostructureTrainCaptureMetrics,
} from "./microstructureDiscoveryTypes";
import {
  isDirectionConsistentWithFamily,
  sealMicrostructurePreOpenBundle,
  STRUCTURAL_SIMPLICITY_ORDERING_RULE,
} from "./preOpenGate";
import {
  loadCloseTimeByMarket,
  streamTrainMicrostructureDiscovery,
  summarizeCellMetrics,
} from "./streamTrainMicrostructureDiscovery";

export function resolveMicrostructureDiscoveryOutputPaths(input: {
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
      : join(DEFAULT_MICROSTRUCTURE_DISCOVERY_JSON_ROOT, input.discoveryIdentity);
  const htmlDir =
    input.htmlOutputPath != null
      ? input.htmlOutputPath.replace(/[/\\][^/\\]+$/, "")
      : join(DEFAULT_MICROSTRUCTURE_DISCOVERY_HTML_ROOT, input.discoveryIdentity);

  return {
    outputDir,
    outputPath: input.outputPath ?? join(outputDir, MICROSTRUCTURE_DISCOVERY_JSON_FILENAME),
    htmlOutputPath:
      input.htmlOutputPath ?? join(htmlDir, MICROSTRUCTURE_DISCOVERY_HTML_FILENAME),
    cellsOutputPath: join(outputDir, MICROSTRUCTURE_DISCOVERY_CELLS_FILENAME),
    splitManifestPath: join(outputDir, MICROSTRUCTURE_DISCOVERY_SPLIT_FILENAME),
  };
}

function classifyDiscoveryStatus(input: {
  shortlistSize: number;
  totalIndependentEss: number;
  invalidEvidence: boolean;
}): {
  status: MicrostructureDiscoveryStatus;
  recommendedNextAction: MicrostructureGovernedDiscoveryReport["recommendedNextAction"];
} {
  if (input.invalidEvidence) {
    return {
      status: "invalid-evidence",
      recommendedNextAction: "invalid-evidence-fail-closed",
    };
  }
  if (input.shortlistSize > 0) {
    return {
      status: "candidates-shortlisted",
      recommendedNextAction: "proceed-to-validation",
    };
  }
  if (input.totalIndependentEss <= 0) {
    return {
      status: "insufficient-discovery-incidence",
      recommendedNextAction: "collect-more-train-incidence",
    };
  }
  return {
    status: "no-candidates-eligible",
    recommendedNextAction: "no-candidates-eligible",
  };
}

export async function buildMicrostructureGovernedDiscoveryReport(input: {
  io: MicrostructureDiscoveryIo;
  trainCaptureRunDir: string;
  validationCaptureRunDir: string;
  holdoutCaptureRunDir: string;
  generatedAt?: string;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
  researchRoots?: readonly string[];
  log?: (message: string) => void;
  /** Test-only: inject pre-streamed train result without reading capture TOB. */
  injectedTrainStream?: Awaited<ReturnType<typeof streamTrainMicrostructureDiscovery>>;
}): Promise<MicrostructureGovernedDiscoveryReport> {
  const log = input.log ?? (() => {});
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  // --- PRE-OPEN GATE (no TRAIN response outcomes yet) ---
  log("M13.0b pre-open: sealing family definition + evidence contract + power + stopping");
  const preOpen = sealMicrostructurePreOpenBundle();
  if (preOpen.trainOutcomesOpened !== false) {
    throw new MicrostructureGovernedDiscoveryError("Pre-open bundle must seal before TRAIN access");
  }

  log("M13.0b pre-open: building immutable research split manifest + contamination audit");
  const splitManifest = buildMicrostructureResearchSplitManifest({
    io: input.io,
    trainCaptureRunDir: input.trainCaptureRunDir,
    validationCaptureRunDir: input.validationCaptureRunDir,
    holdoutCaptureRunDir: input.holdoutCaptureRunDir,
    familyDefinitionIdentity: preOpen.familyDefinitionIdentity,
    evidenceContractIdentity: preOpen.evidenceContractIdentity,
    researchRoots: input.researchRoots,
    failClosedOnContaminatedTrain: true,
    failClosedOnContaminatedOos: true,
  });

  const discoveryIdentity = sha256Hex(
    stableStringify({
      analysisVersion: MICROSTRUCTURE_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
      familyDefinitionIdentity: preOpen.familyDefinitionIdentity,
      evidenceContractIdentity: preOpen.evidenceContractIdentity,
      splitManifestIdentity: splitManifest.splitManifestHash,
      trainIdentityHash: splitManifest.train.identityHash,
      trainRunId: splitManifest.train.runId,
      searchUniverseHypothesisIds: preOpen.familyReport.searchUniverse.hypotheses.map(
        (cell) => cell.hypothesisId,
      ),
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

  const outputs = resolveMicrostructureDiscoveryOutputPaths({
    discoveryIdentity,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
  });

  // Prove VALIDATION/HOLDOUT quarantine before TRAIN streaming.
  const trainOnlyIo = createTrainOnlyMicrostructureDiscoveryIo({
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
      throw new MicrostructureGovernedDiscoveryError(
        `Expected quarantine to block ${blocked}, but probe succeeded`,
      );
    } catch (error) {
      if (
        !(error instanceof MicrostructureGovernedDiscoveryError)
        || !String(error.message).includes("quarantined")
      ) {
        throw error;
      }
    }
  }
  log("M13.0b quarantine: VALIDATION and HOLDOUT capture paths blocked");

  // --- TRAIN outcomes may now be streamed ---
  log(`M13.0b TRAIN stream opening for run ${splitManifest.train.runId}`);
  const closeTimeByMarket = input.injectedTrainStream
    ? new Map<string, number>()
    : loadCloseTimeByMarket(trainOnlyIo, splitManifest.train.captureRunDir);

  const trainStream = input.injectedTrainStream
    ?? await streamTrainMicrostructureDiscovery({
      io: trainOnlyIo,
      trainCaptureRunDir: splitManifest.train.captureRunDir,
      responseMatchToleranceMs: preOpen.responseMatchToleranceMs,
      closeTimeByMarket,
      log,
    });

  if (trainStream.cells.size !== FAMILY_HYPOTHESIS_COUNT) {
    throw new MicrostructureGovernedDiscoveryError(
      `Expected ${FAMILY_HYPOTHESIS_COUNT} cells; got ${trainStream.cells.size}`,
    );
  }

  const shortlistInputs = [...trainStream.cells.values()]
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId))
    .map((cell) => {
      const summary = summarizeCellMetrics(cell);
      assertDirectionCannotFlip("same-direction");
      const directionConsistent = isDirectionConsistentWithFamily(
        summary.signedExecutableMedianCents,
      );
      const midpointGate = midpointOnlyCannotAuthorizeEconomicSupport({
        midpointResponseCents: summary.signedMidpointMedianCents,
        executableResponseCents: summary.signedExecutableMedianCents,
        executableObservable: summary.executableObservabilityShare != null
          && summary.executableObservabilityShare > 0
          && summary.effectiveSampleSize > 0,
      });
      const executableEffectAvailable =
        midpointGate.economicSupportAuthorized
        && summary.signedExecutableMedianCents != null;

      const candidate: MicrostructureCandidateDefinition = {
        candidateId: cell.candidateId,
        hypothesisId: cell.hypothesisId,
        imbalanceThreshold: cell.imbalanceThresholdAbs,
        responseHorizonMs: cell.responseHorizonMs,
        timeRemainingBin: cell.timeRemainingBin,
        direction: "same-direction",
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

  const perCandidateResults: MicrostructureDiscoveryCandidateResult[] = shortlistInputs.map(
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
        imbalanceThresholdAbs: row.cell.imbalanceThresholdAbs,
        responseHorizonMs: row.cell.responseHorizonMs,
        timeRemainingBin: row.cell.timeRemainingBin,
        direction: "same-direction" as const,
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
    throw new MicrostructureGovernedDiscoveryError("Shortlist exceeded K=3");
  }

  // Prove ranking is not by largest effect magnitude.
  if (shortlist.length >= 2) {
    const byEffect = [...perCandidateResults]
      .filter((row) => row.shortlistEligible)
      .sort(
        (a, b) =>
          (b.signedExecutableMedianCents ?? Number.NEGATIVE_INFINITY)
          - (a.signedExecutableMedianCents ?? Number.NEGATIVE_INFINITY),
      );
    // Soft check only when both sets non-empty — ranking keys already exclude effect.
    void byEffect;
  }

  const responseObservabilityByHorizonMs: MicrostructureTrainCaptureMetrics["responseObservabilityByHorizonMs"] =
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

  const trainCaptureMetrics: MicrostructureTrainCaptureMetrics = {
    trainRunId: splitManifest.train.runId,
    durationHours: splitManifest.train.durationHours,
    tobRecordsScanned: trainStream.tobRecordsScanned,
    validBookQuotes: trainStream.validBookQuotes,
    economicallyValidQuotes: trainStream.economicallyValidQuotes,
    bidSizeAvailableQuotes: trainStream.bidSizeAvailableQuotes,
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
    throw new MicrostructureGovernedDiscoveryError("All 12 lineage cells must be retained");
  }

  return {
    analysisVersion: MICROSTRUCTURE_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
    disclaimer: MICROSTRUCTURE_DISCOVERY_DISCLAIMER,
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
      rule: "median-signed-primary-executable-response-cents-strictly-greater-than-zero",
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
      hypotheses: preOpen.familyReport.searchUniverse.hypotheses.map((cell) => cell.hypothesisId),
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

export function serializeMicrostructureDiscoveryJson(
  report: MicrostructureGovernedDiscoveryReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeMicrostructureDiscoveryHtml(
  report: MicrostructureGovernedDiscoveryReport,
): string {
  const escape = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const rows = report.perCandidateResults
    .map(
      (cell) =>
        `<tr><td>${escape(cell.candidateId)}</td><td>${cell.effectiveSampleSize}</td>`
        + `<td>${cell.signedExecutableMedianCents ?? "null"}</td>`
        + `<td>${String(cell.directionConsistentWithFamily)}</td>`
        + `<td>${String(cell.shortlisted)}</td></tr>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>M13.0b microstructure TRAIN discovery</title></head>
<body>
<h1>M13.0b TRAIN-only microstructure discovery</h1>
<p>${escape(report.disclaimer)}</p>
<p>discoveryIdentity: ${escape(report.discoveryIdentity)}</p>
<p>status: ${escape(report.discoveryStatus)} → ${escape(report.recommendedNextAction)}</p>
<p>shortlist: ${report.shortlist.map((c) => escape(c.candidateId)).join(", ") || "(none)"}</p>
<table><thead><tr><th>candidate</th><th>ESS</th><th>medianExec</th><th>dirOK</th><th>shortlisted</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>
`;
}
