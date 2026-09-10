import type { LeadLagEventRecord } from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";
import { mean, median } from "../btcKalshiLeadLagAnalysis/leadLagUtils";

import type {
  LeadLagFrozenCandidateDefinition,
  LeadLagLockedHoldoutCandidate,
  LeadLagValidationCandidateResult,
  LeadLagValidationCandidateStatus,
  LeadLagValidationContract,
} from "./leadLagValidationTypes";

function effectSign(value: number | null): -1 | 0 | 1 | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (value > 0) {
    return 1;
  }
  if (value < 0) {
    return -1;
  }
  return 0;
}

function marketDayKey(marketTicker: string, triggerTimestampMs: number): string {
  return `${marketTicker}|${new Date(triggerTimestampMs).toISOString().slice(0, 10)}`;
}

type MutableStats = {
  eligible: number;
  triggers: Set<number>;
  markets: Set<string>;
  marketDays: Set<string>;
  signedMid: number[];
  signedAsk: number[];
  directionalCorrect: number;
  directionalTotal: number;
  executableVisible: number;
};

function emptyStats(): MutableStats {
  return {
    eligible: 0,
    triggers: new Set(),
    markets: new Set(),
    marketDays: new Set(),
    signedMid: [],
    signedAsk: [],
    directionalCorrect: 0,
    directionalTotal: 0,
    executableVisible: 0,
  };
}

function matchesDefinition(
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

/**
 * Accumulate metrics ONLY for the frozen discovery shortlist.
 * Neighboring bins / flipped directions are intentionally ignored.
 */
export function evaluateFrozenCandidatesOnValidationEvents(input: {
  events: readonly LeadLagEventRecord[];
  frozenCandidates: readonly LeadLagFrozenCandidateDefinition[];
  discoveryIdentityHash: string;
  contract: LeadLagValidationContract;
}): LeadLagValidationCandidateResult[] {
  const statsById = new Map<string, MutableStats>();
  for (const candidate of input.frozenCandidates) {
    statsById.set(candidate.hypothesisId, emptyStats());
  }

  for (const event of input.events) {
    if (!event.contractDirectionResolved) {
      continue;
    }
    if (event.timeRemainingBin === null || event.impliedProbabilityBin === null) {
      continue;
    }
    for (const response of event.responses) {
      for (const definition of input.frozenCandidates) {
        if (!matchesDefinition(event, response.responseWindowMs, definition)) {
          continue;
        }
        const stats = statsById.get(definition.hypothesisId)!;
        stats.eligible += 1;
        stats.triggers.add(event.triggerTimestampMs);
        stats.markets.add(event.marketTicker);
        stats.marketDays.add(marketDayKey(event.marketTicker, event.triggerTimestampMs));

        const signedMid =
          definition.direction === "follow-btc"
            ? response.signedYesMidResponseCents
            : response.signedYesMidResponseCents === null
              ? null
              : -response.signedYesMidResponseCents;
        const signedAsk =
          definition.direction === "follow-btc"
            ? response.signedYesAskResponseCents
            : response.signedYesAskResponseCents === null
              ? null
              : -response.signedYesAskResponseCents;

        if (signedMid !== null) {
          stats.signedMid.push(signedMid);
        }
        if (signedAsk !== null) {
          stats.signedAsk.push(signedAsk);
          if (Math.abs(response.signedYesAskResponseCents ?? 0) >= 1) {
            stats.executableVisible += 1;
          }
        }
        if (response.directionallyCorrect !== null) {
          stats.directionalTotal += 1;
          const correctForDirection =
            definition.direction === "follow-btc"
              ? response.directionallyCorrect
              : !response.directionallyCorrect;
          if (correctForDirection) {
            stats.directionalCorrect += 1;
          }
        }
      }
    }
  }

  return input.frozenCandidates.map((definition) => {
    const stats = statsById.get(definition.hypothesisId)!;
    const midpoint = median(stats.signedMid);
    const trainSign = effectSign(definition.trainMedianSignedMidResponseCents);
    const validationSign = effectSign(midpoint);
    let directionalConsistency: LeadLagValidationCandidateResult["directionalConsistency"] =
      "not-evaluable";
    if (trainSign === null || validationSign === null) {
      directionalConsistency = "not-evaluable";
    } else if (validationSign === 0 || trainSign === 0) {
      directionalConsistency = "zero-or-undefined";
    } else if (validationSign === trainSign) {
      directionalConsistency = "same-sign";
    } else {
      directionalConsistency = "opposite-sign";
    }

    const executableShare =
      stats.eligible === 0 ? null : stats.executableVisible / stats.eligible;
    const directionalShare =
      stats.directionalTotal === 0
        ? null
        : stats.directionalCorrect / stats.directionalTotal;

    const { status, rationale } = classifyValidationStatus({
      contract: input.contract,
      eligible: stats.eligible,
      independentMarkets: stats.markets.size,
      independentMarketDays: stats.marketDays.size,
      midpoint,
      executableShare,
      directionalConsistency,
    });

    return {
      candidateId: definition.candidateId,
      hypothesisId: definition.hypothesisId,
      exactDefinition: definition,
      trainSummaryReference: {
        discoveryIdentityHash: input.discoveryIdentityHash,
        discoveryRank: definition.discoveryRank,
        trainEligibleMarketTriggerCount: definition.trainEligibleMarketTriggerCount,
        trainMedianSignedMidResponseCents: definition.trainMedianSignedMidResponseCents,
      },
      validationEventCount: stats.eligible,
      uniqueBtcTriggerCount: stats.triggers.size,
      independentMarketCount: stats.markets.size,
      independentMarketDayCount: stats.marketDays.size,
      midpointResponseCents: midpoint,
      meanMidpointResponseCents: mean(stats.signedMid),
      directionalResponseShare: directionalShare,
      executableObservabilityShare: executableShare,
      executableAskResponseCents: median(stats.signedAsk),
      trainEffectSign: trainSign,
      validationEffectSign: validationSign,
      directionalConsistency,
      validationStatus: status,
      rationale,
    };
  });
}

function classifyValidationStatus(input: {
  contract: LeadLagValidationContract;
  eligible: number;
  independentMarkets: number;
  independentMarketDays: number;
  midpoint: number | null;
  executableShare: number | null;
  directionalConsistency: LeadLagValidationCandidateResult["directionalConsistency"];
}): { status: LeadLagValidationCandidateStatus; rationale: string[] } {
  const rationale: string[] = [];

  if (input.eligible <= 0) {
    return {
      status: "insufficient-validation-incidence",
      rationale: ["No eligible validation market-trigger observations for this exact definition."],
    };
  }

  const underpowered =
    input.eligible < input.contract.minEligibleMarketTriggers
    || input.independentMarkets < input.contract.minIndependentMarkets
    || input.independentMarketDays < input.contract.minIndependentMarketDays;

  if (underpowered) {
    rationale.push(
      `Underpowered for validation (n=${input.eligible}, markets=${input.independentMarkets}, `
        + `marketDays=${input.independentMarketDays}; floors `
        + `${input.contract.minEligibleMarketTriggers}/`
        + `${input.contract.minIndependentMarkets}/`
        + `${input.contract.minIndependentMarketDays}).`,
    );
    return { status: "underpowered-for-validation", rationale };
  }

  if (input.directionalConsistency === "opposite-sign") {
    rationale.push("Validation midpoint effect sign opposes TRAIN discovery direction.");
    return { status: "validation-failed", rationale };
  }

  if (
    input.midpoint === null
    || Math.abs(input.midpoint) < input.contract.minAbsMedianMidResponseCents
    || input.directionalConsistency === "zero-or-undefined"
  ) {
    rationale.push(
      `Validation midpoint effect is approximately zero / below non-trivial floor `
        + `(${input.contract.minAbsMedianMidResponseCents}¢).`,
    );
    return { status: "validation-failed", rationale };
  }

  if (input.directionalConsistency !== "same-sign") {
    rationale.push(`Directional consistency not established (${input.directionalConsistency}).`);
    return { status: "validation-failed", rationale };
  }

  if (
    input.executableShare === null
    || input.executableShare < input.contract.minExecutableObservabilityShare
  ) {
    rationale.push("Executable-side observability below validation floor.");
    return { status: "validation-failed", rationale };
  }

  rationale.push("Same-sign directional replication with adequate sample and executable observability.");
  rationale.push("TRAIN magnitude was not required to reproduce.");
  return { status: "validated", rationale };
}

/**
 * Predeclared tie-break: DOES NOT maximize observed validation effect.
 * Prefer sample support → directional share → executable observability →
 * effect robustness (clears floor; uses abs only as soft margin, not ranking by size) →
 * simpler definition → hypothesisId.
 */
export function lockHoldoutCandidateFromSurvivors(input: {
  survivors: readonly LeadLagValidationCandidateResult[];
}): LeadLagLockedHoldoutCandidate | null {
  if (input.survivors.length === 0) {
    return null;
  }

  const ranked = [...input.survivors].sort((left, right) => {
    if (right.validationEventCount !== left.validationEventCount) {
      return right.validationEventCount - left.validationEventCount;
    }
    if (right.independentMarketCount !== left.independentMarketCount) {
      return right.independentMarketCount - left.independentMarketCount;
    }
    if (right.independentMarketDayCount !== left.independentMarketDayCount) {
      return right.independentMarketDayCount - left.independentMarketDayCount;
    }
    const leftDir = left.directionalResponseShare ?? 0;
    const rightDir = right.directionalResponseShare ?? 0;
    if (rightDir !== leftDir) {
      return rightDir - leftDir;
    }
    const leftExec = left.executableObservabilityShare ?? 0;
    const rightExec = right.executableObservabilityShare ?? 0;
    if (rightExec !== leftExec) {
      return rightExec - leftExec;
    }
    // Soft robustness: whether absolute effect exceeds 1¢ margin above floor — NOT max effect.
    const leftRobust = Math.abs(left.midpointResponseCents ?? 0) >= 1.5 ? 1 : 0;
    const rightRobust = Math.abs(right.midpointResponseCents ?? 0) >= 1.5 ? 1 : 0;
    if (rightRobust !== leftRobust) {
      return rightRobust - leftRobust;
    }
    const leftSimple =
      left.exactDefinition.btcMoveHorizonMs + left.exactDefinition.responseWindowMs;
    const rightSimple =
      right.exactDefinition.btcMoveHorizonMs + right.exactDefinition.responseWindowMs;
    if (leftSimple !== rightSimple) {
      return leftSimple - rightSimple;
    }
    return left.hypothesisId.localeCompare(right.hypothesisId);
  });

  const winner = ranked[0]!;
  return {
    candidateId: winner.candidateId,
    hypothesisId: winner.hypothesisId,
    exactDefinition: winner.exactDefinition,
    lockReason: [
      "Selected by predeclared validation tie-break (not maximum observed effect).",
      `validationEventCount=${winner.validationEventCount}`,
      `independentMarkets=${winner.independentMarketCount}`,
      `directionalShare=${winner.directionalResponseShare}`,
      `executableShare=${winner.executableObservabilityShare}`,
      `simplicityHorizonPlusWindowMs=${
        winner.exactDefinition.btcMoveHorizonMs + winner.exactDefinition.responseWindowMs
      }`,
    ],
    tieBreakScoreComponents: {
      validationEventCount: winner.validationEventCount,
      independentMarketCount: winner.independentMarketCount,
      independentMarketDayCount: winner.independentMarketDayCount,
      directionalResponseShare: winner.directionalResponseShare ?? "null",
      executableObservabilityShare: winner.executableObservabilityShare ?? "null",
      robustnessClearsSoftMargin: Math.abs(winner.midpointResponseCents ?? 0) >= 1.5 ? 1 : 0,
      simplicityHorizonPlusWindowMs:
        winner.exactDefinition.btcMoveHorizonMs + winner.exactDefinition.responseWindowMs,
      hypothesisId: winner.hypothesisId,
    },
  };
}
