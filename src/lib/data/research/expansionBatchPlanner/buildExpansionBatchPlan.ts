import {
  allocateExpansionBatchBudget,
  expansionBatchAllocationTotal,
} from "./allocateExpansionBatchBudget";
import { buildExpansionBatchMonthCandidates } from "./buildExpansionBatchMonthCandidates";
import type {
  BuildExpansionBatchPlanInput,
  ExpansionBatchPlan,
} from "./expansionBatchPlannerTypes";
import { ExpansionBatchPlannerError, ExpansionBatchPlannerErrorCode } from "./expansionBatchPlannerTypes";
import {
  loadExpansionBatchPlannerInputs,
  loadExpansionImportMarketRecords,
} from "./loadExpansionBatchPlannerInputs";
import { scoreExpansionBatchMonthCandidates } from "./scoreExpansionBatchMonthCandidates";

function buildPlannerNotes(
  plan: Pick<
    ExpansionBatchPlan,
    "inputStatus" | "summary" | "selectionStrategy" | "maxMarkets"
  >,
): string[] {
  const notes = [
    "Read-only batch planner: does not run imports or mutate replay/research calculations.",
    `Selection strategy: ${plan.selectionStrategy}.`,
    `Requested budget: ${plan.maxMarkets} markets.`,
  ];

  if (!plan.inputStatus.expansionImportSummaryPresent) {
    notes.push(
      "historical-expansion-import-summary.json was not found; importability defaults to medium support.",
    );
  }

  if (!plan.inputStatus.coverageAwareValidationPresent) {
    notes.push(
      "coverage-aware-validation.json was not found; research-value scoring uses coverage-plan signals only.",
    );
  }

  if (!plan.inputStatus.discoveryResultPresent) {
    notes.push(
      "Discovery cache was not found; allocations ignore discovered market availability caps.",
    );
  }

  if (plan.summary.allocationCount === 0) {
    notes.push("No month allocations were produced; verify coverage-plan gaps and budget.");
  }

  return notes;
}

/** Builds the expansion import batch plan from configured research artifacts. */
export function buildExpansionBatchPlan(
  input: BuildExpansionBatchPlanInput,
): ExpansionBatchPlan {
  if (!Number.isFinite(input.config.maxMarkets) || input.config.maxMarkets <= 0) {
    throw new ExpansionBatchPlannerError(
      `--max-markets must be a positive integer (received ${input.config.maxMarkets})`,
      ExpansionBatchPlannerErrorCode.INVALID_BUDGET,
    );
  }

  const loaded = loadExpansionBatchPlannerInputs(input.io, input.config.inputPaths);
  const importabilityMarkets = loadExpansionImportMarketRecords(loaded.expansionImportSummary);
  const candidates = buildExpansionBatchMonthCandidates(loaded, importabilityMarkets);
  const scoredCandidates = scoreExpansionBatchMonthCandidates(
    candidates,
    input.config.selectionStrategy,
    input.config.selectionSeed,
  );
  const allocations = allocateExpansionBatchBudget({
    maxMarkets: input.config.maxMarkets,
    candidates: scoredCandidates,
  });

  const totalAllocatedMarkets = expansionBatchAllocationTotal(allocations);
  const unsupportedHeavyAllocationCount = allocations.filter(
    (entry) => entry.expectedImportability === "low" || entry.estimatedUnsupportedRate >= 0.4,
  ).length;

  const plan: ExpansionBatchPlan = {
    generatedAt: input.generatedAt,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
    maxMarkets: input.config.maxMarkets,
    selectionStrategy: input.config.selectionStrategy,
    selectionSeed: input.config.selectionSeed,
    inputPaths: input.config.inputPaths,
    inputStatus: loaded.inputStatus,
    summary: {
      totalAllocatedMarkets,
      allocationCount: allocations.length,
      scheduledJobCount:
        loaded.expansionConfig?.summary.scheduledJobCount
        ?? loaded.expansionConfig?.jobs.filter((job) => job.status === "scheduled").length
        ?? 0,
      candidateMonthCount: candidates.length,
      unsupportedHeavyAllocationCount,
    },
    plannerNotes: [],
    allocations,
  };

  plan.plannerNotes = buildPlannerNotes(plan);
  return plan;
}

export function serializeExpansionBatchPlan(plan: ExpansionBatchPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}
