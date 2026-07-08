import { z } from "zod";

import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { collectEnrichedMispricingObservations } from "@/lib/data/research/hypothesisRobustness/collectEnrichedMispricingObservations";
import { filterObservationsForAtlasBucket } from "@/lib/data/research/hypothesisRobustness/filterObservationsForAtlasBucket";
import { parseAtlasHypothesisCandidateId } from "@/lib/data/research/hypothesisRobustness/parseAtlasHypothesisCandidateId";
import type { EnrichedMispricingObservation } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { loadRegimeVolatilityByMarket } from "@/lib/data/research/mispricingAtlas/loadRegimeVolatilityByMarket";
import { parseHypothesisCandidatesReport } from "@/lib/data/research/strategySynthesis/parseStrategySynthesisInputs";

import {
  assertNoHoldoutLeakageIntoTrain,
  monthBelongsToSplit,
  resolveTemporalSplitRanges,
} from "./computeTemporalResearchSplits";
import {
  computeBenjaminiYekutieliFdr,
  computeEffectiveSampleSizeEstimate,
  computeSignedEdgeSamples,
  computeSplitPowerMetrics,
  groupObservationsByMarketDay,
  scaffoldBlockBootstrapRealityCheck,
} from "./oosPowerCorrectionMath";
import {
  OosPowerCorrectionError,
} from "./oosPowerCorrectionTypes";
import type {
  OosPowerCorrectionConfig,
  OosPowerCorrectionEntry,
  OosPowerCorrectionInputPaths,
  OosPowerCorrectionIo,
  OosPowerCorrectionInputStatus,
  OosSplitPowerMetrics,
  OosStatisticalVerdict,
  OosTemporalSplitId,
  OosTemporalSplitRanges,
  OosTemporalSplitSummary,
} from "./oosPowerCorrectionTypes";

const tradeReplayEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  metrics: z.object({
    tradeCount: z.number().finite(),
    uniqueMarketCount: z.number().finite(),
    uniqueTradingDayCount: z.number().finite(),
    netPnlCents: z.number().finite(),
    averagePnlCentsPerTrade: z.number().nullable(),
  }),
});

const tradeReplayReportSchema = z.object({
  entries: z.array(tradeReplayEntrySchema),
});

export type LoadedOosPowerCorrectionInputs = {
  inputStatus: OosPowerCorrectionInputStatus;
  candidates: readonly HypothesisCandidate[];
  observations: readonly EnrichedMispricingObservation[];
  tradeReplayByHypothesisId: ReadonlyMap<string, z.infer<typeof tradeReplayEntrySchema>>;
};

function parseJson(path: string, raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new OosPowerCorrectionError(`Invalid JSON in ${path}`);
  }
}

export function loadOosPowerCorrectionInputs(
  io: OosPowerCorrectionIo,
  inputPaths: OosPowerCorrectionInputPaths,
): LoadedOosPowerCorrectionInputs {
  let candidates: readonly HypothesisCandidate[] = [];
  const candidatesPresent = io.fileExists(inputPaths.hypothesisCandidatesPath);

  if (candidatesPresent) {
    candidates = parseHypothesisCandidatesReport(
      io.readFile(inputPaths.hypothesisCandidatesPath),
    ).candidates;
  }

  const observations = collectEnrichedMispricingObservations({
    researchResultsDir: inputPaths.researchResultsDir,
    regimeTagsPath: inputPaths.regimeTagsPath,
    io,
  });

  const availableMonths = [
    ...new Set(
      observations
        .map((observation) => observation.calendarMonth)
        .filter((month): month is string => typeof month === "string" && month.length > 0),
    ),
  ].sort((left, right) => left.localeCompare(right));

  const tradeReplayByHypothesisId = new Map<string, z.infer<typeof tradeReplayEntrySchema>>();

  if (io.fileExists(inputPaths.hypothesisTradeReplayPath)) {
    const parsed = parseJson(
      inputPaths.hypothesisTradeReplayPath,
      io.readFile(inputPaths.hypothesisTradeReplayPath),
    );
    const result = tradeReplayReportSchema.safeParse(parsed);
    if (result.success) {
      for (const entry of result.data.entries) {
        tradeReplayByHypothesisId.set(entry.hypothesisId, entry);
      }
    }
  }

  return {
    inputStatus: {
      hypothesisCandidatesPresent: candidatesPresent,
      hypothesisTradeReplayPresent: tradeReplayByHypothesisId.size > 0,
      observationCount: observations.length,
      availableMonthCount: availableMonths.length,
    },
    candidates,
    observations,
    tradeReplayByHypothesisId,
  };
}

function filterObservationsForSplit(
  observations: readonly EnrichedMispricingObservation[],
  split: OosTemporalSplitId,
  ranges: OosTemporalSplitRanges,
): EnrichedMispricingObservation[] {
  return observations.filter((observation) =>
    monthBelongsToSplit(observation.calendarMonth, split, ranges),
  );
}

function buildSplitMetrics(input: {
  observations: readonly EnrichedMispricingObservation[];
  direction: "over" | "under";
  split: OosTemporalSplitId;
  config: OosPowerCorrectionConfig;
}): OosSplitPowerMetrics {
  const rawObservationCount = input.observations.length;
  const independentMarketCount = new Set(
    input.observations.map((observation) => observation.marketTicker),
  ).size;
  const marketDayCount = groupObservationsByMarketDay(input.observations).length;
  const effectiveSampleSizeEstimate = computeEffectiveSampleSizeEstimate({
    rawObservationCount,
    independentMarketCount,
    marketDayCount,
  });

  const edgeSamples = computeSignedEdgeSamples(
    input.observations.map((observation) => ({
      predictedProbability: observation.predictedProbability,
      observedOutcome: observation.observedOutcome,
      calibrationDirection: input.direction,
    })),
  );

  const power = computeSplitPowerMetrics({
    edgeSamples,
    effectiveSampleSize: effectiveSampleSizeEstimate,
    alpha: input.config.alpha,
    targetPower: input.config.targetPower,
    minEffectCents: input.config.minEffectCents,
  });

  return {
    split: input.split,
    rawObservationCount,
    independentMarketCount,
    marketDayCount,
    effectiveSampleSizeEstimate,
    observedNetEdge: power.observedNetEdge,
    standardError: power.standardError,
    confidenceInterval95: power.confidenceInterval95,
    minimumDetectableEffect: power.minimumDetectableEffect,
    tStatistic: power.tStatistic,
    uncorrectedPValue: power.uncorrectedPValue,
    clearsMde: power.clearsMde,
    isUnderpowered: power.isUnderpowered,
    underpoweredReason: power.underpoweredReason,
  };
}

function resolveFinalVerdict(input: {
  passesCorrected: boolean;
  clearsMde: boolean;
  isUnderpowered: boolean;
  holdoutMetrics: OosSplitPowerMetrics;
  skipped: boolean;
}): OosStatisticalVerdict {
  if (input.skipped) {
    return "skipped";
  }

  if (input.holdoutMetrics.rawObservationCount < 2) {
    return "insufficient-data";
  }

  if (input.isUnderpowered) {
    return "underpowered";
  }

  if (input.passesCorrected && input.clearsMde) {
    return "pass";
  }

  return "fail";
}

export function evaluateOosPowerCandidates(input: {
  candidates: readonly HypothesisCandidate[];
  observations: readonly EnrichedMispricingObservation[];
  tradeReplayByHypothesisId: ReadonlyMap<string, { metrics: { tradeCount: number } }>;
  regimeVolatilityByMarket: ReturnType<typeof loadRegimeVolatilityByMarket>;
  config: OosPowerCorrectionConfig;
}): {
  splitSummary: OosTemporalSplitSummary;
  entries: OosPowerCorrectionEntry[];
  blockBootstrapScaffolded: boolean;
} {
  const availableMonths = [
    ...new Set(
      input.observations
        .map((observation) => observation.calendarMonth)
        .filter((month): month is string => typeof month === "string"),
    ),
  ];

  const { ranges, splitMode } = input.config.explicitSplit
    ? { ranges: input.config.explicitSplit, splitMode: "explicit" as const }
    : resolveTemporalSplitRanges({
        availableMonths,
        explicit: null,
      });

  if (!assertNoHoldoutLeakageIntoTrain(ranges)) {
    throw new OosPowerCorrectionError("Holdout months leaked into train split");
  }

  const splitSummary: OosTemporalSplitSummary = {
    ...ranges,
    availableMonths: [...availableMonths].sort((left, right) => left.localeCompare(right)),
    splitMode,
    trainCandidateCount: 0,
    validationCandidateCount: 0,
    holdoutCandidateCount: 0,
  };

  const preliminaryEntries: Array<OosPowerCorrectionEntry & { skipped: boolean }> = [];

  for (const candidate of input.candidates) {
    if (
      input.config.officialOnly
      && candidate.refinementRegistration !== undefined
      && candidate.refinementRegistration !== null
    ) {
      preliminaryEntries.push(buildSkippedEntry(candidate, "Refinement candidate excluded by --official-only"));
      continue;
    }

    const ref = parseAtlasHypothesisCandidateId(candidate.candidateId);
    if (!ref) {
      preliminaryEntries.push(buildSkippedEntry(candidate, "Non-atlas candidate"));
      continue;
    }

    const bucketObservations = filterObservationsForAtlasBucket(
      input.observations,
      ref,
      input.regimeVolatilityByMarket,
    );

    const trainObservations = filterObservationsForSplit(bucketObservations, "train", ranges);
    const validationObservations = filterObservationsForSplit(
      bucketObservations,
      "validation",
      ranges,
    );
    const holdoutObservations = filterObservationsForSplit(bucketObservations, "holdout", ranges);

    if (trainObservations.length > 0) {
      splitSummary.trainCandidateCount += 1;
    }
    if (validationObservations.length > 0) {
      splitSummary.validationCandidateCount += 1;
    }
    if (holdoutObservations.length > 0) {
      splitSummary.holdoutCandidateCount += 1;
    }

    const splitMetrics: Record<OosTemporalSplitId, OosSplitPowerMetrics> = {
      train: buildSplitMetrics({
        observations: trainObservations,
        direction: ref.direction,
        split: "train",
        config: input.config,
      }),
      validation: buildSplitMetrics({
        observations: validationObservations,
        direction: ref.direction,
        split: "validation",
        config: input.config,
      }),
      holdout: buildSplitMetrics({
        observations: holdoutObservations,
        direction: ref.direction,
        split: "holdout",
        config: input.config,
      }),
    };

    const dependenceWarnings: string[] = [];
    const blocks = groupObservationsByMarketDay(bucketObservations);
    if (blocks.some((block) => block.items.length > 1)) {
      dependenceWarnings.push("Multiple observations share a market-day block");
    }
    if (splitMetrics.holdout.rawObservationCount > splitMetrics.holdout.marketDayCount * 2) {
      dependenceWarnings.push("Holdout raw observations exceed 2× market-day blocks");
    }

    const holdoutMetrics = splitMetrics.holdout;
    const clearsMde = holdoutMetrics.clearsMde;

    preliminaryEntries.push({
      hypothesisId: candidate.candidateId,
      hypothesis: candidate.hypothesis,
      sourceArtifact: candidate.sourceArtifact,
      candidate: {
        candidateId: candidate.candidateId,
        confidence: candidate.confidence,
        bucketMetadata: candidate.bucketMetadata,
      },
      splitMetrics,
      uncorrectedPValue: holdoutMetrics.uncorrectedPValue,
      correctedPValue: null,
      qValue: null,
      correctionMethod: input.config.correctionMethod,
      passesUncorrected:
        holdoutMetrics.uncorrectedPValue !== null
        && holdoutMetrics.uncorrectedPValue <= input.config.alpha,
      passesCorrected: false,
      clearsMde,
      isUnderpowered: holdoutMetrics.isUnderpowered,
      finalStatisticalVerdict: "fail",
      dependenceWarnings,
      tradeReplayAvailable: input.tradeReplayByHypothesisId.has(candidate.candidateId),
      skipped: false,
    });
  }

  const testable = preliminaryEntries.filter(
    (entry) => !entry.skipped && entry.uncorrectedPValue !== null,
  );

  const byCorrection =
    input.config.correctionMethod === "benjaminiYekutieli"
      ? computeBenjaminiYekutieliFdr(
          testable.map((entry) => ({
            id: entry.hypothesisId,
            rawPValue: entry.uncorrectedPValue,
          })),
          input.config.alpha,
        )
      : computeBenjaminiYekutieliFdr(
          testable.map((entry) => ({
            id: entry.hypothesisId,
            rawPValue: entry.uncorrectedPValue,
          })),
          input.config.alpha,
        );

  const correctionById = new Map(byCorrection.map((entry) => [entry.id, entry]));

  const blockBootstrap = scaffoldBlockBootstrapRealityCheck({
    candidateIds: testable.map((entry) => entry.hypothesisId),
    blockCount: groupObservationsByMarketDay(input.observations).length,
    iterations: input.config.blockBootstrapIterations,
    seed: input.config.blockBootstrapSeed,
  });

  const entries: OosPowerCorrectionEntry[] = preliminaryEntries.map((entry) => {
    if (entry.skipped) {
      const { skipped: _skipped, ...rest } = entry;
      return rest;
    }

    const correction = correctionById.get(entry.hypothesisId);
    const passesCorrected = correction?.rejected ?? false;
    const correctedPValue = correction?.correctedPValue ?? null;
    const qValue = correction?.qValue ?? null;

    const { skipped: _skipped, ...rest } = entry;

    return {
      ...rest,
      correctedPValue,
      qValue,
      passesCorrected,
      finalStatisticalVerdict: resolveFinalVerdict({
        passesCorrected,
        clearsMde: entry.clearsMde,
        isUnderpowered: entry.isUnderpowered,
        holdoutMetrics: entry.splitMetrics.holdout,
        skipped: false,
      }),
    };
  });

  return {
    splitSummary,
    entries,
    blockBootstrapScaffolded: blockBootstrap.status === "scaffolded",
  };
}

function buildSkippedEntry(
  candidate: HypothesisCandidate,
  reason: string,
): OosPowerCorrectionEntry & { skipped: boolean } {
  const emptyMetrics = (split: OosTemporalSplitId): OosSplitPowerMetrics => ({
    split,
    rawObservationCount: 0,
    independentMarketCount: 0,
    marketDayCount: 0,
    effectiveSampleSizeEstimate: 0,
    observedNetEdge: null,
    standardError: null,
    confidenceInterval95: null,
    minimumDetectableEffect: null,
    tStatistic: null,
    uncorrectedPValue: null,
    clearsMde: false,
    isUnderpowered: false,
    underpoweredReason: null,
  });

  return {
    hypothesisId: candidate.candidateId,
    hypothesis: candidate.hypothesis,
    sourceArtifact: candidate.sourceArtifact,
    candidate: {
      candidateId: candidate.candidateId,
      confidence: candidate.confidence,
      bucketMetadata: candidate.bucketMetadata,
    },
    splitMetrics: {
      train: emptyMetrics("train"),
      validation: emptyMetrics("validation"),
      holdout: emptyMetrics("holdout"),
    },
    uncorrectedPValue: null,
    correctedPValue: null,
    qValue: null,
    correctionMethod: "benjaminiYekutieli",
    passesUncorrected: false,
    passesCorrected: false,
    clearsMde: false,
    isUnderpowered: false,
    finalStatisticalVerdict: "skipped",
    dependenceWarnings: [reason],
    tradeReplayAvailable: false,
    skipped: true,
  };
}
