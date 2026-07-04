import type {
  BuildPipelineDashboardReportInput,
  CoveragePhaseSection,
  ParsedPipelineDashboardInputs,
} from "./pipelineDashboardTypes";

type OrchestratorStepStatus = "succeeded" | "failed" | "skipped" | null;

function resolveOrchestratorStepStatus(
  inputs: ParsedPipelineDashboardInputs,
  stepId: string,
): OrchestratorStepStatus {
  const summary = inputs.fullResearchSummary ?? inputs.pipelineSummary;
  if (!summary) {
    return null;
  }

  const step = summary.steps.find((entry) => entry.stepId === stepId);
  return step?.status ?? null;
}

function buildArtifactLine(
  label: string,
  path: string,
  present: boolean,
  generatedAt: string | null,
  orchestratorStepStatus: OrchestratorStepStatus,
): CoveragePhaseSection["plan"] {
  return {
    label,
    path,
    present,
    generatedAt,
    orchestratorStepStatus,
  };
}

/** Builds coverage-phase visibility from orchestrator steps and optional artifacts. */
export function buildCoveragePhaseSection(
  input: BuildPipelineDashboardReportInput,
): CoveragePhaseSection {
  const { inputs, inputPaths } = input;
  const plan = inputs.historicalCoveragePlan;
  const expansion = inputs.historicalExpansionConfig;
  const validation = inputs.coverageValidation;

  const recommendedImportWindowCount =
    plan?.summary.recommendedImportWindows?.length ?? null;
  const missingMonthCount = plan?.summary.missingMonths?.length ?? null;
  const expansionJobCount =
    expansion?.summary.jobCount
    ?? expansion?.jobs?.length
    ?? null;

  const summaryParts: string[] = [];
  if (plan) {
    summaryParts.push(
      `${plan.summary.currentMarketCount ?? "—"} markets`,
      `${plan.summary.uniqueTradingDays ?? "—"} trading days`,
    );
    if (missingMonthCount !== null) {
      summaryParts.push(`${missingMonthCount} missing months`);
    }
  }
  if (expansion) {
    summaryParts.push(`${expansionJobCount ?? "—"} expansion jobs planned`);
  }
  if (validation) {
    summaryParts.push(
      `${validation.summary.inconclusiveInsufficientCoverageCount ?? 0} inconclusive (coverage)`,
    );
  }

  return {
    plan: buildArtifactLine(
      "Coverage plan",
      inputPaths.historicalCoveragePlanPath,
      plan !== null,
      plan?.generatedAt ?? null,
      resolveOrchestratorStepStatus(inputs, "coverage-plan"),
    ),
    expansionConfig: buildArtifactLine(
      "Expansion import config",
      inputPaths.historicalExpansionConfigPath,
      expansion !== null,
      expansion?.generatedAt ?? null,
      resolveOrchestratorStepStatus(inputs, "generate-expansion-import-config"),
    ),
    coverageValidation: buildArtifactLine(
      "Coverage validation",
      inputPaths.coverageValidationPath,
      validation !== null,
      validation?.generatedAt ?? null,
      resolveOrchestratorStepStatus(inputs, "coverage-validation"),
    ),
    currentMarketCount: plan?.summary.currentMarketCount ?? null,
    uniqueTradingDays: plan?.summary.uniqueTradingDays ?? null,
    missingMonthCount,
    recommendedImportWindowCount,
    expansionJobCount,
    summary: summaryParts.length > 0 ? summaryParts.join(" · ") : null,
  };
}
