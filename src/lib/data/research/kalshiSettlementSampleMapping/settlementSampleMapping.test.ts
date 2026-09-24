import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  completeHttpAttempt,
  createSealedV0Ledger,
  loadOrCreateCampaignLedger,
  reserveHttpAttempt,
  V0_CAMPAIGN_ID,
  V1_CAMPAIGN_ID,
  type CampaignBudgetIo,
} from "@/lib/data/research/kalshiBrtiAccessProbe/campaignBudget";
import { KalshiBrtiAccessProbeError } from "@/lib/data/research/kalshiBrtiAccessProbe/types";

import { quoteAsOf, detectClockAdjustment, compareReceiptOrder } from "./alignQuotes";
import { bindLiveMarketToPlannedClose, officialSettlementMatchesBoundMarket } from "./bindLiveMarket";
import {
  createSessionLimitState,
  planSynchronizedWindow,
  recordReceivedMessage,
  registerConnectionAttempt,
  requestCleanShutdown,
  SESSION_LIMITS,
} from "./captureLimits";
import {
  classifyAverageField,
  documentAverageFieldMapping,
  inferAddedSampleFromCountAverage,
} from "./inferVenueAverageMapping";
import { inspectHistoricalHour } from "./inspectHistoricalHour";
import { parseSettlementSampleMappingArgv } from "./parseArgv";
import { runSettlementSampleMapping } from "./runSettlementSampleMapping";
import { runSynchronizedCapture, type MappingTransport } from "./runSynchronizedCapture";
import { analyzeSynchronizedSession } from "./analyzeSynchronizedSession";
import {
  EXPECTED_RETAINED_HISTORY_BODY_SHA256,
  MAPPING_MAX_CONNECTIONS_PER_STREAM,
  MAPPING_MAX_DURATION_MS,
  MAPPING_MAX_MESSAGES,
  SettlementSampleMappingError,
  V2_MAPPING_CAMPAIGN_ID,
} from "./types";
import {
  lastTickPerSecond,
  meanOf,
  observationInWindow,
  selectWindowObservations,
} from "./windowBoundaries";

const PEM = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
  .export({ type: "pkcs1", format: "pem" })
  .toString();

const CLOSE_MS = Date.parse("2026-08-30T18:15:00.000Z");
const TICKER = "KXBTC15M-26AUG301415-15";
const EVENT = "KXBTC15M-26AUG301415";

function memoryCampaignIo(initial?: Record<string, string>): CampaignBudgetIo & { files: Map<string, string> } {
  const files = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    files,
    readFile: (path) => files.get(path) ?? null,
    writeFile: (path, contents) => {
      files.set(path, contents);
    },
    mkdir: () => undefined,
    withExclusiveLock: (_path, fn) => fn(),
    nowIso: () => "2026-09-24T04:00:00.000Z",
  };
}

function mappingIo(files: Map<string, string>) {
  return {
    files,
    writeFile: (path: string, contents: string) => {
      files.set(path, contents);
    },
    mkdir: () => undefined,
    readFile: (path: string) => files.get(path) ?? null,
    exists: (path: string) => files.has(path),
    appendRaw: (path: string, line: string) => {
      files.set(path, `${files.get(path) ?? ""}${line}\n`);
    },
  };
}

function syntheticTicks(input: {
  firstMs: number;
  lastMs: number;
  stepMs: number;
  value: number;
}): Array<{ time: number; value: string }> {
  const payload: Array<{ time: number; value: string }> = [];
  for (let time = input.firstMs; time <= input.lastMs; time += input.stepMs) {
    payload.push({ time, value: input.value.toFixed(2) });
  }
  return payload;
}

function credentials() {
  return {
    status: "available" as const,
    apiKeyId: "key-id",
    apiBaseUrl: null,
    wsUrl: "wss://example.test/ws",
    privateKeyMaterial: {
      status: "loaded" as const,
      source: "raw-env" as const,
      privateKeyPem: PEM,
      privateKeyLoaded: true,
      privateKeyFingerprint: "abc",
      warnings: [],
      error: null,
    },
    privateKeySource: "raw-env" as const,
    privateKeyLoaded: true,
    privateKeyFingerprint: "abc",
    keyIdPresent: true,
    warnings: [],
    error: null,
  };
}

function openMarket(overrides?: Record<string, unknown>) {
  return {
    ticker: TICKER,
    event_ticker: EVENT,
    series_ticker: "KXBTC15M",
    status: "active",
    open_time: "2026-08-30T18:00:00Z",
    close_time: "2026-08-30T18:15:00Z",
    floor_strike: 78800,
    expiration_value: "",
    ...overrides,
  };
}

describe("window boundaries and timestamp units", () => {
  it("treats millisecond index times as milliseconds and distinguishes four fixed windows", () => {
    const close = CLOSE_MS;
    const start = close - 60_000;
    expect(observationInWindow(start, close, "documented-live-accumulation")).toBe(false);
    expect(observationInWindow(start, close, "payload-start-inclusive-end-exclusive")).toBe(true);
    expect(observationInWindow(close, close, "documented-live-accumulation")).toBe(true);
    expect(observationInWindow(close, close, "payload-start-inclusive-end-exclusive")).toBe(false);
    expect(observationInWindow(start / 1000, close, "payload-start-inclusive-end-exclusive")).toBe(false);
  });

  it("does not interpolate missing seconds when taking last-tick-per-second", () => {
    const observations = [
      { timeRaw: CLOSE_MS - 2_000, timeMs: CLOSE_MS - 2_000, valueRaw: "1", value: 1 },
      { timeRaw: CLOSE_MS - 400, timeMs: CLOSE_MS - 400, valueRaw: "3", value: 3 },
    ];
    const last = lastTickPerSecond(observations);
    expect(last).toHaveLength(2);
    expect(meanOf(last).count).toBe(2);
  });
});

describe("5Hz / 1Hz cadence and missing or duplicate observations", () => {
  it("counts 5Hz ticks and unique seconds without collapsing duplicates into interpolated samples", () => {
    const payload = [
      ...syntheticTicks({ firstMs: CLOSE_MS - 1_000, lastMs: CLOSE_MS - 200, stepMs: 200, value: 10 }),
      { time: CLOSE_MS - 200, value: "10.00" },
    ];
    const observations = payload.map((item) => ({
      timeRaw: item.time,
      timeMs: item.time,
      valueRaw: item.value,
      value: Number(item.value),
    }));
    const windowed = selectWindowObservations(observations, CLOSE_MS, "payload-start-inclusive-end-exclusive");
    expect(windowed.length).toBeGreaterThan(0);
    const last = lastTickPerSecond(windowed);
    expect(last.length).toBeLessThanOrEqual(2);
  });
});

describe("trailing versus settlement-window averages", () => {
  it("does not label a trailing average as the quarter-hour settlement average", () => {
    expect(classifyAverageField("avg_60s_data")).toBe("trailing-60s");
    expect(classifyAverageField("last_60s_windowed_average_15min")).toBe("settlement-window");
    expect(documentAverageFieldMapping("avg_60s_data").documentedMeaning).toMatch(/not the quarter-hour settlement/);
  });
});

describe("count/average arithmetic with ambiguous mappings", () => {
  it("does not uniquely identify a sample when rounding admits two raw ticks", () => {
    const inference = inferAddedSampleFromCountAverage({
      previous: { valueRaw: "10.00", count: 1 },
      next: { valueRaw: "10.005", count: 2 },
      candidateObservations: [
        { timeRaw: 1, timeMs: 1, valueRaw: "10.01", value: 10.01 },
        { timeRaw: 2, timeMs: 2, valueRaw: "10.012", value: 10.012 },
      ],
    });
    expect(inference.deltaCount).toBe(1);
    expect(inference.uniquelyIdentified).toBe(false);
    expect(inference.mappingStatus === "consistent-with-observations" || inference.mappingStatus === "unresolved").toBe(true);
  });

  it("leaves mapping unresolved when count does not increase by one", () => {
    const inference = inferAddedSampleFromCountAverage({
      previous: { valueRaw: "10.00", count: 2 },
      next: { valueRaw: "10.50", count: 4 },
    });
    expect(inference.mappingStatus).toBe("unresolved");
  });
});

describe("ticker and official-settlement identity matching", () => {
  it("refuses a substitute market with a different close", () => {
    const bind = bindLiveMarketToPlannedClose({
      body: { markets: [openMarket({ close_time: "2026-08-30T18:30:00Z" })] },
      plannedCloseIso: "2026-08-30T18:15:00.000Z",
      expectedEventTicker: EVENT,
    });
    expect(bind.status).toBe("unbound");
  });

  it("matches official settlement only to the bound ticker/event/close", () => {
    const bound = bindLiveMarketToPlannedClose({
      body: { markets: [openMarket(), openMarket({ ticker: "KXBTC15M-26AUG301415-30", floor_strike: 79000 })] },
      plannedCloseIso: "2026-08-30T18:15:00.000Z",
      expectedEventTicker: EVENT,
    });
    expect(bound.status).toBe("bound");
    const official = officialSettlementMatchesBoundMarket({
      body: {
        market: {
          ...openMarket({
            ticker: bound.status === "bound" ? bound.market.ticker : TICKER,
            expiration_value: "78833.97",
          }),
        },
      },
      bound: bound.status === "bound" ? bound.market : {
        ticker: TICKER,
        eventTicker: EVENT,
        seriesTicker: "KXBTC15M",
        closeTimeUtc: "2026-08-30T18:15:00Z",
        floorStrike: 78800,
        status: "active",
        openTimeUtc: "2026-08-30T18:00:00Z",
      },
    });
    expect(official.matches).toBe(true);
    expect(official.expirationValue).toBe("78833.97");
  });
});

describe("cross-stream receipt ordering and no future-quote leakage", () => {
  it("uses the latest valid book received no later than the observation", () => {
    const quotes = [
      {
        receivedAtMs: 1_000,
        receivedAtMonoMs: 10,
        exchangeTimestampMs: 900,
        bookState: "valid" as const,
        yesBidCents: 40,
        yesBidSize: 2,
        yesAskCents: 60,
        yesAskSize: 3,
        noBidCents: 40,
        noBidSize: 3,
        noAskCents: 60,
        noAskSize: 2,
        sequence: 1,
        sequenceGap: false,
        reconnectsBefore: 0,
      },
      {
        receivedAtMs: 1_200,
        receivedAtMonoMs: 12,
        exchangeTimestampMs: 1_100,
        bookState: "valid" as const,
        yesBidCents: 41,
        yesBidSize: 5,
        yesAskCents: 59,
        yesAskSize: 4,
        noBidCents: 41,
        noBidSize: 4,
        noAskCents: 59,
        noAskSize: 5,
        sequence: 2,
        sequenceGap: false,
        reconnectsBefore: 0,
      },
    ];
    const aligned = quoteAsOf({ quotes, observationReceivedAtMs: 1_100 });
    expect(aligned.usedFutureQuote).toBe(false);
    expect(aligned.quote?.receivedAtMs).toBe(1_000);
    expect(aligned.quote?.yesBidCents).toBe(40);
    const order = compareReceiptOrder(
      { wallMs: 1_000, monoMs: 10 },
      { wallMs: 1_200, monoMs: 12 },
    );
    expect(order.consistent).toBe(true);
  });

  it("flags wall/monotonic divergence without claiming provider clocks are synchronized", () => {
    const drift = detectClockAdjustment({
      firstWallMs: 0,
      lastWallMs: 5_000,
      firstMonoMs: 0,
      lastMonoMs: 1_000,
    });
    expect(drift.suspected).toBe(true);
  });
});

describe("book snapshot/delta validity and stale or missing quotes", () => {
  it("reports missing size and stale books without inventing quotes", () => {
    const aligned = quoteAsOf({
      quotes: [{
        receivedAtMs: 0,
        receivedAtMonoMs: 0,
        exchangeTimestampMs: null,
        bookState: "valid",
        yesBidCents: 40,
        yesBidSize: null,
        yesAskCents: 60,
        yesAskSize: null,
        noBidCents: 40,
        noBidSize: null,
        noAskCents: 60,
        noAskSize: null,
        sequence: 1,
        sequenceGap: false,
        reconnectsBefore: 0,
      }],
      observationReceivedAtMs: 10_000,
      staleAfterMs: 1_000,
    });
    expect(aligned.missingSize).toBe(true);
    expect(aligned.stale).toBe(true);
    expect(aligned.available).toBe(false);
  });
});

describe("shared session limits and clean shutdown", () => {
  it("stops at the first reached limit and records incomplete coverage", () => {
    const state = createSessionLimitState({ startedAtMs: 0, stopAtMs: 120_000 });
    expect(SESSION_LIMITS.maxDurationMs).toBe(MAPPING_MAX_DURATION_MS);
    expect(SESSION_LIMITS.maxMessages).toBe(MAPPING_MAX_MESSAGES);
    expect(recordReceivedMessage(state, 10, 1)).toBe(true);
    requestCleanShutdown(state, "message-cap");
    expect(recordReceivedMessage(state, 10, 2)).toBe(false);
    expect(state.shutdownRequested).toBe(true);
    expect(registerConnectionAttempt(state, "multiplexed-ws")).toBe(true);
    expect(registerConnectionAttempt(state, "multiplexed-ws")).toBe(true);
    expect(registerConnectionAttempt(state, "multiplexed-ws")).toBe(false);
    expect(MAPPING_MAX_CONNECTIONS_PER_STREAM).toBe(2);
  });

  it("plans close−90s through close+30s without exceeding 120s", () => {
    const plan = planSynchronizedWindow(Date.parse("2026-09-24T04:00:00.000Z") - 200_000);
    expect(plan.durationMs).toBeLessThanOrEqual(120_000);
    expect(plan.closeMs - plan.plannedStartMs).toBe(90_000);
    expect(plan.stopMs - plan.closeMs).toBeLessThanOrEqual(30_000);
  });
});

describe("persistent HTTP budget across retries and resume", () => {
  it("keeps v2 consumption and does not reset v0 or v1", () => {
    const io = memoryCampaignIo();
    const v0 = createSealedV0Ledger("2026-09-24T02:00:00.000Z");
    io.writeFile("/v0/http-budget-ledger.json", `${JSON.stringify(v0)}\n`);
    loadOrCreateCampaignLedger({
      ledgerPath: "/v1/http-budget-ledger.json",
      campaignId: V1_CAMPAIGN_ID,
      limit: 10,
      io,
    });
    reserveHttpAttempt({
      ledgerPath: "/v1/http-budget-ledger.json",
      lockPath: "/v1.lock",
      campaignId: V1_CAMPAIGN_ID,
      limit: 10,
      purpose: "historical-brti",
      io,
    });
    loadOrCreateCampaignLedger({
      ledgerPath: "/v2/http-budget-ledger.json",
      campaignId: V2_MAPPING_CAMPAIGN_ID,
      limit: 10,
      io,
    });
    const first = reserveHttpAttempt({
      ledgerPath: "/v2/http-budget-ledger.json",
      lockPath: "/v2.lock",
      campaignId: V2_MAPPING_CAMPAIGN_ID,
      limit: 10,
      purpose: "live-market-discovery",
      io,
    });
    completeHttpAttempt({
      ledgerPath: "/v2/http-budget-ledger.json",
      lockPath: "/v2.lock",
      reservationId: first.id,
      httpStatus: 500,
      category: "upstream-or-transient",
      failed: true,
      io,
    });
    const resumed = loadOrCreateCampaignLedger({
      ledgerPath: "/v2/http-budget-ledger.json",
      campaignId: V2_MAPPING_CAMPAIGN_ID,
      limit: 10,
      io,
      requireExisting: true,
    });
    expect(resumed.consumed).toBe(1);
    expect(JSON.parse(io.readFile("/v0/http-budget-ledger.json")!).consumed).toBe(13);
    expect(JSON.parse(io.readFile("/v1/http-budget-ledger.json")!).consumed).toBe(1);
    expect(() => reserveHttpAttempt({
      ledgerPath: "/v0/http-budget-ledger.json",
      lockPath: "/v0.lock",
      campaignId: V0_CAMPAIGN_ID,
      limit: 10,
      purpose: "rest-markets",
      io,
    })).toThrow(KalshiBrtiAccessProbeError);
  });
});

describe("output isolation and secret-safe diagnostics", () => {
  it("writes mapping outputs away from v0/v1 and refuses secret-bearing summaries", async () => {
    const files = new Map<string, string>();
    const io = mappingIo(files);
    const campaignIo = memoryCampaignIo();
    const summary = await runSettlementSampleMapping({
      repoRoot: "/repo",
      argv: parseSettlementSampleMappingArgv(["--fixture", "--skip-offline", "--campaign-dir", "out", "--out-dir", "out", "--raw-dir", "out/raw"]),
      io,
      deps: {
        campaignIo,
        nowMs: () => Date.parse("2026-09-24T04:00:00.000Z"),
        unsignedGet: async () => {
          throw new Error("http-should-not-run-in-fixture");
        },
      },
    });
    expect(summary.httpBudget).toMatchObject({ consumed: 0, limit: 10 });
    expect(JSON.stringify(summary)).not.toMatch(/BEGIN PRIVATE KEY|authorization/i);
    expect(files.has("/repo/out/settlement-sample-mapping-summary.json")).toBe(true);
    expect([...files.keys()].some((path) => path.includes("m17-prep-brti-access-probe/"))).toBe(false);
  });
});

describe("offline historical inspection", () => {
  it("reports the retained hour as blocked when the file is absent", () => {
    const inspection = inspectHistoricalHour({
      repoRoot: "/repo",
      readFile: () => null,
      injectedOfficialExpiration: "78833.97",
      injectedCloseUtc: "2026-08-30T18:15:00Z",
    });
    expect(inspection.retainedAvailable).toBe(false);
    expect(inspection.blockedReason).toMatch(/not authorized/);
  });

  it("evaluates fixed interpretations without fitting the official expiration", () => {
    const start = CLOSE_MS - 60_000;
    const payload = syntheticTicks({ firstMs: start, lastMs: CLOSE_MS, stepMs: 200, value: 78_833.97 });
    const inspection = inspectHistoricalHour({
      repoRoot: "/repo",
      injectedBody: { data: { serverTime: "2026-09-24T03:26:51.509Z", payload } },
      injectedOfficialExpiration: "78833.97",
      injectedCloseUtc: "2026-08-30T18:15:00Z",
    });
    expect(inspection.retainedVerified).toBe(true);
    expect(inspection.boundaryDiscrepancy.sameConcept).toBe(false);
    const lastTickPayload = inspection.candidates.find((candidate) => (
      candidate.windowKind === "payload-start-inclusive-end-exclusive"
      && candidate.aggregation === "last-tick-per-second"
    ));
    expect(lastTickPayload?.observationCount).toBe(60);
    expect(lastTickPayload?.officialComparison.status).toBe("agree");
    const documented = inspection.candidates.find((candidate) => (
      candidate.windowKind === "documented-live-accumulation"
      && candidate.aggregation === "last-tick-per-second"
    ));
    expect(documented?.uniqueSecondBuckets).toBeGreaterThanOrEqual(60);
    expect(EXPECTED_RETAINED_HISTORY_BODY_SHA256).toHaveLength(64);
  });
});

describe("synchronized capture mocked transport", () => {
  it("subscribes only after the planned start and never uses a later quote", async () => {
    let connectedAt: number | null = null;
    const messages = [
      JSON.stringify({
        type: "orderbook_snapshot",
        sid: 1,
        seq: 1,
        msg: {
          market_ticker: TICKER,
          market_id: "m1",
          yes_dollars_fp: [["0.4000", "2.00"]],
          no_dollars_fp: [["0.5800", "3.00"]],
        },
      }),
      JSON.stringify({
        type: "cfbenchmarks_value",
        msg: {
          index_id: "BRTI",
          value_usd: "78833.97",
          source_ts_ms: CLOSE_MS - 500,
          received_at: CLOSE_MS - 400,
          last_60s_windowed_average_15min: {
            value: "78833.97000000",
            window_size: 60,
            window_start_ts_ms: CLOSE_MS - 60_000,
            window_end_ts_exclusive: CLOSE_MS,
          },
          avg_60s_data: {
            value: "78810.00",
            window_size: 60,
            window_start_ts_ms: CLOSE_MS - 90_000,
            window_end_ts_exclusive: CLOSE_MS - 30_000,
          },
        },
      }),
    ];
    let now = CLOSE_MS - 200_000;
    const transport: MappingTransport = {
      connect: async () => {
        connectedAt = now;
      },
      send: () => undefined,
      close: () => undefined,
      onMessage: (handler) => {
        queueMicrotask(() => {
          for (const message of messages) {
            handler(message);
          }
        });
      },
    };
    const plan = planSynchronizedWindow(now);
    const capture = await runSynchronizedCapture({
      credentials: credentials(),
      market: {
        ticker: TICKER,
        eventTicker: EVENT,
        seriesTicker: "KXBTC15M",
        closeTimeUtc: "2026-08-30T18:15:00Z",
        floorStrike: 78800,
        status: "active",
        openTimeUtc: "2026-08-30T18:00:00Z",
      },
      plan,
      deps: {
        createTransport: () => transport,
        nowMs: () => now,
        monoMs: () => now,
        sleep: async (ms) => {
          now += ms;
        },
      },
    });
    expect(connectedAt).toBeGreaterThanOrEqual(plan.actualStartMs);
    expect(capture.connectedBeforeWindow).toBe(false);
    expect(capture.closedCleanly).toBe(true);
    expect(capture.venueAverages.some((item) => item.fieldKind === "settlement-window")).toBe(true);
    expect(capture.venueAverages.some((item) => item.fieldKind === "trailing-60s")).toBe(true);
    const analysis = analyzeSynchronizedSession({
      capture,
      market: {
        ticker: TICKER,
        eventTicker: EVENT,
        seriesTicker: "KXBTC15M",
        closeTimeUtc: "2026-08-30T18:15:00Z",
        floorStrike: 78800,
        status: "active",
        openTimeUtc: "2026-08-30T18:00:00Z",
      },
      officialBody: { market: openMarket({ expiration_value: "78833.97" }) },
    });
    expect(analysis.futureQuoteLeakage).toBe(false);
    expect(analysis.officialComparison?.status === "agree" || analysis.officialComparison?.status === "pending" || analysis.officialComparison?.status === "not-compared").toBe(true);
  });

  it("does not run the live probe without credentials", async () => {
    await expect(runSynchronizedCapture({
      credentials: { ...credentials(), status: "missing", apiKeyId: null },
      market: {
        ticker: TICKER,
        eventTicker: EVENT,
        seriesTicker: "KXBTC15M",
        closeTimeUtc: "2026-08-30T18:15:00Z",
        floorStrike: 78800,
        status: "active",
        openTimeUtc: "2026-08-30T18:00:00Z",
      },
      plan: planSynchronizedWindow(CLOSE_MS - 200_000),
    })).rejects.toBeInstanceOf(SettlementSampleMappingError);
  });
});
