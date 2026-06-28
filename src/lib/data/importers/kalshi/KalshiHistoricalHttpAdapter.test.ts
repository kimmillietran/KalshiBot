import { describe, expect, it, vi } from "vitest";

import {
  KalshiHistoricalHttpAdapter,
  KalshiHistoricalHttpAdapterError,
  type FetchLike,
} from "./KalshiHistoricalHttpAdapter";

function mockResponse(status: number, body: string): Response {
  return {
    status,
    text: async () => body,
  } as Response;
}

function createAdapter(fetchImpl: FetchLike) {
  return new KalshiHistoricalHttpAdapter({ fetchImpl });
}

describe("KalshiHistoricalHttpAdapter", () => {
  it("returns parsed JSON for successful responses", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(200, JSON.stringify({ market_settled_ts: "2026-03-27T00:00:00Z" })),
    );

    const result = await createAdapter(fetchImpl).get(
      "https://example.test/trade-api/v2/historical/cutoff",
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ market_settled_ts: "2026-03-27T00:00:00Z" });
  });

  it("returns non-2xx status with parsed JSON body", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(400, JSON.stringify({ code: "bad_request", message: "invalid cursor" })),
    );

    const result = await createAdapter(fetchImpl).get("https://example.test/historical/markets");

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      code: "bad_request",
      message: "invalid cursor",
    });
  });

  it("throws on invalid JSON responses", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(200, "{not-json"));

    await expect(
      createAdapter(fetchImpl).get("https://example.test/historical/cutoff"),
    ).rejects.toMatchObject({
      name: "KalshiHistoricalHttpAdapterError",
      message: "Invalid JSON response",
      url: "https://example.test/historical/cutoff",
    } satisfies Partial<KalshiHistoricalHttpAdapterError>);
  });

  it("calls injected fetch with the requested URL and JSON accept header", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(200, "{}"));
    const url = "https://example.test/trade-api/v2/historical/markets?series_ticker=KXBTC15M";

    await createAdapter(fetchImpl).get(url);

    expect(fetchImpl).toHaveBeenCalledWith(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  });

  it("does not call global fetch in tests", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch");
    const fetchImpl = vi.fn(async () => mockResponse(200, "{}"));

    await createAdapter(fetchImpl).get("https://example.test/historical/cutoff");

    expect(globalFetch).not.toHaveBeenCalled();
    globalFetch.mockRestore();
  });
});
