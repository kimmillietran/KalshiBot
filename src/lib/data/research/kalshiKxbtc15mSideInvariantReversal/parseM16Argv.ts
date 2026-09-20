import { M16ReversalError, type M16CaptureDescriptor } from "./m16Types";

export type ParsedM16Argv = {
  mode: "definition-only" | "incidence-plan-only" | "blind-incidence";
  captures: M16CaptureDescriptor[];
  familyDefinitionOutputPath: string;
  incidencePlanOutputPath: string;
  reportOutputPath: string;
  codeAuthoritySha: string | null;
};

function optionalFlag(argv: readonly string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx < 0) return null;
  if (idx + 1 >= argv.length) {
    throw new M16ReversalError(`Flag ${name} requires a value`);
  }
  return argv[idx + 1]!;
}

/**
 * --definition-only | --incidence-plan-only | --blind-incidence
 * --capture runId|dir|hash[|researchRole][|priorResearchRole]
 */
export function parseM16Argv(argv: readonly string[]): ParsedM16Argv {
  const definitionOnly = argv.includes("--definition-only");
  const incidencePlanOnly = argv.includes("--incidence-plan-only");
  const blindIncidence = argv.includes("--blind-incidence");
  const modeCount = [definitionOnly, incidencePlanOnly, blindIncidence].filter(Boolean).length;
  if (modeCount !== 1) {
    throw new M16ReversalError(
      "Specify exactly one of --definition-only | --incidence-plan-only | --blind-incidence",
    );
  }

  const captures: M16CaptureDescriptor[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--capture") continue;
    const raw = argv[i + 1];
    if (!raw) throw new M16ReversalError("--capture requires runId|dir|hash");
    const parts = raw.split("|");
    if (parts.length < 3 || parts.length > 5) {
      throw new M16ReversalError(
        `--capture expected runId|captureRunDir|captureIdentityHash`
          + `[|researchRole][|priorResearchRole]; got ${raw}`,
      );
    }
    const researchRoleRaw = parts[3] ?? "m16-blind-incidence";
    if (
      researchRoleRaw !== "m16-blind-incidence"
      && researchRoleRaw !== "untouched-candidate"
      && researchRoleRaw !== "other"
    ) {
      throw new M16ReversalError(`unsupported researchRole=${researchRoleRaw}`);
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

  if (blindIncidence && captures.length === 0) {
    throw new M16ReversalError("--blind-incidence requires at least one --capture");
  }
  for (const capture of captures) {
    if (capture.captureRunDir.includes("latest")) {
      throw new M16ReversalError(`mutable latest path forbidden: ${capture.captureRunDir}`);
    }
  }

  return {
    mode: definitionOnly
      ? "definition-only"
      : incidencePlanOnly
      ? "incidence-plan-only"
      : "blind-incidence",
    captures,
    familyDefinitionOutputPath: optionalFlag(argv, "--family-definition-output")
      ?? "data/research-results/m16-side-invariant-reversal/family-definition.json",
    incidencePlanOutputPath: optionalFlag(argv, "--incidence-plan-output")
      ?? "data/research-results/m16-side-invariant-reversal/incidence-plan.json",
    reportOutputPath: optionalFlag(argv, "--output")
      ?? "data/research-results/m16-side-invariant-reversal/blind-incidence-report.json",
    codeAuthoritySha: optionalFlag(argv, "--code-authority-sha"),
  };
}
