import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  POSITION_SIZING_DOLLARS_UNAVAILABLE_LABEL,
  POSITION_SIZING_RECOMMENDED_POSITION_LABEL,
  POSITION_SIZING_UNAVAILABLE_MESSAGE,
  POSITION_SIZING_ZERO_ALLOCATION_MESSAGE,
  POSITION_SIZING_ZERO_REASON,
} from "@/features/trading-dashboard/constants";

import { TradeManagementPanel } from "./TradeManagementPanel";
import {
  buyDownDecision,
  buyUpDecision,
  buyUpWithDollarsDecision,
  guardFailureDecision,
  mockPositionSize,
  noTradePolicyDecision,
  zeroPositionSizeDecision,
} from "../test-fixtures/positionSizingDecisions";

describe("TradeManagementPanel", () => {
  it("renders positive sizing for BUY UP", () => {
    const { container } = render(<TradeManagementPanel decision={buyUpDecision()} />);
    const view = within(container);

    expect(view.getByText(POSITION_SIZING_RECOMMENDED_POSITION_LABEL)).toBeInTheDocument();
    expect(view.getByText(/Recommended position:/i)).toBeInTheDocument();
    expect(view.getByText(/Position side/i)).toBeInTheDocument();
    expect(view.getByText("YES")).toBeInTheDocument();
    expect(view.getByText(/Kelly fraction/i)).toBeInTheDocument();
    expect(view.getByText(/Raw Kelly/i)).toBeInTheDocument();
    expect(view.getByText("5.7.0")).toBeInTheDocument();
    expect(view.getByText(/Sizing reasoning/i)).toBeInTheDocument();
    expect(view.queryByText(POSITION_SIZING_UNAVAILABLE_MESSAGE)).not.toBeInTheDocument();
  });

  it("renders positive sizing for BUY DOWN", () => {
    const { container } = render(<TradeManagementPanel decision={buyDownDecision()} />);
    const view = within(container);

    expect(view.getByText("NO")).toBeInTheDocument();
    expect(view.getByText(/Recommended position:/i)).toBeInTheDocument();
  });

  it("renders zero allocation for NO TRADE policy rejection", () => {
    const decision = zeroPositionSizeDecision();
    const { container } = render(<TradeManagementPanel decision={decision} />);
    const view = within(container);

    expect(view.getByText(POSITION_SIZING_RECOMMENDED_POSITION_LABEL)).toBeInTheDocument();
    expect(view.getAllByText("0.00%").length).toBeGreaterThan(0);
    expect(view.getByText(`Reason: ${POSITION_SIZING_ZERO_REASON}`)).toBeInTheDocument();
    expect(view.getByText(new RegExp(POSITION_SIZING_ZERO_ALLOCATION_MESSAGE, "i"))).toBeInTheDocument();
    expect(view.queryByText(POSITION_SIZING_UNAVAILABLE_MESSAGE)).not.toBeInTheDocument();
    expect(decision.positionSize).not.toBeNull();
    expect(decision.positionSize?.recommendedFraction).toBe(0);
  });

  it("renders unavailable sizing on guard failure", () => {
    const { container } = render(<TradeManagementPanel decision={guardFailureDecision()} />);
    const view = within(container);

    expect(view.getByText(POSITION_SIZING_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(view.queryByText(POSITION_SIZING_RECOMMENDED_POSITION_LABEL)).not.toBeInTheDocument();
    expect(view.getByText(/Evaluation stopped before position sizing/i)).toBeInTheDocument();
    expect(view.queryByText(/Sizing unavailable/i)).not.toBeInTheDocument();
  });

  it("shows bankroll dollars when present in fixture", () => {
    const { container } = render(<TradeManagementPanel decision={buyUpWithDollarsDecision()} />);
    const view = within(container);

    expect(view.getByText("$50.00")).toBeInTheDocument();
  });

  it("shows dollars unavailable label when recommendedDollars is null", () => {
    const decision = buyUpDecision();
    const { container } = render(<TradeManagementPanel decision={decision} />);
    const view = within(container);

    expect(view.getByText(POSITION_SIZING_DOLLARS_UNAVAILABLE_LABEL)).toBeInTheDocument();
  });

  it("does not hide sizing section for zero percent recommendations", () => {
    const { container } = render(
      <TradeManagementPanel
        decision={{
          ...noTradePolicyDecision(),
          positionSize: mockPositionSize({
            recommendedFraction: 0,
            recommendedPercent: 0,
            recommendedDollars: null,
            cappedFraction: 0,
            rawKellyFraction: 0,
            side: null,
            reasoning: ["recommend=0.00%"],
          }),
        }}
      />,
    );
    const view = within(container);

    expect(view.getAllByText(POSITION_SIZING_RECOMMENDED_POSITION_LABEL).length).toBeGreaterThan(0);
    expect(view.getAllByText("0.00%").length).toBeGreaterThan(0);
  });
});
