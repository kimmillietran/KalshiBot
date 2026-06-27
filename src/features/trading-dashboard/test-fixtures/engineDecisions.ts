import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { evaluate } from "@/lib/trading/evaluate";
import { MarketLifecycle } from "@/lib/trading/snapshot/types";
import type { EvaluationSnapshot } from "@/types/domain/trading";
import type { TradeDecision } from "@/types/domain/trading";

const EVALUATED_AT = "2026-06-26T12:00:00.000Z";

const candle = (timestamp: number, close: number) => ({
  timestamp,
  open: close - 5,
  high: close + 5,
  low: close - 10,
  close,
});

function risingCandles(start: number, count: number) {
  return Array.from({ length: count }, (_, index) =>
    candle(index + 1, start + index * 40),
  );
}

function fallingCandles(start: number, count: number) {
  return Array.from({ length: count }, (_, index) =>
    candle(index + 1, start - index * 40),
  );
}

function baseSnapshot(
  overrides: Partial<EvaluationSnapshot> = {},
): EvaluationSnapshot {
  return {
    evaluatedAt: EVALUATED_AT,
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
      candles: [candle(1, 64_090), candle(2, 64_100)],
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
    ...overrides,
  };
}

export function buyUpSnapshot(): EvaluationSnapshot {
  return baseSnapshot({
    market: {
      ticker: "KXBTC",
      lifecycle: MarketLifecycle.ACTIVE,
      strikePrice: 64_200,
      timeRemainingMs: 600_000,
      closeTime: "2026-06-26T12:15:00.000Z",
    },
    btc: {
      price: 64_600,
      change24hPercent: 2.5,
      feedStatus: "live",
      providerSource: "upstream",
      candles: risingCandles(64_100, 12),
    },
    pricing: {
      yesBidCents: 43,
      yesAskCents: 45,
      yesMidCents: 44,
      noBidCents: 52,
      noAskCents: 54,
      noMidCents: 53,
      liquidityQuality: "Good",
      volumeDollars: 500_000,
    },
  });
}

export function buyUpDecision(): TradeDecision {
  return evaluate(buyUpSnapshot(), DEFAULT_ENGINE_CONFIG);
}

export function buyUpWithBankrollDecision(
  targetRecommendedDollars = 250,
): TradeDecision {
  const baseline = buyUpDecision();
  const fraction = baseline.positionSize?.recommendedFraction ?? 0;
  return evaluate(buyUpSnapshot(), {
    ...DEFAULT_ENGINE_CONFIG,
    bankrollDollars: targetRecommendedDollars / fraction,
  });
}

export function buyDownDecision(): TradeDecision {
  return evaluate(
    baseSnapshot({
      market: {
        ticker: "KXBTC",
        lifecycle: MarketLifecycle.ACTIVE,
        strikePrice: 64_800,
        timeRemainingMs: 600_000,
        closeTime: "2026-06-26T12:15:00.000Z",
      },
      btc: {
        price: 64_200,
        change24hPercent: -1.5,
        feedStatus: "live",
        providerSource: "upstream",
        candles: fallingCandles(64_600, 12),
      },
      pricing: {
        yesBidCents: 58,
        yesAskCents: 60,
        yesMidCents: 59,
        noBidCents: 36,
        noAskCents: 38,
        noMidCents: 37,
        liquidityQuality: "Good",
        volumeDollars: 500_000,
      },
    }),
    DEFAULT_ENGINE_CONFIG,
  );
}

export function noTradePolicyDecision(): TradeDecision {
  return evaluate(baseSnapshot(), {
    ...DEFAULT_ENGINE_CONFIG,
    minEdgePercent: 100,
  });
}

export function guardFailureDecision(): TradeDecision {
  return evaluate(baseSnapshot({ market: null }), DEFAULT_ENGINE_CONFIG);
}
