import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { evaluate } from "@/lib/trading/evaluate";
import {
  DECISION_ENGINE_CONNECTED_MESSAGE,
} from "@/features/trading-dashboard/constants";
import { MarketLifecycle } from "@/lib/trading/snapshot/types";
import type { EvaluationSnapshot } from "@/types/domain/trading";

import { RecommendationPanel } from "./RecommendationPanel";

const stubSnapshot: EvaluationSnapshot = {
  evaluatedAt: "2026-06-26T12:00:00.000Z",
  market: {
    ticker: "KXBTC",
    lifecycle: MarketLifecycle.ACTIVE,
    strikePrice: 64_225,
    timeRemainingMs: 600_000,
    closeTime: "2026-06-26T12:15:00.000Z",
  },
  btc: {
    price: 64_250,
    change24hPercent: 1.2,
    feedStatus: "live",
    providerSource: "upstream",
    candles: [
      {
        timestamp: 1,
        open: 64_245,
        high: 64_255,
        low: 64_240,
        close: 64_250,
      },
      {
        timestamp: 2,
        open: 64_250,
        high: 64_260,
        low: 64_245,
        close: 64_255,
      },
    ],
  },
  pricing: {
    yesBidCents: 62,
    yesAskCents: 64,
    yesMidCents: 63,
    noBidCents: 37,
    noAskCents: 39,
    noMidCents: 38,
    liquidityQuality: "Good",
    volumeDollars: null,
  },
};

describe("RecommendationPanel", () => {
  it("shows engine decision instead of mock BUY UP advice", () => {
    const decision = evaluate(stubSnapshot, DEFAULT_ENGINE_CONFIG);
    render(<RecommendationPanel decision={decision} />);

    expect(screen.queryByText("BUY UP")).not.toBeInTheDocument();
    expect(screen.getByText(DECISION_ENGINE_CONNECTED_MESSAGE)).toBeInTheDocument();
    expect(screen.getAllByText("NO TRADE").length).toBeGreaterThan(0);
  });
});
