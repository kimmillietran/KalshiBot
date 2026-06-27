import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { evaluate } from "@/lib/trading/evaluate";
import { GUARD_STEP_ORDER } from "@/lib/trading/guards/evaluationGuards";
import { MarketLifecycle } from "@/lib/trading/snapshot/types";

import {
  DEFAULT_REASONING_PRESENTATION_CONFIG,
  REASONING_PRESENTATION_MODEL_VERSION,
  summarizeTradeDecision,
} from "./summarizeTradeDecision";
import { formatReasoningTrace } from "./formatReasoningTrace";

const EVALUATED_AT = "2026-06-26T12:00:00.000Z";

const candle = (timestamp: number, close: number) => ({
  timestamp,
  open: close - 5,
  high: close + 5,
  low: close - 10,
  close,
});

function createValidSnapshot(
  overrides: Record<string, unknown> = {},
) {
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
      feedStatus: "live" as const,
      providerSource: "upstream" as const,
      candles: [candle(1, 64_090), candle(2, 64_100)],
    },
    pricing: {
      yesBidCents: 62,
      yesAskCents: 64,
      yesMidCents: 63,
      noBidCents: 37,
      noAskCents: 39,
      noMidCents: 38,
      liquidityQuality: "Good" as const,
      volumeDollars: 500_000,
    },
    ...overrides,
  };
}

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

function buyUpDecision() {
  return evaluate(
    createValidSnapshot({
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
    }),
    DEFAULT_ENGINE_CONFIG,
  );
}

function buyDownDecision() {
  return evaluate(
    createValidSnapshot({
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

describe("summarizeTradeDecision", () => {
  it("produces a bullish BUY UP explanation", () => {
    const presentation = summarizeTradeDecision(buyUpDecision());

    expect(presentation.modelVersion).toBe(REASONING_PRESENTATION_MODEL_VERSION);
    expect(presentation.headline).toBe(
      DEFAULT_REASONING_PRESENTATION_CONFIG.headlineBuyUp,
    );
    expect(presentation.primaryReason).toContain("action=BUY_UP");
    expect(presentation.supportingReasons.some((line) => /P\(up\)=/i.test(line))).toBe(
      true,
    );
    expect(presentation.riskNotes).toContain(
      DEFAULT_REASONING_PRESENTATION_CONFIG.executionDisabledNote,
    );
    expect(presentation.riskNotes.some((line) => /execution is enabled/i.test(line))).toBe(
      false,
    );
  });

  it("produces a bearish BUY DOWN explanation", () => {
    const presentation = summarizeTradeDecision(buyDownDecision());

    expect(presentation.headline).toBe(
      DEFAULT_REASONING_PRESENTATION_CONFIG.headlineBuyDown,
    );
    expect(presentation.primaryReason).toContain("action=BUY_DOWN");
  });

  it("explains NO TRADE from policy rejection", () => {
    const decision = evaluate(createValidSnapshot(), {
      ...DEFAULT_ENGINE_CONFIG,
      minEdgePercent: 100,
    });
    const presentation = summarizeTradeDecision(decision);

    expect(presentation.headline).toBe(
      DEFAULT_REASONING_PRESENTATION_CONFIG.headlineNoTradePolicy,
    );
    expect(presentation.primaryReason).toContain("action=NO_TRADE");
    expect(presentation.riskNotes.some((line) => /Policy returned NO TRADE/i.test(line))).toBe(
      true,
    );
    expect(presentation.supportingReasons.some((line) => /Model probability/i.test(line))).toBe(
      true,
    );
  });

  it("explains NO TRADE from guard failure", () => {
    const decision = evaluate(
      createValidSnapshot({ market: null }),
      DEFAULT_ENGINE_CONFIG,
    );
    const presentation = summarizeTradeDecision(decision);

    expect(presentation.headline).toBe(
      DEFAULT_REASONING_PRESENTATION_CONFIG.headlineNoTradeGuard,
    );
    expect(presentation.primaryReason).toMatch(/Active market required|snapshot\.market is null/i);
    expect(presentation.riskNotes.some((line) => /Triggered gate/i.test(line))).toBe(true);
    expect(presentation.supportingReasons).toContain(
      DEFAULT_REASONING_PRESENTATION_CONFIG.featuresUnavailableNote,
    );
    expect(presentation.supportingReasons.some((line) => /Model probability/i.test(line))).toBe(
      false,
    );
  });

  it("describes missing probability and EV truthfully on guard failure", () => {
    const decision = evaluate(
      createValidSnapshot({ market: null }),
      DEFAULT_ENGINE_CONFIG,
    );
    const presentation = summarizeTradeDecision(decision);

    expect(presentation.supportingReasons.join(" ")).not.toMatch(/P\(up\)=74/i);
    expect(presentation.technicalTrace.some((step) => step.id === "model-probability")).toBe(
      false,
    );
  });

  it("preserves technical trace order", () => {
    const decision = buyUpDecision();
    const presentation = summarizeTradeDecision(decision);

    expect(presentation.technicalTrace.map((step) => step.id)).toEqual(
      decision.reasoning.steps.map((step) => step.id),
    );
    expect(presentation.technicalTrace.map((step) => step.id)).toEqual([
      ...GUARD_STEP_ORDER,
      "feature-extraction",
      "model-probability",
      "model-expected-value",
      "decision-policy",
    ]);
  });

  it("is deterministic for identical inputs", () => {
    const decision = buyUpDecision();

    expect(summarizeTradeDecision(decision)).toEqual(summarizeTradeDecision(decision));
  });

  it("uses stable step labels in the technical trace", () => {
    const decision = buyUpDecision();
    const trace = formatReasoningTrace(decision.reasoning.steps);

    expect(trace.find((step) => step.id === "decision-policy")?.label).toBe(
      "Decision policy",
    );
    expect(trace.find((step) => step.id === "model-probability")?.label).toBe(
      "Probability model",
    );
  });

  it("does not invent unavailable model values", () => {
    const decision = evaluate(
      createValidSnapshot({ market: null }),
      DEFAULT_ENGINE_CONFIG,
    );
    const serialized = JSON.stringify(summarizeTradeDecision(decision));

    expect(serialized).not.toMatch(/"probabilityUp":/);
    expect(serialized).not.toContain("74.00%");
    expect(serialized).not.toMatch(/fake|placeholder|LLM/i);
  });

  it("accepts extensions without requiring positionSize", () => {
    const decision = buyUpDecision();

    expect(
      summarizeTradeDecision({
        decision,
        extensions: { positionSize: null },
      }).headline,
    ).toBe(DEFAULT_REASONING_PRESENTATION_CONFIG.headlineBuyUp);
  });
});
