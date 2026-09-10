import {
  LeadLagProspectiveCohortError,
  type LeadLagProspectiveCohortConfig,
} from "./leadLagProspectiveCohortTypes";

const KNOWN_FLAGS = new Set([
  "--candidate-definition-hash",
  "--prospective-contract-identity",
  "--replication-design-identity",
  "--stopping-rule-identity",
  "--required-effective-n",
  "--prospective-freeze-identity",
  "--prospective-freeze-timestamp",
  "--member-evidence",
  "--output",
  "--html-output",
  "--progress-output",
]);

function readAllFlagValues(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) {
      continue;
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || value.trim().length === 0 || value.startsWith("--")) {
      throw new LeadLagProspectiveCohortError(`${flag} requires a value`);
    }
    values.push(value.trim());
  }
  return values;
}

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const values = readAllFlagValues(argv, flag);
  if (values.length > 1) {
    throw new LeadLagProspectiveCohortError(`${flag} may be specified at most once`);
  }
  return values[0] ?? null;
}

function requireFlag(argv: readonly string[], flag: string): string {
  const value = readFlagValue(argv, flag);
  if (!value) {
    throw new LeadLagProspectiveCohortError(`${flag} is required`);
  }
  return value;
}

export function parseLeadLagProspectiveCohortArgv(
  argv: readonly string[],
): LeadLagProspectiveCohortConfig {
  if (
    argv.includes("--latest")
    || argv.includes("--use-latest")
    || argv.includes("--mtime")
  ) {
    throw new LeadLagProspectiveCohortError(
      "Prospective cohort does not support latest/mtime discovery; pass explicit --member-evidence paths.",
    );
  }

  const unknown = argv.filter((token) => token.startsWith("--") && !KNOWN_FLAGS.has(token));
  if (unknown.length > 0) {
    throw new LeadLagProspectiveCohortError(
      `Unknown CLI flag: ${unknown[0]}. Implicit latest/mtime selection is forbidden.`,
    );
  }

  const requiredRaw = requireFlag(argv, "--required-effective-n");
  const requiredEffectiveN = Number(requiredRaw);
  if (!Number.isFinite(requiredEffectiveN) || requiredEffectiveN < 2) {
    throw new LeadLagProspectiveCohortError("--required-effective-n must be >= 2");
  }

  return {
    candidateDefinitionHash: requireFlag(argv, "--candidate-definition-hash"),
    prospectiveContractIdentity: requireFlag(argv, "--prospective-contract-identity"),
    replicationDesignIdentity: requireFlag(argv, "--replication-design-identity"),
    stoppingRuleIdentity:
      readFlagValue(argv, "--stopping-rule-identity") ?? "fixed-n",
    requiredEffectiveN,
    prospectiveFreezeIdentity: readFlagValue(argv, "--prospective-freeze-identity"),
    prospectiveFreezeTimestampIso: readFlagValue(argv, "--prospective-freeze-timestamp"),
    memberEvidencePaths: readAllFlagValues(argv, "--member-evidence"),
    outputPath: readFlagValue(argv, "--output"),
    htmlOutputPath: readFlagValue(argv, "--html-output"),
    progressOutputPath: readFlagValue(argv, "--progress-output"),
  };
}
