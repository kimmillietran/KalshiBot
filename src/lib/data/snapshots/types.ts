import type { FetchProvenance } from "@/lib/data/provenance";
import type {
  BtcBar1m,
  HistoricalTicker,
  KalshiCandle1m,
  MarketWindow,
  SettlementRecord,
} from "@/lib/data/types";
import type { CollectionTime, EventTime, ObservedAt } from "@/lib/data/timestamps";

/** Silver record paired with bronze-derived fetch provenance. */
export type SilverRecordEnvelope<T> = {
  record: T;
  provenance: FetchProvenance;
};

/** Normalized Silver inputs for deterministic snapshot assembly. */
export type SnapshotAssemblyInput = {
  marketWindow: SilverRecordEnvelope<MarketWindow> | null | undefined;
  kalshiCandles:
    | readonly SilverRecordEnvelope<KalshiCandle1m>[]
    | null
    | undefined;
  btcBars: readonly SilverRecordEnvelope<BtcBar1m>[] | null | undefined;
  settlement?: SilverRecordEnvelope<SettlementRecord> | null | undefined;
};

/** Temporal anchor copied from the market window — no inferred timestamps. */
export type SnapshotTemporalMetadata = {
  eventTime: EventTime;
  collectionTime: CollectionTime;
  observedAt: ObservedAt;
};

/** Provenance trace for each snapshot component. */
export type HistoricalSnapshotProvenance = {
  marketWindow: FetchProvenance;
  kalshiCandles: readonly FetchProvenance[];
  btcBars: readonly FetchProvenance[];
  settlement: FetchProvenance | null;
};

/**
 * Immutable historical trading snapshot mirroring the runtime `EvaluationSnapshot`
 * shape using Silver-layer records. Consumed by replay later — no indicators or EV.
 */
export type HistoricalTradingSnapshot = {
  ticker: HistoricalTicker;
  marketWindow: MarketWindow;
  kalshiCandles: readonly KalshiCandle1m[];
  btcBars: readonly BtcBar1m[];
  settlement: SettlementRecord | null;
  temporal: SnapshotTemporalMetadata;
  provenance: HistoricalSnapshotProvenance;
};
