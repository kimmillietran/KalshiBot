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

export const activeBtcMarketApiResponseSchema = z.object({
  market: activeBtcMarketSchema.nullable(),
  noMarket: z.boolean(),
  message: z.string().optional(),
});
