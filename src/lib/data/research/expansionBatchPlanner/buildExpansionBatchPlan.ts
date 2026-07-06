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
  buildExpansionBatchDiscoveryUniverse,
  formatDiscoveryUniversePlannerNotes,
} from "./buildExpansionBatchDiscoveryUniverse";
import {
  collectExpandedCandidateMonths,
  collectKnownCandidateMonths,
} from "./collectExpansionBatchCandidateMonths";
import { partitionImportableExpansionBatchCandidates } from "./evaluateExpansionBatchCandidateImportability";
import { estimateExpansionBatchCandidateImportability } from "./evaluateExpansionBatchCandidateImportability";
import {
  loadExpansionBatchPlannerInputs,
  loadExpansionImportMarketRecords,
} from "./loadExpansionBatchPlannerInputs";
import { scoreExpansionBatchMonthCandidates } from "./scoreExpansionBatchMonthCandidates";

function buildPlannerNotes(
  plan: Pick<
    ExpansionBatchPlan,
    "inputStatus" | "summary" | "selectionStrategy" | "maxMarkets" | "discoveryUniverse"
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

  if (!plan.inputStatus.discoveryResultPresent && !plan.inputStatus.discoveryCachePresent) {
    notes.push(
      "No discovery artifacts found (discovery-result.json or discovery-cache segments); allocations ignore discovered market availability caps.",
    );
  } else if (!plan.inputStatus.discoveryResultPresent) {
    notes.push(
      "discovery-result.json was not found; planner uses discovery-cache segment counts where available.",
    );
  }

  if (!plan.inputStatus.discoveryCachePresent) {
    notes.push(
      "Executor discovery-cache directory was not found; stale-segment detection is limited to discovery-result.json.",
    );
  }

  if (plan.summary.allocationCount === 0) {
    notes.push("No importable research-value allocations found.");
  }

  notes.push(...formatDiscoveryUniversePlannerNotes(plan.discoveryUniverse));

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
  const knownCandidateMonths = collectKnownCandidateMonths(loaded.coveragePlan);
  const expandedCandidateMonths = collectExpandedCandidateMonths({
    coveragePlan: loaded.coveragePlan,
    expansionConfig: loaded.expansionConfig,
  });
  const candidates = buildExpansionBatchMonthCandidates(
    loaded,
    importabilityMarkets,
    expandedCandidateMonths,
  );
  const scoredCandidates = scoreExpansionBatchMonthCandidates(
    candidates,
    input.config.selectionStrategy,
    input.config.selectionSeed,
  );
  const partitioned = partitionImportableExpansionBatchCandidates({
    candidates: scoredCandidates,
    importabilityMarkets,
  });
  const importableCapByMonth = new Map(
    partitioned.importableCandidates.map((candidate) => [
      candidate.month,
      estimateExpansionBatchCandidateImportability(candidate, importabilityMarkets)
        .estimatedImportableMarketCount,
    ]),
  );
  const allocations = allocateExpansionBatchBudget({
    maxMarkets: input.config.maxMarkets,
    candidates: partitioned.importableCandidates,
    importableCapByMonth,
  });

  const totalAllocatedMarkets = expansionBatchAllocationTotal(allocations);
  const unsupportedHeavyAllocationCount = allocations.filter(
    (entry) => entry.expectedImportability === "low" || entry.estimatedUnsupportedRate >= 0.4,
  ).length;

  const discoveryUniverse = buildExpansionBatchDiscoveryUniverse({
    knownCandidateMonths,
    expandedCandidateMonths,
    discoverySources: loaded.discoverySourcesByMonth,
    allocationCount: allocations.length,
    rejectedCandidateCount: partitioned.rejectedCandidates.length,
  });

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
        allocations.length === 0
          ? 0
          : loaded.expansionConfig?.summary.scheduledJobCount
            ?? loaded.expansionConfig?.jobs.filter((job) => job.status === "scheduled").length
            ?? 0,
      candidateMonthCount: candidates.length,
      unsupportedHeavyAllocationCount,
      rejectedUnsupportedHeavyAllocationCount:
        partitioned.rejectedUnsupportedHeavyAllocationCount,
      rejectedZeroPriorityAllocationCount:
        partitioned.rejectedZeroPriorityAllocationCount,
      rejectedAlreadyCoveredAllocationCount:
        partitioned.rejectedAlreadyCoveredAllocationCount,
    },
    discoveryUniverse,
    plannerNotes: [],
    allocations,
    rejectedCandidates: partitioned.rejectedCandidates,
  };

  plan.plannerNotes = buildPlannerNotes(plan);
  return plan;
}

export function serializeExpansionBatchPlan(plan: ExpansionBatchPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}
