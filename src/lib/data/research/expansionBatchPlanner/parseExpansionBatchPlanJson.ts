import {
  EXPANSION_BATCH_PLAN_SELECTION_STRATEGIES,
  ExpansionBatchPlannerError,
  ExpansionBatchPlannerErrorCode,
  type ExpansionBatchPlan,
} from "./expansionBatchPlannerTypes";

function assertPlainObject(value: unknown): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ExpansionBatchPlannerError(
      "expansion-batch-plan.json must be an object",
      ExpansionBatchPlannerErrorCode.INVALID_DOCUMENT,
    );
  }
}

/** Parses and validates a serialized expansion batch plan document. */
export function parseExpansionBatchPlanJson(raw: string, path: string): ExpansionBatchPlan {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new ExpansionBatchPlannerError(
      `Invalid JSON in ${path}`,
      ExpansionBatchPlannerErrorCode.INVALID_JSON,
    );
  }

  assertPlainObject(parsed);

  if (
    typeof parsed.maxMarkets !== "number"
    || !Array.isArray(parsed.allocations)
    || typeof parsed.selectionStrategy !== "string"
  ) {
    throw new ExpansionBatchPlannerError(
      `${path} is missing maxMarkets, allocations, or selectionStrategy`,
      ExpansionBatchPlannerErrorCode.INVALID_DOCUMENT,
    );
  }

  if (
    !(EXPANSION_BATCH_PLAN_SELECTION_STRATEGIES as readonly string[]).includes(
      parsed.selectionStrategy,
    )
  ) {
    throw new ExpansionBatchPlannerError(
      `${path} has invalid selectionStrategy: ${parsed.selectionStrategy}`,
      ExpansionBatchPlannerErrorCode.INVALID_DOCUMENT,
    );
  }

  if (!Array.isArray(parsed.rejectedCandidates)) {
    parsed.rejectedCandidates = [];
  }

  return parsed as ExpansionBatchPlan;
}

/** Creates mutable month-budget state from a batch plan. */
export function createExpansionBatchPlanConsumptionState(
  plan: ExpansionBatchPlan,
): Map<string, number> {
  const remainingByMonth = new Map<string, number>();

  for (const allocation of plan.allocations) {
    remainingByMonth.set(
      allocation.month,
      (remainingByMonth.get(allocation.month) ?? 0) + allocation.marketCount,
    );
  }

  return remainingByMonth;
}
