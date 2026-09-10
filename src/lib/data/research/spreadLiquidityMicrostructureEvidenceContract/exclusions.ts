import { MicrostructureEvidenceContractError } from "./microstructureEvidenceContractTypes";

export const MICROSTRUCTURE_EXPLICIT_EXCLUSIONS = [
  "BTC conditioning",
  "BTC volatility",
  "multi-level depth",
  "cancel/trade labels",
  "true liquidity-withdrawal claims",
  "size-drop alternative event family",
  "spread interactions",
  "new probability bins",
  "searched direction",
  "outcome-driven thresholds",
  "settlement as primary short-horizon outcome",
] as const;

export type MicrostructureFeatureFlag =
  | "btc-conditioning"
  | "btc-volatility"
  | "multi-level-depth"
  | "cancel-trade-labels"
  | "liquidity-withdrawal-claims"
  | "size-drop-event-family"
  | "spread-interactions"
  | "new-probability-bins"
  | "searched-direction"
  | "outcome-driven-thresholds"
  | "settlement-primary-outcome"
  | "endogenous-tob-imbalance";

const ALLOWED: ReadonlySet<MicrostructureFeatureFlag> = new Set(["endogenous-tob-imbalance"]);

export function buildMicrostructureExplicitExclusions(): readonly string[] {
  return MICROSTRUCTURE_EXPLICIT_EXCLUSIONS;
}

export function assertMicrostructureFeatureAllowed(feature: MicrostructureFeatureFlag): void {
  if (!ALLOWED.has(feature)) {
    throw new MicrostructureEvidenceContractError(
      `Unsupported microstructure feature rejected: ${feature}. `
        + "Requires a future governed family version.",
    );
  }
}

export function rejectBtcConditionedCandidate(): never {
  assertMicrostructureFeatureAllowed("btc-conditioning");
  throw new Error("unreachable");
}

export function rejectUnsupportedDepthOrCancelFeatures(
  feature: "multi-level-depth" | "cancel-trade-labels",
): never {
  assertMicrostructureFeatureAllowed(feature);
  throw new Error("unreachable");
}
