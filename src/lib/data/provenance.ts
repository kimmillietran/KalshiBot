import { z } from "zod";

import { collectionTimeSchema, observedAtSchema } from "./timestamps";

/** Upstream system that produced a bronze record. */
export const DataSource = {
  KALSHI_REST: "kalshi-rest",
  KALSHI_CANDLES: "kalshi-candles",
  BINANCE_SPOT: "binance-spot",
  COINBASE_SPOT: "coinbase-spot",
  MANUAL_IMPORT: "manual-import",
} as const;

export type DataSource = (typeof DataSource)[keyof typeof DataSource];

export const dataSourceSchema = z.enum([
  DataSource.KALSHI_REST,
  DataSource.KALSHI_CANDLES,
  DataSource.BINANCE_SPOT,
  DataSource.COINBASE_SPOT,
  DataSource.MANUAL_IMPORT,
]);

export const fetchProvenanceSchema = z.object({
  source: dataSourceSchema,
  collectionTime: collectionTimeSchema,
  observedAt: observedAtSchema,
  fetchId: z.string().min(1).optional(),
  apiVersion: z.string().min(1).optional(),
});

export type FetchProvenance = z.infer<typeof fetchProvenanceSchema>;
