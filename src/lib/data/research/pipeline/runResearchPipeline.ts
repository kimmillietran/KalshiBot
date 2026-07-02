import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  buildResearchStepDependencySpecs,
  formatDependencyFailureMessage,
  validateResearchStepDependencies,
} from "@/lib/data/research/dependencyValidation";
import type {
  DependencyValidationResult,
  ResearchDependencyIo,
} from "@/lib/data/research/dependencyValidation";

import {
  buildResearchPipelineSteps,
  formatResearchPipelineCommand,
} from "./buildResearchPipelineSteps";
import {
  formatPipelineSpawnError,
  formatPipelineStepFailureMessage,
  tailCapturedOutput,
} from "./spawnNpmScript";
import type {
  ResearchPipelineRunStatus,
  ResearchPipelineStepDependencyFields,
  ResearchPipelineStepResult,
  ResearchPipelineSummary,
  RunResearchPipelineInput,
  RunResearchPipelineOutput,
} from "./researchPipelineTypes";

function deriveRunStatus(
  steps: readonly ResearchPipelineStepResult[],
): ResearchPipelineRunStatus {
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

function deriveExitCode(status: ResearchPipelineRunStatus): number {
  return status === "succeeded" ? 0 : 1;
}

function emptyDependencyFields(): ResearchPipelineStepDependencyFields {
  return {
    dependencyStatus: "passed",
    missingDependencies: [],
    staleDependencies: [],
    warnings: [],
  };
}

function dependencyFieldsFromValidation(
  validation: DependencyValidationResult,
): ResearchPipelineStepDependencyFields {
  return {
    dependencyStatus: validation.dependencyStatus,
    missingDependencies: validation.missingDependencies,
    staleDependencies: validation.staleDependencies,
    warnings: validation.warnings,
  };
}

function createSkippedStepResult(
  step: ReturnType<typeof buildResearchPipelineSteps>[number],
): ResearchPipelineStepResult {
  return {
    stepId: step.id,
    label: step.label,
    npmScript: step.npmScript,
    command: formatResearchPipelineCommand(step.npmScript, step.args),
    status: "skipped",
    exitCode: null,
    durationMs: 0,
    ...emptyDependencyFields(),
  };
}

function logDependencyWarnings(
  log: (message: string) => void,
  stepLabel: string,
  validation: DependencyValidationResult,
): void {
  for (const warning of validation.warnings) {
    log(`⚠️  ${stepLabel}: ${warning}`);
  }
}

/** Runs the official research pipeline with progress logging and fail-fast control. */
export async function runResearchPipeline(
  input: RunResearchPipelineInput,
): Promise<RunResearchPipelineOutput> {
  const log = input.log ?? (() => {});
  const steps = buildResearchPipelineSteps(input.config);
  const dependencySpecs = buildResearchStepDependencySpecs({
    discoveryOutputPath: input.config.discoveryOutputPath,
  });
  const dependencyIo: ResearchDependencyIo = input.dependencyIo ?? {
    fileExists: () => true,
    isDirectory: () => true,
    getModifiedTimeMs: () => null,
    countFilesNamedUnder: () => 1,
  };
  const results: ResearchPipelineStepResult[] = [];
  let halted = false;

  for (const step of steps) {
    if (halted) {
      results.push(createSkippedStepResult(step));
      continue;
    }

    const command = formatResearchPipelineCommand(step.npmScript, step.args);
    const spec = dependencySpecs.get(step.id);
    const validation = spec
      ? validateResearchStepDependencies({
          spec,
          io: dependencyIo,
          strictDependencies: input.config.strictDependencies,
        })
      : {
          dependencyStatus: "passed" as const,
          missingDependencies: [],
          staleDependencies: [],
          warnings: [],
        };
    const dependencyFields = dependencyFieldsFromValidation(validation);

    log("");
    log(`=== ${step.label} ===`);

    if (validation.dependencyStatus === "failed") {
      log(formatDependencyFailureMessage(step.label, validation));
      results.push({
        stepId: step.id,
        label: step.label,
        npmScript: step.npmScript,
        command,
        status: "failed",
        exitCode: null,
        durationMs: 0,
        errorMessage: formatDependencyFailureMessage(step.label, validation),
        ...dependencyFields,
      });

      if (!input.config.continueOnError) {
        halted = true;
      }
      continue;
    }

    if (validation.dependencyStatus === "warning") {
      logDependencyWarnings(log, step.label, validation);
    }

    log(command);

    const startedAt = Date.now();
    try {
      const outcome = await input.runner(step.npmScript, step.args);
      const durationMs = Date.now() - startedAt;

      if (outcome.exitCode === 0) {
        results.push({
          stepId: step.id,
          label: step.label,
          npmScript: step.npmScript,
          command,
          status: "succeeded",
          exitCode: outcome.exitCode,
          durationMs,
          ...dependencyFields,
        });
        continue;
      }

      const stdoutTail = tailCapturedOutput(outcome.stdout);
      const stderrTail = tailCapturedOutput(outcome.stderr);
      results.push({
        stepId: step.id,
        label: step.label,
        npmScript: step.npmScript,
        command,
        status: "failed",
        exitCode: outcome.exitCode,
        durationMs,
        errorMessage: formatPipelineStepFailureMessage({
          exitCode: outcome.exitCode,
          stdout: outcome.stdout,
          stderr: outcome.stderr,
        }),
        stdoutTail,
        stderrTail,
        ...dependencyFields,
      });

      if (!input.config.continueOnError) {
        halted = true;
      }
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      results.push({
        stepId: step.id,
        label: step.label,
        npmScript: step.npmScript,
        command,
        status: "failed",
        exitCode: null,
        durationMs,
        errorMessage: formatPipelineSpawnError(error, command),
        ...dependencyFields,
      });

      if (!input.config.continueOnError) {
        halted = true;
      }
    }
  }

  const status = deriveRunStatus(results);
  const summary: ResearchPipelineSummary = {
    generatedAt: input.generatedAt,
    outputPath: input.config.summaryOutputPath,
    config: input.config,
    status,
    steps: results,
  };

  return {
    summary,
    exitCode: deriveExitCode(status),
  };
}

export function serializeResearchPipelineSummary(
  summary: ResearchPipelineSummary,
): string {
  return stableStringify(summary);
}
