import { createHash } from "node:crypto";

import {
  KALSHI_FEE_MULTIPLIER_BY_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  MomentumDiagnosticEstimandId,
  MomentumFeeContractStatus,
  MomentumPrimaryEstimandId,
} from "./momentumEvidenceContractTypes";
import { MomentumEvidenceContractError } from "./momentumEvidenceContractTypes";

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Fee audit: a reusable Kalshi schedule fee function exists in backtesting costModel.
 * It is identified here but NOT activated as this family's net primary estimand.
 * Net-edge / promotion claims fail closed until governance explicitly binds and
 * promotes fee-adjusted P&L. Do not invent a flat 1¢ fee; do not default silently to zero.
 */
export function auditMomentumFeeContract(): {
  feeContractStatus: MomentumFeeContractStatus;
  candidateFeeModulePath: string;
  candidateFeeFunction: "computeKalshiScheduleFeeCents";
  candidateScheduleIdentityHash: string;
  inventedFlatOneCentFeeForbidden: true;
  silentZeroFeeForbidden: true;
  netEdgePromotionAuthorized: false;
  primaryRemainsGrossUntilActivated: true;
  rationale: string;
} {
  const candidateScheduleIdentityHash = sha256Hex(
    stableStringify({
      module: "src/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents.ts",
      function: "computeKalshiScheduleFeeCents",
      multipliers: KALSHI_FEE_MULTIPLIER_BY_VARIANT,
    }),
  );

  return {
    feeContractStatus: "schedule-identified-but-unbound-for-family",
    candidateFeeModulePath:
      "src/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents.ts",
    candidateFeeFunction: "computeKalshiScheduleFeeCents",
    candidateScheduleIdentityHash,
    inventedFlatOneCentFeeForbidden: true,
    silentZeroFeeForbidden: true,
    netEdgePromotionAuthorized: false,
    primaryRemainsGrossUntilActivated: true,
    rationale:
      "Reusable Kalshi schedule fee infrastructure exists and is suitable for one-contract "
      + "horizon fills, but this family's fee contract is not yet activated for promotion. "
      + "Primary estimand remains gross executable one-contract P&L. Net-edge claims fail closed. "
      + "Do not invent a flat 1¢ fee; do not silently assume zero fees.",
  };
}

export function assertNetEdgeClaimFailsClosedWhenFeeUnbound(input: {
  feeContractStatus: MomentumFeeContractStatus;
  claimingNetEdge: boolean;
}): void {
  if (input.claimingNetEdge) {
    throw new MomentumEvidenceContractError(
      "Net-edge / fee-adjusted promotion claim fails closed while fee contract is unbound "
        + "for this family (status="
        + input.feeContractStatus
        + ").",
    );
  }
}

export function rejectInventedFlatOneCentFee(): never {
  throw new MomentumEvidenceContractError(
    "Invented flat 1¢ fee is forbidden for momentum evidence contract.",
  );
}

export function rejectSilentZeroFeeDefault(): never {
  throw new MomentumEvidenceContractError(
    "Silent zero-fee default is forbidden for momentum evidence contract.",
  );
}

export function buildMomentumEstimandContract(): {
  primaryEstimand: MomentumPrimaryEstimandId;
  primaryEstimandRationale: string;
  diagnosticEstimand: MomentumDiagnosticEstimandId;
  midpointAuthorization: "diagnostic-only";
  economicSupportRequiresExecutable: true;
  continuationSignConvention: {
    upwardPredictor: string;
    downwardPredictor: string;
  };
} {
  return {
    primaryEstimand: "signed-one-contract-executable-horizon-pnl-cents-gross",
    primaryEstimandRationale:
      "Promotion-facing economic evidence is signed one-contract executable horizon P&L "
      + "in cents (gross), using M14.0a complement-book / executable semantics once bound. "
      + "Midpoint continuation is diagnostic only.",
    diagnosticEstimand: "signed-midpoint-continuation-cents",
    midpointAuthorization: "diagnostic-only",
    economicSupportRequiresExecutable: true,
    continuationSignConvention: {
      upwardPredictor:
        "Buy one YES at executable entry; exit at executable YES bid at horizon.",
      downwardPredictor:
        "Symmetric one-contract NO exposure using governed complement-book semantics.",
    },
  };
}

export function midpointOnlyCannotAuthorizeEconomicSupport(input: {
  midpointContinuationCents: number | null;
  executablePnlCents: number | null;
  executableObservable: boolean;
}): { economicSupportAuthorized: boolean; reason: string } {
  if (!input.executableObservable || input.executablePnlCents === null) {
    return {
      economicSupportAuthorized: false,
      reason: "Midpoint-only / non-executable evidence cannot authorize economic support.",
    };
  }
  return {
    economicSupportAuthorized: true,
    reason: "Executable one-contract observable P&L present.",
  };
}

export function coerceMissingResponseToZeroCents(_missing: true): never {
  void _missing;
  throw new MomentumEvidenceContractError(
    "Missing momentum response is unobservable and must not be treated as 0 cents.",
  );
}
