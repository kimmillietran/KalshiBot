import { posix } from "node:path";

import type { DiscoveredMarket } from "@/lib/data/discovery";
import {
  buildHistoricalBronzeImportConfig,
  serializeHistoricalBronzeImportConfig,
} from "@/lib/data/importJobs/config";
import type { HistoricalBronzeImportConfig } from "@/lib/data/importJobs/config";
import { deriveImportWindowFromDiscoveredMarket } from "@/lib/data/importJobs/batchConfig/deriveImportWindow";
import type { HistoricalExpansionImportJob } from "@/lib/data/importJobs/expansionConfig";
import {
  discoveredMarketToKalshiListWireShape,
  KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY,
  KALSHI_DISCOVERY_LIST_MARKET_PROVENANCE_METADATA_KEY,
} from "@/lib/data/importers/kalshi/kalshiMarketSchemaReconciliation";
import {
  BATCH_IMPORT_CONFIG_FILENAME,
  BATCH_IMPORT_RESULT_FILENAME,
} from "@/lib/data/importJobs/batchImport/batchImportTypes";

export type ExpansionMarketImportArtifacts = {
  config: HistoricalBronzeImportConfig;
  serializedConfig: string;
  configPath: string;
  importResultPath: string;
};

function assertSafePathSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || /[<>:"/\\|?*\u0000-\u001f]/.test(trimmed) || /^(?:\.|\.\.)$/.test(trimmed)) {
    throw new Error(`${label} contains invalid path characters`);
  }

  return trimmed;
}

/** Builds per-market import config artifacts from an expansion job and discovered market. */
export function buildExpansionMarketImportArtifacts(
  job: HistoricalExpansionImportJob,
  market: Pick<
    DiscoveredMarket,
    | "marketTicker"
    | "seriesTicker"
    | "eventTicker"
    | "status"
    | "openTime"
    | "closeTime"
    | "settlementTime"
    | "expirationValue"
    | "title"
    | "subtitle"
    | "provenance"
  >,
  paths: {
    importConfigsDir: string;
    importsDir: string;
  },
): ExpansionMarketImportArtifacts {
  const window = deriveImportWindowFromDiscoveredMarket(market as DiscoveredMarket);
  const safeSeries = assertSafePathSegment(market.seriesTicker, "seriesTicker");
  const safeMarket = assertSafePathSegment(market.marketTicker, "marketTicker");

  const configInput = {
    jobId: `expansion-import-${market.marketTicker}`,
    marketTicker: market.marketTicker,
    startTime: window.startTime,
    endTime: window.endTime,
    collectionTime: window.collectionTime,
    observedAt: window.observedAt,
    kalshi: job.importDefaults.kalshi,
    btc: job.importDefaults.btc,
    output: job.importDefaults.output,
    metadata: {
      [KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY]:
        discoveredMarketToKalshiListWireShape(market),
      [KALSHI_DISCOVERY_LIST_MARKET_PROVENANCE_METADATA_KEY]: market.provenance,
    },
  };

  const config = buildHistoricalBronzeImportConfig(configInput);

  return {
    config,
    serializedConfig: serializeHistoricalBronzeImportConfig(config),
    configPath: posix.join(
      paths.importConfigsDir.replace(/\\/g, "/"),
      safeSeries,
      safeMarket,
      BATCH_IMPORT_CONFIG_FILENAME,
    ),
    importResultPath: posix.join(
      paths.importsDir.replace(/\\/g, "/"),
      safeSeries,
      safeMarket,
      BATCH_IMPORT_RESULT_FILENAME,
    ),
  };
}
