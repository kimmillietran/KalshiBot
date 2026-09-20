import { M15CostFloorError, type M15CaptureDescriptor } from "./m15CostFloorTypes";

export type ParsedM15CostFloorArgv = {
  captures: M15CaptureDescriptor[];
  outputPath: string;
  studyDefinitionOutputPath: string;
  expectedFeeContractIdentity: string | null;
  codeAuthoritySha: string | null;
  dryRunDefinitionOnly: boolean;
};

function optionalFlag(argv: readonly string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx < 0) return null;
  if (idx + 1 >= argv.length) {
    throw new M15CostFloorError(`Flag ${name} requires a value`);
  }
  return argv[idx + 1]!;
}

/**
 * Parse CLI argv for M15 cost-floor analyzer.
 *
 * Capture descriptors are explicit triples (no latest / mtime discovery):
 *   --capture <runId>|<captureRunDir>|<captureIdentityHash>[|<researchRole>][|<priorResearchRole>]
 */
export function parseM15CostFloorArgv(argv: readonly string[]): ParsedM15CostFloorArgv {
  const dryRunDefinitionOnly = argv.includes("--definition-only");
  const captures: M15CaptureDescriptor[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--capture") continue;
    const raw = argv[i + 1];
    if (!raw) {
      throw new M15CostFloorError("--capture requires runId|dir|hash");
    }
    const parts = raw.split("|");
    if (parts.length < 3 || parts.length > 5) {
      throw new M15CostFloorError(
        `--capture expected runId|captureRunDir|captureIdentityHash`
          + `[|researchRole][|priorResearchRole]; got ${raw}`,
      );
    }
    const researchRoleRaw = parts[3] ?? "m15-cost-floor";
    if (
      researchRoleRaw !== "m15-cost-floor"
      && researchRoleRaw !== "untouched-candidate"
      && researchRoleRaw !== "other"
    ) {
      throw new M15CostFloorError(
        `unsupported researchRole=${researchRoleRaw}; use m15-cost-floor|untouched-candidate|other`,
      );
    }
    captures.push({
      runId: parts[0]!,
      captureRunDir: parts[1]!,
      captureIdentityHash: parts[2]!,
      researchRole: researchRoleRaw,
      priorResearchRole: parts[4] ?? null,
    });
    i += 1;
  }

  if (!dryRunDefinitionOnly && captures.length === 0) {
    throw new M15CostFloorError(
      "At least one --capture runId|dir|hash is required (or use --definition-only)",
    );
  }

  for (const capture of captures) {
    if (
      capture.captureRunDir.includes("latest")
      || capture.captureRunDir.endsWith("/latest")
    ) {
      throw new M15CostFloorError(
        `mutable latest path forbidden: ${capture.captureRunDir}`,
      );
    }
  }

  return {
    captures,
    outputPath: optionalFlag(argv, "--output")
      ?? "data/research-results/m15-taker-cost-floor/report.json",
    studyDefinitionOutputPath: optionalFlag(argv, "--study-definition-output")
      ?? "data/research-results/m15-taker-cost-floor/study-definition.json",
    expectedFeeContractIdentity: optionalFlag(argv, "--expected-fee-contract-identity"),
    codeAuthoritySha: optionalFlag(argv, "--code-authority-sha"),
    dryRunDefinitionOnly,
  };
}
