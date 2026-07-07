import type { HypothesisAtlasGroupId } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

export type NumericBucketDefinition = {
  bucketId: string;
  bucketLabel: string;
  minInclusive: number;
  maxExclusive: number | null;
};

export type ResearchDimensionId =
  | "probability"
  | "coarseProbability"
  | "coarseProbabilityAxis"
  | "timeRemaining"
  | "coarseTimeRemaining"
  | "moneyness"
  | "volatility"
  | "momentum15m";

/** Legacy multi-axis matcher labels used by composite bucket parsing. */
export type ResearchMatcherAxisId =
  | "probability"
  | "time"
  | "moneyness"
  | "volatility"
  | "momentum";

export type ResearchDimension = {
  id: ResearchDimensionId;
  label: string;
  getBuckets: () => readonly NumericBucketDefinition[];
  extractValue: (observation: MispricingObservation) => number | null;
  valueFitsBucket: (value: number, bucket: NumericBucketDefinition) => boolean;
};

export type ResearchAxisGroupAtlasSource =
  | {
      kind: "singleAxis";
      stateKey:
        | "probabilityBuckets"
        | "timeRemainingBuckets"
        | "moneynessBuckets"
        | "volatilityBuckets"
        | "momentumBuckets";
    }
  | {
      kind: "coarse";
      coarseBucketsKey:
        | "probabilityOnly"
        | "probabilityTime"
        | "probabilityRegime"
        | "probabilityMoneyness"
        | "moneynessTime"
        | "volatilityMoneyness"
        | "volatilityProbabilityTime"
        | "probabilityMomentum"
        | "momentumTime"
        | "momentumVolatility"
        | "probabilityMomentumTime";
      stateKey:
        | "coarseProbabilityOnly"
        | "coarseProbabilityTime"
        | "coarseProbabilityRegime"
        | "coarseProbabilityMoneyness"
        | "coarseMoneynessTime"
        | "coarseVolatilityMoneyness"
        | "coarseVolatilityProbabilityTime"
        | "coarseProbabilityMomentum"
        | "coarseMomentumTime"
        | "coarseMomentumVolatility"
        | "coarseProbabilityMomentumTime";
    };

export type ResearchAxisGroup = {
  groupId: HypothesisAtlasGroupId;
  dimensionIds: readonly ResearchDimensionId[];
  atlasSource: ResearchAxisGroupAtlasSource;
  matcherAxes: readonly ResearchMatcherAxisId[];
  requiresRegimeVolatility?: boolean;
};

export type ObservationDimensionContext = {
  observation: MispricingObservation;
  regimeVolatilityByMarket?: ReadonlyMap<string, "low" | "medium" | "high">;
};
