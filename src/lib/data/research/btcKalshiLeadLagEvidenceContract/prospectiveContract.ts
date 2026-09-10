import type { LeadLagResponseDirection } from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";

import {
  LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
  type LeadLagExecutionSemantics,
  type LeadLagProspectiveEvidenceContract,
  type LeadLagStoppingRule,
} from "./leadLagEvidenceContractTypes";
import { DEFAULT_LEAD_LAG_SUPPORT_REJECT_RULES } from "./holdoutContract";
import { deriveRequiredEffectiveEvidence } from "./powerModel";
import { validateLeadLagStoppingRule } from "./stoppingRules";

export function buildLeadLagProspectiveEvidenceContract(input: {
  executionDefinition: LeadLagExecutionSemantics;
  alpha: number;
  targetPower: number;
  effectThresholdCents: number;
  outcomeStandardDeviationCents: number;
  stoppingRule: LeadLagStoppingRule | null;
  signalHorizonMs: number | null;
  kalshiResponseHorizonMs: number | null;
  candidateDirection: LeadLagResponseDirection | null;
}): LeadLagProspectiveEvidenceContract & {
  stoppingRuleValidation: ReturnType<typeof validateLeadLagStoppingRule>;
} {
  const required = deriveRequiredEffectiveEvidence({
    alpha: input.alpha,
    targetPower: input.targetPower,
    materialEffectCents: input.effectThresholdCents,
    outcomeStandardDeviationCents: input.outcomeStandardDeviationCents,
  });
  const stoppingRuleValidation = validateLeadLagStoppingRule(input.stoppingRule);

  return {
    contractVersion: LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
    featureDefinition:
      "Locked BTC-impulse → Kalshi yes-mid response association with declared magnitude/time/prob bins "
      + "(candidate parameters bound only after M12.8b lock).",
    causalBtcJoinSemantics:
      "Backward-only causal BTC join (last BTC at-or-before Kalshi timestamp) with age cap; "
      + "no lookahead. Reuse btcKalshiLeadLagAnalysis causalBtcJoin.",
    signalHorizonMs: input.signalHorizonMs,
    kalshiResponseHorizonMs: input.kalshiResponseHorizonMs,
    candidateDirection: input.candidateDirection,
    entryEligibility:
      "Eligible only when locked cell axes match and executable observability passes at trigger.",
    executionDefinition: input.executionDefinition,
    effectThresholdCents: input.effectThresholdCents,
    alpha: input.alpha,
    targetPower: input.targetPower,
    requiredEvidence: {
      kind: "model-derived-effective-n",
      requiredEffectiveN: required.requiredEffectiveN,
    },
    stoppingRule: input.stoppingRule,
    supportRejectInconclusive: DEFAULT_LEAD_LAG_SUPPORT_REJECT_RULES,
    captureQualityRequirements: [
      "capture-health research-ready or explicitly waived with documented risk",
      "top-of-book bid/ask + size coverage adequate for one-contract TOB model",
      "btc-spot continuity sufficient for causal join",
      "sequence/resync integrity acceptable for quote timestamps",
    ],
    candidateSpecificParametersBound: false,
    stoppingRuleValidation,
  };
}
