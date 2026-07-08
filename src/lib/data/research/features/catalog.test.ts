import { describe, expect, it } from "vitest";

import { RESEARCH_DIMENSIONS } from "@/lib/data/research/dimensions";

import { UNIFIED_FEATURE_CATALOG } from "./catalog";
import {
  assertUnifiedFeatureCatalogIntegrity,
  buildResearchDimensionFeatureMap,
  getUnifiedFeatureById,
  getUnifiedFeatureForResearchDimension,
  listUnifiedFeatures,
  requireUnifiedFeatureById,
} from "./registry";

describe("unified feature catalog", () => {
  it("lists features in deterministic id order", () => {
    const ids = listUnifiedFeatures().map((entry) => entry.id);
    expect(ids).toEqual([...ids].sort((left, right) => left.localeCompare(right)));
    expect(ids[0]).toBe("annualizedRealizedVolatility");
  });

  it("has no duplicate feature ids", () => {
    const ids = UNIFIED_FEATURE_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes required metadata on every entry", () => {
    for (const entry of UNIFIED_FEATURE_CATALOG) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(entry.units.length).toBeGreaterThan(0);
      expect(entry.canonicalSource.path.length).toBeGreaterThan(0);
      expect(entry.dependencies).toBeDefined();
    }
  });

  it("maps every M10 registry dimension to a catalog feature", () => {
    const dimensionMap = buildResearchDimensionFeatureMap();

    for (const dimension of RESEARCH_DIMENSIONS) {
      expect(dimensionMap.has(dimension.id)).toBe(true);
      expect(getUnifiedFeatureForResearchDimension(dimension.id)).not.toBeNull();
    }
  });

  it("resolves canonical metadata by feature id", () => {
    const entry = requireUnifiedFeatureById("momentum15m");
    expect(entry.displayName).toBe("15-minute momentum");
    expect(entry.onMispricingObservation).toBe(true);
    expect(entry.linkedResearchDimensionIds).toEqual(["momentum15m"]);
    expect(getUnifiedFeatureById("missing-feature")).toBeNull();
  });

  it("passes integrity assertion", () => {
    const report = assertUnifiedFeatureCatalogIntegrity();
    expect(report.featureCount).toBe(UNIFIED_FEATURE_CATALOG.length);
    expect(report.unmappedResearchDimensions).toEqual([]);
  });

  it("includes minimum required research and trading features", () => {
    const requiredIds = [
      "predictedProbability",
      "moneynessPercent",
      "timeRemainingMs",
      "annualizedRealizedVolatility",
      "momentum15m",
      "hourUtc",
      "dayOfWeekUtc",
      "sessionBucket",
      "weekendFlag",
      "trendStrength",
      "rollingVolatility",
      "priceVelocity",
      "priceAcceleration",
      "spreadPercent",
      "liquidityScore",
      "volumeBucket",
      "volatilityRegime",
      "trendRegime",
      "marketState",
      "impliedVolatility",
      "volPremium",
    ];

    for (const featureId of requiredIds) {
      expect(getUnifiedFeatureById(featureId)).not.toBeNull();
    }
  });
});
