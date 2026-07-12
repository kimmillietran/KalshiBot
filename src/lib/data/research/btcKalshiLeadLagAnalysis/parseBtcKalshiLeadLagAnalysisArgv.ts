import {
  DEFAULT_BTC_KALSHI_LEAD_LAG_ANALYSIS_HTML_PATH,
  DEFAULT_BTC_KALSHI_LEAD_LAG_ANALYSIS_OUTPUT_PATH,
  DEFAULT_BTC_KALSHI_LEAD_LAG_EVENTS_PATH,
  BtcKalshiLeadLagAnalysisError,
  type BtcKalshiLeadLagAnalysisConfig,
} from "./btcKalshiLeadLagAnalysisTypes";
import { createBtcKalshiLeadLagAnalysisConfig } from "./btcKalshiLeadLagAnalysisConfig";

function readArgValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return argv[index + 1] ?? null;
}

function readNumberArg(argv: readonly string[], flag: string): number | null {
  const value = readArgValue(argv, flag);
  if (value === null) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBtcKalshiLeadLagAnalysisArgv(argv: readonly string[]): {
  outputPath: string;
  htmlOutputPath: string;
  eventsOutputPath: string;
  config: BtcKalshiLeadLagAnalysisConfig;
} {
  const captureRunDir = readArgValue(argv, "--capture-run-dir");
  if (!captureRunDir) {
    throw new BtcKalshiLeadLagAnalysisError("Missing required --capture-run-dir.");
  }

  const outputPath =
    readArgValue(argv, "--output")
    ?? readArgValue(argv, "-o")
    ?? DEFAULT_BTC_KALSHI_LEAD_LAG_ANALYSIS_OUTPUT_PATH;
  const htmlOutputPath =
    readArgValue(argv, "--html")
    ?? readArgValue(argv, "--html-output")
    ?? DEFAULT_BTC_KALSHI_LEAD_LAG_ANALYSIS_HTML_PATH;
  const eventsOutputPath =
    readArgValue(argv, "--events-output")
    ?? DEFAULT_BTC_KALSHI_LEAD_LAG_EVENTS_PATH;

  const maximumBtcJoinAgeMs = readNumberArg(argv, "--maximum-btc-join-age-ms");
  const responseMatchToleranceMs = readNumberArg(argv, "--response-match-tolerance-ms");
  const triggerCooldownMs = readNumberArg(argv, "--trigger-cooldown-ms");
  const stalenessBoundMs = readNumberArg(argv, "--staleness-bound-ms");

  return {
    outputPath,
    htmlOutputPath,
    eventsOutputPath,
    config: createBtcKalshiLeadLagAnalysisConfig({
      captureRunDir,
      eventsOutputPath,
      ...(maximumBtcJoinAgeMs !== null ? { maximumBtcJoinAgeMs } : {}),
      ...(responseMatchToleranceMs !== null ? { responseMatchToleranceMs } : {}),
      ...(triggerCooldownMs !== null ? { triggerCooldownMs } : {}),
      ...(stalenessBoundMs !== null ? { stalenessBoundMs } : {}),
    }),
  };
}
