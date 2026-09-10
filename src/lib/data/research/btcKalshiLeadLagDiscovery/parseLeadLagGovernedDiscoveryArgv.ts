export type LeadLagGovernedDiscoveryArgv = {
  trainCaptureRunDir: string;
  validationCaptureRunDir: string;
  holdoutCaptureRunDir: string;
  outputPath: string | null;
  htmlOutputPath: string | null;
};

function readFlag(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) {
    return null;
  }
  return args[index + 1] ?? null;
}

export function parseLeadLagGovernedDiscoveryArgv(
  argv: readonly string[],
): LeadLagGovernedDiscoveryArgv {
  const trainCaptureRunDir = readFlag(argv, "--train-capture-run-dir");
  const validationCaptureRunDir = readFlag(argv, "--validation-capture-run-dir");
  const holdoutCaptureRunDir = readFlag(argv, "--holdout-capture-run-dir");

  if (!trainCaptureRunDir || !validationCaptureRunDir || !holdoutCaptureRunDir) {
    throw new Error(
      "Required: --train-capture-run-dir, --validation-capture-run-dir, --holdout-capture-run-dir",
    );
  }

  return {
    trainCaptureRunDir,
    validationCaptureRunDir,
    holdoutCaptureRunDir,
    outputPath: readFlag(argv, "--output") ?? readFlag(argv, "-o"),
    htmlOutputPath: readFlag(argv, "--html") ?? readFlag(argv, "--html-output"),
  };
}
