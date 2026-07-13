import { describe, expect, it, vi } from "vitest";

import type { KalshiHistoricalHttpClient } from "./KalshiHistoricalImporter";
import { KalshiHistoricalImporterError } from "./KalshiHistoricalImporter";
import { buildKalshiRestMarketPath } from "./kalshiRestEndpoints";
import {
  buildSettlementResultFromWire,
  classifyKalshiSettlementState,
  createKalshiSettlementRetrievalError,
  fetchKalshiMarketWireWithFallback,
  fetchKalshiMarketWithSettlementFallback,
  isKalshiSettlementErrorRetryable,
  mapKalshiImporterErrorToBackfillCategory,
  parseKalshiMarketWire,
} from "./kalshiSettlementRetrieval";

const BASE_URL = "https://example.test/trade-api/v2";
const MARKET_TICKER = "KXBTC15M-26JUL111200-00";

const settledYesWire = {
  ticker: MARKET_TICKER,
  event_ticker: "KXBTC15M-26JUL111200",
  status: "finalized",
  result: "yes",
  open_time: "2026-07-11T11:45:00Z",
  close_time: "2026-07-11T12:00:00Z",
  settlement_ts: "2026-07-11T12:05:00Z",
  settlement_value_dollars: "1.0000",
  expiration_value: "60010.25",
};

function createClient(
  handler: (url: string) => {
    status: number;
    body: unknown;
    headers?: Readonly<Record<string, string>>;
  },
): KalshiHistoricalHttpClient {
  return {
    get: vi.fn(async (url: string) => handler(url)),
  };
}

describe("kalshiSettlementRetrieval", () => {
  it("builds REST market path with encoded marketTicker", () => {
    expect(buildKalshiRestMarketPath(MARKET_TICKER)).toBe(
      `/markets/${encodeURIComponent(MARKET_TICKER)}`,
    );
  });

  it("falls back from historical 404 to REST market endpoint", async () => {
    const client = createClient((url) => {
      if (url.endsWith(`/historical/markets/${MARKET_TICKER}`)) {
        return { status: 404, body: { message: "not found" } };
      }
      if (url.endsWith(buildKalshiRestMarketPath(MARKET_TICKER))) {
        return { status: 200, body: { market: settledYesWire } };
      }
      throw new Error(`unexpected url ${url}`);
    });

    const resolved = await fetchKalshiMarketWithSettlementFallback({
      httpClient: client,
      baseUrl: BASE_URL,
      marketTicker: MARKET_TICKER,
      fetchedAt: "2026-07-12T12:00:00.000Z",
    });

    expect(resolved.source).toBe("kalshi-rest-api");
    expect(resolved.settlement.result).toBe("yes");
    expect(resolved.requestPath).toBe(buildKalshiRestMarketPath(MARKET_TICKER));
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it("uses historical endpoint when market is archived", async () => {
    const client = createClient(() => ({
      status: 200,
      body: { market: settledYesWire },
    }));

    const resolved = await fetchKalshiMarketWithSettlementFallback({
      httpClient: client,
      baseUrl: BASE_URL,
      marketTicker: MARKET_TICKER,
      fetchedAt: "2026-07-12T12:00:00.000Z",
    });

    expect(resolved.source).toBe("kalshi-historical-api");
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it("classifies deterministic 404 as non-retryable market-not-found", async () => {
    const client = createClient(() => ({ status: 404, body: { message: "not found" } }));

    await expect(
      fetchKalshiMarketWithSettlementFallback({
        httpClient: client,
        baseUrl: BASE_URL,
        marketTicker: MARKET_TICKER,
        fetchedAt: "2026-07-12T12:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      status: 404,
      retryable: false,
      errorKind: "kalshi-market-not-found",
      identifierType: "marketTicker",
    });
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it("retries transient 429 and 5xx semantics via error metadata", () => {
    const rateLimited = createKalshiSettlementRetrievalError({
      kind: "kalshi-transient-http-error",
      message: "rate limited",
      status: 429,
      retryable: true,
      requestOperation: "get-rest-market",
      identifierType: "marketTicker",
      requestPath: "/markets/foo",
      retryAfterMs: 1000,
    });
    const serverError = createKalshiSettlementRetrievalError({
      kind: "kalshi-transient-http-error",
      message: "server error",
      status: 503,
      retryable: true,
      requestOperation: "get-rest-market",
      identifierType: "marketTicker",
      requestPath: "/markets/foo",
    });

    expect(isKalshiSettlementErrorRetryable(rateLimited)).toBe(true);
    expect(isKalshiSettlementErrorRetryable(serverError)).toBe(true);
    expect(
      isKalshiSettlementErrorRetryable(
        createKalshiSettlementRetrievalError({
          kind: "kalshi-market-not-found",
          message: "missing",
          status: 404,
          retryable: false,
          requestOperation: "get-rest-market",
          identifierType: "marketTicker",
          requestPath: "/markets/foo",
        }),
      ),
    ).toBe(false);
  });

  it("maps YES, NO, void, canceled, unresolved, and malformed settlement states", () => {
    expect(
      classifyKalshiSettlementState({
        ...settledYesWire,
        result: "yes",
      }).settlementReady,
    ).toBe(true);
    expect(
      classifyKalshiSettlementState({
        ...settledYesWire,
        result: "no",
      }).settledOutcome,
    ).toBe("no");
    expect(
      classifyKalshiSettlementState({
        ...settledYesWire,
        status: "void",
        result: "",
      }).settledOutcome,
    ).toBe("void");
    expect(
      classifyKalshiSettlementState({
        ...settledYesWire,
        status: "canceled",
        result: "",
      }).settledOutcome,
    ).toBe("canceled");
    expect(
      classifyKalshiSettlementState({
        ...settledYesWire,
        status: "closed",
        result: "",
      }).settledOutcome,
    ).toBe("unresolved");
    expect(
      classifyKalshiSettlementState({
        ...settledYesWire,
        status: "finalized",
        result: "",
      }).settledOutcome,
    ).toBe("malformed");
  });

  it("builds canonical settlement records for YES outcomes", () => {
    const settlement = buildSettlementResultFromWire({
      market: settledYesWire,
      provenance: {
        source: "kalshi-rest-api",
        fetchedAt: "2026-07-12T12:00:00.000Z",
        requestPath: buildKalshiRestMarketPath(MARKET_TICKER),
      },
    });

    expect(settlement.result).toBe("yes");
    expect(settlement.provenance.source).toBe("kalshi-rest-api");
  });

  it("rejects unresolved markets as not-yet-settled", () => {
    expect(() =>
      buildSettlementResultFromWire({
        market: { ...settledYesWire, status: "closed", result: "" },
        provenance: {
          source: "kalshi-rest-api",
          fetchedAt: "2026-07-12T12:00:00.000Z",
          requestPath: buildKalshiRestMarketPath(MARKET_TICKER),
        },
      }),
    ).toThrow(/not settled/i);
  });

  it("maps importer errors to backfill categories", () => {
    const error = new KalshiHistoricalImporterError("missing", 404, undefined, undefined, {
      errorKind: "kalshi-market-not-found",
      retryable: false,
      requestOperation: "get-rest-market",
      identifierType: "marketTicker",
      requestPath: "/markets/foo",
    });
    expect(mapKalshiImporterErrorToBackfillCategory(error)).toBe("kalshi-market-not-found");
  });

  it("parses market wire without substituting event ticker", () => {
    const wire = parseKalshiMarketWire({ market: settledYesWire });
    expect(wire?.ticker).toBe(MARKET_TICKER);
    expect(wire?.event_ticker).toBe("KXBTC15M-26JUL111200");
  });

  it("returns null market wire when both endpoints 404", async () => {
    const client = createClient(() => ({ status: 404, body: { message: "not found" } }));
    const wire = await fetchKalshiMarketWireWithFallback({
      httpClient: client,
      baseUrl: BASE_URL,
      marketTicker: MARKET_TICKER,
    });
    expect(wire).toBeNull();
  });
});
