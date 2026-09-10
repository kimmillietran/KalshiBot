import {
  MICROSTRUCTURE_DEFAULT_ALPHA,
  MICROSTRUCTURE_DEFAULT_OUTCOME_SD_CENTS,
  MICROSTRUCTURE_DEFAULT_TARGET_POWER,
  MicrostructureEvidenceContractError,
  type MicrostructureEvidenceContractConfig,
  type MicrostructureStoppingRule,
} from "./microstructureEvidenceContractTypes";

function readFlag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (value == null || value.startsWith("--")) {
    throw new MicrostructureEvidenceContractError(`Missing value for ${name}`);
  }
  return value;
}

function readOptionalNumber(argv: readonly string[], name: string): number | null {
  const raw = readFlag(argv, name);
  if (raw == null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new MicrostructureEvidenceContractError(`Invalid number for ${name}: ${raw}`);
  }
  return value;
}

function parseStoppingRule(argv: readonly string[]): MicrostructureStoppingRule | null {
  const kind = readFlag(argv, "--stopping-kind");
  if (kind == null) return null;
  if (kind === "fixed-n") {
    const n = readOptionalNumber(argv, "--stopping-min-ess");
    if (n == null) {
      throw new MicrostructureEvidenceContractError("--stopping-min-ess required for fixed-n");
    }
    return {
      kind: "fixed-n",
      minimumEffectiveSampleSize: n,
      interpretationIfNotReached: "inconclusive-underpowered",
    };
  }
  if (kind === "fixed-capture-horizon") {
    const hours = readOptionalNumber(argv, "--stopping-horizon-hours");
    if (hours == null) {
      throw new MicrostructureEvidenceContractError(
        "--stopping-horizon-hours required for fixed-capture-horizon",
      );
    }
    return {
      kind: "fixed-capture-horizon",
      captureHorizonHours: hours,
      interpretationIfNotReached: "inconclusive-underpowered",
    };
  }
  throw new MicrostructureEvidenceContractError(`Unsupported --stopping-kind: ${kind}`);
}

export function parseMicrostructureEvidenceContractArgv(
  argv: readonly string[],
): MicrostructureEvidenceContractConfig {
  return {
    familyDefinitionIdentity: readFlag(argv, "--family-definition-identity"),
    materialEffectThresholdCents: readOptionalNumber(argv, "--material-effect-cents"),
    alpha: readOptionalNumber(argv, "--alpha") ?? MICROSTRUCTURE_DEFAULT_ALPHA,
    targetPower: readOptionalNumber(argv, "--target-power") ?? MICROSTRUCTURE_DEFAULT_TARGET_POWER,
    outcomeStandardDeviationCents:
      readOptionalNumber(argv, "--outcome-sd-cents") ?? MICROSTRUCTURE_DEFAULT_OUTCOME_SD_CENTS,
    maxShortlistK: 3,
    expectedDiscoveryHypothesisCount: 12,
    stoppingRule: parseStoppingRule(argv),
    outputPath: readFlag(argv, "--output"),
    htmlOutputPath: readFlag(argv, "--html-output"),
  };
}
