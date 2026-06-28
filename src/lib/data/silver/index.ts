export {
  SilverNormalizationError,
  SilverUnsupportedContentTypeError,
  SilverMalformedPayloadError,
  SilverInvalidBronzeRecordError,
} from "./errors";

export { normalizeMarketWindow } from "./normalizeMarketWindow";
export { normalizeKalshiCandle } from "./normalizeCandles";
export { normalizeSettlement } from "./normalizeSettlement";
export { normalizeRecord } from "./normalizeRecord";
export { SilverNormalizer } from "./SilverNormalizer";

export {
  SILVER_BRONZE_CONTENT_TYPE,
  type SilverBronzeContentType,
  type SilverNormalizationOutput,
  type SilverNormalizationResult,
} from "./shared";
