import { analyzeHypothesisEvolution } from "./analyzeHypothesisEvolution";
import { buildHypothesisEvolutionRun } from "./buildHypothesisEvolutionRun";
import {
  appendHypothesisHistoryRun,
  serializeHypothesisHistoryDocument,
  tryLoadHypothesisHistoryDocument,
} from "./hypothesisHistoryDocument";
import { loadHypothesisEvolutionInputs } from "./loadHypothesisEvolutionInputs";
import type {
  HypothesisEvolutionInputPaths,
  HypothesisEvolutionIo,
  HypothesisEvolutionReport,
} from "./hypothesisEvolutionTypes";

/** Updates hypothesis history and builds the evolution report for the current run. */
export function buildHypothesisEvolutionReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  historyPath: string;
  inputPaths: HypothesisEvolutionInputPaths;
  io: HypothesisEvolutionIo;
}): {
  historyJson: string;
  report: HypothesisEvolutionReport;
} {
  const loadedInputs = loadHypothesisEvolutionInputs(input.io, {
    ...input.inputPaths,
    historyPath: input.historyPath,
  });
  const currentRun = buildHypothesisEvolutionRun(loadedInputs);
  const existingHistory = tryLoadHypothesisHistoryDocument(input.io, input.historyPath);
  const history = appendHypothesisHistoryRun(existingHistory, currentRun, {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
  });
  const analysis = analyzeHypothesisEvolution(history);

  const report: HypothesisEvolutionReport = {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    historyPath: input.historyPath,
    summary: analysis.summary,
    highlights: analysis.highlights,
    entries: analysis.entries,
  };

  return {
    historyJson: serializeHypothesisHistoryDocument(history),
    report,
  };
}
