import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { GUARD_STEP_ORDER, runEvaluationGuards } from "./evaluationGuards";
import { MarketLifecycle } from "@/lib/trading/snapshot/types";
import type { EvaluationSnapshot } from "@/types/domain/trading";

const candle = (timestamp: number, close: number) => ({
  timestamp,
  open: close,
  high: close,
  low: close,
  close,
});

const validSnapshot: EvaluationSnapshot = {
  evaluatedAt: "2026-06-26T12:00:00.000Z",
  market: {
    ticker: "KXBTC",
    lifecycle: MarketLifecycle.ACTIVE,
    strikePrice: 64_225,
    timeRemainingMs: 600_000,
    closeTime: "2026-06-26T12:15:00.000Z",
  },
  btc: {
    price: 64_100,
    change24hPercent: 1.2,
    feedStatus: "live",
    providerSource: "upstream",
    candles: [candle(1, 64_100), candle(2, 64_100)],
  },
  pricing: {
    yesBidCents: 62,
    yesAskCents: 64,
    yesMidCents: 63,
    noBidCents: 37,
    noAskCents: 39,
    noMidCents: 38,
    liquidityQuality: "Good",
    volumeDollars: 500_000,
  },
};

describe("runEvaluationGuards", () => {
  it("passes in canonical order", () => {
    const result = runEvaluationGuards(validSnapshot, DEFAULT_ENGINE_CONFIG);
    expect(result.status).toBe("pass");
    expect(result.steps.map((step) => step.id)).toEqual([...GUARD_STEP_ORDER]);
  });

  it("short-circuits on first failure", () => {
    const result = runEvaluationGuards({ ...validSnapshot, market: null }, DEFAULT_ENGINE_CONFIG);
    expect(result.status).toBe("fail");
    if (result.status === "fail") {
      expect(result.gatesTriggered).toEqual(["guard-market-present"]);
      expect(result.steps.at(-1)?.outcome).toBe("fail");
    }
  });

  it("blocks disabled config", () => {
    const result = runEvaluationGuards(validSnapshot, {
      ...DEFAULT_ENGINE_CONFIG,
      enabled: false,
    });
    expect(result.status).toBe("fail");
    if (result.status === "fail") {
      expect(result.gatesTriggered).toEqual(["guard-config-enabled"]);
    }
  });

  it("blocks loading and error feed status before stale guard", () => {
    const loading = runEvaluationGuards(
      {
        ...validSnapshot,
        btc: { ...validSnapshot.btc!, feedStatus: "loading" },
      },
      DEFAULT_ENGINE_CONFIG,
    );
    expect(loading.status).toBe("fail");
    if (loading.status === "fail") {
      expect(loading.gatesTriggered).toEqual(["guard-btc-feed-loading"]);
    }

    const error = runEvaluationGuards(
      {
        ...validSnapshot,
        btc: { ...validSnapshot.btc!, feedStatus: "error" },
      },
      DEFAULT_ENGINE_CONFIG,
    );
    expect(error.status).toBe("fail");
    if (error.status === "fail") {
      expect(error.gatesTriggered).toEqual(["guard-btc-feed-error"]);
    }
  });
});
