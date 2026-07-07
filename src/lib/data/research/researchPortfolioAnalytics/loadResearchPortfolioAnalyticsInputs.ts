import { z } from "zod";

import { HYPOTHESIS_FAILURE_REASON_CATEGORIES } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import { HYPOTHESIS_PRIORITY_CATEGORIES } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisFailureAnalysisEntry } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import { HYPOTHESIS_ATLAS_GROUP_IDS } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import {
  ResearchPortfolioAnalyticsError,
  type ResearchPortfolioAnalyticsInputPaths,
  type ResearchPortfolioAnalyticsInputStatus,
  type ResearchPortfolioAnalyticsIo,
} from "./researchPortfolioAnalyticsTypes";

const hypothesisCandidateSchema = z.object({
  candidateId: z.string().trim().min(1),
  sourceArtifact: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  marketCondition: z.string().trim().min(1),
  suggestedStrategyFamily: z.string().trim().min(1),
  requiredData: z.array(z.string().trim().min(1)),
  proposedEntryCondition: z.string().trim().min(1),
  proposedExitSettlementAssumption: z.string().trim().min(1),
  expectedFailureMode: z.string().trim().min(1),
  killCriterion: z.string().trim().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  warnings: z.array(z.string().trim().min(1)),
  bucketMetadata: z
    .object({
      groupId: z.enum(HYPOTHESIS_ATLAS_GROUP_IDS),
      bucketId: z.string().trim().min(1),
      bucketLabel: z.string().trim().min(1),
      observations: z.number().finite(),
      uniqueTradingDays: z.number().finite().nullable(),
      calibrationError: z.number().finite(),
      calibrationDirection: z.enum(["over", "under"]),
    })
    .nullable()
    .optional(),
});

const hypothesisCandidatesReportSchema = z.object({
  candidates: z.array(hypothesisCandidateSchema),
});

const hypothesisValidationEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  sourceArtifact: z.string().trim().min(1),
  robustnessScore: z.number().finite(),
  passes: z.boolean(),
  reasons: z.array(z.string()),
  observationCount: z.number().finite(),
  timeStability: z.object({
    monthPeriods: z.array(
      z.object({
        periodKey: z.string(),
        observations: z.number().finite(),
        signedCalibrationError: z.number().nullable(),
        edgeMatchesDirection: z.boolean(),
      }),
    ),
    quarterPeriods: z.array(
      z.object({
        periodKey: z.string(),
        observations: z.number().finite(),
        signedCalibrationError: z.number().nullable(),
        edgeMatchesDirection: z.boolean(),
      }),
    ),
    monthPersistenceRate: z.number().finite(),
    quarterPersistenceRate: z.number().finite(),
    scoreComponent: z.number().finite().optional(),
  }),
  regimeStability: z.object({
    regimes: z.array(
      z.object({
        regime: z.enum(["low", "medium", "high"]),
        observations: z.number().finite(),
        signedCalibrationError: z.number().nullable(),
        edgeMatchesDirection: z.boolean(),
      }),
    ),
    regimesWithEdge: z.number().finite(),
    regimesWithData: z.number().finite(),
    scoreComponent: z.number().finite().optional(),
  }),
  sampleConcentration: z.object({
    uniqueTradingDays: z.number().finite(),
    largestContributingDay: z.string().nullable(),
    largestDayObservations: z.number().finite(),
    largestDayPercent: z.number().finite(),
    singleDayDominated: z.boolean(),
    scoreComponent: z.number().finite().optional(),
  }),
  leaveOnePeriodOut: z.object({
    errorStdDev: z.number().finite(),
    errorVariance: z.number().finite().optional(),
    scoreComponent: z.number().finite().optional(),
    folds: z.array(
      z.object({
        excludedMonth: z.string(),
        remainingObservations: z.number().finite(),
        signedCalibrationError: z.number().nullable(),
      }),
    ),
  }),
});

const hypothesisValidationReportSchema = z.object({
  config: z
    .object({
      passScoreThreshold: z.number().finite().optional(),
    })
    .optional(),
  validations: z.array(hypothesisValidationEntrySchema),
});

const hypothesisFailureAnalysisEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  passes: z.boolean(),
  robustnessScore: z.number().finite(),
  passThreshold: z.number().finite(),
  scoreGap: z.number().finite(),
  observationCount: z.number().finite(),
  uniqueTradingDays: z.number().finite(),
  priorityRank: z.number().finite(),
  priorityCategory: z.enum(HYPOTHESIS_PRIORITY_CATEGORIES),
  priorityScore: z.number().finite(),
  recommendedNextAction: z.string(),
  failureReasons: z.array(
    z.object({
      category: z.enum(HYPOTHESIS_FAILURE_REASON_CATEGORIES),
      summary: z.string(),
      detail: z.string().nullable(),
    }),
  ),
  stabilityDiagnostics: z.record(z.string(), z.unknown()),
  marginalEvidenceNeeds: z.array(z.string()),
  notes: z.array(z.string()),
  suggestedStrategyFamily: z.string().nullable(),
  coverageClassification: z.string().nullable(),
  crossValidationPasses: z.boolean().nullable(),
});

const hypothesisFailureAnalysisReportSchema = z.object({
  passThreshold: z.number().finite().optional(),
  analyses: z.array(hypothesisFailureAnalysisEntrySchema),
});

const crossValidationReportSchema = z.object({
  entries: z.array(z.unknown()).optional(),
});

const coverageAwareValidationReportSchema = z.object({
  entries: z.array(z.unknown()).optional(),
});

const researchDimensionExplorerReportSchema = z.object({
  dimensions: z.array(z.object({ dimensionId: z.string() })).optional(),
  axisGroups: z.array(z.object({ groupId: z.string() })).optional(),
});

function readOptionalJson(
  io: ResearchPortfolioAnalyticsIo,
  path: string,
): unknown | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    return JSON.parse(io.readFile(path).replace(/^\uFEFF/, "")) as unknown;
  } catch {
    throw new ResearchPortfolioAnalyticsError(`Invalid JSON at ${path}`);
  }
}

export type LoadedResearchPortfolioAnalyticsInputs = {
  inputStatus: ResearchPortfolioAnalyticsInputStatus;
  candidates: readonly HypothesisCandidate[];
  validations: readonly HypothesisValidationEntry[];
  failureAnalyses: readonly HypothesisFailureAnalysisEntry[];
  passScoreThreshold: number | null;
  failureAnalysisPassThreshold: number | null;
  crossValidationEntryCount: number;
  coverageEntryCount: number;
  dimensionExplorerDimensionCount: number | null;
  dimensionExplorerAxisGroupCount: number | null;
};

export function loadResearchPortfolioAnalyticsInputs(
  io: ResearchPortfolioAnalyticsIo,
  inputPaths: ResearchPortfolioAnalyticsInputPaths,
): LoadedResearchPortfolioAnalyticsInputs {
  const candidatesDocument = readOptionalJson(io, inputPaths.hypothesisCandidatesPath);
  const validationDocument = readOptionalJson(io, inputPaths.hypothesisValidationPath);
  const failureDocument = readOptionalJson(io, inputPaths.hypothesisFailureAnalysisPath);
  const crossValidationDocument = readOptionalJson(io, inputPaths.crossValidationPath);
  const coverageDocument = readOptionalJson(io, inputPaths.coverageAwareValidationPath);
  const explorerDocument = readOptionalJson(io, inputPaths.researchDimensionExplorerPath);

  let candidates: HypothesisCandidate[] = [];
  if (candidatesDocument) {
    const parsed = hypothesisCandidatesReportSchema.safeParse(candidatesDocument);
    if (!parsed.success) {
      throw new ResearchPortfolioAnalyticsError(
        `Invalid hypothesis candidates document at ${inputPaths.hypothesisCandidatesPath}`,
      );
    }

    candidates = parsed.data.candidates as HypothesisCandidate[];
  }

  let validations: HypothesisValidationEntry[] = [];
  let passScoreThreshold: number | null = null;
  if (validationDocument) {
    const parsed = hypothesisValidationReportSchema.safeParse(validationDocument);
    if (!parsed.success) {
      throw new ResearchPortfolioAnalyticsError(
        `Invalid hypothesis validation document at ${inputPaths.hypothesisValidationPath}`,
      );
    }

    validations = parsed.data.validations as unknown as HypothesisValidationEntry[];
    passScoreThreshold = parsed.data.config?.passScoreThreshold ?? null;
  }

  let failureAnalyses: HypothesisFailureAnalysisEntry[] = [];
  let failureAnalysisPassThreshold: number | null = null;
  if (failureDocument) {
    const parsed = hypothesisFailureAnalysisReportSchema.safeParse(failureDocument);
    if (!parsed.success) {
      throw new ResearchPortfolioAnalyticsError(
        `Invalid hypothesis failure analysis document at ${inputPaths.hypothesisFailureAnalysisPath}`,
      );
    }

    failureAnalyses = parsed.data.analyses as unknown as HypothesisFailureAnalysisEntry[];
    failureAnalysisPassThreshold = parsed.data.passThreshold ?? null;
  }

  const crossValidationParsed = crossValidationDocument
    ? crossValidationReportSchema.safeParse(crossValidationDocument)
    : null;
  const coverageParsed = coverageDocument
    ? coverageAwareValidationReportSchema.safeParse(coverageDocument)
    : null;
  const explorerParsed = explorerDocument
    ? researchDimensionExplorerReportSchema.safeParse(explorerDocument)
    : null;

  if (crossValidationDocument && !crossValidationParsed?.success) {
    throw new ResearchPortfolioAnalyticsError(
      `Invalid cross-validation document at ${inputPaths.crossValidationPath}`,
    );
  }

  if (coverageDocument && !coverageParsed?.success) {
    throw new ResearchPortfolioAnalyticsError(
      `Invalid coverage-aware validation document at ${inputPaths.coverageAwareValidationPath}`,
    );
  }

  if (explorerDocument && !explorerParsed?.success) {
    throw new ResearchPortfolioAnalyticsError(
      `Invalid research dimension explorer document at ${inputPaths.researchDimensionExplorerPath}`,
    );
  }

  return {
    inputStatus: {
      hypothesisValidationPresent: validationDocument !== null,
      hypothesisFailureAnalysisPresent: failureDocument !== null,
      hypothesisCandidatesPresent: candidatesDocument !== null,
      crossValidationPresent: crossValidationDocument !== null,
      coverageAwareValidationPresent: coverageDocument !== null,
      researchDimensionExplorerPresent: explorerDocument !== null,
    },
    candidates,
    validations,
    failureAnalyses,
    passScoreThreshold,
    failureAnalysisPassThreshold,
    crossValidationEntryCount: crossValidationParsed?.data?.entries?.length ?? 0,
    coverageEntryCount: coverageParsed?.data?.entries?.length ?? 0,
    dimensionExplorerDimensionCount: explorerParsed?.data?.dimensions?.length ?? null,
    dimensionExplorerAxisGroupCount: explorerParsed?.data?.axisGroups?.length ?? null,
  };
}
