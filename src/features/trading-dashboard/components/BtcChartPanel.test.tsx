import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithDashboard } from "@/test/test-utils";

import { BtcChartPanel } from "./BtcChartPanel";

describe("BtcChartPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders settlement target line and above/below state", async () => {
    renderWithDashboard(<BtcChartPanel />);

    await waitFor(() => {
      expect(screen.getAllByText(/Settlement target/i).length).toBeGreaterThan(0);
    });

    expect(
      screen.getByLabelText("BTC price chart with settlement target line"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Above target|Below target/i)).toBeInTheDocument();
    expect(screen.getByText(/vs target/i)).toBeInTheDocument();
  });
});
