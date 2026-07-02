import { describe, expect, it } from "vitest";

import {
  calculateEtaMs,
  formatCompletionPercent,
  formatDurationClock,
  formatProgressBar,
} from "./cliProgressMath";

describe("formatDurationClock", () => {
  it("formats sub-hour durations as MM:SS", () => {
    expect(formatDurationClock(102_000)).toBe("01:42");
    expect(formatDurationClock(192_000)).toBe("03:12");
  });

  it("formats hour-plus durations as HH:MM:SS", () => {
    expect(formatDurationClock(3_661_000)).toBe("01:01:01");
  });
});

describe("formatCompletionPercent", () => {
  it("rounds completion percent", () => {
    expect(formatCompletionPercent(182, 500)).toBe(36);
    expect(formatCompletionPercent(0, 0)).toBe(0);
  });
});

describe("formatProgressBar", () => {
  it("renders filled and empty segments", () => {
    expect(formatProgressBar(5, 10, 10)).toBe("█████░░░░░");
  });
});

describe("calculateEtaMs", () => {
  it("estimates remaining time from average throughput", () => {
    expect(calculateEtaMs(100_000, 50, 100)).toBe(100_000);
  });

  it("returns null before work starts or after completion", () => {
    expect(calculateEtaMs(10_000, 0, 100)).toBeNull();
    expect(calculateEtaMs(10_000, 100, 100)).toBeNull();
  });
});
