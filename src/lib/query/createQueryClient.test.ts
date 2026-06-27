import { describe, expect, it } from "vitest";

import { createQueryClient, shouldRetryQuery } from "./createQueryClient";

describe("shouldRetryQuery", () => {
  it("retries transient failures up to two times", () => {
    expect(shouldRetryQuery(0, new Error("network"))).toBe(true);
    expect(shouldRetryQuery(1, new Error("network"))).toBe(true);
    expect(shouldRetryQuery(2, new Error("network"))).toBe(false);
  });

  it("does not retry 4xx client errors", () => {
    expect(shouldRetryQuery(0, new Error("Kalshi BFF 404: not found"))).toBe(
      false,
    );
    expect(shouldRetryQuery(0, new Error("BTC API 429: rate limited"))).toBe(
      false,
    );
  });

  it("retries 5xx upstream errors", () => {
    expect(shouldRetryQuery(0, new Error("Kalshi BFF 502: upstream"))).toBe(
      true,
    );
    expect(shouldRetryQuery(0, new Error("Kalshi BFF 504: timeout"))).toBe(
      true,
    );
  });
});

describe("createQueryClient", () => {
  it("applies shared default query options", () => {
    const client = createQueryClient();
    const defaults = client.getDefaultOptions().queries;

    expect(defaults?.staleTime).toBe(5_000);
    expect(defaults?.gcTime).toBe(5 * 60_000);
    expect(defaults?.refetchOnWindowFocus).toBe(false);
    expect(defaults?.refetchOnReconnect).toBe(false);
    expect(defaults?.refetchOnMount).toBe(true);
  });

  it("can disable retries for tests", () => {
    const client = createQueryClient({ retry: false });
    expect(client.getDefaultOptions().queries?.retry).toBe(false);
  });
});
