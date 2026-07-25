import { describe, expect, it } from "vitest";

import { describeKalshiEnvPresence, requireKalshiEnv } from "./shared/kalshiEnv";
import { OperatorCliError } from "./shared/argv";

describe("kalshiEnv", () => {
  it("fails safely when variables are missing without reading secrets", () => {
    expect(() =>
      requireKalshiEnv({
        KALSHI_API_KEY_ID: "",
        KALSHI_API_PRIVATE_KEY_PATH: "",
      }),
    ).toThrow(OperatorCliError);

    try {
      requireKalshiEnv({});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("load-kalshi-env");
      expect(message).not.toMatch(/BEGIN PRIVATE KEY|api[_-]?key_id\s*=/i);
    }
  });

  it("describes presence without exposing values", () => {
    const presence = describeKalshiEnvPresence({
      KALSHI_API_KEY_ID: "secret-id-value",
      KALSHI_API_PRIVATE_KEY_PATH: "/tmp/not-a-real-key.pem",
    });
    expect(presence).toEqual({ keyIdSet: true, privateKeyPathSet: true });
    expect(JSON.stringify(presence)).not.toContain("secret-id-value");
  });
});
