import {
  DEFAULT_STATIC_PARITY_FRICTION_CONFIG,
  DEFAULT_STATIC_PARITY_SCAN_HTML_PATH,
  DEFAULT_STATIC_PARITY_SCAN_INPUT_PATHS,
  DEFAULT_STATIC_PARITY_SCAN_OUTPUT_PATH,
  PARITY_PRICING_MODELS,
  StaticParityScanError,
  type ParityPricingModel,
  type StaticParityFrictionConfig,
  type StaticParityScanInputPaths,
} from "./staticParityScanTypes";

function readArgValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return argv[index + 1] ?? null;
}

function readNumericArg(argv: readonly string[], flag: string): number | null {
  const value = readArgValue(argv, flag);
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePricingModel(value: string | null): ParityPricingModel {
  if (value === null) {
    return DEFAULT_STATIC_PARITY_FRICTION_CONFIG.pricingModel;
  }

  if ((PARITY_PRICING_MODELS as readonly string[]).includes(value)) {
    return value as ParityPricingModel;
  }

  throw new StaticParityScanError(
    `Invalid --pricing-model value: ${value}. Expected bid-only or complement-derived.`,
  );
}

export function parseStaticParityScanFrictionFromArgv(
  argv: readonly string[],
): StaticParityFrictionConfig {
  const pricingModel = parsePricingModel(readArgValue(argv, "--pricing-model"));
  const feeBufferCents =
    readNumericArg(argv, "--fee-buffer-cents")
    ?? DEFAULT_STATIC_PARITY_FRICTION_CONFIG.feeBufferCents;
  const minGrossEdgeCents =
    readNumericArg(argv, "--min-gross-edge-cents")
    ?? DEFAULT_STATIC_PARITY_FRICTION_CONFIG.minGrossEdgeCents;
  const minBidOnlyEdgeCents =
    readNumericArg(argv, "--min-bid-only-edge-cents")
    ?? DEFAULT_STATIC_PARITY_FRICTION_CONFIG.minBidOnlyEdgeCents;
  const minSizeContracts =
    readNumericArg(argv, "--min-size-contracts")
    ?? DEFAULT_STATIC_PARITY_FRICTION_CONFIG.minSizeContracts;

  return {
    pricingModel,
    feeBufferCents,
    minGrossEdgeCents,
    minBidOnlyEdgeCents,
    minSizeContracts,
    requireBothSidesPresent:
      pricingModel === "complement-derived"
        ? DEFAULT_STATIC_PARITY_FRICTION_CONFIG.requireBothSidesPresent
        : false,
    requireExecutableConfirmation:
      DEFAULT_STATIC_PARITY_FRICTION_CONFIG.requireExecutableConfirmation,
  };
}

export function parseStaticParityScanPathsFromArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: StaticParityScanInputPaths;
} {
  const outputPath =
    readArgValue(argv, "--output")
    ?? readArgValue(argv, "-o")
    ?? DEFAULT_STATIC_PARITY_SCAN_OUTPUT_PATH;
  const htmlOutputPath =
    readArgValue(argv, "--html")
    ?? readArgValue(argv, "--html-output")
    ?? DEFAULT_STATIC_PARITY_SCAN_HTML_PATH;
  const forwardQuotesDir =
    readArgValue(argv, "--input-dir")
    ?? readArgValue(argv, "--forward-quotes-dir")
    ?? DEFAULT_STATIC_PARITY_SCAN_INPUT_PATHS.forwardQuotesDir;

  if (!outputPath || !htmlOutputPath || !forwardQuotesDir) {
    throw new StaticParityScanError("Missing required CLI paths.");
  }

  return {
    outputPath,
    htmlOutputPath,
    inputPaths: { forwardQuotesDir },
  };
}
