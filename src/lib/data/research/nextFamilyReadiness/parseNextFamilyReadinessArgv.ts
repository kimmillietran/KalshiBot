import {
  NextFamilyReadinessError,
  type LeadLagLineageBindingConfig,
  type NextFamilyReadinessConfig,
  type ResearchFamilyId,
} from "./nextFamilyReadinessTypes";

const DEFAULT_DISCOVERY_ID =
  "a4b5fd8a50bd04207f1041846f30a4f7d9f07bf34b03ddf12e293a2278520a24";
const DEFAULT_VALIDATION_ID =
  "d87619c312e0e3e2341d98f68a7742addd623446e6fce11d9f4ea39699488fe0";
const DEFAULT_HOLDOUT_ID =
  "6d8df318342d2e8c274f43ee9c5b9259bf620266ab6c2d9716ce85d1ca288756";
const DEFAULT_READINESS_ID =
  "8cf1f72069af4a67692ae7060ebe618a9813c6bb6b38f035be3c485f52379053";

const KNOWN_FLAGS = new Set([
  "--exploratory-capture-run",
  "--fade-confirmatory-report",
  "--historical-return-proxy",
  "--bind-lead-lag-lineage",
  "--discovery-identity",
  "--discovery-report",
  "--validation-identity",
  "--validation-report",
  "--holdout-identity",
  "--holdout-report",
  "--readiness-identity",
  "--readiness-report",
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
      throw new NextFamilyReadinessError(`${flag} requires a value`);
    }
    values.push(value.trim());
  }
  return values;
}

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const values = readAllFlagValues(argv, flag);
  if (values.length > 1) {
    throw new NextFamilyReadinessError(`${flag} may be specified at most once`);
  }
  return values[0] ?? null;
}

function parseHistoricalReturnProxies(
  argv: readonly string[],
): Partial<Record<ResearchFamilyId, number>> {
  const proxies: Partial<Record<ResearchFamilyId, number>> = {};
  const values = readAllFlagValues(argv, "--historical-return-proxy");
  for (const value of values) {
    const [familyId, rawNumber] = value.split("=");
    if (
      familyId !== "btc-kalshi-lead-lag"
      && familyId !== "spread-liquidity-microstructure"
      && familyId !== "momentum"
    ) {
      throw new NextFamilyReadinessError(
        `--historical-return-proxy family must be a known ResearchFamilyId; got ${familyId ?? ""}`,
      );
    }
    const parsed = Number(rawNumber);
    if (!Number.isFinite(parsed)) {
      throw new NextFamilyReadinessError(
        `--historical-return-proxy requires familyId=number; got ${value}`,
      );
    }
    proxies[familyId] = parsed;
  }
  return proxies;
}

function parseLeadLagLineageBinding(argv: readonly string[]): LeadLagLineageBindingConfig | null {
  const bind = argv.includes("--bind-lead-lag-lineage");
  if (!bind) {
    return null;
  }
  return {
    discoveryIdentityHash: readFlagValue(argv, "--discovery-identity") ?? DEFAULT_DISCOVERY_ID,
    discoveryReportPath: readFlagValue(argv, "--discovery-report"),
    validationIdentityHash: readFlagValue(argv, "--validation-identity") ?? DEFAULT_VALIDATION_ID,
    validationReportPath: readFlagValue(argv, "--validation-report"),
    holdoutIdentityHash: readFlagValue(argv, "--holdout-identity") ?? DEFAULT_HOLDOUT_ID,
    holdoutReportPath: readFlagValue(argv, "--holdout-report"),
    readinessIdentityHash: readFlagValue(argv, "--readiness-identity") ?? DEFAULT_READINESS_ID,
    readinessReportPath: readFlagValue(argv, "--readiness-report"),
  };
}

export function parseNextFamilyReadinessArgv(
  argv: readonly string[],
): NextFamilyReadinessConfig {
  if (
    argv.includes("--latest")
    || argv.includes("--use-latest")
    || argv.includes("--mtime")
  ) {
    throw new NextFamilyReadinessError(
      "Next-family readiness does not support latest/mtime discovery; pass explicit paths.",
    );
  }

  const unknown = argv.filter((token) => token.startsWith("--") && !KNOWN_FLAGS.has(token));
  if (unknown.length > 0) {
    throw new NextFamilyReadinessError(
      `Unknown CLI flag: ${unknown[0]}. Pass explicit --exploratory-capture-run paths; `
        + "implicit latest/mtime selection is forbidden.",
    );
  }

  return {
    exploratoryCaptureRunDirs: readAllFlagValues(argv, "--exploratory-capture-run"),
    fadeConfirmatoryReportPaths: readAllFlagValues(argv, "--fade-confirmatory-report"),
    exploratoryHistoricalReturnProxies: parseHistoricalReturnProxies(argv),
    leadLagLineage: parseLeadLagLineageBinding(argv),
    outputPath: readFlagValue(argv, "--output"),
    htmlOutputPath: readFlagValue(argv, "--html-output"),
  };
}
