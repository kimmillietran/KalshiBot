import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import {
  fnv1a32,
  hashConfig,
  stableStringify,
} from "@/lib/trading/config/hashConfig";
import type { EngineConfig } from "@/types/domain/trading";

describe("stableStringify", () => {
  it("sorts object keys for stable output", () => {
    const a = stableStringify({ z: 1, a: 2 });
    const b = stableStringify({ a: 2, z: 1 });
    expect(a).toBe(b);
  });

  it("omits undefined object properties instead of emitting invalid JSON", () => {
    const serialized = stableStringify({
      end_period_ts: 1_735_670_400,
      price: undefined,
      volume: "12.00",
    });

    expect(serialized).not.toContain("undefined");
    expect(JSON.parse(serialized)).toEqual({
      end_period_ts: 1_735_670_400,
      volume: "12.00",
    });
  });
});

describe("fnv1a32", () => {
  it("returns a fixed-width hex digest", () => {
    expect(fnv1a32("test")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("hashConfig", () => {
  it("is stable for the same config", () => {
    const hashA = hashConfig(DEFAULT_ENGINE_CONFIG);
    const hashB = hashConfig(DEFAULT_ENGINE_CONFIG);
    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^cfg-v1-[0-9a-f]{8}$/);
  });

  it("changes when config values change", () => {
    const base = hashConfig(DEFAULT_ENGINE_CONFIG);
    const tweaked: EngineConfig = {
      ...DEFAULT_ENGINE_CONFIG,
      minEdgePercent: DEFAULT_ENGINE_CONFIG.minEdgePercent + 1,
    };
    expect(hashConfig(tweaked)).not.toBe(base);
  });

  it("is insensitive to property insertion order", () => {
    const ordered: EngineConfig = {
      enabled: true,
      minEdgePercent: 5,
      minLiquidityQuality: "Fair",
      maxSpreadPercent: 15,
      minimumTimeRemaining: 60_000,
      minimumCandles: 2,
    };
    const reordered: EngineConfig = {
      minimumCandles: 2,
      maxSpreadPercent: 15,
      minimumTimeRemaining: 60_000,
      minLiquidityQuality: "Fair",
      enabled: true,
      minEdgePercent: 5,
    };
    expect(hashConfig(ordered)).toBe(hashConfig(reordered));
  });
});
