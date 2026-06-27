import { afterEach, describe, expect, it } from "vitest";

import {
  configureProviderHealth,
  getProviderHealth,
  isProviderCircuitOpen,
  recordProviderFailure,
  recordProviderSuccess,
  resetProviderHealth,
} from "./providerHealth";
import { BtcProviderTimeoutError } from "./errors";

afterEach(() => {
  resetProviderHealth();
});

describe("providerHealth", () => {
  it("starts healthy with score 100", () => {
    const health = getProviderHealth("coinbase");
    expect(health.status).toBe("healthy");
    expect(health.healthScore).toBe(100);
  });

  it("degrades score and status after failures", () => {
    recordProviderFailure("coinbase", new BtcProviderTimeoutError());
    const health = getProviderHealth("coinbase");
    expect(health.status).toBe("degraded");
    expect(health.failureCount).toBe(1);
    expect(health.healthScore).toBeLessThan(100);
  });

  it("opens circuit after consecutive failure threshold", () => {
    configureProviderHealth({ failureThreshold: 2, cooldownMs: 30_000 });

    recordProviderFailure("coinbase", new Error("a"), 1_000);
    expect(isProviderCircuitOpen("coinbase", 1_000)).toBe(false);

    recordProviderFailure("coinbase", new Error("b"), 1_100);
    expect(isProviderCircuitOpen("coinbase", 1_200)).toBe(true);
    expect(getProviderHealth("coinbase", 1_200).status).toBe("circuit_open");
    expect(getProviderHealth("coinbase", 1_200).healthScore).toBe(0);
  });

  it("allows half-open probe after cooldown and closes on success", () => {
    configureProviderHealth({ failureThreshold: 1, cooldownMs: 1_000 });

    recordProviderFailure("coinbase", new Error("fail"), 1_000);
    expect(isProviderCircuitOpen("coinbase", 1_500)).toBe(true);
    expect(isProviderCircuitOpen("coinbase", 2_100)).toBe(false);

    const result = recordProviderSuccess("coinbase", 2_100);
    expect(result.circuitClosed).toBe(true);
    expect(getProviderHealth("coinbase", 2_100).status).toBe("healthy");
    expect(getProviderHealth("coinbase", 2_100).consecutiveFailures).toBe(0);
  });

  it("never opens circuit for exempt fallback provider", () => {
    configureProviderHealth({ failureThreshold: 1, cooldownMs: 60_000 });

    recordProviderFailure("fallback", new Error("fail"), 1_000);
    expect(isProviderCircuitOpen("fallback", 1_000)).toBe(false);
  });
});
