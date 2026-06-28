import { z } from "zod";

const orderbookLevelSchema = z.tuple([z.string(), z.string()]);

export const kalshiRestOrderbookSchema = z.object({
  orderbook_fp: z.object({
    yes_dollars: z.array(orderbookLevelSchema),
    no_dollars: z.array(orderbookLevelSchema),
  }),
});

export const kalshiOrderbookSnapshotMessageSchema = z.object({
  type: z.literal("orderbook_snapshot"),
  sid: z.number().int().positive(),
  seq: z.number().int().positive(),
  msg: z.object({
    market_ticker: z.string().min(1),
    market_id: z.string().min(1),
    yes_dollars_fp: z.array(orderbookLevelSchema).optional(),
    no_dollars_fp: z.array(orderbookLevelSchema).optional(),
  }),
});

export const kalshiOrderbookDeltaMessageSchema = z.object({
  type: z.literal("orderbook_delta"),
  sid: z.number().int().positive(),
  seq: z.number().int().positive(),
  msg: z.object({
    market_ticker: z.string().min(1),
    market_id: z.string().min(1),
    price_dollars: z.string().min(1),
    delta_fp: z.string().min(1),
    side: z.enum(["yes", "no"]),
    ts_ms: z.number().int().optional(),
  }),
});

export type KalshiRestOrderbookResponse = z.infer<typeof kalshiRestOrderbookSchema>;
