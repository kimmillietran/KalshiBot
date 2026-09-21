import { M16ReversalError } from "./m16Types";
import type { M16BlindCollectionProgress } from "./m16ProspectiveCohortPlan";

export type ParsedM161Argv = {
  mode:
    | "evidence-contract-only"
    | "cohort-plan-only"
    | "outcome-open-status";
  evidenceContractOutputPath: string;
  dependencePlanOutputPath: string;
  feeContractOutputPath: string;
  cohortPlanOutputPath: string;
  outcomeOpenStatusOutputPath: string;
  progress: M16BlindCollectionProgress;
};

function optionalFlag(argv: readonly string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx < 0) return null;
  if (idx + 1 >= argv.length) {
    throw new M16ReversalError(`Flag ${name} requires a value`);
  }
  return argv[idx + 1]!;
}

function requiredNumberFlag(argv: readonly string[], name: string, fallback: number): number {
  const raw = optionalFlag(argv, name);
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new M16ReversalError(`Flag ${name} must be a non-negative number`);
  }
  return n;
}

/**
 * --evidence-contract-only | --cohort-plan-only | --outcome-open-status
 * Optional structural progress for status (never P&L):
 *   --accepted-hours --eligible-trades --utc-day-clusters
 *   --accepted-run-id (repeatable)
 */
export function parseM161Argv(argv: readonly string[]): ParsedM161Argv {
  const evidenceOnly = argv.includes("--evidence-contract-only");
  const cohortOnly = argv.includes("--cohort-plan-only");
  const statusOnly = argv.includes("--outcome-open-status");
  const modeCount = [evidenceOnly, cohortOnly, statusOnly].filter(Boolean).length;
  if (modeCount !== 1) {
    throw new M16ReversalError(
      "Specify exactly one of --evidence-contract-only | --cohort-plan-only | "
        + "--outcome-open-status",
    );
  }

  const acceptedRunIds: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--accepted-run-id") continue;
    const raw = argv[i + 1];
    if (!raw) throw new M16ReversalError("--accepted-run-id requires a value");
    if (raw.includes("latest")) {
      throw new M16ReversalError(`mutable latest path forbidden: ${raw}`);
    }
    acceptedRunIds.push(raw);
    i += 1;
  }

  const progress: M16BlindCollectionProgress = {
    acceptedCaptureHours: requiredNumberFlag(argv, "--accepted-hours", 0),
    eligibleTradeCount: requiredNumberFlag(argv, "--eligible-trades", 0),
    utcDayClusterCount: requiredNumberFlag(argv, "--utc-day-clusters", 0),
    acceptedCaptureRunIds: acceptedRunIds,
  };

  return {
    mode: evidenceOnly
      ? "evidence-contract-only"
      : cohortOnly
      ? "cohort-plan-only"
      : "outcome-open-status",
    evidenceContractOutputPath: optionalFlag(argv, "--evidence-contract-output")
      ?? "data/research-results/m16-evidence-contract/evidence-contract.json",
    dependencePlanOutputPath: optionalFlag(argv, "--dependence-plan-output")
      ?? "data/research-results/m16-evidence-contract/dependence-plan.json",
    feeContractOutputPath: optionalFlag(argv, "--fee-contract-output")
      ?? "data/research-results/m16-evidence-contract/fee-contract.json",
    cohortPlanOutputPath: optionalFlag(argv, "--cohort-plan-output")
      ?? "data/research-results/m16-evidence-contract/cohort-plan.json",
    outcomeOpenStatusOutputPath: optionalFlag(argv, "--outcome-open-status-output")
      ?? "data/research-results/m16-evidence-contract/outcome-open-status.json",
    progress,
  };
}
