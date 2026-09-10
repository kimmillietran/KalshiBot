import {
  KNOWN_M128A_DISCOVERY_IDENTITY,
  KNOWN_M128A_SPLIT_MANIFEST_HASH,
  LeadLagEvidenceContractError,
  type LeadLagEvidenceContractConfig,
  type LeadLagStoppingRule,
} from "./leadLagEvidenceContractTypes";
import {
  DEFAULT_LEAD_LAG_MATERIAL_EFFECT_CENTS,
  DEFAULT_LEAD_LAG_OUTCOME_SD_CENTS,
} from "./powerModel";
import { buildDefaultLeadLagEvidenceContractConfig } from "./buildLeadLagEvidenceDesignReport";

const KNOWN_FLAGS = new Set([
  "--discovery-identity",
  "--split-manifest-hash",
  "--candidate-definition-hash",
  "--validation-identity",
  "--direction",
  "--signal-horizon-ms",
  "--response-horizon-ms",
  "--alpha",
  "--target-power",
  "--material-effect-cents",
  "--outcome-sd-cents",
  "--stopping-rule",
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
      throw new LeadLagEvidenceContractError(`${flag} requires a value`);
    }
    values.push(value.trim());
  }
  return values;
}

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const values = readAllFlagValues(argv, flag);
  if (values.length > 1) {
    throw new LeadLagEvidenceContractError(`${flag} may be specified at most once`);
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
    throw new LeadLagEvidenceContractError(`${flag} must be a finite number`);
  }
  return parsed;
}

function parseStoppingRule(raw: string | null): LeadLagStoppingRule | null | undefined {
  if (raw === null) {
    return undefined;
  }
  if (raw === "none" || raw === "missing") {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LeadLagEvidenceContractError("--stopping-rule must be JSON or none");
  }
  return parsed as LeadLagStoppingRule;
}

export function parseLeadLagEvidenceContractArgv(
  argv: readonly string[],
): LeadLagEvidenceContractConfig {
  if (
    argv.includes("--latest")
    || argv.includes("--use-latest")
    || argv.includes("--mtime")
  ) {
    throw new LeadLagEvidenceContractError(
      "Lead-lag evidence contract does not support latest/mtime discovery; pass explicit identities.",
    );
  }

  const unknown = argv.filter((token) => token.startsWith("--") && !KNOWN_FLAGS.has(token));
  if (unknown.length > 0) {
    throw new LeadLagEvidenceContractError(
      `Unknown CLI flag: ${unknown[0]}. Implicit latest/mtime selection is forbidden.`,
    );
  }

  const directionRaw = readFlagValue(argv, "--direction");
  if (
    directionRaw !== null
    && directionRaw !== "follow-btc"
    && directionRaw !== "reverse-btc"
  ) {
    throw new LeadLagEvidenceContractError("--direction must be follow-btc or reverse-btc");
  }

  const stoppingParsed = parseStoppingRule(readFlagValue(argv, "--stopping-rule"));

  return buildDefaultLeadLagEvidenceContractConfig({
    discoveryIdentity:
      readFlagValue(argv, "--discovery-identity") ?? KNOWN_M128A_DISCOVERY_IDENTITY,
    splitManifestHash:
      readFlagValue(argv, "--split-manifest-hash") ?? KNOWN_M128A_SPLIT_MANIFEST_HASH,
    candidateDefinitionHash: readFlagValue(argv, "--candidate-definition-hash"),
    validationIdentity: readFlagValue(argv, "--validation-identity"),
    direction: directionRaw,
    signalHorizonMs: readNumberFlag(argv, "--signal-horizon-ms"),
    kalshiResponseHorizonMs: readNumberFlag(argv, "--response-horizon-ms"),
    alpha: readNumberFlag(argv, "--alpha") ?? 0.05,
    targetPower: readNumberFlag(argv, "--target-power") ?? 0.8,
    materialEffectCents:
      readNumberFlag(argv, "--material-effect-cents") ?? DEFAULT_LEAD_LAG_MATERIAL_EFFECT_CENTS,
    outcomeStandardDeviationCents:
      readNumberFlag(argv, "--outcome-sd-cents") ?? DEFAULT_LEAD_LAG_OUTCOME_SD_CENTS,
    ...(stoppingParsed !== undefined ? { stoppingRule: stoppingParsed } : {}),
    outputPath: readFlagValue(argv, "--output"),
    htmlOutputPath: readFlagValue(argv, "--html-output"),
  });
}
