import { analyzeParityNearMissForRun, serializeParityNearMissAnalysisReport } from "./analyzeParityNearMissForRun";
import type {
  ParityNearMissAnalysisConfig,
  ParityNearMissAnalysisIo,
  ParityNearMissAnalysisReport,
} from "./parityNearMissAnalysisTypes";
import {
  DEFAULT_PARITY_NEAR_MISS_ANALYSIS_HTML_PATH,
  DEFAULT_PARITY_NEAR_MISS_ANALYSIS_OUTPUT_PATH,
} from "./parityNearMissAnalysisTypes";

export async function buildParityNearMissAnalysisReport(input: {
  generatedAt: string;
  outputPath?: string;
  htmlOutputPath?: string;
  config: ParityNearMissAnalysisConfig;
  io: ParityNearMissAnalysisIo;
}): Promise<ParityNearMissAnalysisReport> {
  return analyzeParityNearMissForRun({
    generatedAt: input.generatedAt,
    outputPath: input.outputPath ?? DEFAULT_PARITY_NEAR_MISS_ANALYSIS_OUTPUT_PATH,
    htmlOutputPath: input.htmlOutputPath ?? DEFAULT_PARITY_NEAR_MISS_ANALYSIS_HTML_PATH,
    config: input.config,
    io: input.io,
  });
}

export { serializeParityNearMissAnalysisReport };
