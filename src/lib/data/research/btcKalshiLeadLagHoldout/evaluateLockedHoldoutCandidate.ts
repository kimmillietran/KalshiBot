import type { LeadLagEventRecord } from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";
import { mean, median } from "../btcKalshiLeadLagAnalysis/leadLagUtils";
import {
  computeLeadLagEffectiveSampleSize,
} from "../btcKalshiLeadLagEvidenceContract/statisticalUnit";
import type { LeadLagFrozenCandidateDefinition } from "../btcKalshiLeadLagValidation/leadLagValidationTypes";

import { LeadLagHoldoutError } from "./leadLagHoldoutTypes";

function marketDayKey(marketTicker: string, triggerTimestampMs: number): string {
  return `${marketTicker}|${new Date(triggerTimestampMs).toISOString().slice(0, 10)}`;
}

function matchesLockedDefinition(
  event: LeadLagEventRecord,
  responseWindowMs: number,
  definition: LeadLagFrozenCandidateDefinition,
): boolean {
  return (
    event.btcMoveHorizonMs === definition.btcMoveHorizonMs
    && responseWindowMs === definition.responseWindowMs
    && event.btcMagnitudeBin === definition.btcMagnitudeBin
    && event.timeRemainingBin === definition.timeRemainingBin
    && event.impliedProbabilityBin === definition.impliedProbabilityBin
  );
}

export type LockedHoldoutEvaluationMetrics = {
  rawEligibleEventCount: number;
  uniqueBtcTriggerCount: number;
  independentMarketCount: number;
  independentMarketDayCount: number;
  effectiveSampleSize: number;
  diagnosticMidpointEffectCents: number | null;
  meanMidpointEffectCents: number | null;
  holdoutEffectCents: number | null;
  executableAskEffectCents: number | null;
  executableObservabilityShare: number | null;
  directionalResponseShare: number | null;
  signedMidSamples: readonly number[];
};

/**
 * Score EXACTLY the locked candidate definition.
 * Neighboring bins, flipped directions, and other survivors are ignored.
 */
export function evaluateLockedCandidateOnHoldoutEvents(input: {
  events: readonly LeadLagEventRecord[];
  lockedDefinition: LeadLagFrozenCandidateDefinition;
  /** Forbidden: any additional hypothesis ids. */
  forbiddenHypothesisIds?: readonly string[];
}): LockedHoldoutEvaluationMetrics {
  if (input.forbiddenHypothesisIds?.includes(input.lockedDefinition.hypothesisId) === false) {
    // no-op; presence of forbidden list is for caller intent
  }
  for (const forbidden of input.forbiddenHypothesisIds ?? []) {
    if (forbidden === input.lockedDefinition.hypothesisId) {
      throw new LeadLagHoldoutError(
        "additional candidate cannot be tested: forbidden list includes the locked id",
      );
    }
  }

  const triggers = new Set<number>();
  const markets = new Set<string>();
  const marketDays = new Set<string>();
  const signedMid: number[] = [];
  const signedAsk: number[] = [];
  let eligible = 0;
  let executableVisible = 0;
  let directionalCorrect = 0;
  let directionalTotal = 0;

  for (const event of input.events) {
    if (!event.contractDirectionResolved) {
      continue;
    }
    if (event.timeRemainingBin === null || event.impliedProbabilityBin === null) {
      continue;
    }
    for (const response of event.responses) {
      if (!matchesLockedDefinition(event, response.responseWindowMs, input.lockedDefinition)) {
        continue;
      }
      eligible += 1;
      triggers.add(event.triggerTimestampMs);
      markets.add(event.marketTicker);
      marketDays.add(marketDayKey(event.marketTicker, event.triggerTimestampMs));

      const signedMidValue =
        input.lockedDefinition.direction === "follow-btc"
          ? response.signedYesMidResponseCents
          : response.signedYesMidResponseCents === null
            ? null
            : -response.signedYesMidResponseCents;
      const signedAskValue =
        input.lockedDefinition.direction === "follow-btc"
          ? response.signedYesAskResponseCents
          : response.signedYesAskResponseCents === null
            ? null
            : -response.signedYesAskResponseCents;

      if (signedMidValue !== null) {
        signedMid.push(signedMidValue);
      }
      if (signedAskValue !== null) {
        signedAsk.push(signedAskValue);
        if (Math.abs(response.signedYesAskResponseCents ?? 0) >= 1) {
          executableVisible += 1;
        }
      }
      if (response.directionallyCorrect !== null) {
        directionalTotal += 1;
        const correctForDirection =
          input.lockedDefinition.direction === "follow-btc"
            ? response.directionallyCorrect
            : !response.directionallyCorrect;
        if (correctForDirection) {
          directionalCorrect += 1;
        }
      }
    }
  }

  const effectiveSampleSize = computeLeadLagEffectiveSampleSize({
    rawObservationCount: eligible,
    independentMarketCount: markets.size,
    marketDayCount: marketDays.size,
    uniqueBtcTriggerCount: triggers.size,
  });

  const midpoint = median(signedMid);

  return {
    rawEligibleEventCount: eligible,
    uniqueBtcTriggerCount: triggers.size,
    independentMarketCount: markets.size,
    independentMarketDayCount: marketDays.size,
    effectiveSampleSize: eligible === 0 ? 0 : effectiveSampleSize,
    diagnosticMidpointEffectCents: midpoint,
    meanMidpointEffectCents: mean(signedMid),
    holdoutEffectCents: midpoint,
    executableAskEffectCents: median(signedAsk),
    executableObservabilityShare: eligible === 0 ? null : executableVisible / eligible,
    directionalResponseShare:
      directionalTotal === 0 ? null : directionalCorrect / directionalTotal,
    signedMidSamples: signedMid,
  };
}

export function assertOnlyLockedCandidateRequested(input: {
  requestedHypothesisIds: readonly string[];
  lockedHypothesisId: string;
}): void {
  if (input.requestedHypothesisIds.length !== 1) {
    throw new LeadLagHoldoutError("exactly one validation-locked candidate required");
  }
  if (input.requestedHypothesisIds[0] !== input.lockedHypothesisId) {
    throw new LeadLagHoldoutError(
      "unselected validation survivor cannot enter holdout",
    );
  }
}

export function assertSearchGridNotRerun(mode: string): void {
  if (mode === "full-grid" || mode === "discovery-search" || mode === "9600") {
    throw new LeadLagHoldoutError("search grid cannot rerun in holdout mode");
  }
}

export function assertNoCandidateMutation(input: {
  locked: LeadLagFrozenCandidateDefinition;
  proposed: Partial<LeadLagFrozenCandidateDefinition>;
}): void {
  const fields: (keyof LeadLagFrozenCandidateDefinition)[] = [
    "hypothesisId",
    "btcMoveHorizonMs",
    "responseWindowMs",
    "btcMagnitudeBin",
    "timeRemainingBin",
    "impliedProbabilityBin",
    "direction",
  ];
  for (const field of fields) {
    if (field in input.proposed && input.proposed[field] !== input.locked[field]) {
      if (field === "btcMoveHorizonMs" || field === "responseWindowMs") {
        throw new LeadLagHoldoutError("horizon mutation fails closed");
      }
      if (field === "direction") {
        throw new LeadLagHoldoutError("direction mutation fails closed");
      }
      throw new LeadLagHoldoutError("candidate mutation fails closed");
    }
  }
}
