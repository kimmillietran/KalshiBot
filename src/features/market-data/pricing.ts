import type { ContractOdds } from "@/features/mock-data/types";

import type { KalshiMarket } from "./schemas";
import type {
  ContractSidePricing,
  LiquidityQuality,
  MarketContractPricing,
} from "./types";

/** Parse Kalshi dollar string (e.g. "0.1500") to whole cents (15). */
export function parseKalshiDollarToCents(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}

/** Mid-price in cents when both bid and ask are available. */
export function computeMidCents(
  bidCents: number | null,
  askCents: number | null,
): number | null {
  if (bidCents == null || askCents == null) return null;
  return Math.round((bidCents + askCents) / 2);
}

/** Spread in cents when both bid and ask are available. */
export function computeSpreadCents(
  bidCents: number | null,
  askCents: number | null,
): number | null {
  if (bidCents == null || askCents == null) return null;
  return Math.max(askCents - bidCents, 0);
}

function resolveDisplayCents(side: ContractSidePricing): number {
  return (
    side.lastCents ??
    side.midCents ??
    side.askCents ??
    side.bidCents ??
    0
  );
}

/** Format Kalshi volume_fp / liquidity_dollars for display. */
export function formatContractVolume(
  volumeFp: string | undefined,
  liquidityDollars: string | undefined,
): string {
  const volume = volumeFp ? Number.parseFloat(volumeFp) : Number.NaN;
  if (!Number.isNaN(volume) && volume > 0) {
    if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
    if (volume >= 1_000) return `$${Math.round(volume / 1_000)}K`;
    return `$${Math.round(volume)}`;
  }

  const liquidity = liquidityDollars
    ? Number.parseFloat(liquidityDollars)
    : Number.NaN;
  if (!Number.isNaN(liquidity) && liquidity > 0) {
    if (liquidity >= 1_000_000) return `$${(liquidity / 1_000_000).toFixed(1)}M`;
    if (liquidity >= 1_000) return `$${Math.round(liquidity / 1_000)}K`;
    return `$${Math.round(liquidity)}`;
  }

  return "—";
}

/** Heuristic liquidity label from dollar depth and YES spread. */
export function assessLiquidityQuality(
  liquidityDollars: string | undefined,
  yesSpreadCents: number | null,
): LiquidityQuality {
  const liquidity = liquidityDollars
    ? Number.parseFloat(liquidityDollars)
    : Number.NaN;
  const spread = yesSpreadCents ?? 99;

  if (Number.isNaN(liquidity) || liquidity <= 0) {
    return spread <= 2 ? "Fair" : "Poor";
  }

  if (liquidity >= 100_000 && spread <= 2) return "Excellent";
  if (liquidity >= 25_000 && spread <= 3) return "Good";
  if (liquidity >= 5_000 && spread <= 5) return "Fair";
  return "Poor";
}

function mapSidePricing(
  bidDollars: string | undefined,
  askDollars: string | undefined,
  lastDollars?: string,
): ContractSidePricing {
  const bidCents = parseKalshiDollarToCents(bidDollars);
  const askCents = parseKalshiDollarToCents(askDollars);
  const lastCents = parseKalshiDollarToCents(lastDollars);

  return {
    bidCents,
    askCents,
    midCents: computeMidCents(bidCents, askCents),
    lastCents,
    spreadCents: computeSpreadCents(bidCents, askCents),
  };
}

/** Normalize Kalshi market list fields into domain contract pricing. */
export function mapKalshiMarketToContractPricing(
  market: KalshiMarket,
  now: Date = new Date(),
): MarketContractPricing {
  const yes = mapSidePricing(
    market.yes_bid_dollars,
    market.yes_ask_dollars,
    market.last_price_dollars,
  );
  const no = mapSidePricing(market.no_bid_dollars, market.no_ask_dollars);

  return {
    yes,
    no,
    volumeLabel: formatContractVolume(market.volume_fp, market.liquidity_dollars),
    liquidityQuality: assessLiquidityQuality(
      market.liquidity_dollars,
      yes.spreadCents,
    ),
    updatedAt: now.toISOString(),
    isFallback: false,
    source: "kalshi",
  };
}

/** Map YES/NO domain pricing to dashboard UP/DOWN contract cards. */
export function mapPricingToOddsViews(pricing: MarketContractPricing): {
  up: ContractOdds;
  down: ContractOdds;
} {
  const upPrice = resolveDisplayCents(pricing.yes);
  const downPrice = resolveDisplayCents(pricing.no);

  return {
    up: {
      label: "UP",
      price: upPrice,
      bid: pricing.yes.bidCents ?? upPrice,
      ask: pricing.yes.askCents ?? upPrice,
      spread: pricing.yes.spreadCents ?? 0,
      volume: pricing.volumeLabel,
      impliedProbability: upPrice,
    },
    down: {
      label: "DOWN",
      price: downPrice,
      bid: pricing.no.bidCents ?? downPrice,
      ask: pricing.no.askCents ?? downPrice,
      spread: pricing.no.spreadCents ?? 0,
      volume: pricing.volumeLabel,
      impliedProbability: downPrice,
    },
  };
}
