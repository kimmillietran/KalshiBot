import { describe, expect, it } from "vitest";

import { resolveKalshiCaptureCredentials } from "./resolveKalshiCaptureCredentials";

describe("resolveKalshiCaptureCredentials", () => {
  it("returns missing when env vars are absent", () => {
    expect(resolveKalshiCaptureCredentials({})).toEqual({
      status: "missing",
      apiKeyId: null,
      apiPrivateKey: null,
      apiBaseUrl: null,
      wsUrl: null,
    });
  });

  it("returns invalid when only one credential is present", () => {
    expect(
      resolveKalshiCaptureCredentials({
        KALSHI_API_KEY_ID: "key-id",
      }).status,
    ).toBe("invalid");
  });

  it("returns available when both credentials are present", () => {
    expect(
      resolveKalshiCaptureCredentials({
        KALSHI_API_KEY_ID: "key-id",
        KALSHI_API_PRIVATE_KEY: "private-key",
        KALSHI_WS_URL: "wss://example.test/ws",
      }),
    ).toEqual({
      status: "available",
      apiKeyId: "key-id",
      apiPrivateKey: "private-key",
      apiBaseUrl: null,
      wsUrl: "wss://example.test/ws",
    });
  });
});
