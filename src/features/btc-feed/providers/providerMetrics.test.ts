import { afterEach, describe, expect, it, vi } from "vitest";

import {
  emitProviderMetric,
  logProviderMetric,
  resetProviderMetricsObservers,
  subscribeProviderMetrics,
} from "./providerMetrics";
import type { ProviderHealthSnapshot } from "./providerHealth";

const baseHealth: ProviderHealthSnapshot = {
  providerId: "coinbase",
  status: "degraded",
  healthScore: 70,
  successCount: 3,
  failureCount: 1,
  consecutiveFailures: 1,
  circuitOpenUntil: null,
  lastSuccessAt: 1_000,
  lastFailureAt: 2_000,
  lastErrorName: "BtcProviderTimeoutError",
};

afterEach(() => {
  resetProviderMetricsObservers();
  vi.restoreAllMocks();
});

describe("providerMetrics", () => {
  it("logs structured JSON for provider_failure", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logProviderMetric({
      type: "provider_failure",
      providerId: "coinbase",
      errorName: "BtcProviderTimeoutError",
      message: "timed out",
      health: baseHealth,
    });

    expect(warnSpy).toHaveBeenCalledOnce();
    const line = String(warnSpy.mock.calls[0][0]);
    expect(line).toContain("[btc-feed:metric]");
    expect(line).toContain('"metric":"provider_failure"');
    expect(line).toContain('"providerId":"coinbase"');
    expect(line).toContain('"healthScore":70');
  });

  it("notifies subscribed observers", () => {
    const observer = vi.fn();
    subscribeProviderMetrics(observer);

    const event = {
      type: "provider_success" as const,
      providerId: "kraken",
      health: { ...baseHealth, providerId: "kraken", status: "healthy" as const },
    };

    emitProviderMetric(event);
    expect(observer).toHaveBeenCalledWith(event);
  });
});
