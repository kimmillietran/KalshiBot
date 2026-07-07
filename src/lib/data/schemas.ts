import { z } from "zod";

import { fetchProvenanceSchema } from "./provenance";
import { eventTimeSchema, temporalFieldsSchema } from "./timestamps";
import { DATA_CONTRACT_VERSION } from "./versioning";

export const DataQualityFlag = {
  MISSING_BID_ASK: "missing-bid-ask",
  STALE_QUOTE: "stale-quote",
  PARTIAL_WINDOW: "partial-window",
  INTERPOLATED: "interpolated",
  SOURCE_DEGRADED: "source-degraded",
  DERIVED_EXPIRATION_VALUE: "derived-expiration-value",
} as const;

export type DataQualityFlag =
  (typeof DataQualityFlag)[keyof typeof DataQualityFlag];

export const dataQualityFlagSchema = z.enum([
  DataQualityFlag.MISSING_BID_ASK,
  DataQualityFlag.STALE_QUOTE,
  DataQualityFlag.PARTIAL_WINDOW,
  DataQualityFlag.INTERPOLATED,
  DataQualityFlag.SOURCE_DEGRADED,
  DataQualityFlag.DERIVED_EXPIRATION_VALUE,
]);

export const datasetVersionSchema = z.literal(DATA_CONTRACT_VERSION);

export const historicalTickerSchema = z
  .string()
  .trim()
  .min(1, "Historical ticker is required");

export const seriesTickerSchema = z
  .string()
  .trim()
  .min(1, "Series ticker is required");

const finiteUsdPriceSchema = z
  .number()
  .finite("Price must be finite")
  .positive("Price must be positive");

const contractPriceCentsSchema = z
  .number()
  .int("Price cents must be an integer")
  .min(0, "Price cents must be at least 0")
  .max(100, "Price cents must be at most 100")
  .finite("Price cents must be finite");

function validateBidAskSpread(
  bidCents: number,
  askCents: number,
  side: "yes" | "no",
): { code: "custom"; message: string; path: [string] } | null {
  if (bidCents > askCents) {
    return {
      code: "custom",
      message: `${side} bid must be less than or equal to ask`,
      path: [`${side}BidCents`],
    };
  }
  return null;
}

function validateOhlcBar(bar: {
  openUsd: number;
  highUsd: number;
  lowUsd: number;
  closeUsd: number;
}): { code: "custom"; message: string; path: [string] } | null {
  const { openUsd, highUsd, lowUsd, closeUsd } = bar;
  if (highUsd < lowUsd) {
    return {
      code: "custom",
      message: "highUsd must be greater than or equal to lowUsd",
      path: ["highUsd"],
    };
  }
  if (highUsd < openUsd || highUsd < closeUsd) {
    return {
      code: "custom",
      message: "highUsd must be greater than or equal to openUsd and closeUsd",
      path: ["highUsd"],
    };
  }
  if (lowUsd > openUsd || lowUsd > closeUsd) {
    return {
      code: "custom",
      message: "lowUsd must be less than or equal to openUsd and closeUsd",
      path: ["lowUsd"],
    };
  }
  return null;
}

const qualityFlagsField = z.array(dataQualityFlagSchema);

/** Bronze-layer immutable fetch payload with explicit temporal provenance. */
export const rawHistoricalRecordSchema = temporalFieldsSchema.extend({
  recordId: z.string().trim().min(1, "Record id is required"),
  ticker: historicalTickerSchema,
  contentType: z.string().trim().min(1, "Content type is required"),
  payload: z.unknown(),
  provenance: fetchProvenanceSchema,
});

/** Silver-layer canonical 15-minute Kalshi BTC market window. */
export const marketWindowSchema = temporalFieldsSchema.extend({
  ticker: historicalTickerSchema,
  seriesTicker: seriesTickerSchema,
  openTime: eventTimeSchema,
  closeTime: eventTimeSchema,
  strikePriceUsd: finiteUsdPriceSchema,
  status: z.enum(["open", "closed", "settled"]),
  qualityFlags: qualityFlagsField,
  datasetVersion: datasetVersionSchema,
}).superRefine((window, ctx) => {
  if (Date.parse(window.openTime) >= Date.parse(window.closeTime)) {
    ctx.addIssue({
      code: "custom",
      message: "openTime must be before closeTime",
      path: ["openTime"],
    });
  }
});

/** Silver-layer 1-minute Kalshi contract quote candle. */
export const kalshiCandle1mSchema = temporalFieldsSchema.extend({
  ticker: historicalTickerSchema,
  openTime: eventTimeSchema,
  closeTime: eventTimeSchema,
  yesBidCents: contractPriceCentsSchema,
  yesAskCents: contractPriceCentsSchema,
  noBidCents: contractPriceCentsSchema,
  noAskCents: contractPriceCentsSchema,
  volumeContracts: z.number().finite().nonnegative().nullable(),
  qualityFlags: qualityFlagsField,
  datasetVersion: datasetVersionSchema,
}).superRefine((candle, ctx) => {
  const yesSpread = validateBidAskSpread(
    candle.yesBidCents,
    candle.yesAskCents,
    "yes",
  );
  if (yesSpread) {
    ctx.addIssue(yesSpread);
  }

  const noSpread = validateBidAskSpread(
    candle.noBidCents,
    candle.noAskCents,
    "no",
  );
  if (noSpread) {
    ctx.addIssue(noSpread);
  }

  if (Date.parse(candle.openTime) >= Date.parse(candle.closeTime)) {
    ctx.addIssue({
      code: "custom",
      message: "openTime must be before closeTime",
      path: ["openTime"],
    });
  }
});

/** Silver-layer 1-minute BTC spot OHLC bar. */
export const btcBar1mSchema = temporalFieldsSchema.extend({
  openTime: eventTimeSchema,
  closeTime: eventTimeSchema,
  openUsd: finiteUsdPriceSchema,
  highUsd: finiteUsdPriceSchema,
  lowUsd: finiteUsdPriceSchema,
  closeUsd: finiteUsdPriceSchema,
  volumeBtc: z.number().finite().nonnegative().nullable(),
  qualityFlags: qualityFlagsField,
  datasetVersion: datasetVersionSchema,
}).superRefine((bar, ctx) => {
  const ohlcIssue = validateOhlcBar(bar);
  if (ohlcIssue) {
    ctx.addIssue(ohlcIssue);
  }

  if (Date.parse(bar.openTime) >= Date.parse(bar.closeTime)) {
    ctx.addIssue({
      code: "custom",
      message: "openTime must be before closeTime",
      path: ["openTime"],
    });
  }
});

/** Silver-layer market settlement outcome for a resolved window. */
export const settlementRecordSchema = temporalFieldsSchema.extend({
  ticker: historicalTickerSchema,
  strikePriceUsd: finiteUsdPriceSchema,
  settlementPriceUsd: finiteUsdPriceSchema,
  result: z.enum(["yes", "no"]),
  settledAt: eventTimeSchema,
  qualityFlags: qualityFlagsField,
  datasetVersion: datasetVersionSchema,
});

export {
  collectionTimeSchema,
  eventTimeSchema,
  observedAtSchema,
  temporalFieldsSchema,
} from "./timestamps";

export { dataSourceSchema, fetchProvenanceSchema } from "./provenance";
