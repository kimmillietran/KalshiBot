import {
  KNOWN_M128A_DISCOVERY_IDENTITY,
} from "../btcKalshiLeadLagEvidenceContract/leadLagEvidenceContractTypes";

import {
  LeadLagReplicationReadinessError,
  type LeadLagReplicationReadinessConfig,
} from "./leadLagReplicationReadinessTypes";

const KNOWN_VALIDATION_IDENTITY =
  "d87619c312e0e3e2341d98f68a7742addd623446e6fce11d9f4ea39699488fe0";
const KNOWN_HOLDOUT_IDENTITY =
  "6d8df318342d2e8c274f43ee9c5b9259bf620266ab6c2d9716ce85d1ca288756";
const KNOWN_EVIDENCE_IDENTITY =
  "ed60f336af8517abe536d5642b9875e8dd26dddb0eaf6db9302368f75203ae38";

const KNOWN_FLAGS = new Set([
  "--discovery-identity",
  "--discovery-report",
  "--validation-identity",
  "--validation-report",
  "--holdout-identity",
  "--holdout-report",
  "--evidence-contract-identity",
  "--capture-run-root",
  "--output",
  "--html-output",
]);

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0) {
    return null;
  }
  const value = argv[index + 1];
  if (value == null || value.startsWith("--")) {
    throw new LeadLagReplicationReadinessError(`Flag ${flag} requires a value`);
  }
  return value;
}

function readAllFlagValues(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const value = argv[index + 1];
      if (value == null || value.startsWith("--")) {
        throw new LeadLagReplicationReadinessError(`Flag ${flag} requires a value`);
      }
      values.push(value);
      index += 1;
    }
  }
  return values;
}

export function parseLeadLagReplicationReadinessArgv(
  argv: readonly string[],
): LeadLagReplicationReadinessConfig {
  const unknown = argv.filter((token) => token.startsWith("--") && !KNOWN_FLAGS.has(token));
  if (unknown.length > 0) {
    throw new LeadLagReplicationReadinessError(`Unknown flags: ${unknown.join(", ")}`);
  }

  const captureRunRoots = readAllFlagValues(argv, "--capture-run-root");
  return {
    discoveryIdentityHash:
      readFlagValue(argv, "--discovery-identity") ?? KNOWN_M128A_DISCOVERY_IDENTITY,
    discoveryReportPath: readFlagValue(argv, "--discovery-report"),
    validationIdentityHash:
      readFlagValue(argv, "--validation-identity") ?? KNOWN_VALIDATION_IDENTITY,
    validationReportPath: readFlagValue(argv, "--validation-report"),
    holdoutIdentityHash: readFlagValue(argv, "--holdout-identity") ?? KNOWN_HOLDOUT_IDENTITY,
    holdoutReportPath: readFlagValue(argv, "--holdout-report"),
    expectedEvidenceContractIdentity:
      readFlagValue(argv, "--evidence-contract-identity") ?? KNOWN_EVIDENCE_IDENTITY,
    captureRunRoots:
      captureRunRoots.length > 0
        ? captureRunRoots
        : ["data/live-capture/forward-quotes"],
    outputPath: readFlagValue(argv, "--output"),
    htmlOutputPath: readFlagValue(argv, "--html-output"),
  };
}
