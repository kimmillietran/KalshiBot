import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";

import { DATASET_BRONZE_CONTENT_TYPE } from "../datasetTypes";
import {
  buildHistoricalDataset,
  serializeHistoricalDataset,
} from "../HistoricalDatasetBuilder";
import {
  buildHistoricalDatasetManifest,
  serializeHistoricalDatasetManifest,
} from "./HistoricalDatasetManifest";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const GENERATED_METADATA = {
  generatedAt: "2026-06-28T01:00:00.000Z",
  generatedBy: "manifest-test",
  label: "dataset-manifest-6.13a",
  source: "unit-test",
};

function baseBronze(
  contentType: string,
  payload: Record<string, unknown>,
  options: {
    recordId: string;
    ticker: string;
    eventTime: string;
  },
): RawHistoricalRecord {
  return {
    recordId: options.recordId,
    ticker: options.ticker,
    contentType,
    eventTime: options.eventTime,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    payload,
    provenance: {
      source: DataSource.KALSHI_REST,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      fetchId: `fetch-${options.recordId}`,
    },
  };
}

function completeMarketRecords(
  ticker: string,
  eventTime: string,
  windowClose: string,
  idPrefix: string,
): RawHistoricalRecord[] {
  const openTime = eventTime;
  const closeTime = new Date(Date.parse(eventTime) + 60_000).toISOString();

  return [
    baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.MARKET,
      {
        open_time: eventTime,
        close_time: windowClose,
        floor_strike: 59_990.31,
        event_ticker: `${ticker.split("-")[0]}-EVENT`,
        status: "closed",
      },
      { recordId: `${idPrefix}-market`, ticker, eventTime },
    ),
    baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
      {
        open_time: openTime,
        close_time: closeTime,
        yes_bid_cents: 48,
        yes_ask_cents: 52,
        no_bid_cents: 47,
        no_ask_cents: 51,
        volume_contracts: 120,
      },
      { recordId: `${idPrefix}-candle`, ticker, eventTime: openTime },
    ),
    baseBronze(
      DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
      {
        open_time: openTime,
        close_time: closeTime,
        open_usd: 59_980.5,
        high_usd: 60_010.25,
        low_usd: 59_960.0,
        close_usd: 59_995.75,
        volume_btc: 12.5,
      },
      { recordId: `${idPrefix}-btc`, ticker, eventTime: closeTime },
    ),
    baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
      {
        floor_strike: 59_990.31,
        expiration_value: "60010.25",
        result: "yes",
        settlement_ts: windowClose,
      },
      { recordId: `${idPrefix}-settlement`, ticker, eventTime },
    ),
  ];
}

describe("buildHistoricalDatasetManifest", () => {
  it("builds a manifest happy path for a single-market dataset", () => {
    const dataset = buildHistoricalDataset(
      completeMarketRecords(
        "KXBTC15M-MANIFEST-A",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
        "manifest-a",
      ),
    );

    const manifest = buildHistoricalDatasetManifest({
      dataset,
      generatedMetadata: GENERATED_METADATA,
    });

    expect(manifest.datasetId).toBe(dataset.metadata.datasetId);
    expect(manifest.contractVersion).toBe(DATA_CONTRACT_VERSION);
    expect(manifest.snapshotCount).toBe(1);
    expect(manifest.marketCount).toBe(1);
    expect(manifest.marketTickers).toEqual(["KXBTC15M-MANIFEST-A"]);
    expect(manifest.earliestTimestamp).toBe("2026-06-26T23:15:00.000Z");
    expect(manifest.latestTimestamp).toBe("2026-06-26T23:15:00.000Z");
    expect(manifest.btcBarCount).toBe(1);
    expect(manifest.marketWindowCount).toBe(1);
    expect(manifest.settlementCount).toBe(1);
    expect(manifest.generatedMetadata).toEqual(GENERATED_METADATA);
  });

  it("summarizes multiple markets with sorted tickers and timestamp bounds", () => {
    const earlierTicker = "KXBTC15M-EARLIER";
    const laterTicker = "KXBTC15M-LATER";

    const dataset = buildHistoricalDataset([
      ...completeMarketRecords(
        laterTicker,
        "2026-06-26T23:30:00.000Z",
        "2026-06-26T23:45:00.000Z",
        "later",
      ),
      ...completeMarketRecords(
        earlierTicker,
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
        "earlier",
      ),
    ]);

    const manifest = buildHistoricalDatasetManifest({
      dataset,
      generatedMetadata: GENERATED_METADATA,
    });

    expect(manifest.snapshotCount).toBe(2);
    expect(manifest.marketCount).toBe(2);
    expect(manifest.marketTickers).toEqual([earlierTicker, laterTicker]);
    expect(manifest.earliestTimestamp).toBe("2026-06-26T23:15:00.000Z");
    expect(manifest.latestTimestamp).toBe("2026-06-26T23:30:00.000Z");
    expect(manifest.btcBarCount).toBe(2);
    expect(manifest.marketWindowCount).toBe(2);
    expect(manifest.settlementCount).toBe(2);
  });

  it("serializes manifests deterministically", () => {
    const dataset = buildHistoricalDataset(
      completeMarketRecords(
        "KXBTC15M-MANIFEST-SERIALIZE",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
        "manifest-serialize",
      ),
    );
    const input = { dataset, generatedMetadata: GENERATED_METADATA };

    const first = serializeHistoricalDatasetManifest(
      buildHistoricalDatasetManifest(input),
    );
    const second = serializeHistoricalDatasetManifest(
      buildHistoricalDatasetManifest(input),
    );

    expect(first).toBe(second);
  });

  it("returns deeply frozen immutable outputs", () => {
    const manifest = buildHistoricalDatasetManifest({
      dataset: buildHistoricalDataset(
        completeMarketRecords(
          "KXBTC15M-MANIFEST-FROZEN",
          "2026-06-26T23:15:00.000Z",
          "2026-06-26T23:30:00.000Z",
          "manifest-frozen",
        ),
      ),
      generatedMetadata: GENERATED_METADATA,
    });

    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.marketTickers)).toBe(true);
    expect(Object.isFrozen(manifest.generatedMetadata)).toBe(true);
    expect(() => {
      (manifest as { datasetId: string }).datasetId = "mutated";
    }).toThrow();
  });

  it("passes caller-supplied generated metadata through unchanged", () => {
    const metadata = {
      generatedAt: "2026-06-28T12:00:00.000Z",
      generatedBy: "builder-1",
      label: "custom-label",
      source: "manual-entry",
    };

    const manifest = buildHistoricalDatasetManifest({
      dataset: buildHistoricalDataset(
        completeMarketRecords(
          "KXBTC15M-MANIFEST-META",
          "2026-06-26T23:15:00.000Z",
          "2026-06-26T23:30:00.000Z",
          "manifest-meta",
        ),
      ),
      generatedMetadata: metadata,
    });

    expect(manifest.generatedMetadata).toEqual(metadata);
    expect(serializeHistoricalDatasetManifest(manifest)).toContain("custom-label");
  });

  it("does not mutate the input dataset", () => {
    const dataset = buildHistoricalDataset(
      completeMarketRecords(
        "KXBTC15M-MANIFEST-UNCHANGED",
        "2026-06-26T23:15:00.000Z",
        "2026-06-26T23:30:00.000Z",
        "manifest-unchanged",
      ),
    );
    const before = serializeHistoricalDataset(dataset);

    buildHistoricalDatasetManifest({
      dataset,
      generatedMetadata: GENERATED_METADATA,
    });

    expect(serializeHistoricalDataset(dataset)).toBe(before);
  });

  it("produces identical manifests for repeated builds", () => {
    const input = {
      dataset: buildHistoricalDataset(
        completeMarketRecords(
          "KXBTC15M-MANIFEST-REPEAT",
          "2026-06-26T23:15:00.000Z",
          "2026-06-26T23:30:00.000Z",
          "manifest-repeat",
        ),
      ),
      generatedMetadata: GENERATED_METADATA,
    };

    const first = serializeHistoricalDatasetManifest(
      buildHistoricalDatasetManifest(input),
    );
    const second = serializeHistoricalDatasetManifest(
      buildHistoricalDatasetManifest(input),
    );

    expect(first).toBe(second);
  });
});
