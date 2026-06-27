import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DECISION_ENGINE_CONNECTED_MESSAGE } from "@/features/trading-dashboard/constants";
import { isGuardFailure } from "@/features/trading-dashboard/formatting/decisionDisplay";

import { ProbabilityEdgePanel } from "./ProbabilityEdgePanel";
import {
  buyDownDecision,
  buyUpDecision,
  guardFailureDecision,
  noTradePolicyDecision,
} from "../test-fixtures/engineDecisions";

describe("ProbabilityEdgePanel", () => {
  it("renders probability and expected value for BUY UP", () => {
    const decision = buyUpDecision();
    const { container } = render(<ProbabilityEdgePanel decision={decision} />);
    const view = within(container);

    expect(view.getByText("Model probability")).toBeInTheDocument();
    expect(view.getByText("Expected value")).toBeInTheDocument();
    expect(view.getByText(/P\(up\)/i)).toBeInTheDocument();
    expect(view.getByText(/Net EV UP/i)).toBeInTheDocument();
  });

  it("renders probability and expected value for BUY DOWN", () => {
    const decision = buyDownDecision();
    const { container } = render(<ProbabilityEdgePanel decision={decision} />);
    const view = within(container);

    expect(view.getByText("Expected value")).toBeInTheDocument();
    expect(view.getByText("Edge DOWN")).toBeInTheDocument();
  });

  it("renders NO TRADE model outputs when policy rejects trade", () => {
    const decision = noTradePolicyDecision();
    const { container } = render(<ProbabilityEdgePanel decision={decision} />);
    const view = within(container);

    expect(view.getByText("Model probability")).toBeInTheDocument();
    expect(view.getByText("Expected value")).toBeInTheDocument();
    expect(view.getAllByText("NO TRADE").length).toBeGreaterThan(0);
  });

  it("renders guard failure state with triggered gate", () => {
    const decision = guardFailureDecision();
    expect(isGuardFailure(decision)).toBe(true);

    const { container } = render(<ProbabilityEdgePanel decision={decision} />);
    const view = within(container);

    expect(view.getByText(/Guard failure — NO TRADE/i)).toBeInTheDocument();
    expect(view.getByText(/Gate:/i)).toBeInTheDocument();
    expect(view.getByText("Guard trace")).toBeInTheDocument();
    expect(view.queryByText("Model probability")).not.toBeInTheDocument();
    expect(view.queryByText("Expected value")).not.toBeInTheDocument();
  });

  it("shows live engine subtitle", () => {
    const { container } = render(<ProbabilityEdgePanel decision={buyUpDecision()} />);
    expect(within(container).getByText(DECISION_ENGINE_CONNECTED_MESSAGE)).toBeInTheDocument();
    expect(screen.getAllByText(DECISION_ENGINE_CONNECTED_MESSAGE).length).toBeGreaterThan(0);
  });
});
