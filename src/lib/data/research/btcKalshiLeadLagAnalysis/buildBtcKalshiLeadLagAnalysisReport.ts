import { analyzeBtcKalshiLeadLagForRun, serializeBtcKalshiLeadLagAnalysisReport } from "./analyzeBtcKalshiLeadLagForRun";
import type {
  BtcKalshiLeadLagAnalysisConfig,
  BtcKalshiLeadLagAnalysisIo,
  BtcKalshiLeadLagAnalysisReport,
} from "./btcKalshiLeadLagAnalysisTypes";
import {
  DEFAULT_BTC_KALSHI_LEAD_LAG_ANALYSIS_HTML_PATH,
  DEFAULT_BTC_KALSHI_LEAD_LAG_ANALYSIS_OUTPUT_PATH,
  DEFAULT_BTC_KALSHI_LEAD_LAG_EVENTS_PATH,
} from "./btcKalshiLeadLagAnalysisTypes";

export async function buildBtcKalshiLeadLagAnalysisReport(input: {
  generatedAt: string;
  outputPath?: string;
  htmlOutputPath?: string;
  eventsOutputPath?: string;
  config: BtcKalshiLeadLagAnalysisConfig;
  io: BtcKalshiLeadLagAnalysisIo;
}): Promise<BtcKalshiLeadLagAnalysisReport> {
  return analyzeBtcKalshiLeadLagForRun({
    generatedAt: input.generatedAt,
    outputPath: input.outputPath ?? DEFAULT_BTC_KALSHI_LEAD_LAG_ANALYSIS_OUTPUT_PATH,
    htmlOutputPath: input.htmlOutputPath ?? DEFAULT_BTC_KALSHI_LEAD_LAG_ANALYSIS_HTML_PATH,
    eventsOutputPath: input.eventsOutputPath ?? DEFAULT_BTC_KALSHI_LEAD_LAG_EVENTS_PATH,
    config: input.config,
    io: input.io,
  });
}

export { serializeBtcKalshiLeadLagAnalysisReport };
