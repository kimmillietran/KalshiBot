import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import type { ResolvedTradingSettings } from "@/lib/trading/settings";
import type { EngineConfig } from "@/types/domain/trading";

/** Maps normalized settings into the engine config shape (no validation). */
export function buildEngineConfigFromSettings(
  settings: ResolvedTradingSettings,
): EngineConfig {
  return {
    ...DEFAULT_ENGINE_CONFIG,
    minEdgePercent: settings.minEdgePercent,
    maxSpreadPercent: settings.maxSpreadPercent,
    kellyFraction: settings.kellyFraction,
    maxPositionFraction: settings.maxPositionFraction,
    ...(settings.bankrollDollars !== null
      ? { bankrollDollars: settings.bankrollDollars }
      : {}),
  };
}
