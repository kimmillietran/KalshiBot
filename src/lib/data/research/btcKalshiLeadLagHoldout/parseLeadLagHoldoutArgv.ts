import {
  KNOWN_M128A_DISCOVERY_IDENTITY,
  KNOWN_M128A_SPLIT_MANIFEST_HASH,
} from "../btcKalshiLeadLagEvidenceContract/leadLagEvidenceContractTypes";

import { LeadLagHoldoutError, type LeadLagHoldoutConfig } from "./leadLagHoldoutTypes";

const KNOWN_FLAGS = new Set([
  "--discovery-identity",
  "--discovery-report",
  "--validation-identity",
  "--validation-report",
  "--split-manifest-hash",
  "--validation-contract-hash",
  "--holdout-capture-run-dir",
  "--outcome-sd-cents",
  "--output",
  "--html-output",
]);

function readAllFlagValues(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) {
      continue;
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || value.trim().length === 0 || value.startsWith("--")) {
      throw new LeadLagHoldoutError(`${flag} requires a value`);
    }
    values.push(value.trim());
  }
  return values;
}

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const values = readAllFlagValues(argv, flag);
  if (values.length > 1) {
    throw new LeadLagHoldoutError(`${flag} may be specified at most once`);
  }
  return values[0] ?? null;
}

function readNumberFlag(argv: readonly string[], flag: string): number | null {
  const raw = readFlagValue(argv, flag);
  if (raw === null) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new LeadLagHoldoutError(`${flag} must be a finite number`);
  }
  return parsed;
}

export function parseLeadLagHoldoutArgv(argv: readonly string[]): LeadLagHoldoutConfig {
  if (
    argv.includes("--latest")
    || argv.includes("--use-latest")
    || argv.includes("--mtime")
  ) {
    throw new LeadLagHoldoutError(
      "Lead-lag holdout does not support latest/mtime discovery; pass explicit identities.",
    );
  }

  const unknown = argv.filter((token) => token.startsWith("--") && !KNOWN_FLAGS.has(token));
  if (unknown.length > 0) {
    throw new LeadLagHoldoutError(
      `Unknown CLI flag: ${unknown[0]}. Implicit latest/mtime selection is forbidden.`,
    );
  }

  const discoveryIdentityHash =
    readFlagValue(argv, "--discovery-identity") ?? KNOWN_M128A_DISCOVERY_IDENTITY;
  const validationIdentityHash = readFlagValue(argv, "--validation-identity");
  if (!validationIdentityHash) {
    throw new LeadLagHoldoutError(
      "--validation-identity is required; holdout must bind the exact PR #70 validation artifact",
    );
  }

  return {
    discoveryIdentityHash,
    discoveryReportPath: readFlagValue(argv, "--discovery-report"),
    validationIdentityHash,
    validationReportPath: readFlagValue(argv, "--validation-report"),
    expectedSplitManifestHash:
      readFlagValue(argv, "--split-manifest-hash") ?? KNOWN_M128A_SPLIT_MANIFEST_HASH,
    expectedValidationContractHash: readFlagValue(argv, "--validation-contract-hash"),
    holdoutCaptureRunDir: readFlagValue(argv, "--holdout-capture-run-dir"),
    outcomeStandardDeviationCents: readNumberFlag(argv, "--outcome-sd-cents"),
    outputPath: readFlagValue(argv, "--output"),
    htmlOutputPath: readFlagValue(argv, "--html-output"),
  };
}
