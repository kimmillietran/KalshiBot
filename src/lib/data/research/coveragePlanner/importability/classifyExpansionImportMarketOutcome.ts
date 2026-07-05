import { classifyExpansionImportFailure } from "@/lib/data/importJobs/expansionExecutor/expansionImportCircuitBreaker";

import type { ExpansionImportMarketOutcomeCategory } from "./importabilityTypes";

function isUnsupportedMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("expiration_value")
    || normalized.includes("missing required fields")
    || normalized.includes("kalshi historical market response missing")
    || normalized.includes("import-compatibility")
    || normalized.includes("incompatible")
    || normalized.includes("missing opentime")
    || normalized.includes("missing closetime")
  );
}

/** Classifies a single expansion import market result for planner importability scoring. */
export function classifyExpansionImportMarketOutcome(input: {
  status: "planned" | "imported" | "skipped" | "failed";
  errorMessage: string | null;
  skipReason: string | null;
}): ExpansionImportMarketOutcomeCategory {
  if (input.status === "imported") {
    return "successful-import";
  }

  if (input.status === "planned") {
    return "planned";
  }

  if (input.status === "failed") {
    const message = input.errorMessage ?? "";
    if (
      classifyExpansionImportFailure(message) === "import-compatibility"
      || isUnsupportedMessage(message)
    ) {
      return "compatibility-failure";
    }

    return "other-failure";
  }

  const skipReason = input.skipReason ?? "";
  if (
    skipReason.includes("already present")
    || skipReason.includes("checkpoint")
    || skipReason.includes("Retry exhausted")
    || skipReason.includes("--skip-failed")
    || skipReason.includes("--force-market")
  ) {
    return "skipped-deduped";
  }

  if (isUnsupportedMessage(skipReason)) {
    return "unsupported-market";
  }

  return "skipped-other";
}

export function isUnsupportedOutcomeCategory(
  category: ExpansionImportMarketOutcomeCategory,
): boolean {
  return category === "compatibility-failure" || category === "unsupported-market";
}

export function isAttemptedOutcomeCategory(
  category: ExpansionImportMarketOutcomeCategory,
): boolean {
  return (
    category === "successful-import"
    || category === "compatibility-failure"
    || category === "unsupported-market"
    || category === "other-failure"
  );
}
