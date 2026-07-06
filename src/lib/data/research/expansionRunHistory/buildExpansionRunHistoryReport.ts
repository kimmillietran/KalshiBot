import { analyzeExpansionRunHistory } from "./analyzeExpansionRunHistory";
import { buildExpansionRunHistoryRun } from "./buildExpansionRunHistoryRun";
import {
  appendExpansionRunHistoryRun,
  serializeExpansionRunHistoryDocument,
  tryLoadExpansionRunHistoryDocument,
} from "./expansionRunHistoryDocument";
import { loadExpansionRunHistoryInputs } from "./loadExpansionRunHistoryInputs";
import type {
  ExpansionRunHistoryInputPaths,
  ExpansionRunHistoryIo,
  ExpansionRunHistoryReport,
} from "./expansionRunHistoryTypes";

/** Updates expansion run history and builds the comparison report for the current run. */
export function buildExpansionRunHistoryReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  historyPath: string;
  inputPaths: ExpansionRunHistoryInputPaths;
  io: ExpansionRunHistoryIo;
}): {
  historyJson: string;
  report: ExpansionRunHistoryReport;
} {
  const loadedInputs = loadExpansionRunHistoryInputs(input.io, {
    ...input.inputPaths,
    historyPath: input.historyPath,
  });
  const currentRun = buildExpansionRunHistoryRun(loadedInputs);
  const priorHistory = tryLoadExpansionRunHistoryDocument(input.io, input.historyPath);
  const history = appendExpansionRunHistoryRun(priorHistory.document, currentRun, {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
  });
  const analysis = analyzeExpansionRunHistory(history.runs);

  const report: ExpansionRunHistoryReport = {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    historyPath: input.historyPath,
    summary: {
      runCount: history.runs.length,
      corruptedPreviousHistoryRecovered: priorHistory.corrupted,
    },
    trends: analysis.trends,
    highlights: analysis.highlights,
    runs: history.runs,
  };

  return {
    historyJson: serializeExpansionRunHistoryDocument(history),
    report,
  };
}
