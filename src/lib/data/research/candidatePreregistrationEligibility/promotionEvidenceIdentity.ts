import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  CandidatePromotionDecision,
  CandidatePromotionEntry,
  CandidatePromotionReport,
  ParsedSynthesisStrategy,
  ParsedValidationEntry,
} from "@/lib/data/research/candidatePromotion/candidatePromotionTypes";

import {
  ACCEPTED_PREREGISTRATION_PROMOTION_DECISIONS,
  type AcceptedPreregistrationPromotionDecision,
} from "./candidatePreregistrationEligibilityTypes";

/** Content hash of artifact bytes. Does not use mtime/ctime/path freshness. */
export function hashArtifactContent(content: string): string {
  return fnv1a32(content.replace(/^\uFEFF/, ""));
}

/** Semantic identity hash for a validation entry (order-stable). */
export function hashValidationEntryContent(entry: ParsedValidationEntry): string {
  return fnv1a32(stableStringify(entry));
}

/** Semantic identity hash for the candidate/synthesis definition used in promotion. */
export function hashCandidateDefinitionContent(
  strategy: Pick<
    ParsedSynthesisStrategy,
    "strategyId" | "hypothesisId" | "strategyFamily" | "promotionStatus" | "validationSummary"
  >,
): string {
  return fnv1a32(
    stableStringify({
      strategyId: strategy.strategyId,
      hypothesisId: strategy.hypothesisId,
      strategyFamily: strategy.strategyFamily,
      promotionStatus: strategy.promotionStatus,
      validationSummary: strategy.validationSummary,
    }),
  );
}

export function isAcceptedPromotionDecision(
  decision: CandidatePromotionDecision | null | undefined,
): decision is AcceptedPreregistrationPromotionDecision {
  return (
    decision === "candidate"
    || decision === "production-watchlist"
  );
}

export function computePromotionAccepted(input: {
  decision: CandidatePromotionDecision;
  validationPasses: boolean | null;
  statisticalGates?: {
    oosFinalStatisticalVerdict: string | null;
    oosPassesCorrected: boolean | null;
    oosClearsMde: boolean | null;
    oosIsUnderpowered: boolean | null;
    discoveryIsolationStatus: string | null;
    prospectiveDesignValid: boolean | null;
  } | null;
}): boolean {
  if (!isAcceptedPromotionDecision(input.decision) || input.validationPasses !== true) {
    return false;
  }
  // M12.7c: legacy validation alone is never sufficient for accepted promotion.
  const gates = input.statisticalGates;
  if (!gates) {
    return false;
  }
  return (
    gates.oosFinalStatisticalVerdict === "pass"
    && gates.oosPassesCorrected === true
    && gates.oosClearsMde === true
    && gates.oosIsUnderpowered === false
    && gates.discoveryIsolationStatus === "train-only-discovery"
    && gates.prospectiveDesignValid === true
  );
}

export function selectPromotionEntryForHypothesis(
  report: CandidatePromotionReport,
  hypothesisId: string,
): CandidatePromotionEntry | null {
  const matches = report.promotions
    .filter((entry) => entry.hypothesisId === hypothesisId)
    .sort((left, right) => left.strategyId.localeCompare(right.strategyId));
  if (matches.length === 0) {
    return null;
  }
  // Prefer an accepted entry when multiple strategies share a hypothesis id.
  const accepted = matches.find((entry) => entry.evidence?.promotionAccepted === true);
  return accepted ?? matches[0] ?? null;
}

export function assertAcceptedPreregistrationDecision(
  decision: unknown,
): asserts decision is AcceptedPreregistrationPromotionDecision {
  if (
    typeof decision !== "string"
    || !(ACCEPTED_PREREGISTRATION_PROMOTION_DECISIONS as readonly string[]).includes(decision)
  ) {
    throw new Error(`Promotion decision is not accepted for preregistration: ${String(decision)}`);
  }
}
