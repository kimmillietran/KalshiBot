import { describe, expect, it } from "vitest";

import { resolveKalshiCaptureCredentials } from "./resolveKalshiCaptureCredentials";

const PEM = `-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----`;

describe("resolveKalshiCaptureCredentials", () => {
  it("returns missing when env vars are absent", () => {
    const credentials = resolveKalshiCaptureCredentials({ env: {} });
    expect(credentials.status).toBe("missing");
    expect(credentials.privateKeyLoaded).toBe(false);
    expect(credentials.keyIdPresent).toBe(false);
  });

  it("returns invalid when only key id is present", () => {
    expect(
      resolveKalshiCaptureCredentials({
        env: { KALSHI_API_KEY_ID: "key-id" },
      }).status,
    ).toBe("invalid");
  });

  it("returns available when key id and raw PEM are present", () => {
    const credentials = resolveKalshiCaptureCredentials({
      env: {
        KALSHI_API_KEY_ID: "key-id",
        KALSHI_API_PRIVATE_KEY: PEM,
        KALSHI_WS_URL: "wss://example.test/ws",
      },
    });

    expect(credentials.status).toBe("available");
    expect(credentials.apiKeyId).toBe("key-id");
    expect(credentials.privateKeyLoaded).toBe(true);
    expect(credentials.privateKeySource).toBe("raw-env");
    expect(credentials.wsUrl).toBe("wss://example.test/ws");
  });

  it("loads credentials from private key path", () => {
    const credentials = resolveKalshiCaptureCredentials({
      env: {
        KALSHI_API_KEY_ID: "key-id",
        KALSHI_API_PRIVATE_KEY_PATH: "C:\\Users\\me\\.kalshi\\key.pem",
      },
      readFile: () => PEM,
    });

    expect(credentials.status).toBe("available");
    expect(credentials.privateKeySource).toBe("path");
    expect(credentials.privateKeyFingerprint).toHaveLength(12);
  });
});
