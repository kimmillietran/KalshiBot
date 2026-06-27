import type { EngineConfig } from "@/types/domain/trading";

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  enabled: true,
  minEdgePercent: 5,
  minLiquidityQuality: "Fair",
  maxSpreadPercent: 15,
  minimumTimeRemaining: 60_000,
  minimumCandles: 2,
};
