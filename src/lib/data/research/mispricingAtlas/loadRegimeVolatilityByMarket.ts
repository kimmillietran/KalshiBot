import { z } from "zod";

import type { MispricingAtlasIo, RegimeVolatilityByMarketKey } from "./mispricingAtlasTypes";

const regimeMarketEntrySchema = z.object({
  joinKey: z.string().trim().min(1),
  tags: z.object({
    volatility: z.enum(["low", "medium", "high"]).nullable(),
  }),
});

const regimeTagsReportSchema = z.object({
  markets: z.array(regimeMarketEntrySchema),
});

/** Loads volatility regime tags keyed by strategy/series/market join key. */
export function loadRegimeVolatilityByMarket(
  io: MispricingAtlasIo,
  regimeTagsPath: string,
): RegimeVolatilityByMarketKey {
  if (!io.fileExists(regimeTagsPath)) {
    return new Map();
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(io.readFile(regimeTagsPath));
  } catch {
    return new Map();
  }

  const result = regimeTagsReportSchema.safeParse(parsed);
  if (!result.success) {
    return new Map();
  }

  const regimeVolatilityByMarket: RegimeVolatilityByMarketKey = new Map();

  for (const market of result.data.markets) {
    if (market.tags.volatility === null) {
      continue;
    }

    regimeVolatilityByMarket.set(market.joinKey, market.tags.volatility);
  }

  return regimeVolatilityByMarket;
}
