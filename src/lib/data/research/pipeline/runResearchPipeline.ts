import { stableStringify } from "@/lib/trading/config/hashConfig";

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

/** Runs the official research pipeline with progress logging and fail-fast control. */
export async function runResearchPipeline(
  input: RunResearchPipelineInput,
): Promise<RunResearchPipelineOutput> {
  const log = input.log ?? (() => {});
  const steps = buildResearchPipelineSteps(input.config);
  const results: ResearchPipelineStepResult[] = [];
  let halted = false;

  for (const step of steps) {
    if (halted) {
      results.push({
        stepId: step.id,
        label: step.label,
        npmScript: step.npmScript,
        command: formatResearchPipelineCommand(step.npmScript, step.args),
        status: "skipped",
        exitCode: null,
        durationMs: 0,
      });
      continue;
    }

    const command = formatResearchPipelineCommand(step.npmScript, step.args);
    log("");
    log(`=== ${step.label} ===`);
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
