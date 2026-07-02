import type {
  DataHealthRecommendation,
  DataHealthStageStatus,
  PipelineCoverage,
  ResearchCoverage,
  ScannedDataHealthInputs,
  SettlementHealth,
  StageStatusColor,
} from "./dataHealthTypes";

function stage(
  stageId: string,
  stageLabel: string,
  status: StageStatusColor,
  reason: string,
  requiredAction: string,
): DataHealthStageStatus {
  return { stageId, stageLabel, status, reason, requiredAction };
}

export function computeStageStatuses(
  scanned: ScannedDataHealthInputs,
): DataHealthStageStatus[] {
  const { pipelineCoverage, settlementHealth, researchCoverage } = scanned;

  const stages: DataHealthStageStatus[] = [
    evaluateDiscoveryStage(pipelineCoverage),
    evaluateImportStage(pipelineCoverage),
    evaluateFixtureStage(pipelineCoverage),
    evaluateRegistryStage(pipelineCoverage),
    evaluateResearchStage(pipelineCoverage),
    evaluateAggregateStage(pipelineCoverage),
    evaluateSettlementStage(settlementHealth, pipelineCoverage),
    evaluateCalibrationStage(pipelineCoverage, researchCoverage),
    evaluateAnalysisStage(researchCoverage),
    evaluateLeaderboardStage(pipelineCoverage),
    evaluateReportStage(pipelineCoverage, scanned.artifactFreshness.staleDependencyWarnings.length),
  ];

  return stages.sort((left, right) => left.stageId.localeCompare(right.stageId));
}

function evaluateDiscoveryStage(coverage: PipelineCoverage): DataHealthStageStatus {
  if (coverage.discoveredMarkets === null || coverage.discoveredMarkets === 0) {
    return stage(
      "discovery",
      "Market discovery",
      "red",
      "discovery-result.json is missing or contains no markets.",
      "Run market discovery before downstream research.",
    );
  }

  return stage(
    "discovery",
    "Market discovery",
    "green",
    `${coverage.discoveredMarkets} markets discovered.`,
    "None",
  );
}

function evaluateImportStage(coverage: PipelineCoverage): DataHealthStageStatus {
  if (coverage.importConfigs === 0) {
    return stage(
      "imports",
      "Historical imports",
      "red",
      "No import configs were found.",
      "Generate import configs from discovery output.",
    );
  }

  if (coverage.successfulImports === null) {
    return stage(
      "imports",
      "Historical imports",
      "yellow",
      `${coverage.importConfigs} import configs exist but batch-import-summary.json is missing.`,
      "Run batch import and capture batch-import-summary.json.",
    );
  }

  if (coverage.failedImports !== null && coverage.failedImports > 0) {
    return stage(
      "imports",
      "Historical imports",
      "yellow",
      `${coverage.failedImports} imports failed out of ${coverage.importConfigs} configs.`,
      "Review import failures and retry recoverable markets.",
    );
  }

  return stage(
    "imports",
    "Historical imports",
    "green",
    `${coverage.successfulImports} imports succeeded.`,
    "None",
  );
}

function evaluateFixtureStage(coverage: PipelineCoverage): DataHealthStageStatus {
  if (coverage.fixtures === 0) {
    return stage(
      "fixtures",
      "Fixture bridge",
      "red",
      "No fixture.json files were found.",
      "Run fixtures:batch to build replay fixtures.",
    );
  }

  if (coverage.discoveredMarkets !== null && coverage.fixtures < coverage.discoveredMarkets) {
    return stage(
      "fixtures",
      "Fixture bridge",
      "yellow",
      `${coverage.fixtures} fixtures cover fewer markets than discovery (${coverage.discoveredMarkets}).`,
      "Rebuild fixtures for missing markets.",
    );
  }

  return stage(
    "fixtures",
    "Fixture bridge",
    "green",
    `${coverage.fixtures} fixtures available.`,
    "None",
  );
}

function evaluateRegistryStage(coverage: PipelineCoverage): DataHealthStageStatus {
  if (coverage.registryMarkets === 0) {
    return stage(
      "registry",
      "Research registry",
      "red",
      "No dataset-registry.json markets were found.",
      "Run research:registry against fixtures and import metadata.",
    );
  }

  return stage(
    "registry",
    "Research registry",
    "green",
    `${coverage.registryMarkets} registry markets indexed.`,
    "None",
  );
}

function evaluateResearchStage(coverage: PipelineCoverage): DataHealthStageStatus {
  if (coverage.researchOutputs === 0) {
    return stage(
      "research",
      "Research execution",
      "red",
      "No research-output.json files were found.",
      "Run research sweep or batch research.",
    );
  }

  return stage(
    "research",
    "Research execution",
    "green",
    `${coverage.researchOutputs} research outputs available.`,
    "None",
  );
}

function evaluateAggregateStage(coverage: PipelineCoverage): DataHealthStageStatus {
  if (coverage.aggregateSummaries === 0) {
    return stage(
      "aggregate",
      "Aggregate summaries",
      "yellow",
      "No aggregate-summary.json files were found.",
      "Run research:aggregate after research execution.",
    );
  }

  return stage(
    "aggregate",
    "Aggregate summaries",
    "green",
    `${coverage.aggregateSummaries} aggregate summaries available.`,
    "None",
  );
}

function evaluateSettlementStage(
  settlement: SettlementHealth,
  coverage: PipelineCoverage,
): DataHealthStageStatus {
  if (coverage.registryMarkets === 0) {
    return stage(
      "settlement",
      "Settlement coverage",
      "red",
      "Registry markets unavailable; settlement coverage cannot be assessed.",
      "Build research registry before evaluating settlement health.",
    );
  }

  if (settlement.settlementMissing === 0) {
    return stage(
      "settlement",
      "Settlement coverage",
      "green",
      "All registry markets include settlement data.",
      "None",
    );
  }

  if (
    settlement.settlementCoveragePct !== null &&
    settlement.settlementCoveragePct >= 90
  ) {
    return stage(
      "settlement",
      "Settlement coverage",
      "yellow",
      `${settlement.settlementMissing} markets missing settlement (${settlement.settlementCoveragePct}% coverage).`,
      "Import or repair settlement records for missing markets.",
    );
  }

  return stage(
    "settlement",
    "Settlement coverage",
    "red",
    `${settlement.settlementMissing} markets missing settlement (${settlement.settlementCoveragePct ?? 0}% coverage).`,
    "Fix settlement gaps before trusting calibration or atlas outputs.",
  );
}

function evaluateCalibrationStage(
  coverage: PipelineCoverage,
  research: ResearchCoverage,
): DataHealthStageStatus {
  if (coverage.calibrationReports === 0) {
    return stage(
      "calibration",
      "Calibration reports",
      "yellow",
      "No calibration-report.json files were found.",
      "Run research:calibration after research execution.",
    );
  }

  if (
    research.calibrationCoveragePct !== null &&
    research.calibrationCoveragePct < 80
  ) {
    return stage(
      "calibration",
      "Calibration reports",
      "yellow",
      `Calibration coverage is ${research.calibrationCoveragePct}% of research outputs.`,
      "Rebuild calibration for markets missing reports.",
    );
  }

  return stage(
    "calibration",
    "Calibration reports",
    "green",
    `${coverage.calibrationReports} calibration reports available.`,
    "None",
  );
}

function evaluateAnalysisStage(research: ResearchCoverage): DataHealthStageStatus {
  const missing: string[] = [];
  if (!research.mispricingAtlasPresent) {
    missing.push("mispricing atlas");
  }
  if (!research.leadLagPresent) {
    missing.push("lead-lag");
  }
  if (!research.significancePresent) {
    missing.push("significance");
  }

  if (missing.length >= 2) {
    return stage(
      "analysis",
      "Downstream analysis",
      "red",
      `Missing or empty analysis artifacts: ${missing.join(", ")}.`,
      "Run the research analysis pipeline for missing artifacts.",
    );
  }

  if (missing.length === 1) {
    return stage(
      "analysis",
      "Downstream analysis",
      "yellow",
      `Partial analysis coverage; missing ${missing[0]}.`,
      `Run research commands to generate ${missing[0]}.`,
    );
  }

  if (
    research.mispricingAtlasCoveragePct !== null &&
    research.mispricingAtlasCoveragePct < 50
  ) {
    return stage(
      "analysis",
      "Downstream analysis",
      "yellow",
      `Mispricing atlas covers ${research.mispricingAtlasCoveragePct}% of markets.`,
      "Investigate missing settlement or probability inputs blocking atlas observations.",
    );
  }

  return stage(
    "analysis",
    "Downstream analysis",
    "green",
    "Core analysis artifacts are present with usable coverage.",
    "None",
  );
}

function evaluateLeaderboardStage(coverage: PipelineCoverage): DataHealthStageStatus {
  if (!coverage.leaderboardPresent) {
    return stage(
      "leaderboard",
      "Strategy leaderboard",
      "yellow",
      "strategy-leaderboard.json is missing.",
      "Run leaderboard:strategies after aggregate summaries exist.",
    );
  }

  return stage(
    "leaderboard",
    "Strategy leaderboard",
    "green",
    "Strategy leaderboard artifact is present.",
    "None",
  );
}

function evaluateReportStage(
  coverage: PipelineCoverage,
  staleWarningCount: number,
): DataHealthStageStatus {
  if (!coverage.reportHtmlPresent) {
    return stage(
      "report",
      "Research report",
      "yellow",
      "research-report.html is missing.",
      "Run research:report after leaderboard and calibration artifacts exist.",
    );
  }

  if (staleWarningCount > 0) {
    return stage(
      "report",
      "Research report",
      "yellow",
      "Report or downstream artifacts appear stale relative to upstream dependencies.",
      "Rebuild stale downstream artifacts in dependency order.",
    );
  }

  return stage(
    "report",
    "Research report",
    "green",
    "Research report artifact is present and fresh.",
    "None",
  );
}

export function computeRecommendations(
  stages: readonly DataHealthStageStatus[],
): DataHealthRecommendation[] {
  const recommendations: DataHealthRecommendation[] = [];
  let priority = 1;

  for (const entry of stages) {
    if (entry.status === "green" || entry.requiredAction === "None") {
      continue;
    }

    recommendations.push({
      priority,
      action: entry.requiredAction,
      reason: entry.reason,
    });
    priority += 1;
  }

  return recommendations;
}
