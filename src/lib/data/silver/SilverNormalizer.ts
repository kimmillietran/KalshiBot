import type { RawHistoricalRecord } from "@/lib/data/types";

import { normalizeRecord } from "./normalizeRecord";
import type { SilverNormalizationOutput } from "./shared";

/** Bronze → Silver normalization facade. */
export class SilverNormalizer {
  normalize(record: RawHistoricalRecord): SilverNormalizationOutput {
    return normalizeRecord(record);
  }
}
