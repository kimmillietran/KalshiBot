import type {
  ArtifactHealthEntry,
  ArtifactHealthSection,
  BuildPipelineDashboardReportInput,
  HypothesisSummarySection,
  ParsedPipelineDashboardInputs,
  PipelineDashboardReport,
  PipelineStatusSection,
  ResearchHealthSection,
  StrategySummarySection,
} from "./pipelineDashboardTypes";

function buildPipelineStatusSection(
  pipelineSummary: ParsedPipelineDashboardInputs["pipelineSummary"],
): PipelineStatusSection {
  if (!pipelineSummary) {
    return {
      pipelineStatus: "unknown",
      completedSteps: [],
      failedSteps: [],
      generatedAt: null,
      durationMs: null,
      totalSteps: 0,
    };
  }

  const completedSteps = pipelineSummary.steps
    .filter((step) => step.status === "succeeded")
    .map((step) => step.label)
    .sort((left, right) => left.localeCompare(right));
  const failedSteps = pipelineSummary.steps
    .filter((step) => step.status === "failed")
    .map((step) => step.label)
    .sort((left, right) => left.localeCompare(right));

  return {
    pipelineStatus: pipelineSummary.status,
    completedSteps,
    failedSteps,
    generatedAt: pipelineSummary.generatedAt,
    durationMs: pipelineSummary.steps.reduce((total, step) => total + step.durationMs, 0),
    totalSteps: pipelineSummary.steps.length,
  };
}

function mapStageStatusToArtifactStatus(
  status: "green" | "yellow" | "red",
): ArtifactHealthEntry["status"] {
  if (status === "green") {
    return "present";
  }
  if (status === "yellow") {
    return "stale";
  }
  return "missing";
}

function buildArtifactHealthSection(
  inputs: ParsedPipelineDashboardInputs,
  artifactIndexPath: string,
): ArtifactHealthSection {
  if (inputs.artifactIndex) {
    const entries: ArtifactHealthEntry[] = [...inputs.artifactIndex.artifacts]
      .map((artifact) => ({
        artifactId: artifact.artifactId,
        label: artifact.name,
        path: artifact.path,
        status: artifact.status,
        lastModified: artifact.generatedTimestamp,
      }))
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId));

    return {
      present: entries.filter((entry) => entry.status === "present").length,
      stale: entries.filter((entry) => entry.status === "stale").length,
      missing: entries.filter((entry) => entry.status === "missing").length,
      artifactIndexPath: inputs.artifactIndex.outputPath,
      artifactIndexPresent: true,
      entries,
    };
  }

  const entries: ArtifactHealthEntry[] = (inputs.dataHealth?.stageStatuses ?? [])
    .map((stage, index) => ({
      artifactId: `stage-${index + 1}`,
      label: stage.stageLabel,
      path: artifactIndexPath,
      status: mapStageStatusToArtifactStatus(stage.status),
      lastModified: inputs.dataHealth?.generatedAt ?? null,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

  const staleWarnings = inputs.dataHealth?.artifactFreshness.staleDependencyWarnings.length ?? 0;

  return {
    present: entries.filter((entry) => entry.status === "present").length,
    stale: entries.filter((entry) => entry.status === "stale").length + staleWarnings,
    missing: entries.filter((entry) => entry.status === "missing").length,
    artifactIndexPath,
    artifactIndexPresent: false,
    entries,
  };
}

function buildHypothesisSummarySection(
  inputs: ParsedPipelineDashboardInputs,
): HypothesisSummarySection {
  const hypothesisCount = inputs.hypothesisCandidates?.candidates.length ?? 0;
  const validatedCount = inputs.hypothesisValidation?.summary.passingCount ?? 0;
  const rejectedCount = inputs.hypothesisValidation?.summary.failingCount ?? 0;

  const promotedCount = inputs.strategySynthesis
    ? inputs.strategySynthesis.summary.promotionCounts.candidate
    : validatedCount;

  return {
    hypothesisCount,
    validatedCount,
    promotedCount,
    rejectedCount,
  };
}

function countExecutedStrategies(
  harnessResults: ParsedPipelineDashboardInputs["harnessResults"],
): number {
  if (!harnessResults) {
    return 0;
  }

  const successfulStrategyIds = new Set(
    harnessResults.results
      .filter((result) => result.status === "success")
      .map((result) => result.synthesizedStrategyId),
  );

  return successfulStrategyIds.size;
}

function buildStrategySummarySection(
  inputs: ParsedPipelineDashboardInputs,
): StrategySummarySection {
  const topCandidate = inputs.strategyLeaderboard?.strategies[0] ?? null;

  return {
    synthesizedStrategies:
      inputs.strategySynthesis?.summary.synthesizedCount
      ?? inputs.strategySynthesis?.strategies.length
      ?? 0,
    executedStrategies: countExecutedStrategies(inputs.harnessResults),
    topCandidateStrategyId: topCandidate?.strategyId ?? null,
    topCandidateRank: topCandidate?.rank ?? null,
    topCandidateTotalPnlCents: topCandidate?.totalPnlCents ?? null,
  };
}

function buildResearchHealthSection(
  inputs: ParsedPipelineDashboardInputs,
  dataHealthPath: string,
): ResearchHealthSection {
  const dataHealth = inputs.dataHealth;
  const staleWarnings = dataHealth?.artifactFreshness.staleDependencyWarnings.length ?? 0;
  const yellowStages =
    dataHealth?.stageStatuses.filter((stage) => stage.status === "yellow").length ?? 0;
  const redStages =
    dataHealth?.stageStatuses.filter((stage) => stage.status === "red").length ?? 0;
  const recommendationCount = dataHealth?.recommendations.length ?? 0;

  const summaryParts: string[] = [];
  if (dataHealth) {
    summaryParts.push(
      `${dataHealth.pipelineCoverage.researchOutputs} research outputs`,
      `${dataHealth.pipelineCoverage.calibrationReports} calibration reports`,
    );
    if (recommendationCount > 0) {
      summaryParts.push(`${recommendationCount} recommended actions`);
    }
  }

  return {
    calibrationCoveragePct: dataHealth?.researchCoverage.calibrationCoveragePct ?? null,
    atlasObservations: inputs.mispricingAtlas?.totalAtlasObservations ?? null,
    warningCount: staleWarnings + yellowStages + redStages + recommendationCount,
    dataHealthGeneratedAt: dataHealth?.generatedAt ?? null,
    dataHealthSummary: summaryParts.length > 0 ? summaryParts.join(" · ") : null,
    dataHealthPath,
    dataHealthPresent: dataHealth !== null,
  };
}

/** Builds a deterministic research pipeline dashboard report. */
export function buildPipelineDashboardReport(
  input: BuildPipelineDashboardReportInput,
): PipelineDashboardReport {
  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    inputPaths: input.inputPaths,
    pipelineStatus: buildPipelineStatusSection(input.inputs.pipelineSummary),
    artifactHealth: buildArtifactHealthSection(
      input.inputs,
      input.inputPaths.artifactIndexPath,
    ),
    hypothesisSummary: buildHypothesisSummarySection(input.inputs),
    strategySummary: buildStrategySummarySection(input.inputs),
    researchHealth: buildResearchHealthSection(
      input.inputs,
      input.inputPaths.dataHealthPath,
    ),
  };
}

export function buildPipelineDashboardReportFromInputs(
  generatedAt: string,
  outputPath: string,
  inputPaths: BuildPipelineDashboardReportInput["inputPaths"],
  inputs: ParsedPipelineDashboardInputs,
): PipelineDashboardReport {
  return buildPipelineDashboardReport({
    generatedAt,
    outputPath,
    inputPaths,
    inputs,
  });
}
