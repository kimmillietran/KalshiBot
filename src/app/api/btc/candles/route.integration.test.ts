import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchBtcCandleHistory } from "@/features/btc-feed/api/btcServer";
import { COINBASE_EXCHANGE_API_BASE } from "@/features/btc-feed/providers";
import { coinbaseCandlesFixture } from "@/features/btc-feed/providers/fixtures/coinbaseCandles.fixture";

import { GET } from "./route";

function isCoinbaseCandlesUrl(url: RequestInfo | URL): boolean {
  const href = String(url);
  return href.startsWith(
    `${COINBASE_EXCHANGE_API_BASE}/products/BTC-USD/candles`,
  );
}

describe("GET /api/btc/candles integration", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps upstream Coinbase JSON through provider and btcServer to BFF response", async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      if (isCoinbaseCandlesUrl(url)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [...coinbaseCandlesFixture],
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch: ${String(url)}`));
    });

    const serverResult = await fetchBtcCandleHistory();
    expect(serverResult.candles.length).toBeGreaterThanOrEqual(1);
    expect(serverResult.candles[0].close).toBe(64190.25);

    const res = await GET();
    const body = await res.json();

    expect(fetchMock).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(body.candles.length).toBeGreaterThanOrEqual(1);
    expect(body.candles[0]).toEqual(serverResult.candles[0]);
    expect(body.candles[0].open).toBe(64180.0);
  });

  it("returns 502 when upstream Coinbase sends string OHLC values", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [
          [1719421200, "64170.12", 64200.55, 64180.0, 64190.25, 12.5],
        ],
      } as Response),
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toMatch(/low is not a valid number/i);
  });
});
