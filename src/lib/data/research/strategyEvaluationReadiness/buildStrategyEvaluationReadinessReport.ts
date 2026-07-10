import { stableStringify } from "@/lib/trading/config/hashConfig";

import { evaluateStrategyEvaluationReadiness } from "./evaluateStrategyEvaluationReadiness";
import { loadStrategyEvaluationInputs } from "./loadStrategyEvaluationInputs";
import type {
  StrategyEvaluationInputPaths,
  StrategyEvaluationReadinessIo,
  StrategyEvaluationReadinessReport,
} from "./strategyEvaluationReadinessTypes";

/** Builds the strategy evaluation readiness report from artifacts and capture data. */
export function buildStrategyEvaluationReadinessReport(input: {
  generatedAt: string;
  evaluatedAt?: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: StrategyEvaluationInputPaths;
  io: StrategyEvaluationReadinessIo;
}): StrategyEvaluationReadinessReport {
  const evaluatedAt = input.evaluatedAt ?? input.generatedAt;
  const loadedInputs = loadStrategyEvaluationInputs({
    io: input.io,
    inputPaths: input.inputPaths,
    evaluatedAt,
  });

  return evaluateStrategyEvaluationReadiness({
    inputs: loadedInputs,
    inputPaths: input.inputPaths,
    evaluatedAt,
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
  });
}

export function serializeStrategyEvaluationReadinessReport(
  report: StrategyEvaluationReadinessReport,
): string {
  return stableStringify(report);
}
