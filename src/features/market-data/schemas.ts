import { z } from "zod";

import { MarketLifecycle } from "./types";

/** Minimal Kalshi market fields required for discovery and normalization. */
export const kalshiMarketSchema = z.object({
  ticker: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  open_time: z.string().min(1),
  close_time: z.string().min(1),
  floor_strike: z.number().nullable().optional(),
  event_ticker: z.string().optional(),
  yes_sub_title: z.string().optional(),
  yes_bid_dollars: z.string().optional(),
  yes_ask_dollars: z.string().optional(),
  no_bid_dollars: z.string().optional(),
  no_ask_dollars: z.string().optional(),
  last_price_dollars: z.string().optional(),
  volume_fp: z.string().optional(),
  liquidity_dollars: z.string().optional(),
});

export const kalshiMarketsResponseSchema = z.object({
  markets: z.array(kalshiMarketSchema),
  cursor: z.string().optional(),
});

export type KalshiMarket = z.infer<typeof kalshiMarketSchema>;
export type KalshiMarketsResponse = z.infer<typeof kalshiMarketsResponseSchema>;

export const activeBtcMarketSchema = z.object({
  ticker: z.string(),
  title: z.string(),
  targetPrice: z.number().nullable(),
  lifecycle: z.nativeEnum(MarketLifecycle),
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
  timeRemainingMs: z.number(),
  updatedAt: z.string(),
  source: z.literal("kalshi"),
  isFallback: z.boolean(),
});

export const contractSidePricingSchema = z.object({
  bidCents: z.number().nullable(),
  askCents: z.number().nullable(),
  midCents: z.number().nullable(),
  lastCents: z.number().nullable(),
  spreadCents: z.number().nullable(),
});

export const marketContractPricingSchema = z.object({
  yes: contractSidePricingSchema,
  no: contractSidePricingSchema,
  volumeLabel: z.string(),
  liquidityQuality: z.enum(["Poor", "Fair", "Good", "Excellent"]),
  updatedAt: z.string(),
  isFallback: z.boolean(),
  source: z.literal("kalshi"),
});

export const activeBtcMarketApiResponseSchema = z.object({
  market: activeBtcMarketSchema.nullable(),
  pricing: marketContractPricingSchema.nullable(),
  noMarket: z.boolean(),
  message: z.string().optional(),
});
