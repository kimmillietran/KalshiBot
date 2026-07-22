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
  /**
   * Optional client command id. Present when the server delivers a
   * get_snapshot response as an orderbook_snapshot (no separate type:"ok").
   * Command ids start at ORDERBOOK_SUBSCRIPTION_ID_START (1).
   */
  id: z.number().int().positive().optional(),
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

/**
 * Official Kalshi WS control responses (docs.kalshi.com/websockets):
 * subscribe ack `{id, type:"subscribed", msg:{channel, sid}}`,
 * update ack `{id, sid, seq, type:"ok", msg:{market_tickers}}`,
 * unsubscribe ack `{id, sid, seq, type:"unsubscribed"}`,
 * error `{id, type:"error", msg:{code, msg}}`.
 */
export const kalshiSubscribedResponseSchema = z.object({
  id: z.number().int().optional(),
  type: z.literal("subscribed"),
  msg: z.object({
    channel: z.string().min(1),
    sid: z.number().int().positive(),
    market_tickers: z.array(z.string()).optional(),
  }),
});

export const kalshiOkResponseSchema = z.object({
  id: z.number().int().optional(),
  sid: z.number().int().positive().optional(),
  seq: z.number().int().optional(),
  type: z.literal("ok"),
  msg: z.unknown().optional(),
});

export const kalshiUnsubscribedResponseSchema = z.object({
  id: z.number().int().optional(),
  sid: z.number().int().positive().optional(),
  seq: z.number().int().optional(),
  type: z.literal("unsubscribed"),
  msg: z.unknown().optional(),
});

export const kalshiWsErrorResponseSchema = z.object({
  id: z.number().int().optional(),
  sid: z.number().int().optional(),
  type: z.literal("error"),
  msg: z.object({
    code: z.number().int().optional(),
    msg: z.string(),
  }),
});

export type KalshiSubscribedResponse = z.infer<typeof kalshiSubscribedResponseSchema>;
export type KalshiOkResponse = z.infer<typeof kalshiOkResponseSchema>;
export type KalshiUnsubscribedResponse = z.infer<typeof kalshiUnsubscribedResponseSchema>;
export type KalshiWsErrorResponse = z.infer<typeof kalshiWsErrorResponseSchema>;

export type KalshiRestOrderbookResponse = z.infer<typeof kalshiRestOrderbookSchema>;
