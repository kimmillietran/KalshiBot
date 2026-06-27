import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_REASONING_PRESENTATION_CONFIG,
  summarizeTradeDecision,
} from "@/lib/trading/reasoning-presentation";

import { AIReasoningPanel } from "./AIReasoningPanel";
import {
  buyDownDecision,
  buyUpDecision,
  guardFailureDecision,
  noTradePolicyDecision,
} from "../test-fixtures/engineDecisions";
import { POSITION_SIZING_UNAVAILABLE_MESSAGE } from "../constants";

function renderPanel(decision: ReturnType<typeof buyUpDecision>) {
  const presentation = summarizeTradeDecision(decision);
  const view = render(<AIReasoningPanel decision={decision} />);
  return { presentation, ...view };
}

describe("AIReasoningPanel", () => {
  it("renders BUY UP presentation with bullish headline and primary reason", () => {
    const decision = buyUpDecision();
    const { presentation, container } = renderPanel(decision);
    const view = within(container);

    expect(view.getByText("Headline")).toBeInTheDocument();
    expect(view.getByText(presentation.headline)).toBeInTheDocument();
    expect(presentation.headline).toBe(
      DEFAULT_REASONING_PRESENTATION_CONFIG.headlineBuyUp,
    );
    expect(view.getByText("Primary Reason")).toBeInTheDocument();
    expect(view.getAllByText(presentation.primaryReason!).length).toBeGreaterThan(0);
    expect(presentation.primaryReason).toContain("action=BUY_UP");
    expect(view.queryByText(POSITION_SIZING_UNAVAILABLE_MESSAGE)).not.toBeInTheDocument();
    expect(view.queryByText("Pipeline trace")).not.toBeInTheDocument();
  });

  it("renders BUY DOWN presentation with bearish headline", () => {
    const decision = buyDownDecision();
    const { presentation, container } = renderPanel(decision);
    const view = within(container);

    expect(view.getByText(presentation.headline)).toBeInTheDocument();
    expect(presentation.headline).toBe(
      DEFAULT_REASONING_PRESENTATION_CONFIG.headlineBuyDown,
    );
    expect(presentation.primaryReason).toContain("action=BUY_DOWN");
    expect(view.getAllByText(presentation.primaryReason!).length).toBeGreaterThan(0);
  });

  it("renders NO TRADE policy presentation without sizing unavailable", () => {
    const decision = noTradePolicyDecision();
    const { presentation, container } = renderPanel(decision);
    const view = within(container);

    expect(view.getByText(presentation.headline)).toBeInTheDocument();
    expect(presentation.headline).toBe(
      DEFAULT_REASONING_PRESENTATION_CONFIG.headlineNoTradePolicy,
    );
    expect(presentation.primaryReason).toContain("action=NO_TRADE");
    expect(decision.positionSize).not.toBeNull();
    expect(view.queryByText("Sizing unavailable")).not.toBeInTheDocument();
    expect(view.queryByText(POSITION_SIZING_UNAVAILABLE_MESSAGE)).not.toBeInTheDocument();
  });

  it("renders guard failure presentation with sizing unavailable", () => {
    const decision = guardFailureDecision();
    const { presentation, container } = renderPanel(decision);
    const view = within(container);

    expect(view.getByText(presentation.headline)).toBeInTheDocument();
    expect(presentation.headline).toBe(
      DEFAULT_REASONING_PRESENTATION_CONFIG.headlineNoTradeGuard,
    );
    expect(decision.positionSize).toBeNull();
    expect(view.getByText("Sizing unavailable")).toBeInTheDocument();
    expect(view.getByText(POSITION_SIZING_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(
      presentation.supportingReasons.some((line) => /Feature vector unavailable/i.test(line)),
    ).toBe(true);
  });

  it("renders presentation summary, supporting reasons, and risk notes", () => {
    const decision = buyUpDecision();
    const { presentation, container } = renderPanel(decision);
    const view = within(container);

    expect(view.getByText("Summary")).toBeInTheDocument();
    expect(view.getByText(presentation.summary)).toBeInTheDocument();
    expect(view.getByText("Supporting Reasons")).toBeInTheDocument();
    for (const reason of presentation.supportingReasons) {
      expect(view.getAllByText(reason).length).toBeGreaterThan(0);
    }
    expect(view.getByText("Risk Notes")).toBeInTheDocument();
    for (const note of presentation.riskNotes) {
      expect(view.getAllByText(note).length).toBeGreaterThan(0);
    }
  });

  it("preserves technical trace details in an expandable section", () => {
    const decision = buyUpDecision();
    const { presentation, container } = renderPanel(decision);
    const view = within(container);
    const details = container.querySelector("details");

    expect(view.getByText("Technical Trace")).toBeInTheDocument();
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");

    const policyTrace = presentation.technicalTrace.find(
      (step) => step.id === "decision-policy",
    );
    expect(policyTrace).toBeDefined();
    expect(policyTrace?.label).toBe("Decision policy");

    fireEvent.click(view.getByText("Technical Trace"));

    expect(details).toHaveAttribute("open");
    expect(view.getByText("Decision policy")).toBeInTheDocument();
    if (policyTrace?.detail) {
      expect(view.getAllByText(policyTrace.detail).length).toBeGreaterThan(0);
    }
    expect(
      presentation.technicalTrace.map((step) => step.id),
    ).toEqual(decision.reasoning.steps.map((step) => step.id));
  });

  it("does not regress to raw pipeline trace rendering", () => {
    const decision = buyUpDecision();
    const { container } = render(<AIReasoningPanel decision={decision} />);
    const view = within(container);

    expect(view.queryByText("Pipeline trace")).not.toBeInTheDocument();
    expect(view.getByText("Headline")).toBeInTheDocument();
    expect(view.getByText("Technical Trace")).toBeInTheDocument();
    expect(
      summarizeTradeDecision(decision).headline,
    ).not.toEqual(decision.reasoning.summary);
  });

  it("matches snapshot for BUY UP presentation structure", () => {
    const decision = buyUpDecision();
    const presentation = summarizeTradeDecision(decision);
    const { container } = render(<AIReasoningPanel decision={decision} />);

    expect({
      headline: presentation.headline,
      summary: presentation.summary,
      primaryReason: presentation.primaryReason,
      supportingReasonCount: presentation.supportingReasons.length,
      riskNoteCount: presentation.riskNotes.length,
      traceStepCount: presentation.technicalTrace.length,
      sectionTitles: Array.from(container.querySelectorAll("section > p")).map(
        (node) => node.textContent,
      ),
    }).toMatchSnapshot();
  });
});
