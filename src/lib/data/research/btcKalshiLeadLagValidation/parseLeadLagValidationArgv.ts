export type LeadLagValidationArgv = {
  discoveryIdentityHash: string;
  discoveryReportPath: string | null;
  expectedSplitManifestHash: string | null;
  validationCaptureRunDir: string | null;
  holdoutCaptureRunDir: string | null;
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

export function parseLeadLagValidationArgv(argv: readonly string[]): LeadLagValidationArgv {
  const discoveryIdentityHash = readFlag(argv, "--discovery-identity");
  if (!discoveryIdentityHash) {
    throw new Error("Required: --discovery-identity <hash>");
  }

  return {
    discoveryIdentityHash,
    discoveryReportPath: readFlag(argv, "--discovery-report"),
    expectedSplitManifestHash: readFlag(argv, "--split-manifest-hash"),
    validationCaptureRunDir: readFlag(argv, "--validation-capture-run-dir"),
    holdoutCaptureRunDir: readFlag(argv, "--holdout-capture-run-dir"),
    outputPath: readFlag(argv, "--output") ?? readFlag(argv, "-o"),
    htmlOutputPath: readFlag(argv, "--html") ?? readFlag(argv, "--html-output"),
  };
}
