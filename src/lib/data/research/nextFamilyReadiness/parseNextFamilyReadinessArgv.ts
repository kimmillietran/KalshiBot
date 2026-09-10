import {
  NextFamilyReadinessError,
  type NextFamilyReadinessConfig,
  type ResearchFamilyId,
} from "./nextFamilyReadinessTypes";

const KNOWN_FLAGS = new Set([
  "--exploratory-capture-run",
  "--fade-confirmatory-report",
  "--historical-return-proxy",
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
    outputPath: readFlagValue(argv, "--output"),
    htmlOutputPath: readFlagValue(argv, "--html-output"),
  };
}
