import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { DEFAULT_POSITION_SIZING_CONFIG } from "@/lib/trading/position-sizing/config";

export const TRADING_SETTINGS_MODEL_VERSION = "5.10.0";

/** Documented defaults sourced from existing engine / sizing config. */
export const DEFAULT_TRADING_SETTINGS = {
  minEdgePercent: DEFAULT_ENGINE_CONFIG.minEdgePercent,
  maxSpreadPercent: DEFAULT_ENGINE_CONFIG.maxSpreadPercent,
  kellyFraction: DEFAULT_POSITION_SIZING_CONFIG.kellyFraction,
  maxPositionFraction: DEFAULT_POSITION_SIZING_CONFIG.maxFraction,
} as const;

export const TRADING_SETTINGS_BOUNDS = {
  minEdgePercent: { min: 0, max: 100 },
  maxSpreadPercent: { min: 0, max: 100 },
  kellyFraction: { minExclusive: 0, max: 1 },
  maxPositionFraction: { minExclusive: 0, max: 1 },
} as const;
