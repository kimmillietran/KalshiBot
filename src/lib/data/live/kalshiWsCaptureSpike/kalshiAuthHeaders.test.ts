import { describe, expect, it, vi } from "vitest";

import {
  buildKalshiSignMessage,
  createKalshiAuthHeaders,
  createKalshiWebSocketAuthHeaders,
  KALSHI_ACCESS_KEY_HEADER,
  KALSHI_ACCESS_SIGNATURE_HEADER,
  KALSHI_ACCESS_TIMESTAMP_HEADER,
  KALSHI_WS_SIGN_METHOD,
  KALSHI_WS_SIGN_PATH,
  normalizeKalshiSignPath,
} from "./kalshiAuthHeaders";

const TEST_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7Mb+jehnjHfO8S27U
-----END RSA PRIVATE KEY-----`;

describe("kalshiAuthHeaders", () => {
  it("builds the documented signing payload without query params", () => {
    expect(
      buildKalshiSignMessage({
        timestampMs: "1703123456789",
        method: "GET",
        path: "/trade-api/ws/v2?ignored=1",
      }),
    ).toBe(`1703123456789GET/trade-api/ws/v2`);
  });

  it("normalizes sign paths by stripping query strings", () => {
    expect(normalizeKalshiSignPath("/trade-api/v2/markets?limit=5")).toBe(
      "/trade-api/v2/markets",
    );
  });

  it("creates auth headers with mocked signer output", () => {
    const signMessage = vi.fn(() => "mock-signature");
    const headers = createKalshiAuthHeaders({
      apiKeyId: "key-id",
      privateKeyPem: TEST_PEM,
      method: KALSHI_WS_SIGN_METHOD,
      path: KALSHI_WS_SIGN_PATH,
      timestampMs: "1703123456789",
      signMessage,
    });

    expect(signMessage).toHaveBeenCalledWith(
      `1703123456789${KALSHI_WS_SIGN_METHOD}${KALSHI_WS_SIGN_PATH}`,
      TEST_PEM,
    );
    expect(headers[KALSHI_ACCESS_KEY_HEADER]).toBe("key-id");
    expect(headers[KALSHI_ACCESS_TIMESTAMP_HEADER]).toBe("1703123456789");
    expect(headers[KALSHI_ACCESS_SIGNATURE_HEADER]).toBe("mock-signature");
  });

  it("creates websocket auth headers via GET /trade-api/ws/v2", () => {
    const headers = createKalshiWebSocketAuthHeaders({
      apiKeyId: "key-id",
      privateKeyPem: TEST_PEM,
      timestampMs: "1",
      signMessage: () => "sig",
    });

    expect(headers[KALSHI_ACCESS_SIGNATURE_HEADER]).toBe("sig");
  });
});
