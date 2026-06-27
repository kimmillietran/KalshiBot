/** Tunable parameters for the deterministic decision policy (v1). */
export type DecisionPolicyConfig = {
  /** When false, policy always returns NO_TRADE regardless of edge. */
  enabled: boolean;
  /** Minimum combined model confidence required to trade. */
  minConfidence: number;
};

export const DEFAULT_DECISION_POLICY_CONFIG: DecisionPolicyConfig = {
  enabled: true,
  minConfidence: 0.5,
};

export const DECISION_POLICY_MODEL_VERSION = "5.6.0";
