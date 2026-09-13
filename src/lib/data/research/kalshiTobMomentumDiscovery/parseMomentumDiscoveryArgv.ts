import {
  DEFAULT_FORWARD_QUOTES_CAPTURE_ROOT,
  DEFAULT_MOMENTUM_HOLDOUT_RUN_ID,
  DEFAULT_MOMENTUM_TRAIN_RUN_ID,
  DEFAULT_MOMENTUM_VALIDATION_RUN_ID,
  MomentumGovernedDiscoveryError,
} from "./momentumDiscoveryTypes";

export type ParsedMomentumDiscoveryArgv = {
  trainCaptureRunDir: string;
  validationCaptureRunDir: string;
  holdoutCaptureRunDir: string;
  captureRoot: string;
  outputPath: string | null;
  htmlOutputPath: string | null;
};

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0) {
    return null;
  }
  const value = argv[index + 1];
  if (value == null || value.startsWith("--")) {
    throw new MomentumGovernedDiscoveryError(`Missing value for ${flag}`);
  }
  return value;
}

function defaultCaptureDir(captureRoot: string, runId: string): string {
  return `${captureRoot}/${runId}`;
}

export function parseMomentumDiscoveryArgv(
  argv: readonly string[],
): ParsedMomentumDiscoveryArgv {
  const forbidden = argv.find(
    (arg) =>
      arg === "--latest"
      || arg === "--mtime"
      || arg === "--use-latest"
      || arg === "--validate"
      || arg === "--holdout"
      || arg === "--promote"
      || arg === "--preregister"
      || arg === "--freeze"
      || arg === "--capture"
      || arg === "--live"
      || arg === "--alpha"
      || arg.startsWith("--alpha=")
      || arg.startsWith("--target-power=")
      || arg.startsWith("--outcome-sd=")
      || arg.startsWith("--material-effect="),
  );
  if (forbidden) {
    throw new MomentumGovernedDiscoveryError(
      `Forbidden authority flag ${forbidden}: M14.0b is TRAIN-only discovery `
        + "(no latest/mtime, validation, holdout, sealed-science overrides, promotion, freeze, capture, or live trading).",
    );
  }

  const captureRoot =
    readFlagValue(argv, "--capture-root") ?? DEFAULT_FORWARD_QUOTES_CAPTURE_ROOT;

  return {
    captureRoot,
    trainCaptureRunDir:
      readFlagValue(argv, "--train-capture-run-dir")
      ?? defaultCaptureDir(captureRoot, DEFAULT_MOMENTUM_TRAIN_RUN_ID),
    validationCaptureRunDir:
      readFlagValue(argv, "--validation-capture-run-dir")
      ?? defaultCaptureDir(captureRoot, DEFAULT_MOMENTUM_VALIDATION_RUN_ID),
    holdoutCaptureRunDir:
      readFlagValue(argv, "--holdout-capture-run-dir")
      ?? defaultCaptureDir(captureRoot, DEFAULT_MOMENTUM_HOLDOUT_RUN_ID),
    outputPath: readFlagValue(argv, "--output"),
    htmlOutputPath: readFlagValue(argv, "--html-output") ?? readFlagValue(argv, "--html"),
  };
}
