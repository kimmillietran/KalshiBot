import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DECISION_EXPORT_BUTTON_LABEL,
  DECISION_EXPORT_COPIED_LABEL,
} from "@/features/trading-dashboard/constants";
import { buyUpDecision } from "@/features/trading-dashboard/test-fixtures/engineDecisions";

import { DecisionExportButton } from "./DecisionExportButton";

describe("DecisionExportButton", () => {
  afterEach(() => {
    cleanup();
  });

  it("calls the injectable copy helper with serialized decision JSON", async () => {
    const copyText = vi.fn().mockResolvedValue({ ok: true as const });
    const decision = buyUpDecision();

    render(<DecisionExportButton decision={decision} copyText={copyText} />);

    fireEvent.click(screen.getByRole("button", { name: DECISION_EXPORT_BUTTON_LABEL }));

    await waitFor(() => {
      expect(copyText).toHaveBeenCalledTimes(1);
    });

    const copied = copyText.mock.calls[0]?.[0];
    expect(typeof copied).toBe("string");
    expect(copied).toContain('"action":"BUY UP"');
    expect(copied).toContain(`"engineVersion":"${decision.engineVersion}"`);
    expect(copied).not.toContain("undefined");
  });

  it("shows copied state after successful copy", async () => {
    const copyText = vi.fn().mockResolvedValue({ ok: true as const });

    render(<DecisionExportButton decision={buyUpDecision()} copyText={copyText} />);

    fireEvent.click(screen.getByRole("button", { name: DECISION_EXPORT_BUTTON_LABEL }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: DECISION_EXPORT_COPIED_LABEL })).toBeInTheDocument();
    });
  });

  it("shows error state when clipboard is unavailable without blocking render", async () => {
    const copyText = vi.fn().mockResolvedValue({
      ok: false as const,
      error: "Clipboard unavailable",
    });

    render(<DecisionExportButton decision={buyUpDecision()} copyText={copyText} />);

    expect(screen.getByRole("button", { name: DECISION_EXPORT_BUTTON_LABEL })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: DECISION_EXPORT_BUTTON_LABEL }));

    await waitFor(() => {
      expect(screen.getByText("Clipboard unavailable")).toBeInTheDocument();
    });
  });

  it("resets copied state after the feedback timer", async () => {
    const copyText = vi.fn().mockResolvedValue({ ok: true as const });

    render(<DecisionExportButton decision={buyUpDecision()} copyText={copyText} />);

    fireEvent.click(screen.getByRole("button", { name: DECISION_EXPORT_BUTTON_LABEL }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: DECISION_EXPORT_COPIED_LABEL })).toBeInTheDocument();
    });

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: DECISION_EXPORT_BUTTON_LABEL })).toBeInTheDocument();
      },
      { timeout: 2_500 },
    );
  });

  it("does not use localStorage or network APIs", () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <DecisionExportButton
        decision={buyUpDecision()}
        copyText={vi.fn().mockResolvedValue({ ok: true as const })}
      />,
    );

    expect(localStorageSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    localStorageSpy.mockRestore();
    fetchSpy.mockRestore();
  });
});
