import type { DiscoveredMarket } from "@/lib/data/discovery";
import type { HistoricalMarketRecord } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";
import type { KalshiMarketWireShape } from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";

import type { SingleMarketDiscoveryPayloadTrace } from "./singleMarketExpansionImportDebugTypes";

function hasExpirationValue(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function resolveExpirationValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function historicalMarketRecordTopLevelKeys(
  record: HistoricalMarketRecord | null,
): readonly string[] {
  if (!record) {
    return [];
  }

  return Object.freeze(Object.keys(record).sort());
}

/** Builds the deep single-market discovery payload trace across pipeline stages. */
export function buildSingleMarketDiscoveryPayloadTrace(input: {
  pagesScanned: number;
  tickerFound: boolean;
  foundOnPage: number | null;
  rawMarketRecord: HistoricalMarketRecord | null;
  normalizedMarket: DiscoveredMarket | null;
  listMarketWire: KalshiMarketWireShape | null;
  configMetadataListWire: KalshiMarketWireShape | null;
  reconciliationListWire: KalshiMarketWireShape | null;
  reconciliationMergedWire: KalshiMarketWireShape | null;
}): SingleMarketDiscoveryPayloadTrace {
  return {
    pagesScanned: input.pagesScanned,
    tickerFound: input.tickerFound,
    foundOnPage: input.foundOnPage,
    rawDiscoveredMarketTopLevelKeys: historicalMarketRecordTopLevelKeys(
      input.rawMarketRecord,
    ),
    rawDiscoveredMarketHasExpirationValue: hasExpirationValue(
      input.rawMarketRecord?.expirationValue,
    ),
    rawDiscoveredMarketExpirationValue: resolveExpirationValue(
      input.rawMarketRecord?.expirationValue,
    ),
    normalizedMarketHasExpirationValue: hasExpirationValue(
      input.normalizedMarket?.expirationValue,
    ),
    normalizedMarketExpirationValue: resolveExpirationValue(
      input.normalizedMarket?.expirationValue,
    ),
    listMarketWireHasExpirationValue: hasExpirationValue(
      input.listMarketWire?.expiration_value,
    ),
    listMarketWireExpirationValue: resolveExpirationValue(
      input.listMarketWire?.expiration_value,
    ),
    configMetadataHasExpirationValue: hasExpirationValue(
      input.configMetadataListWire?.expiration_value,
    ),
    configMetadataExpirationValue: resolveExpirationValue(
      input.configMetadataListWire?.expiration_value,
    ),
    reconciliationInputHasExpirationValue: hasExpirationValue(
      input.reconciliationListWire?.expiration_value,
    ),
    reconciliationInputExpirationValue: resolveExpirationValue(
      input.reconciliationListWire?.expiration_value,
    ),
    reconciliationOutputHasExpirationValue: hasExpirationValue(
      input.reconciliationMergedWire?.expiration_value,
    ),
    reconciliationOutputExpirationValue: resolveExpirationValue(
      input.reconciliationMergedWire?.expiration_value,
    ),
  };
}
