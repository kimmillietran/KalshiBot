import type { z } from "zod";

import type { DataQualityFlag } from "./schemas";
import type {
  btcBar1mSchema,
  historicalTickerSchema,
  kalshiCandle1mSchema,
  marketWindowSchema,
  rawHistoricalRecordSchema,
  seriesTickerSchema,
  settlementRecordSchema,
} from "./schemas";
import type { CollectionTime, EventTime, ObservedAt } from "./timestamps";
import type { DatasetVersion } from "./versioning";

export type HistoricalTicker = z.infer<typeof historicalTickerSchema>;
export type SeriesTicker = z.infer<typeof seriesTickerSchema>;

export type { CollectionTime, EventTime, ObservedAt, DatasetVersion, DataQualityFlag };

export type RawHistoricalRecord = z.infer<typeof rawHistoricalRecordSchema>;
export type MarketWindow = z.infer<typeof marketWindowSchema>;
export type KalshiCandle1m = z.infer<typeof kalshiCandle1mSchema>;
export type BtcBar1m = z.infer<typeof btcBar1mSchema>;
export type SettlementRecord = z.infer<typeof settlementRecordSchema>;
