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
  | "momentum15m"
  | "hourUtc"
  | "dayOfWeekUtc"
  | "sessionBucket"
  | "weekendFlag";

/** Legacy and temporal matcher labels used by composite bucket parsing. */
export type ResearchMatcherAxisId =
  | "probability"
  | "time"
  | "moneyness"
  | "volatility"
  | "momentum"
  | "hour"
  | "dayOfWeek"
  | "session"
  | "weekend";

export type ResearchDimension = {
  id: ResearchDimensionId;
  label: string;
  getBuckets: () => readonly NumericBucketDefinition[];
  extractValue: (observation: MispricingObservation) => number | null;
  valueFitsBucket: (value: number, bucket: NumericBucketDefinition) => boolean;
};

export type SingleAxisStateKey =
  | "probabilityBuckets"
  | "timeRemainingBuckets"
  | "moneynessBuckets"
  | "volatilityBuckets"
  | "momentumBuckets"
  | "hourUtcBuckets"
  | "dayOfWeekUtcBuckets"
  | "sessionBucketBuckets"
  | "weekendFlagBuckets";

export type CoarseAxisStateKey =
  | "coarseProbabilityOnly"
  | "coarseProbabilityTime"
  | "coarseProbabilityRegime"
  | "coarseProbabilityMoneyness"
  | "coarseMoneynessTime"
  | "coarseVolatilityMoneyness"
  | "coarseVolatilityProbabilityTime"
  | "coarseProbabilityMomentumTime"
  | "coarseProbabilityMomentum"
  | "coarseMomentumVolatility"
  | "coarseMomentumTime"
  | "coarseProbabilityHour"
  | "coarseProbabilityWeekday"
  | "coarseMomentumHour"
  | "coarseTimeRemainingHour";

export type CoarseBucketsKey =
  | "probabilityOnly"
  | "probabilityTime"
  | "probabilityRegime"
  | "probabilityMoneyness"
  | "moneynessTime"
  | "volatilityMoneyness"
  | "volatilityProbabilityTime"
  | "probabilityMomentumTime"
  | "probabilityMomentum"
  | "momentumVolatility"
  | "momentumTime"
  | "probabilityHour"
  | "probabilityWeekday"
  | "momentumHour"
  | "timeRemainingHour";

export type ResearchAxisGroupAtlasSource =
  | {
      kind: "singleAxis";
      stateKey: SingleAxisStateKey;
    }
  | {
      kind: "coarse";
      coarseBucketsKey: CoarseBucketsKey;
      stateKey: CoarseAxisStateKey;
    }
  | {
      kind: "probabilityRegime";
      coarseBucketsKey: "probabilityRegime";
      stateKey: "coarseProbabilityRegime";
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
