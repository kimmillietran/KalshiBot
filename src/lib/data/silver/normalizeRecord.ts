import type { RawHistoricalRecord } from "@/lib/data/types";

import { SilverUnsupportedContentTypeError } from "./errors";
import { normalizeKalshiCandle } from "./normalizeCandles";
import { normalizeMarketWindow } from "./normalizeMarketWindow";
import { normalizeSettlement } from "./normalizeSettlement";
import {
  parseBronzeRecord,
  SILVER_BRONZE_CONTENT_TYPE,
  type SilverNormalizationOutput,
} from "./shared";

/** Dispatches a bronze record to the appropriate silver normalizer. */
export function normalizeRecord(
  record: RawHistoricalRecord,
): SilverNormalizationOutput {
  const validated = parseBronzeRecord(record);

  switch (validated.contentType) {
    case SILVER_BRONZE_CONTENT_TYPE.MARKET:
      return normalizeMarketWindow(validated);
    case SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK:
      return normalizeKalshiCandle(validated);
    case SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT:
      return normalizeSettlement(validated);
    default:
      throw new SilverUnsupportedContentTypeError(
        validated.contentType,
        validated.recordId,
      );
  }
}
