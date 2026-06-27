import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketLifecycle } from "../types";
import { MarketStatusBadge } from "./MarketStatusBadge";

describe("MarketStatusBadge", () => {
  it("renders lifecycle label when feed is live", () => {
    render(
      <MarketStatusBadge status="live" lifecycle={MarketLifecycle.ACTIVE} />,
    );

    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("renders feed status label when lifecycle is absent", () => {
    render(<MarketStatusBadge status="fallback" />);

    expect(screen.getByText("FALLBACK")).toBeInTheDocument();
  });

  it("renders no-market label without lifecycle", () => {
    render(<MarketStatusBadge status="no-market" />);

    expect(screen.getByText("NO MARKET")).toBeInTheDocument();
  });
});
