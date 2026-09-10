import type { LeadLagStoppingRule } from "./leadLagEvidenceContractTypes";
import { LeadLagEvidenceContractError } from "./leadLagEvidenceContractTypes";

export type StoppingRuleValidationResult = {
  valid: boolean;
  reasons: readonly string[];
};

/**
 * Fail closed when stopping design is missing or optional-stopping-like without
 * an explicit sequential design implementation flag.
 */
export function validateLeadLagStoppingRule(
  stoppingRule: LeadLagStoppingRule | null | undefined,
): StoppingRuleValidationResult {
  if (stoppingRule == null) {
    return {
      valid: false,
      reasons: ["missing stopping rule fails closed"],
    };
  }

  if (stoppingRule.kind === "fixed-n") {
    if (
      !Number.isFinite(stoppingRule.minimumEffectiveSampleSize)
      || stoppingRule.minimumEffectiveSampleSize < 2
    ) {
      return {
        valid: false,
        reasons: ["fixed-n stopping rule requires minimumEffectiveSampleSize >= 2"],
      };
    }
    return { valid: true, reasons: [] };
  }

  if (stoppingRule.kind === "fixed-capture-horizon") {
    if (
      !Number.isFinite(stoppingRule.captureHorizonHours)
      || stoppingRule.captureHorizonHours <= 0
    ) {
      return {
        valid: false,
        reasons: ["fixed-capture-horizon requires positive captureHorizonHours"],
      };
    }
    return { valid: true, reasons: [] };
  }

  if (stoppingRule.kind === "explicit-sequential") {
    if (stoppingRule.sequentialDesignImplemented !== true) {
      return {
        valid: false,
        reasons: ["optional stopping without sequential design fails closed"],
      };
    }
    if (!stoppingRule.ruleId.trim() || !stoppingRule.description.trim()) {
      return {
        valid: false,
        reasons: ["explicit-sequential stopping rule requires ruleId and description"],
      };
    }
    return { valid: true, reasons: [] };
  }

  return {
    valid: false,
    reasons: ["unknown stopping rule kind fails closed"],
  };
}

export function requireValidLeadLagStoppingRule(
  stoppingRule: LeadLagStoppingRule | null | undefined,
): LeadLagStoppingRule {
  const result = validateLeadLagStoppingRule(stoppingRule);
  if (!result.valid || stoppingRule == null) {
    throw new LeadLagEvidenceContractError(result.reasons.join("; "));
  }
  return stoppingRule;
}

/** Reject ad-hoc optional stopping shapes that are not in the allowed union. */
export function rejectOptionalStoppingWithoutSequentialDesign(value: unknown): StoppingRuleValidationResult {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return validateLeadLagStoppingRule(null);
  }
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "optional-stopping" || kind === "peeking" || kind === "unbounded") {
    return {
      valid: false,
      reasons: ["optional stopping without sequential design fails closed"],
    };
  }
  return validateLeadLagStoppingRule(value as LeadLagStoppingRule);
}
