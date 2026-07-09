import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { assertCaptureSpikeSafety } from "./captureSpikeSafetyGuard";

describe("captureSpikeSafetyGuard", () => {
  it("does not import order placement clients in capture spike sources", () => {
    const files = [
      "runKalshiWsCaptureSpike.ts",
      "runDryRunKalshiWsCapture.ts",
      "runLiveKalshiWsCapture.ts",
      "kalshiWsCaptureMessageProcessor.ts",
    ];

    for (const file of files) {
      const source = readFileSync(
        join(process.cwd(), "src/lib/data/live/kalshiWsCaptureSpike", file),
        "utf8",
      );
      expect(() => assertCaptureSpikeSafety(source)).not.toThrow();
    }

    const cliSource = readFileSync(
      join(process.cwd(), "scripts/live/runKalshiWsCaptureSpike.ts"),
      "utf8",
    );
    expect(() => assertCaptureSpikeSafety(cliSource)).not.toThrow();
  });
});
