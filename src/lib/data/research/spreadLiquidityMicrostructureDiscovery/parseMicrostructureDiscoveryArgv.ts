import {
  DEFAULT_FORWARD_QUOTES_CAPTURE_ROOT,
  DEFAULT_MICROSTRUCTURE_HOLDOUT_RUN_ID,
  DEFAULT_MICROSTRUCTURE_TRAIN_RUN_ID,
  DEFAULT_MICROSTRUCTURE_VALIDATION_RUN_ID,
  MicrostructureGovernedDiscoveryError,
} from "./microstructureDiscoveryTypes";

export type ParsedMicrostructureDiscoveryArgv = {
  trainCaptureRunDir: string;
  validationCaptureRunDir: string;
  holdoutCaptureRunDir: string;
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
    throw new MicrostructureGovernedDiscoveryError(`Missing value for ${flag}`);
  }
  return value;
}

function defaultCaptureDir(runId: string): string {
  return `${DEFAULT_FORWARD_QUOTES_CAPTURE_ROOT}/${runId}`;
}

export function parseMicrostructureDiscoveryArgv(
  argv: readonly string[],
): ParsedMicrostructureDiscoveryArgv {
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
      || arg === "--live",
  );
  if (forbidden) {
    throw new MicrostructureGovernedDiscoveryError(
      `Forbidden authority flag ${forbidden}: M13.0b is TRAIN-only discovery `
        + "(no latest/mtime, validation, holdout, promotion, freeze, capture, or live trading).",
    );
  }

  return {
    trainCaptureRunDir:
      readFlagValue(argv, "--train-capture-run-dir")
      ?? defaultCaptureDir(DEFAULT_MICROSTRUCTURE_TRAIN_RUN_ID),
    validationCaptureRunDir:
      readFlagValue(argv, "--validation-capture-run-dir")
      ?? defaultCaptureDir(DEFAULT_MICROSTRUCTURE_VALIDATION_RUN_ID),
    holdoutCaptureRunDir:
      readFlagValue(argv, "--holdout-capture-run-dir")
      ?? defaultCaptureDir(DEFAULT_MICROSTRUCTURE_HOLDOUT_RUN_ID),
    outputPath: readFlagValue(argv, "--output"),
    htmlOutputPath: readFlagValue(argv, "--html-output") ?? readFlagValue(argv, "--html"),
  };
}
