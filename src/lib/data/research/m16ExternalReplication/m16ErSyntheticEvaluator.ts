/**
 * Synthetic-only M16-ER evaluator plumbing checks.
 * Never accepts real reserved CryptoStruct outcomes.
 */

import {
  computeKalshiScheduleFeeCents,
  KALSHI_FEE_SCHEDULE_ROLE,
  KALSHI_FEE_SCHEDULE_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";
import { computeM16Cr2ClusterMeanInference } from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16Cr2ClusterMean";
import { buildM16AuthoritativeFeeContract } from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16AuthoritativeFeeContract";
import { M16_AUTHORITATIVE_FEE_CONTRACT_IDENTITY } from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16PriorContractIdentities";
import {
  createM16MarketMachine,
  stepM16MarketMachine,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16StateMachine";

import {
  buildM16ErFeeContract,
  evaluateM16ErOutcomeOpenAuthorization,
  M16_ER_ADAPTER_IDENTITY,
} from "./m16ErProtocol";

export type M16ErSyntheticTradeFixture = {
  clusterKey: string;
  entryAskCents: number;
  exitBidCents: number;
};

export function applyM16ErSyntheticFeeAdjustedPnlCents(
  fixture: M16ErSyntheticTradeFixture,
): number {
  const fee = buildM16AuthoritativeFeeContract();
  if (fee.feeContractIdentity !== M16_AUTHORITATIVE_FEE_CONTRACT_IDENTITY) {
    throw new Error("M16 fee identity drift");
  }
  const erFee = buildM16ErFeeContract();
  if (!erFee.bindsExistingM16FeeSemantics) {
    throw new Error("M16-ER fee must bind existing M16 fee semantics");
  }
  const entryFee = computeKalshiScheduleFeeCents({
    priceCents: fixture.entryAskCents,
    quantity: 1,
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
  });
  const exitFee = computeKalshiScheduleFeeCents({
    priceCents: fixture.exitBidCents,
    quantity: 1,
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
  });
  return fixture.exitBidCents - fixture.entryAskCents - entryFee - exitFee;
}

export function runM16ErSyntheticEvaluatorFixture(): {
  confirmationEmitted: boolean;
  cr2SupportCriterionMet: boolean;
  outcomeGateSealed: boolean;
  adapterIdentity: string;
  feeBindsM16: boolean;
} {
  let yes = createM16MarketMachine("YES");
  const closeTimeMs = 10_000 + 120_000;
  const ticks = [
    { mid: 45, ts: 1_000 },
    { mid: 40, ts: 2_000 },
    { mid: 41, ts: 3_000 },
    { mid: 40, ts: 4_000 },
    { mid: 42, ts: 5_000 },
  ];
  let confirmation = false;
  for (const t of ticks) {
    const stepped = stepM16MarketMachine({
      state: yes,
      tick: {
        timestampMs: t.ts,
        yesBestBidCents: 30,
        noBestBidCents: 50,
        candidateMidCents: t.mid,
        bookEligible: true,
        structuralGap: false,
      },
      closeTimeMs,
    });
    yes = stepped.state;
    if (stepped.events.some((e) => e.type === "confirmation")) {
      confirmation = true;
    }
  }

  const pnlA = applyM16ErSyntheticFeeAdjustedPnlCents({
    clusterKey: "d1",
    entryAskCents: 40,
    exitBidCents: 55,
  });
  const pnlB = applyM16ErSyntheticFeeAdjustedPnlCents({
    clusterKey: "d2",
    entryAskCents: 40,
    exitBidCents: 52,
  });
  const cr2 = computeM16Cr2ClusterMeanInference([
    { clusterKey: "d1", valueCents: pnlA },
    { clusterKey: "d1", valueCents: pnlA },
    { clusterKey: "d2", valueCents: pnlB },
    { clusterKey: "d2", valueCents: pnlB },
  ]);

  const gate = evaluateM16ErOutcomeOpenAuthorization();
  const fee = buildM16ErFeeContract();

  return {
    confirmationEmitted: confirmation,
    cr2SupportCriterionMet: cr2.supportCriterionMet,
    outcomeGateSealed: gate.sealed === true && gate.authorized === false,
    adapterIdentity: M16_ER_ADAPTER_IDENTITY,
    feeBindsM16: fee.bindsExistingM16FeeSemantics,
  };
}
