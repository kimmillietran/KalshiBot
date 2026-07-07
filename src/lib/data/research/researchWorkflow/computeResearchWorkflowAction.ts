import type { ResearchWorkflowQueueAction } from "./researchWorkflowTypes";

export const RESEARCH_WORKFLOW_ACTION_PRIORITY: Record<
  ResearchWorkflowQueueAction,
  number
> = {
  "validate-refinement-candidates": 1,
  "run-research-only-harness": 2,
  "investigate-month-instability": 3,
  "gather-additional-history": 4,
  deprioritize: 5,
};

export const RESEARCH_WORKFLOW_ACTION_LABELS: Record<
  ResearchWorkflowQueueAction,
  string
> = {
  "validate-refinement-candidates": "Validate refinement candidates",
  "run-research-only-harness": "Run research-only harness",
  "investigate-month-instability": "Investigate month instability",
  "gather-additional-history": "Gather additional history",
  deprioritize: "Deprioritize",
};

export type HypothesisWorkflowContext = {
  refinementsAvailable: number;
  registeredChildren: number;
  harnessEligible: boolean | null;
  harnessEvaluated: boolean | null;
  failureCategories: readonly string[];
  priorityCategory: string | null;
  recommendedNextAction: string | null;
  monthRegimeUnstable: boolean | null;
  robustnessScore: number | null;
  harnessFilterExcluded: boolean;
  synthesisRejectionReasons: readonly string[];
};

const NEAR_PROMISING_ROBUSTNESS_FLOOR = 50;

function hasMonthInstabilitySignals(context: HypothesisWorkflowContext): boolean {
  return (
    context.failureCategories.includes("poor-month-stability")
    || context.failureCategories.includes("regime-instability")
    || context.monthRegimeUnstable === true
    || context.recommendedNextAction === "inspect-month-breakdown"
    || context.synthesisRejectionReasons.some((reason) =>
      /month-level edge persistence is weak|month instability|month breakdown/i.test(reason),
    )
  );
}

function shouldRunResearchOnlyHarness(context: HypothesisWorkflowContext): boolean {
  if (context.harnessEligible === true && context.harnessEvaluated !== true) {
    return true;
  }

  if (context.harnessEvaluated === true) {
    return false;
  }

  const nearPromising =
    context.priorityCategory === "near-promising"
    || (context.robustnessScore !== null && context.robustnessScore >= NEAR_PROMISING_ROBUSTNESS_FLOOR);

  return (
    nearPromising
    && context.harnessFilterExcluded
    && context.recommendedNextAction === "strategy-synthesis-investigation"
  ) || (
    nearPromising
    && context.harnessFilterExcluded
    && context.harnessEligible === false
  );
}

/** Maps diagnostic signals to the unified workflow queue action for one hypothesis. */
export function determineHypothesisWorkflowAction(
  context: HypothesisWorkflowContext,
): ResearchWorkflowQueueAction {
  if (context.registeredChildren > 0 || context.refinementsAvailable > 0) {
    return "validate-refinement-candidates";
  }

  if (shouldRunResearchOnlyHarness(context)) {
    return "run-research-only-harness";
  }

  if (hasMonthInstabilitySignals(context)) {
    return "investigate-month-instability";
  }

  const needsMoreHistory =
    context.priorityCategory === "blocked-by-coverage"
    || context.priorityCategory === "needs-more-data"
    || context.failureCategories.includes("insufficient-observations")
    || context.failureCategories.includes("insufficient-trading-days")
    || context.recommendedNextAction === "collect-more-data";

  if (needsMoreHistory) {
    return "gather-additional-history";
  }

  if (
    context.priorityCategory === "likely-spurious"
    || context.recommendedNextAction === "lower-priority"
    || context.recommendedNextAction === "retire-if-next-batch-fails"
  ) {
    return "deprioritize";
  }

  if (context.recommendedNextAction === "strategy-synthesis-investigation") {
    return "run-research-only-harness";
  }

  if (context.recommendedNextAction === "inspect-derived-data-sensitivity") {
    return "investigate-month-instability";
  }

  if (context.harnessFilterExcluded && context.robustnessScore !== null) {
    return "run-research-only-harness";
  }

  return "gather-additional-history";
}

export function compareWorkflowActions(
  left: ResearchWorkflowQueueAction,
  right: ResearchWorkflowQueueAction,
): number {
  return (
    RESEARCH_WORKFLOW_ACTION_PRIORITY[left] - RESEARCH_WORKFLOW_ACTION_PRIORITY[right]
  );
}

export function deriveWorkflowStatus(
  action: ResearchWorkflowQueueAction,
  priorityCategory: string | null,
): "active" | "blocked" | "deprioritized" | "unknown" {
  if (action === "deprioritize") {
    return "deprioritized";
  }

  if (priorityCategory === "likely-spurious") {
    return "deprioritized";
  }

  if (priorityCategory === "blocked-by-coverage") {
    return "blocked";
  }

  if (
    priorityCategory === "near-promising"
    || priorityCategory === "needs-more-data"
    || action === "validate-refinement-candidates"
    || action === "run-research-only-harness"
    || action === "investigate-month-instability"
  ) {
    return "active";
  }

  if (action === "gather-additional-history") {
    return "blocked";
  }

  return "unknown";
}
