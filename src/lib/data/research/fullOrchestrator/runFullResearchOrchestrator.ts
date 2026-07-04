import { stableStringify } from "@/lib/trading/config/hashConfig";
import { formatResearchPipelineCommand } from "@/lib/data/research/pipeline/buildResearchPipelineSteps";
import {
  formatPipelineSpawnError,
  formatPipelineStepFailureMessage,
  tailCapturedOutput,
} from "@/lib/data/research/pipeline/spawnNpmScript";

import { buildFullResearchSteps } from "./buildFullResearchSteps";
import type {
  FullResearchOrchestratorConfig,
  FullResearchRunMode,
  FullResearchRunStatus,
  FullResearchStepDefinition,
  FullResearchStepResult,
  FullResearchSummary,
  RunFullResearchOrchestratorInput,
  RunFullResearchOrchestratorOutput,
} from "./fullResearchOrchestratorTypes";

function deriveRunStatus(
  steps: readonly FullResearchStepResult[],
): FullResearchRunStatus {
  const failed = steps.some((step) => step.status === "failed");
  const succeeded = steps.some((step) => step.status === "succeeded");

  if (!failed) {
    return "succeeded";
  }

  if (succeeded) {
    return "partial";
  }

  return "failed";
}

function deriveExitCode(status: FullResearchRunStatus): number {
  return status === "succeeded" ? 0 : 1;
}

function collectOutputsGenerated(
  step: FullResearchStepDefinition,
  outputIo: RunFullResearchOrchestratorInput["outputIo"],
): readonly string[] {
  if (!outputIo) {
    return [];
  }

  return step.expectedOutputs.filter((path) => outputIo.fileExists(path));
}

function findBlockingUpstreamSteps(
  step: FullResearchStepDefinition,
  resultsById: ReadonlyMap<string, FullResearchStepResult>,
): readonly FullResearchStepResult[] {
  return step.upstreamStepIds
    .map((stepId) => resultsById.get(stepId))
    .filter(
      (result): result is FullResearchStepResult =>
        result !== undefined
        && (result.status === "failed" || result.status === "skipped"),
    );
}

function formatUpstreamSkipReason(
  step: FullResearchStepDefinition,
  blockingUpstream: readonly FullResearchStepResult[],
): string {
  const failed = blockingUpstream.filter((result) => result.status === "failed");
  if (failed.length > 0) {
    const labels = failed.map((result) => result.label).join(", ");
    return `Skipped: upstream step failed (${labels})`;
  }

  const labels = blockingUpstream.map((result) => result.label).join(", ");
  return `Skipped: upstream step unavailable (${labels})`;
}

function formatCoreChainSkipReason(): string {
  return "Skipped: core research chain halted after upstream failure";
}

function formatMissingScriptReason(npmScript: string): string {
  return `npm script not registered: ${npmScript}`;
}

function formatOptionalMissingScriptReason(npmScript: string): string {
  return `Optional coverage step skipped: npm script not registered (${npmScript})`;
}

function createSkippedStepResult(
  step: FullResearchStepDefinition,
  reason: string,
): FullResearchStepResult {
  return {
    stepId: step.id,
    label: step.label,
    npmScript: step.npmScript,
    command: formatResearchPipelineCommand(step.npmScript, step.args),
    status: "skipped",
    exitCode: null,
    durationMs: 0,
    outputsGenerated: [],
    warnings: [],
    executionRisk: step.executionRisk,
    errorMessage: reason,
  };
}

function parseWarnings(stdout: string, stderr: string): readonly string[] {
  const warnings: string[] = [];

  for (const line of `${stdout}\n${stderr}`.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.includes("⚠️") || trimmed.toLowerCase().includes("warning")) {
      warnings.push(trimmed);
    }
  }

  return warnings;
}

function deriveRunMode(config: FullResearchOrchestratorConfig): FullResearchRunMode {
  return config.executeExpansionImport ? "import-executing" : "read-only";
}

function attachExecutionRisk(
  step: FullResearchStepDefinition,
  result: FullResearchStepResult,
): FullResearchStepResult {
  return step.executionRisk ? { ...result, executionRisk: step.executionRisk } : result;
}

/** Runs the end-to-end research workflow by invoking existing research CLIs. */
export async function runFullResearchOrchestrator(
  input: RunFullResearchOrchestratorInput,
): Promise<RunFullResearchOrchestratorOutput> {
  const log = input.log ?? (() => {});
  const outputIo = input.outputIo ?? { fileExists: () => false };
  const isNpmScriptRegistered = input.isNpmScriptRegistered ?? (() => true);
  const steps = buildFullResearchSteps(input.config);
  const results: FullResearchStepResult[] = [];
  const resultsById = new Map<string, FullResearchStepResult>();
  let coreChainHalted = false;

  for (const step of steps) {
    const command = formatResearchPipelineCommand(step.npmScript, step.args);

    log("");
    log(`=== ${step.label} ===`);

    const blockingUpstream = findBlockingUpstreamSteps(step, resultsById);
    if (blockingUpstream.length > 0) {
      const skipped = createSkippedStepResult(
        step,
        formatUpstreamSkipReason(step, blockingUpstream),
      );
      results.push(skipped);
      resultsById.set(step.id, skipped);
      log(skipped.errorMessage!);

      if (!step.independent && !input.config.continueOnError) {
        coreChainHalted = true;
      }
      continue;
    }

    if (!step.independent && coreChainHalted) {
      const skipped = createSkippedStepResult(step, formatCoreChainSkipReason());
      results.push(skipped);
      resultsById.set(step.id, skipped);
      log(skipped.errorMessage!);
      continue;
    }

    if (!isNpmScriptRegistered(step.npmScript)) {
      if (step.optional) {
        const skipped = createSkippedStepResult(
          step,
          formatOptionalMissingScriptReason(step.npmScript),
        );
        results.push(skipped);
        resultsById.set(step.id, skipped);
        log(skipped.errorMessage!);
        continue;
      }

      const failed = attachExecutionRisk(step, {
        stepId: step.id,
        label: step.label,
        npmScript: step.npmScript,
        command,
        status: "failed",
        exitCode: null,
        durationMs: 0,
        outputsGenerated: [],
        warnings: [],
        errorMessage: formatMissingScriptReason(step.npmScript),
      });
      results.push(failed);
      resultsById.set(step.id, failed);
      log(failed.errorMessage ?? "Step failed");

      if (!step.independent && !input.config.continueOnError) {
        coreChainHalted = true;
      }
      continue;
    }

    log(command);

    const startedAt = Date.now();
    try {
      const outcome = await input.runner(step.npmScript, step.args);
      const durationMs = Date.now() - startedAt;
      const warnings = parseWarnings(outcome.stdout, outcome.stderr);

      for (const warning of warnings) {
        log(warning);
      }

      if (outcome.exitCode === 0) {
        const outputsGenerated = collectOutputsGenerated(step, outputIo);
        const succeeded = attachExecutionRisk(step, {
          stepId: step.id,
          label: step.label,
          npmScript: step.npmScript,
          command,
          status: "succeeded",
          exitCode: outcome.exitCode,
          durationMs,
          outputsGenerated,
          warnings,
        });
        results.push(succeeded);
        resultsById.set(step.id, succeeded);
        continue;
      }

      const stdoutTail = tailCapturedOutput(outcome.stdout);
      const stderrTail = tailCapturedOutput(outcome.stderr);
      const failed = attachExecutionRisk(step, {
        stepId: step.id,
        label: step.label,
        npmScript: step.npmScript,
        command,
        status: "failed",
        exitCode: outcome.exitCode,
        durationMs,
        outputsGenerated: collectOutputsGenerated(step, outputIo),
        warnings,
        errorMessage: formatPipelineStepFailureMessage({
          exitCode: outcome.exitCode,
          stdout: outcome.stdout,
          stderr: outcome.stderr,
        }),
        stdoutTail,
        stderrTail,
      });
      results.push(failed);
      resultsById.set(step.id, failed);

      if (!step.independent && !input.config.continueOnError) {
        coreChainHalted = true;
      }
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const failed = attachExecutionRisk(step, {
        stepId: step.id,
        label: step.label,
        npmScript: step.npmScript,
        command,
        status: "failed",
        exitCode: null,
        durationMs,
        outputsGenerated: [],
        warnings: [],
        errorMessage: formatPipelineSpawnError(error, command),
      });
      results.push(failed);
      resultsById.set(step.id, failed);

      if (!step.independent && !input.config.continueOnError) {
        coreChainHalted = true;
      }
    }
  }

  const status = deriveRunStatus(results);
  const summary: FullResearchSummary = {
    generatedAt: input.generatedAt,
    outputPath: input.config.summaryOutputPath,
    config: {
      ...input.config,
      runMode: deriveRunMode(input.config),
    },
    status,
    steps: results,
  };

  return {
    summary,
    exitCode: deriveExitCode(status),
  };
}

export function serializeFullResearchSummary(summary: FullResearchSummary): string {
  return stableStringify(summary);
}

export function createDefaultFullResearchOrchestratorConfig(
  overrides: Partial<FullResearchOrchestratorConfig> = {},
): FullResearchOrchestratorConfig {
  return {
    continueOnError: false,
    summaryOutputPath: "data/research-results/full-research-summary.json",
    executeExpansionImport: false,
    expansionImportMaxMarkets: null,
    expansionImportJobId: null,
    expansionImportResume: false,
    ...overrides,
  };
}
