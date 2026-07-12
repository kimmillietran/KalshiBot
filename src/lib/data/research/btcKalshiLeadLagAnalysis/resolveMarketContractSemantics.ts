import type {
  ComparisonDirection,
  MarketContractSemantics,
} from "./btcKalshiLeadLagAnalysisTypes";
import { readNumber } from "./leadLagUtils";

const KXBTC15M_SERIES = "KXBTC15M";

export function resolveMarketContractSemantics(input: {
  marketTicker: string;
  seriesTicker: string | null;
  eventTicker: string | null;
  closeTimeMs: number | null;
  metadataRecord: Record<string, unknown> | null;
}): MarketContractSemantics {
  const floorStrikeUsd = resolveFloorStrikeUsd(input.metadataRecord);
  const seriesTicker = input.seriesTicker ?? inferSeriesTicker(input.marketTicker);

  if (seriesTicker === KXBTC15M_SERIES) {
    return {
      marketTicker: input.marketTicker,
      seriesTicker,
      eventTicker: input.eventTicker,
      closeTimeMs: input.closeTimeMs,
      floorStrikeUsd,
      comparisonDirection: "above-threshold",
      contractInterpretationSource: floorStrikeUsd !== null
        ? "series-kxbtc15m-with-floor-strike-metadata"
        : "series-kxbtc15m-default-above-threshold",
      exclusionReason: null,
    };
  }

  return {
    marketTicker: input.marketTicker,
    seriesTicker,
    eventTicker: input.eventTicker,
    closeTimeMs: input.closeTimeMs,
    floorStrikeUsd,
    comparisonDirection: null,
    contractInterpretationSource: null,
    exclusionReason: `unsupported-series:${seriesTicker ?? "unknown"}`,
  };
}

function inferSeriesTicker(marketTicker: string): string | null {
  const dashIndex = marketTicker.indexOf("-");
  return dashIndex === -1 ? marketTicker : marketTicker.slice(0, dashIndex);
}

function resolveFloorStrikeUsd(metadataRecord: Record<string, unknown> | null): number | null {
  if (!metadataRecord) {
    return null;
  }

  return (
    readNumber(metadataRecord.floorStrikeUsd)
    ?? readNumber(metadataRecord.floorStrike)
    ?? readNumber(metadataRecord.floor_strike)
    ?? readNumber(metadataRecord.strikePriceUsd)
    ?? readNumber(metadataRecord.strike)
  );
}

export function expectedKalshiDirectionForBtcMove(
  btcDirection: "up" | "down" | "flat",
  comparisonDirection: ComparisonDirection | null,
): "up" | "down" | "flat" | "unavailable" {
  if (btcDirection === "flat" || comparisonDirection === null) {
    return btcDirection === "flat" ? "flat" : "unavailable";
  }

  if (comparisonDirection === "above-threshold") {
    return btcDirection === "up" ? "up" : "down";
  }

  return "unavailable";
}

export function signedYesMidResponseCents(
  changeCents: number | null,
  expectedDirection: "up" | "down" | "flat" | "unavailable",
): number | null {
  if (changeCents === null || expectedDirection === "unavailable" || expectedDirection === "flat") {
    return changeCents;
  }
  return expectedDirection === "up" ? changeCents : -changeCents;
}

export function isDirectionallyCorrect(
  actualDirection: "up" | "down" | "flat" | "unavailable",
  expectedDirection: "up" | "down" | "flat" | "unavailable",
): boolean | null {
  if (
    actualDirection === "unavailable"
    || expectedDirection === "unavailable"
    || expectedDirection === "flat"
    || actualDirection === "flat"
  ) {
    return null;
  }
  return actualDirection === expectedDirection;
}

export function readMarketMetadataLine(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function mergeMarketMetadataRecord(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(existing ?? {}), ...incoming };
}
