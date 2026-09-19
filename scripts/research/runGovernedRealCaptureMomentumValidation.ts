/**
 * Governed M14.0c real-capture validation outcome executor CLI.
 *
 * Offline research only. Requires an EXPLICIT cohort registry path and
 * explicit accepted-capture descriptor list. Never discovers "latest".
 *
 * DO NOT point this at accepted M14 validation captures until the
 * implementation is reviewed/merged and a separate outcome-open task
 * authorizes reading those captures.
 */
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

import {
  createFilesystemMomentumDiscoveryIo,
} from "@/lib/data/research/kalshiTobMomentumDiscovery";
import {
  createFilesystemMomentumValidationIo,
  createValidationOnlyMomentumIo,
  runGovernedRealCaptureMomentumValidation,
  type MomentumValidationCohortAuthorityInput,
  type SealedAcceptedCaptureDescriptor,
} from "@/lib/data/research/kalshiTobMomentumValidation";
import type { MomentumValidationCohortRegistry } from "@/lib/data/research/kalshiTobMomentumValidationCohort";

type ParsedArgv = {
  cohortRegistryPath: string;
  acceptedCapturesPath: string;
  holdoutCaptureRunDirs: string[];
  codeAuthoritySha: string | null;
  writeArtifacts: boolean;
  verifyCaptureIdentities: boolean;
  outputPath: string | null;
  htmlOutputPath: string | null;
  generatedAt: string | null;
};

function usage(): string {
  return [
    "Usage: npm run research:momentum-validation-real -- \\",
    "  --cohort-registry <path> \\",
    "  --accepted-captures <path> \\",
    "  [--holdout-quarantine <dir>]... \\",
    "  [--code-authority-sha <sha>] \\",
    "  [--verify-capture-identities] \\",
    "  [--write-artifacts|--dry-run] \\",
    "  [--output <path>] [--html-output <path>] \\",
    "  [--generated-at <iso>]",
    "",
    "Requires explicit sealed cohort authority. Refuses implicit newest/latest discovery.",
    "Do not target accepted M14 validation captures from this development milestone.",
  ].join("\n");
}

export function parseGovernedRealCaptureMomentumValidationArgv(
  argv: readonly string[],
): ParsedArgv {
  let cohortRegistryPath: string | null = null;
  let acceptedCapturesPath: string | null = null;
  const holdoutCaptureRunDirs: string[] = [];
  let codeAuthoritySha: string | null = null;
  let writeArtifacts = true;
  let verifyCaptureIdentities = false;
  let outputPath: string | null = null;
  let htmlOutputPath: string | null = null;
  let generatedAt: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = () => {
      const value = argv[i + 1];
      if (value == null || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return value;
    };
    switch (arg) {
      case "--cohort-registry":
        cohortRegistryPath = next();
        break;
      case "--accepted-captures":
        acceptedCapturesPath = next();
        break;
      case "--holdout-quarantine":
        holdoutCaptureRunDirs.push(next());
        break;
      case "--code-authority-sha":
        codeAuthoritySha = next();
        break;
      case "--verify-capture-identities":
        verifyCaptureIdentities = true;
        break;
      case "--write-artifacts":
        writeArtifacts = true;
        break;
      case "--dry-run":
        writeArtifacts = false;
        break;
      case "--output":
        outputPath = next();
        break;
      case "--html-output":
        htmlOutputPath = next();
        break;
      case "--generated-at":
        generatedAt = next();
        break;
      case "--help":
      case "-h":
        throw new Error(usage());
      default:
        throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  if (!cohortRegistryPath) {
    throw new Error(`--cohort-registry is required (explicit authority only).\n${usage()}`);
  }
  if (!acceptedCapturesPath) {
    throw new Error(`--accepted-captures is required (explicit descriptor list).\n${usage()}`);
  }
  if (/latest/i.test(cohortRegistryPath) || /latest/i.test(acceptedCapturesPath)) {
    throw new Error(
      "Refuse paths containing 'latest' — explicit content-addressed authority required",
    );
  }

  return {
    cohortRegistryPath: resolve(cohortRegistryPath),
    acceptedCapturesPath: resolve(acceptedCapturesPath),
    holdoutCaptureRunDirs,
    codeAuthoritySha,
    writeArtifacts,
    verifyCaptureIdentities,
    outputPath,
    htmlOutputPath,
    generatedAt,
  };
}

function resolveCodeAuthoritySha(explicit: string | null): string | null {
  if (explicit) return explicit;
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function loadAuthorityBundle(input: {
  cohortRegistryPath: string;
}): MomentumValidationCohortAuthorityInput {
  const raw = JSON.parse(readFileSync(input.cohortRegistryPath, "utf8")) as {
    cohortAuthority?: MomentumValidationCohortAuthorityInput;
    registry?: MomentumValidationCohortRegistry;
  } & Partial<MomentumValidationCohortAuthorityInput>;

  if (raw.cohortAuthority) {
    return raw.cohortAuthority;
  }
  if (raw.registry && raw.planIdentity && raw.familyDefinitionIdentity) {
    return raw as MomentumValidationCohortAuthorityInput;
  }
  throw new Error(
    "Cohort registry file must contain cohortAuthority or a full "
      + "MomentumValidationCohortAuthorityInput",
  );
}

function loadAcceptedCaptures(path: string): readonly SealedAcceptedCaptureDescriptor[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as
    | { acceptedCaptures: SealedAcceptedCaptureDescriptor[] }
    | SealedAcceptedCaptureDescriptor[];
  const list = Array.isArray(raw) ? raw : raw.acceptedCaptures;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("accepted-captures must be a non-empty explicit descriptor list");
  }
  return list;
}

export async function runGovernedRealCaptureMomentumValidationCommand(
  argv: readonly string[],
): Promise<number> {
  try {
    const parsed = parseGovernedRealCaptureMomentumValidationArgv(argv);
    if (!existsSync(parsed.cohortRegistryPath)) {
      throw new Error(`cohort registry not found: ${parsed.cohortRegistryPath}`);
    }
    if (!existsSync(parsed.acceptedCapturesPath)) {
      throw new Error(`accepted captures file not found: ${parsed.acceptedCapturesPath}`);
    }

    const cohortAuthority = loadAuthorityBundle({
      cohortRegistryPath: parsed.cohortRegistryPath,
    });
    const acceptedCaptures = loadAcceptedCaptures(parsed.acceptedCapturesPath);

    const baseIo = createFilesystemMomentumValidationIo(
      createFilesystemMomentumDiscoveryIo(),
    );
    const io = createValidationOnlyMomentumIo({
      baseIo,
      holdoutCaptureRunDirs: parsed.holdoutCaptureRunDirs,
    });

    const result = await runGovernedRealCaptureMomentumValidation({
      cohortAuthority,
      acceptedCaptures,
      io,
      codeAuthoritySha: resolveCodeAuthoritySha(parsed.codeAuthoritySha),
      writeArtifacts: parsed.writeArtifacts,
      verifyCaptureIdentities: parsed.verifyCaptureIdentities,
      outputPath: parsed.outputPath,
      htmlOutputPath: parsed.htmlOutputPath,
      generatedAt: parsed.generatedAt ?? undefined,
      log: (message) => {
        process.stderr.write(`${message}\n`);
      },
    });

    // Progress / identity only — never dump per-episode P&L.
    const summary = {
      overallStatus: result.report.overallStatus,
      validationIdentityHash: result.report.validationIdentityHash,
      cohortCaptureFingerprint: result.transition.cohortCaptureFingerprint,
      episodeCount: result.episodeCount,
      alreadyOpened: result.alreadyOpened,
      realCaptureStreamed: result.report.quarantine.realCaptureStreamed,
      holdoutOpened: result.report.quarantine.holdoutOpened,
      feeContractStatus: result.report.candidateEvaluation?.feeContractStatus ?? null,
      nextAction: result.report.nextAction,
      reportPath: result.reportPath,
      transitionPath: result.transitionPath,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const code = await runGovernedRealCaptureMomentumValidationCommand(process.argv.slice(2));
  process.exitCode = code;
}

if (
  import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith("runGovernedRealCaptureMomentumValidation.ts")
) {
  void main();
}
