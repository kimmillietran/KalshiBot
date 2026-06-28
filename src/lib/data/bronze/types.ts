import type { DataSource } from "@/lib/data/provenance";
import type {
  CollectionTime,
  EventTime,
  RawHistoricalRecord,
} from "@/lib/data/types";

export type BronzeRecordKey = string;

export type BronzeRecordFilter = {
  recordId?: string;
  ticker?: string;
  source?: DataSource;
  eventTimeFrom?: EventTime;
  eventTimeTo?: EventTime;
  collectionTimeFrom?: CollectionTime;
  collectionTimeTo?: CollectionTime;
};

export type BronzeStore = {
  append(record: RawHistoricalRecord): Promise<void>;
  get(recordId: string): Promise<RawHistoricalRecord | null>;
  list(filter?: BronzeRecordFilter): Promise<readonly RawHistoricalRecord[]>;
};

export class BronzeDuplicateConflictError extends Error {
  readonly recordId: string;

  constructor(recordId: string) {
    super(`Bronze record conflict for recordId "${recordId}"`);
    this.name = "BronzeDuplicateConflictError";
    this.recordId = recordId;
  }
}
