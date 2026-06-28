import { describe, expect, it, vi } from "vitest";

import { copyTextToClipboard } from "./copyTextToClipboard";

describe("copyTextToClipboard", () => {
  it("writes text through the injected clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    const result = await copyTextToClipboard("payload", { writeText });

    expect(result).toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith("payload");
  });

  it("returns an error when clipboard is unavailable", async () => {
    const result = await copyTextToClipboard("payload", null);

    expect(result).toEqual({ ok: false, error: "Clipboard unavailable" });
  });
});
