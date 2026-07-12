import { describe, expect, it } from "vitest";

import {
  buildHistoricalBronzeImportConfig,
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportConfigError,
  HistoricalBronzeImportConfigErrorCode,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportMode,
  HistoricalBronzeImportOutputFormat,
  serializeHistoricalBronzeImportConfig,
} from "./index";
import type { BuildHistoricalBronzeImportConfigInput } from "./historicalBronzeImportConfigTypes";

const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:30:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";

function validInput(
  overrides: Partial<BuildHistoricalBronzeImportConfigInput> = {},
): BuildHistoricalBronzeImportConfigInput {
  return {
    jobId: "import-job-001",
    marketTicker: "KXBTC15M-26JUN262315-15",
    startTime: START_TIME,
    endTime: END_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    kalshi: {
      marketSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
      candleSource: HistoricalBronzeImportKalshiSource.KALSHI_CANDLES,
      settlementSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
    },
    btc: {
      provider: HistoricalBronzeImportBtcProvider.BINANCE_SPOT,
      symbol: "BTCUSDT",
      interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
    },
    output: {
      format: HistoricalBronzeImportOutputFormat.JSON,
      includeValidationReport: true,
      includeFixture: false,
    },
    ...overrides,
  };
}

function snapshotInput(input: BuildHistoricalBronzeImportConfigInput): string {
  return JSON.stringify(input);
}

describe("buildHistoricalBronzeImportConfig", () => {
  it("builds a valid import config", () => {
    const config = buildHistoricalBronzeImportConfig(validInput());

    expect(config).toEqual({
      jobId: "import-job-001",
      marketTicker: "KXBTC15M-26JUN262315-15",
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      importMode: HistoricalBronzeImportMode.FULL_BRONZE,
      kalshi: {
        marketSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
        candleSource: HistoricalBronzeImportKalshiSource.KALSHI_CANDLES,
        settlementSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
      },
      btc: {
        provider: HistoricalBronzeImportBtcProvider.BINANCE_SPOT,
        symbol: "BTCUSDT",
        interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
      },
      output: {
        format: HistoricalBronzeImportOutputFormat.JSON,
        includeValidationReport: true,
        includeFixture: false,
      },
      metadata: {},
    });
  });

  it("rejects an empty jobId", () => {
    expect(() =>
      buildHistoricalBronzeImportConfig(validInput({ jobId: "   " })),
    ).toThrowError(
      expect.objectContaining({
        code: HistoricalBronzeImportConfigErrorCode.MISSING_JOB_ID,
      }),
    );
  });

  it("rejects invalid timestamps", () => {
    expect(() =>
      buildHistoricalBronzeImportConfig(
        validInput({ startTime: "2026-06-26T23:15:00-04:00" }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: HistoricalBronzeImportConfigErrorCode.INVALID_TIMESTAMP,
      }),
    );

    expect(() =>
      buildHistoricalBronzeImportConfig(
        validInput({ collectionTime: "not-a-timestamp" }),
      ),
    ).toThrowError(HistoricalBronzeImportConfigError);
  });

  it("rejects startTime greater than or equal to endTime", () => {
    expect(() =>
      buildHistoricalBronzeImportConfig(
        validInput({
          startTime: END_TIME,
          endTime: START_TIME,
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: HistoricalBronzeImportConfigErrorCode.INVALID_TIME_RANGE,
      }),
    );

    expect(() =>
      buildHistoricalBronzeImportConfig(
        validInput({
          startTime: START_TIME,
          endTime: START_TIME,
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: HistoricalBronzeImportConfigErrorCode.INVALID_TIME_RANGE,
      }),
    );
  });

  it("rejects unsupported BTC intervals", () => {
    expect(() =>
      buildHistoricalBronzeImportConfig(
        validInput({
          btc: {
            provider: HistoricalBronzeImportBtcProvider.BINANCE_SPOT,
            symbol: "BTCUSDT",
            interval: "5m" as typeof HistoricalBronzeImportBtcInterval.ONE_MINUTE,
          },
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: HistoricalBronzeImportConfigErrorCode.INVALID_BTC_INTERVAL,
      }),
    );
  });

  it("rejects unsupported output formats", () => {
    expect(() =>
      buildHistoricalBronzeImportConfig(
        validInput({
          output: {
            format: "csv" as typeof HistoricalBronzeImportOutputFormat.JSON,
            includeValidationReport: false,
            includeFixture: false,
          },
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: HistoricalBronzeImportConfigErrorCode.INVALID_OUTPUT_FORMAT,
      }),
    );
  });

  it("serializes configs deterministically", () => {
    const config = buildHistoricalBronzeImportConfig(
      validInput({ metadata: { label: "fixture" } }),
    );

    expect(serializeHistoricalBronzeImportConfig(config)).toBe(
      serializeHistoricalBronzeImportConfig(config),
    );
  });

  it("returns deeply frozen output", () => {
    const config = buildHistoricalBronzeImportConfig(
      validInput({ metadata: { label: "frozen" } }),
    );

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.kalshi)).toBe(true);
    expect(Object.isFrozen(config.btc)).toBe(true);
    expect(Object.isFrozen(config.output)).toBe(true);
    expect(Object.isFrozen(config.metadata)).toBe(true);

    expect(() => {
      (config as { jobId: string }).jobId = "mutated";
    }).toThrow();
  });

  it("passes caller metadata through unchanged", () => {
    const metadata = {
      requestedBy: "builder-2",
      tags: ["bronze", "import"],
    };
    const config = buildHistoricalBronzeImportConfig(
      validInput({ metadata }),
    );

    expect(config.metadata).toEqual(metadata);
  });

  it("does not mutate the input object", () => {
    const input = validInput({
      metadata: { run: "immutable-check" },
    });
    const before = snapshotInput(input);

    buildHistoricalBronzeImportConfig(input);

    expect(snapshotInput(input)).toBe(before);
  });
});
