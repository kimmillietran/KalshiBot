import type { ResearchDimensionId } from "@/lib/data/research/dimensions/types";

export const FEATURE_SOURCE_LAYERS = [
  "trading",
  "research",
  "aggregate",
  "strategy",
  "regime",
] as const;

export type FeatureSourceLayer = (typeof FEATURE_SOURCE_LAYERS)[number];

export const FEATURE_OUTPUT_TYPES = [
  "number",
  "percent",
  "probability",
  "milliseconds",
  "boolean",
  "enum",
  "object",
  "score",
] as const;

export type FeatureOutputType = (typeof FEATURE_OUTPUT_TYPES)[number];

export type FeatureLookbackMetadata = {
  /** Candle/bar count when the feature uses OHLC history. */
  bars?: number;
  /** Wall-clock lookback in milliseconds when applicable. */
  ms?: number;
  /** Human-readable note when lookback is dynamic or configurable. */
  description?: string;
};

export type FeatureCanonicalSource =
  | {
      kind: "function";
      /** Module path or symbol reference for the canonical computation. */
      path: string;
    }
  | {
      kind: "field";
      /** TypeScript field path on a domain object (e.g. MispricingObservation). */
      path: string;
    }
  | {
      kind: "derived";
      /** Extractor or study step that derives the value from other inputs. */
      path: string;
    };

export type UnifiedFeatureCatalogEntry = {
  id: string;
  displayName: string;
  sourceLayer: FeatureSourceLayer;
  canonicalSource: FeatureCanonicalSource;
  lookback: FeatureLookbackMetadata | null;
  units: string;
  outputType: FeatureOutputType;
  /** True when the raw value is stored on MispricingObservation at atlas parse time. */
  onMispricingObservation: boolean;
  /** MispricingObservation field when `onMispricingObservation` is true. */
  mispricingObservationField?: keyof import("@/lib/data/research/mispricingAtlas/mispricingAtlasTypes").MispricingObservation;
  /** True when the feature may back a research dimension registry entry. */
  researchDimensionEligible: boolean;
  /** Linked M10 registry dimension ids (bucket views of the same underlying signal). */
  linkedResearchDimensionIds?: readonly ResearchDimensionId[];
  /** Other catalog feature ids required upstream. */
  dependencies: readonly string[];
  description?: string;
  /** False for catalogued but not-yet-implemented indicators (e.g. EMA). Defaults to true. */
  implemented?: boolean;
  /** Optional duplication group for explorer diagnostics. */
  duplicationGroupId?: string | null;
};

export type UnifiedFeatureCatalog = {
  version: string;
  features: readonly UnifiedFeatureCatalogEntry[];
};
