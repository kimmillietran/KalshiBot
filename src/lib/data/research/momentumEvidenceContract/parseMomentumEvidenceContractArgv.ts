import {
  MOMENTUM_DEFAULT_ALPHA,
  MOMENTUM_DEFAULT_OUTCOME_SD_CENTS,
  MOMENTUM_DEFAULT_TARGET_POWER,
  MOMENTUM_MAX_SHORTLIST_K,
  EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT,
  MomentumEvidenceContractError,
  type MomentumEvidenceContractConfig,
  type MomentumStoppingRule,
} from "./momentumEvidenceContractTypes";
import { bindAuthoritativeMomentumFamilyDefinition } from "./familyDefinitionBinding";

const KNOWN_FLAGS = new Set([
  "--family-definition-identity",
  "--bind-m14a-family",
  "--material-effect-cents",
  "--alpha",
  "--target-power",
  "--outcome-sd-cents",
  "--stopping-kind",
  "--minimum-ess",
  "--capture-horizon-hours",
  "--output",
  "--html-output",
  "--html",
]);

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) continue;
    const value = argv[index + 1];
    if (typeof value !== "string" || value.trim() === "" || value.startsWith("--")) {
      throw new MomentumEvidenceContractError(`${flag} requires a value`);
    }
    values.push(value.trim());
  }
  if (values.length > 1) {
    throw new MomentumEvidenceContractError(`${flag} may be specified at most once`);
  }
  return values[0] ?? null;
}

function parseStoppingRule(argv: readonly string[]): MomentumStoppingRule | null {
  const kind = readFlagValue(argv, "--stopping-kind");
  if (kind == null) {
    return null;
  }
  if (kind === "fixed-n") {
    const essRaw = readFlagValue(argv, "--minimum-ess");
    const ess = essRaw == null ? Number.NaN : Number(essRaw);
    if (!Number.isFinite(ess)) {
      throw new MomentumEvidenceContractError("--minimum-ess required for fixed-n stopping");
    }
    return {
      kind: "fixed-n",
      minimumEffectiveSampleSize: ess,
      interpretationIfNotReached: "inconclusive-underpowered",
    };
  }
  if (kind === "fixed-capture-horizon") {
    const hoursRaw = readFlagValue(argv, "--capture-horizon-hours");
    const hours = hoursRaw == null ? Number.NaN : Number(hoursRaw);
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new MomentumEvidenceContractError(
        "--capture-horizon-hours required for fixed-capture-horizon stopping",
      );
    }
    return {
      kind: "fixed-capture-horizon",
      captureHorizonHours: hours,
      interpretationIfNotReached: "inconclusive-underpowered",
    };
  }
  throw new MomentumEvidenceContractError(`Unknown --stopping-kind: ${kind}`);
}

export function parseMomentumEvidenceContractArgv(
  argv: readonly string[],
): MomentumEvidenceContractConfig {
  if (
    argv.includes("--latest")
    || argv.includes("--use-latest")
    || argv.includes("--mtime")
  ) {
    throw new MomentumEvidenceContractError(
      "Momentum evidence contract does not support latest/mtime discovery.",
    );
  }

  const unknown = argv.filter((token) => token.startsWith("--") && !KNOWN_FLAGS.has(token));
  if (unknown.length > 0) {
    throw new MomentumEvidenceContractError(`Unknown CLI flag: ${unknown[0]}`);
  }

  const materialRaw = readFlagValue(argv, "--material-effect-cents");
  const alphaRaw = readFlagValue(argv, "--alpha");
  const powerRaw = readFlagValue(argv, "--target-power");
  const sdRaw = readFlagValue(argv, "--outcome-sd-cents");

  let familyDefinitionIdentity = readFlagValue(argv, "--family-definition-identity");
  if (argv.includes("--bind-m14a-family")) {
    const bound = bindAuthoritativeMomentumFamilyDefinition({
      expectedIdentity: familyDefinitionIdentity,
    });
    familyDefinitionIdentity = bound.familyDefinitionIdentity;
  }

  return {
    familyDefinitionIdentity,
    materialEffectThresholdCents:
      materialRaw == null ? null : Number(materialRaw),
    alpha: alphaRaw == null ? MOMENTUM_DEFAULT_ALPHA : Number(alphaRaw),
    targetPower: powerRaw == null ? MOMENTUM_DEFAULT_TARGET_POWER : Number(powerRaw),
    outcomeStandardDeviationCents:
      sdRaw == null ? MOMENTUM_DEFAULT_OUTCOME_SD_CENTS : Number(sdRaw),
    maxShortlistK: MOMENTUM_MAX_SHORTLIST_K,
    expectedDiscoveryHypothesisCount: EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT,
    stoppingRule: parseStoppingRule(argv),
    outputPath: readFlagValue(argv, "--output"),
    htmlOutputPath: readFlagValue(argv, "--html-output") ?? readFlagValue(argv, "--html"),
  };
}
