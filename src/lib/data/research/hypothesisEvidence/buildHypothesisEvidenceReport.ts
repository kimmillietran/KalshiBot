import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { LeadLagAnalysis } from "@/lib/data/research/leadLag/leadLagTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { StatisticalSignificanceReport } from "@/lib/data/research/statisticalSignificance/statisticalSignificanceTypes";

import {
  buildHypothesisConfidenceSummary,
  collectHypothesisExampleMarkets,
  countUniqueTradingDaysForCandidate,
} from "./collectHypothesisExampleMarkets";
import type {
  BuildHypothesisEvidenceReportInput,
  HypothesisEvidenceCard,
  HypothesisEvidenceReport,
} from "./hypothesisEvidenceTypes";
import {
  parseAtlasCandidateReference,
  parseBucketAxisLabels,
  parseLeadLagCandidateReference,
} from "./parseAtlasCandidateReference";
import { resolveAtlasBucketMetrics } from "./resolveAtlasBucketMetrics";

function resolveAssociatedRegime(input: {
  candidate: HypothesisCandidate;
  groupId: string | null;
  bucketId: string | null;
}): string | null {
  if (input.groupId === "probabilityRegime" && input.bucketId) {
    return parseBucketAxisLabels(input.bucketId).regimeBucket;
  }

  if (input.groupId === "volatility" && input.bucketId) {
    return input.bucketId;
  }

  const regimeMatch = /in (.+)$/.exec(input.candidate.marketCondition);
  return regimeMatch?.[1] ?? null;
}

function buildAtlasEvidenceCard(input: {
  candidate: HypothesisCandidate;
  atlas: MispricingAtlas;
  statisticalSignificance: StatisticalSignificanceReport | null;
  researchOutputPaths: readonly string[];
  readFile: (path: string) => string;
}): HypothesisEvidenceCard {
  const reference = parseAtlasCandidateReference(input.candidate.candidateId);
  const bucket =
    reference === null
      ? null
      : resolveAtlasBucketMetrics(
          input.atlas,
          reference.groupId,
          reference.bucketId,
        );
  const axisLabels =
    reference === null
      ? {
          probabilityBucket: null,
          timeBucket: null,
          regimeBucket: null,
          moneynessBucket: null,
          volatilityBucket: null,
        }
      : parseBucketAxisLabels(reference.bucketId);

  const sampleSize = bucket?.observations ?? 0;
  const exampleMarkets = collectHypothesisExampleMarkets({
    candidate: input.candidate,
    mispricingAtlas: input.atlas,
    leadLagAnalysis: null,
    researchOutputPaths: input.researchOutputPaths,
    readFile: input.readFile,
  });
  const uniqueTradingDays = countUniqueTradingDaysForCandidate({
    candidate: input.candidate,
    mispricingAtlas: input.atlas,
    leadLagAnalysis: null,
    researchOutputPaths: input.researchOutputPaths,
    readFile: input.readFile,
  });

  return {
    candidateId: input.candidate.candidateId,
    title: input.candidate.hypothesis,
    strategyFamily: input.candidate.suggestedStrategyFamily,
    rationale: input.candidate.rationale,
    calibrationError: bucket?.calibrationError ?? null,
    impliedProbability: bucket?.averageImpliedProbability ?? null,
    realizedProbability: bucket?.realizedFrequency ?? null,
    sampleSize,
    confidenceLevel: input.candidate.confidence,
    associatedRegime: resolveAssociatedRegime({
      candidate: input.candidate,
      groupId: reference?.groupId ?? null,
      bucketId: reference?.bucketId ?? null,
    }),
    associatedProbabilityBucket:
      axisLabels.probabilityBucket ?? reference?.bucketId ?? null,
    associatedTimeBucket:
      axisLabels.timeBucket
      ?? (reference?.groupId === "timeRemaining" ? reference.bucketId : null),
    associatedMoneynessBucket:
      axisLabels.moneynessBucket
      ?? (reference?.groupId === "moneyness" ? reference.bucketId : null),
    associatedVolatilityBucket:
      axisLabels.volatilityBucket
      ?? (reference?.groupId === "volatility" ? reference.bucketId : null),
    bucketGroup: reference?.groupId ?? input.candidate.bucketMetadata?.groupId ?? null,
    warnings: input.candidate.warnings,
    sourceArtifact: input.candidate.sourceArtifact,
    confidenceSummary: buildHypothesisConfidenceSummary({
      sampleSize,
      uniqueTradingDays,
      calibrationError: bucket?.calibrationError ?? null,
      statisticalSignificance: input.statisticalSignificance,
      confidenceLevel: input.candidate.confidence,
    }),
    exampleMarkets,
  };
}

function buildLeadLagEvidenceCard(input: {
  candidate: HypothesisCandidate;
  leadLagAnalysis: LeadLagAnalysis;
  statisticalSignificance: StatisticalSignificanceReport | null;
  readFile: (path: string) => string;
}): HypothesisEvidenceCard {
  const reference = parseLeadLagCandidateReference(input.candidate.candidateId);
  const lagMetrics =
    reference === null
      ? null
      : input.leadLagAnalysis.aggregateLagMetrics.find(
          (metric) => metric.lag === reference.lag,
        ) ?? null;

  const sampleSize = lagMetrics?.observationCount ?? 0;
  const exampleMarkets = collectHypothesisExampleMarkets({
    candidate: input.candidate,
    mispricingAtlas: null,
    leadLagAnalysis: input.leadLagAnalysis,
    researchOutputPaths: [],
    readFile: input.readFile,
  });
  const uniqueTradingDays = countUniqueTradingDaysForCandidate({
    candidate: input.candidate,
    mispricingAtlas: null,
    leadLagAnalysis: input.leadLagAnalysis,
    researchOutputPaths: [],
    readFile: input.readFile,
  });

  return {
    candidateId: input.candidate.candidateId,
    title: input.candidate.hypothesis,
    strategyFamily: input.candidate.suggestedStrategyFamily,
    rationale: input.candidate.rationale,
    calibrationError: null,
    impliedProbability: null,
    realizedProbability: null,
    sampleSize,
    confidenceLevel: input.candidate.confidence,
    associatedRegime: resolveAssociatedRegime({
      candidate: input.candidate,
      groupId: null,
      bucketId: null,
    }),
    associatedProbabilityBucket: null,
    associatedTimeBucket: reference ? `lag-${reference.lag}` : null,
    associatedMoneynessBucket: null,
    associatedVolatilityBucket: null,
    bucketGroup: "lead-lag",
    warnings: input.candidate.warnings,
    sourceArtifact: input.candidate.sourceArtifact,
    confidenceSummary: buildHypothesisConfidenceSummary({
      sampleSize,
      uniqueTradingDays,
      calibrationError: null,
      statisticalSignificance: input.statisticalSignificance,
      confidenceLevel: input.candidate.confidence,
    }),
    exampleMarkets,
  };
}

function buildEvidenceCard(
  candidate: HypothesisCandidate,
  input: Omit<BuildHypothesisEvidenceReportInput, "candidatesReport" | "generatedAt" | "htmlOutputPath"> & {
    researchOutputPaths: readonly string[];
  },
): HypothesisEvidenceCard {
  if (candidate.sourceArtifact === "mispricing-atlas.json" && input.mispricingAtlas) {
    return buildAtlasEvidenceCard({
      candidate,
      atlas: input.mispricingAtlas,
      statisticalSignificance: input.statisticalSignificance,
      researchOutputPaths: input.researchOutputPaths,
      readFile: input.readFile,
    });
  }

  if (candidate.sourceArtifact === "lead-lag-analysis.json" && input.leadLagAnalysis) {
    return buildLeadLagEvidenceCard({
      candidate,
      leadLagAnalysis: input.leadLagAnalysis,
      statisticalSignificance: input.statisticalSignificance,
      readFile: input.readFile,
    });
  }

  return {
    candidateId: candidate.candidateId,
    title: candidate.hypothesis,
    strategyFamily: candidate.suggestedStrategyFamily,
    rationale: candidate.rationale,
    calibrationError: null,
    impliedProbability: null,
    realizedProbability: null,
    sampleSize: 0,
    confidenceLevel: candidate.confidence,
    associatedRegime: null,
    associatedProbabilityBucket: null,
    associatedTimeBucket: null,
    associatedMoneynessBucket: null,
    associatedVolatilityBucket: null,
    bucketGroup: null,
    warnings: candidate.warnings,
    sourceArtifact: candidate.sourceArtifact,
    confidenceSummary: buildHypothesisConfidenceSummary({
      sampleSize: 0,
      uniqueTradingDays: 0,
      calibrationError: null,
      statisticalSignificance: input.statisticalSignificance,
      confidenceLevel: candidate.confidence,
    }),
    exampleMarkets: [],
  };
}

/** Builds human-readable evidence cards for every hypothesis candidate. */
export function buildHypothesisEvidenceReport(
  input: BuildHypothesisEvidenceReportInput,
): HypothesisEvidenceReport {
  const researchOutputPaths = input.listResearchOutputPaths(input.researchInputRoot);

  const cards = input.candidatesReport.candidates.map((candidate) =>
    buildEvidenceCard(candidate, {
      mispricingAtlas: input.mispricingAtlas,
      leadLagAnalysis: input.leadLagAnalysis,
      statisticalSignificance: input.statisticalSignificance,
      researchInputRoot: input.researchInputRoot,
      readFile: input.readFile,
      listResearchOutputPaths: input.listResearchOutputPaths,
      researchOutputPaths,
    }),
  );

  return {
    generatedAt: input.generatedAt,
    htmlOutputPath: input.htmlOutputPath,
    candidatesReportPath: input.candidatesReport.outputPath,
    candidateCount: cards.length,
    noCandidateReasons: input.candidatesReport.summary.noCandidateReasons,
    cards,
  };
}
