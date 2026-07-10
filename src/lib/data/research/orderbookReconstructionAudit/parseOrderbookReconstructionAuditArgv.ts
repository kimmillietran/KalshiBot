import {
  DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_CONFIG,
  DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_HTML_PATH,
  DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_OUTPUT_PATH,
  OrderbookReconstructionAuditError,
  type OrderbookReconstructionAuditConfig,
} from "./orderbookReconstructionAuditTypes";

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

export function parseOrderbookReconstructionAuditArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  config: OrderbookReconstructionAuditConfig;
} {
  const captureRunDir =
    readArgValue(argv, "--capture-run-dir")
    ?? DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_CONFIG.captureRunDir;
  const maxRawMessages =
    readNumberArg(argv, "--max-raw-messages")
    ?? DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_CONFIG.maxRawMessages;
  const sampleLimit =
    readNumberArg(argv, "--sample-limit")
    ?? DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_CONFIG.sampleLimit;
  const marketTicker = readArgValue(argv, "--market-ticker");
  const outputPath =
    readArgValue(argv, "--output")
    ?? readArgValue(argv, "-o")
    ?? DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_OUTPUT_PATH;
  const htmlOutputPath =
    readArgValue(argv, "--html")
    ?? readArgValue(argv, "--html-output")
    ?? DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_HTML_PATH;

  if (!captureRunDir) {
    throw new OrderbookReconstructionAuditError("Missing --capture-run-dir.");
  }

  return {
    outputPath,
    htmlOutputPath,
    config: {
      captureRunDir,
      maxRawMessages,
      marketTicker,
      sampleLimit,
    },
  };
}

export {
  DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_CONFIG,
  DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_HTML_PATH,
  DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_OUTPUT_PATH,
};
