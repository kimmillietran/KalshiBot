import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DECISION_ENGINE_CONNECTED_MESSAGE,
} from "@/features/trading-dashboard/constants";

import { RecommendationPanel } from "./RecommendationPanel";
import {
  buyDownDecision,
  buyUpDecision,
  guardFailureDecision,
  noTradePolicyDecision,
} from "../test-fixtures/engineDecisions";

describe("RecommendationPanel", () => {
  it("renders BUY UP from engine output", () => {
    render(<RecommendationPanel decision={buyUpDecision()} />);

    expect(screen.getAllByText("BUY UP").length).toBeGreaterThan(0);
    expect(screen.getByText(DECISION_ENGINE_CONNECTED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/model deferred/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/probability model ships/i)).not.toBeInTheDocument();
  });

  it("renders BUY DOWN from engine output", () => {
    render(<RecommendationPanel decision={buyDownDecision()} />);

    expect(screen.getAllByText("BUY DOWN").length).toBeGreaterThan(0);
  });

  it("renders NO TRADE from engine output", () => {
    render(<RecommendationPanel decision={noTradePolicyDecision()} />);

    expect(screen.getAllByText("NO TRADE").length).toBeGreaterThan(0);
  });

  it("renders guard failure banner when evaluation is blocked", () => {
    render(<RecommendationPanel decision={guardFailureDecision()} />);

    expect(screen.getAllByText("NO TRADE").length).toBeGreaterThan(0);
    expect(screen.getByText(/Guard failure — NO TRADE/i)).toBeInTheDocument();
  });
});
