import type {
  HistoricalSnapshotProvenance,
  HistoricalTradingSnapshot,
  SnapshotTemporalMetadata,
} from "@/lib/data/snapshots/types";
import type { HistoricalTicker } from "@/lib/data/types";
import type { EvaluationSnapshot } from "@/types/domain/trading";

/** BTC feed semantics when adapting immutable historical bars for engine input. */
export const REPLAY_BTC_FEED_STATUS = "live" as const;
export const REPLAY_BTC_PROVIDER_SOURCE = "upstream" as const;

export type HistoricalReplayAdaptation = {
  engineInput: EvaluationSnapshot;
  temporal: SnapshotTemporalMetadata;
  provenance: HistoricalSnapshotProvenance;
  sourceTicker: HistoricalTicker;
  sourceSnapshot: HistoricalTradingSnapshot;
};
