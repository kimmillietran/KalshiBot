import {
  ResearchExperimentManagerError,
  ResearchExperimentManagerErrorCode,
  type ParsedExperimentInputs,
  type ResearchExperimentInputPaths,
  type ResearchExperimentManagerIo,
} from "./experimentManagerTypes";

function readOptionalJson(
  io: ResearchExperimentManagerIo,
  path: string,
): Record<string, unknown> | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    return JSON.parse(io.readFile(path)) as Record<string, unknown>;
  } catch (error) {
    throw new ResearchExperimentManagerError(
      `Failed to parse JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`,
      ResearchExperimentManagerErrorCode.PARSE_ERROR,
    );
  }
}

function sumStepDurations(
  steps: readonly Record<string, unknown>[] | undefined,
): number | null {
  if (!steps || steps.length === 0) {
    return null;
  }

  return steps.reduce((total, step) => {
    const durationMs = step.durationMs;
    return total + (typeof durationMs === "number" ? durationMs : 0);
  }, 0);
}

function collectStepWarnings(
  steps: readonly Record<string, unknown>[] | undefined,
): string[] {
  if (!steps) {
    return [];
  }

  const warnings: string[] = [];

  for (const step of steps) {
    const stepWarnings = step.warnings;
    if (!Array.isArray(stepWarnings)) {
      continue;
    }

    for (const warning of stepWarnings) {
      if (typeof warning === "string" && warning.trim().length > 0) {
        warnings.push(warning);
      }
    }
  }

  return warnings;
}

function parsePipelineSummary(
  document: Record<string, unknown> | null,
): ParsedExperimentInputs["pipelineSummary"] {
  if (!document) {
    return null;
  }

  const steps = Array.isArray(document.steps)
    ? (document.steps as readonly Record<string, unknown>[])
    : [];

  return {
    config:
      document.config && typeof document.config === "object"
        ? (document.config as Record<string, unknown>)
        : {},
    status: typeof document.status === "string" ? document.status : "unknown",
    steps: steps.map((step) => ({
      durationMs: typeof step.durationMs === "number" ? step.durationMs : 0,
      warnings: Array.isArray(step.warnings)
        ? step.warnings.filter((warning): warning is string => typeof warning === "string")
        : [],
    })),
  };
}

function parseValidationSummary(
  document: Record<string, unknown> | null,
): ParsedExperimentInputs["validationSummary"] {
  if (!document || !document.summary || typeof document.summary !== "object") {
    return null;
  }

  const summary = document.summary as Record<string, unknown>;

  return {
    totalHypotheses:
      typeof summary.totalHypotheses === "number" ? summary.totalHypotheses : 0,
    passingCount:
      typeof summary.passingCount === "number" ? summary.passingCount : 0,
    failingCount:
      typeof summary.failingCount === "number" ? summary.failingCount : 0,
    averageRobustnessScore:
      typeof summary.averageRobustnessScore === "number"
        ? summary.averageRobustnessScore
        : null,
  };
}

function parseHarnessSummary(
  document: Record<string, unknown> | null,
): ParsedExperimentInputs["harnessSummary"] {
  if (!document || !document.summary || typeof document.summary !== "object") {
    return null;
  }

  const summary = document.summary as Record<string, unknown>;
  const recommendationCounts =
    summary.recommendationCounts &&
    typeof summary.recommendationCounts === "object"
      ? (summary.recommendationCounts as Record<string, number>)
      : {};

  return {
    totalStrategies:
      typeof summary.totalStrategies === "number" ? summary.totalStrategies : 0,
    evaluatedCount:
      typeof summary.evaluatedCount === "number" ? summary.evaluatedCount : 0,
    recommendationCounts,
  };
}

function parsePromotionSummary(
  document: Record<string, unknown> | null,
): ParsedExperimentInputs["promotionSummary"] {
  if (!document || !document.summary || typeof document.summary !== "object") {
    return null;
  }

  const summary = document.summary as Record<string, unknown>;
  const decisionCounts =
    summary.decisionCounts && typeof summary.decisionCounts === "object"
      ? (summary.decisionCounts as Record<string, number>)
      : {};

  return {
    totalStrategies:
      typeof summary.totalStrategies === "number" ? summary.totalStrategies : 0,
    decisionCounts,
    watchlistCount:
      typeof summary.watchlistCount === "number" ? summary.watchlistCount : 0,
    rejectedCount:
      typeof summary.rejectedCount === "number" ? summary.rejectedCount : 0,
  };
}

function parsePromotions(
  document: Record<string, unknown> | null,
): ParsedExperimentInputs["promotions"] {
  if (!document || !Array.isArray(document.promotions)) {
    return [];
  }

  return document.promotions
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object")
    .map((entry) => {
      const supportingMetrics =
        entry.supportingMetrics && typeof entry.supportingMetrics === "object"
          ? (entry.supportingMetrics as Record<string, unknown>)
          : null;

      return {
        strategyId: typeof entry.strategyId === "string" ? entry.strategyId : "unknown",
        hypothesisId:
          typeof entry.hypothesisId === "string" ? entry.hypothesisId : "unknown",
        strategyFamily:
          typeof entry.strategyFamily === "string" ? entry.strategyFamily : "unknown",
        decision: typeof entry.decision === "string" ? entry.decision : "unknown",
        robustnessScore:
          supportingMetrics &&
          typeof supportingMetrics.robustnessScore === "number"
            ? supportingMetrics.robustnessScore
            : null,
        warnings: Array.isArray(entry.warnings)
          ? entry.warnings.filter((warning): warning is string => typeof warning === "string")
          : [],
      };
    });
}

function parseArtifactSnapshot(
  document: Record<string, unknown> | null,
): ParsedExperimentInputs["artifactSnapshot"] {
  if (!document || !Array.isArray(document.artifacts)) {
    return [];
  }

  return document.artifacts
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object")
    .map((entry) => ({
      artifactId:
        typeof entry.artifactId === "string" ? entry.artifactId : "unknown",
      status: typeof entry.status === "string" ? entry.status : "unknown",
      generatedTimestamp:
        typeof entry.generatedTimestamp === "string"
          ? entry.generatedTimestamp
          : null,
    }));
}

export function loadExperimentInputs(
  io: ResearchExperimentManagerIo,
  inputPaths: ResearchExperimentInputPaths,
): ParsedExperimentInputs {
  const pipelineDocument = readOptionalJson(io, inputPaths.pipelineSummaryPath);
  const fullResearchDocument = readOptionalJson(
    io,
    inputPaths.fullResearchSummaryPath,
  );
  const hypothesisCandidatesDocument = readOptionalJson(
    io,
    inputPaths.hypothesisCandidatesPath,
  );
  const validationDocument = readOptionalJson(
    io,
    inputPaths.hypothesisValidationPath,
  );
  const synthesisDocument = readOptionalJson(io, inputPaths.strategySynthesisPath);
  const harnessDocument = readOptionalJson(io, inputPaths.harnessResultsPath);
  const promotionsDocument = readOptionalJson(
    io,
    inputPaths.candidatePromotionsPath,
  );
  const artifactIndexDocument = readOptionalJson(io, inputPaths.artifactIndexPath);

  const pipelineSummary = parsePipelineSummary(pipelineDocument);
  const fullResearchSummary = parsePipelineSummary(fullResearchDocument);

  const hypothesisCount =
    hypothesisCandidatesDocument &&
    hypothesisCandidatesDocument.summary &&
    typeof hypothesisCandidatesDocument.summary === "object"
      ? ((hypothesisCandidatesDocument.summary as Record<string, unknown>)
          .candidateCount as number | undefined) ?? null
      : Array.isArray(hypothesisCandidatesDocument?.candidates)
        ? hypothesisCandidatesDocument.candidates.length
        : null;

  const synthesizedStrategyCount =
    synthesisDocument &&
    synthesisDocument.summary &&
    typeof synthesisDocument.summary === "object"
      ? ((synthesisDocument.summary as Record<string, unknown>).synthesizedCount as
          | number
          | undefined) ?? null
      : Array.isArray(synthesisDocument?.strategies)
        ? synthesisDocument.strategies.length
        : null;

  const warnings = [
    ...collectStepWarnings(pipelineDocument?.steps as readonly Record<string, unknown>[]),
    ...collectStepWarnings(
      fullResearchDocument?.steps as readonly Record<string, unknown>[],
    ),
    ...parsePromotions(promotionsDocument).flatMap((promotion) => promotion.warnings),
  ];

  return {
    pipelineSummary,
    fullResearchSummary,
    hypothesisCount,
    validationSummary: parseValidationSummary(validationDocument),
    synthesizedStrategyCount,
    harnessSummary: parseHarnessSummary(harnessDocument),
    promotionSummary: parsePromotionSummary(promotionsDocument),
    promotions: parsePromotions(promotionsDocument),
    artifactSnapshot: parseArtifactSnapshot(artifactIndexDocument),
    warnings: [...new Set(warnings)],
  };
}

export function computeRuntimeFromInputs(
  inputs: ParsedExperimentInputs,
): {
  pipelineDurationMs: number | null;
  fullResearchDurationMs: number | null;
  totalDurationMs: number | null;
} {
  const pipelineDurationMs = inputs.pipelineSummary
    ? sumStepDurations(
        inputs.pipelineSummary.steps as unknown as readonly Record<string, unknown>[],
      )
    : null;
  const fullResearchDurationMs = inputs.fullResearchSummary
    ? sumStepDurations(
        inputs.fullResearchSummary.steps as unknown as readonly Record<string, unknown>[],
      )
    : null;

  const totalDurationMs =
    pipelineDurationMs === null && fullResearchDurationMs === null
      ? null
      : (pipelineDurationMs ?? 0) + (fullResearchDurationMs ?? 0);

  return {
    pipelineDurationMs,
    fullResearchDurationMs,
    totalDurationMs,
  };
}
