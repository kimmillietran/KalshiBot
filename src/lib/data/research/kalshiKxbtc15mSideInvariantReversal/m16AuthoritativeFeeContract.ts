/**
 * M16.1 authoritative KXBTC15M fee contract.
 *
 * Bound from Kalshi Trade API series metadata (fee_type=quadratic,
 * fee_multiplier=1) → repository STANDARD taker schedule.
 * Not chosen for conservatism or hypothesis friendliness.
 */
import { createHash } from "node:crypto";

import {
  computeKalshiScheduleFeeCents,
  KALSHI_FEE_MULTIPLIER_BY_VARIANT,
  KALSHI_FEE_SCHEDULE_ROLE,
  KALSHI_FEE_SCHEDULE_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { M16ReversalError, M16_SUBFAMILY_ID } from "./m16Types";

export const M16_AUTHORITATIVE_FEE_CONTRACT_VERSION =
  "kalshi-kxbtc15m-side-invariant-exhaustion-reversal-fee-contract-v1" as const;

/** Sealed attestation from GET /series/KXBTC15M at M16.1 seal time. */
export const M16_KXBTC15M_FEE_ATTESTATION = {
  seriesTicker: "KXBTC15M",
  sourceEndpoint:
    "GET https://api.elections.kalshi.com/trade-api/v2/series/KXBTC15M",
  feeType: "quadratic",
  feeMultiplier: 1,
  seriesLastUpdatedTs: "2026-09-18T15:20:18.321673Z",
  feeChangesEndpoint:
    "GET https://api.elections.kalshi.com/trade-api/v2/series/fee_changes?series_ticker=KXBTC15M&show_historical=true",
  feeChangesObservedEmptyAtSeal: true,
  supportingScheduleDoc: "https://kalshi.com/docs/kalshi-fee-schedule.pdf",
  mappingRule:
    "fee_type=quadratic AND fee_multiplier=1 maps to repository schedule=standard "
    + "(taker 0.07×C×P×(1-P) ceil-to-cent). reduced-index (0.035) is NOT selected.",
} as const;

export type M16AuthoritativeFeeContract = {
  contractVersion: typeof M16_AUTHORITATIVE_FEE_CONTRACT_VERSION;
  studyId: typeof M16_SUBFAMILY_ID;
  feeContractStatus: "bound-authoritative-kxbtc15m-standard-taker";
  authoritativeScheduleBound: true;
  seriesTicker: "KXBTC15M";
  attestation: typeof M16_KXBTC15M_FEE_ATTESTATION;
  modulePath: "src/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents.ts";
  functionName: "computeKalshiScheduleFeeCents";
  role: typeof KALSHI_FEE_SCHEDULE_ROLE.TAKER;
  schedule: typeof KALSHI_FEE_SCHEDULE_VARIANT.STANDARD;
  quantityContracts: 1;
  rounding: "ceil-to-next-cent";
  priceDependence: "quadratic-P*(100-P)";
  entryFee: "taker-fee-at-executable-ask";
  exitFeeTargetStopFlatten: "taker-fee-at-executable-bid";
  settlementFee: "none-under-attested-schedule";
  scheduleChangeRule:
    "fail-closed-stop-collection-require-governed-amendment-if-series-fee_type-or-fee_multiplier-differs-from-attestation";
  inventedFlatFeeForbidden: true;
  silentZeroFeeForbidden: true;
  feeContractIdentity: string;
};

export function buildM16AuthoritativeFeeContract(): M16AuthoritativeFeeContract {
  const contract: Omit<M16AuthoritativeFeeContract, "feeContractIdentity"> = {
    contractVersion: M16_AUTHORITATIVE_FEE_CONTRACT_VERSION,
    studyId: M16_SUBFAMILY_ID,
    feeContractStatus: "bound-authoritative-kxbtc15m-standard-taker",
    authoritativeScheduleBound: true,
    seriesTicker: "KXBTC15M",
    attestation: M16_KXBTC15M_FEE_ATTESTATION,
    modulePath: "src/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents.ts",
    functionName: "computeKalshiScheduleFeeCents",
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
    quantityContracts: 1,
    rounding: "ceil-to-next-cent",
    priceDependence: "quadratic-P*(100-P)",
    entryFee: "taker-fee-at-executable-ask",
    exitFeeTargetStopFlatten: "taker-fee-at-executable-bid",
    settlementFee: "none-under-attested-schedule",
    scheduleChangeRule:
      "fail-closed-stop-collection-require-governed-amendment-if-series-fee_type-or-fee_multiplier-differs-from-attestation",
    inventedFlatFeeForbidden: true,
    silentZeroFeeForbidden: true,
  };

  const feeContractIdentity = createHash("sha256")
    .update(
      stableStringify({
        ...contract,
        multipliers: KALSHI_FEE_MULTIPLIER_BY_VARIANT,
      }),
    )
    .digest("hex");

  return { ...contract, feeContractIdentity };
}

export function assertM16AuthoritativeFeeMatches(
  expectedIdentity: string,
): M16AuthoritativeFeeContract {
  const bound = buildM16AuthoritativeFeeContract();
  if (bound.feeContractIdentity !== expectedIdentity) {
    throw new M16ReversalError(
      `M16.1 fee-contract identity mismatch: expected ${expectedIdentity}, `
        + `got ${bound.feeContractIdentity}`,
    );
  }
  return bound;
}

/**
 * Fail closed if live series fee metadata diverges from the sealed attestation.
 * Used by future collection governance — not a P&L path.
 */
export function assertM16SeriesFeeMatchesAttestation(input: {
  feeType: string;
  feeMultiplier: number;
}): void {
  if (input.feeType !== M16_KXBTC15M_FEE_ATTESTATION.feeType) {
    throw new M16ReversalError(
      `KXBTC15M fee_type changed: sealed=${M16_KXBTC15M_FEE_ATTESTATION.feeType} `
        + `observed=${input.feeType} — stop collection; require governed amendment`,
    );
  }
  if (input.feeMultiplier !== M16_KXBTC15M_FEE_ATTESTATION.feeMultiplier) {
    throw new M16ReversalError(
      `KXBTC15M fee_multiplier changed: sealed=`
        + `${M16_KXBTC15M_FEE_ATTESTATION.feeMultiplier} `
        + `observed=${input.feeMultiplier} — stop collection; require governed amendment`,
    );
  }
}

/** Authoritative one-contract taker fee under the sealed STANDARD schedule. */
export function computeM16AuthoritativeOneContractTakerFeeCents(
  priceCents: number,
): number {
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100) {
    throw new M16ReversalError(
      `fee priceCents must be integer in [0,100]; got ${priceCents}`,
    );
  }
  return computeKalshiScheduleFeeCents({
    quantity: 1,
    priceCents,
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
  });
}
