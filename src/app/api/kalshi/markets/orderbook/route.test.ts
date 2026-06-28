import { afterEach, describe, expect, it, vi } from "vitest";

import { KalshiRequestTimeoutError } from "@/features/market-data/api/fetchWithTimeout";

import { GET } from "./route";

vi.mock("@/features/market-data/api/kalshiServer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/market-data/api/kalshiServer")>();
  return {
    ...actual,
    fetchKalshiOrderbook: vi.fn(),
  };
});

const { fetchKalshiOrderbook } = await import("@/features/market-data/api/kalshiServer");
const mockedFetchKalshiOrderbook = vi.mocked(fetchKalshiOrderbook);

describe("GET /api/kalshi/markets/orderbook", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when ticker is missing", async () => {
    const response = await GET(new Request("http://localhost/api/kalshi/markets/orderbook"));
    expect(response.status).toBe(400);
  });

  it("returns normalized orderbook levels", async () => {
    mockedFetchKalshiOrderbook.mockResolvedValueOnce({
      yesLevels: [["0.4800", "100.00"]],
      noLevels: [["0.5200", "80.00"]],
    });

    const response = await GET(
      new Request(
        "http://localhost/api/kalshi/markets/orderbook?ticker=KXBTC15M-26JUN261930-30",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ticker: "KXBTC15M-26JUN261930-30",
      yesLevels: [["0.4800", "100.00"]],
      noLevels: [["0.5200", "80.00"]],
    });
  });

  it("maps upstream timeouts to 504", async () => {
    mockedFetchKalshiOrderbook.mockRejectedValueOnce(
      new KalshiRequestTimeoutError("https://example.test/orderbook"),
    );

    const response = await GET(
      new Request(
        "http://localhost/api/kalshi/markets/orderbook?ticker=KXBTC15M-26JUN261930-30",
      ),
    );

    expect(response.status).toBe(504);
  });
});
