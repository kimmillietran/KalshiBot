import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DECISION_ENGINE_PENDING_MESSAGE,
  MODEL_NOT_LIVE_LABEL,
} from "@/features/trading-dashboard/constants";

import { RecommendationPanel } from "./RecommendationPanel";

describe("RecommendationPanel", () => {
  it("shows neutral placeholder instead of trade advice", () => {
    render(<RecommendationPanel />);

    expect(screen.queryByText("BUY UP")).not.toBeInTheDocument();
    expect(screen.getByText(MODEL_NOT_LIVE_LABEL)).toBeInTheDocument();
    expect(screen.getByText(DECISION_ENGINE_PENDING_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
