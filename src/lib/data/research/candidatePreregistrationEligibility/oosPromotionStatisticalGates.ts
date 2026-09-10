import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  OosPowerCorrectionEntry,
  OosStatisticalVerdict,
} from "@/lib/data/research/oosPowerCorrection/oosPowerCorrectionTypes";

import type { ProspectiveStatisticalPromotionContract } from "./prospectiveStatisticalPromotionContract";
import { validateProspectiveStatisticalPromotionContract } from "./prospectiveStatisticalPromotionContract";

export type OosDiscoveryIsolationStatus =
  | "train-only-discovery"
  | "discovery-saw-full-corpus"
  | "not-proven";

export type OosDiscoveryIsolation = {
  status: OosDiscoveryIsolationStatus;
  reason: string;
};

export type OosPromotionStatisticalGates = {
  oosFinalStatisticalVerdict: OosStatisticalVerdict | null;
  oosPassesCorrected: boolean | null;
  oosClearsMde: boolean | null;
  oosIsUnderpowered: boolean | null;
  oosQValue: number | null;
  oosUncorrectedPValue: number | null;
  oosCorrectionMethod: string | null;
  oosNumberOfHypothesesTested: number | null;
  oosAlpha: number | null;
  oosTargetPower: number | null;
  oosMinimumDetectableEffect: number | null;
  oosObservedEffect: number | null;
  oosEffectiveSampleSize: number | null;
  oosIndependentMarketCount: number | null;
  oosMarketDayCount: number | null;
  discoveryIsolationStatus: OosDiscoveryIsolationStatus | null;
  prospectiveDesignValid: boolean | null;
  prospectiveDesignContentHash: string | null;
  oosEntryContentHash: string | null;
};

/** Semantic hash of the OOS entry fields that authorize promotion. */
export function hashOosPromotionEntryContent(
  entry: Pick<
    OosPowerCorrectionEntry,
    | "hypothesisId"
    | "uncorrectedPValue"
    | "correctedPValue"
    | "qValue"
    | "correctionMethod"
    | "passesUncorrected"
    | "passesCorrected"
    | "clearsMde"
    | "isUnderpowered"
    | "finalStatisticalVerdict"
  >,
): string {
  return fnv1a32(
    stableStringify({
      hypothesisId: entry.hypothesisId,
      uncorrectedPValue: entry.uncorrectedPValue,
      correctedPValue: entry.correctedPValue,
      qValue: entry.qValue,
      correctionMethod: entry.correctionMethod,
      passesUncorrected: entry.passesUncorrected,
      passesCorrected: entry.passesCorrected,
      clearsMde: entry.clearsMde,
      isUnderpowered: entry.isUnderpowered,
      finalStatisticalVerdict: entry.finalStatisticalVerdict,
    }),
  );
}

export function buildOosPromotionStatisticalGates(input: {
  entry: OosPowerCorrectionEntry | null;
  discoveryIsolation: OosDiscoveryIsolation | null;
  prospectiveDesign: unknown;
  testedHypothesisCount: number | null;
  alpha: number | null;
  targetPower: number | null;
}): OosPromotionStatisticalGates {
  const design = validateProspectiveStatisticalPromotionContract(input.prospectiveDesign);
  const entry = input.entry;
  if (!entry) {
    return {
      oosFinalStatisticalVerdict: null,
      oosPassesCorrected: null,
      oosClearsMde: null,
      oosIsUnderpowered: null,
      oosQValue: null,
      oosUncorrectedPValue: null,
      oosCorrectionMethod: null,
      oosNumberOfHypothesesTested: input.testedHypothesisCount,
      oosAlpha: input.alpha,
      oosTargetPower: input.targetPower,
      oosMinimumDetectableEffect: null,
      oosObservedEffect: null,
      oosEffectiveSampleSize: null,
      oosIndependentMarketCount: null,
      oosMarketDayCount: null,
      discoveryIsolationStatus: input.discoveryIsolation?.status ?? null,
      prospectiveDesignValid: design.valid,
      prospectiveDesignContentHash: design.contractContentHash,
      oosEntryContentHash: null,
    };
  }

  const holdout = entry.splitMetrics.holdout;
  return {
    oosFinalStatisticalVerdict: entry.finalStatisticalVerdict,
    oosPassesCorrected: entry.passesCorrected,
    oosClearsMde: entry.clearsMde,
    oosIsUnderpowered: entry.isUnderpowered,
    oosQValue: entry.qValue,
    oosUncorrectedPValue: entry.uncorrectedPValue,
    oosCorrectionMethod: entry.correctionMethod,
    oosNumberOfHypothesesTested: input.testedHypothesisCount,
    oosAlpha: input.alpha,
    oosTargetPower: input.targetPower,
    oosMinimumDetectableEffect: holdout?.minimumDetectableEffect ?? null,
    oosObservedEffect: holdout?.observedNetEdge ?? null,
    oosEffectiveSampleSize: holdout?.effectiveSampleSizeEstimate ?? null,
    oosIndependentMarketCount: holdout?.independentMarketCount ?? null,
    oosMarketDayCount: holdout?.marketDayCount ?? null,
    discoveryIsolationStatus: input.discoveryIsolation?.status ?? null,
    prospectiveDesignValid: design.valid,
    prospectiveDesignContentHash: design.contractContentHash,
    oosEntryContentHash: hashOosPromotionEntryContent(entry),
  };
}

export function statisticalGatesAuthorizePromotion(
  gates: OosPromotionStatisticalGates | null | undefined,
): boolean {
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

export type { ProspectiveStatisticalPromotionContract };
