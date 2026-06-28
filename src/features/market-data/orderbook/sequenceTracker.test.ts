import { describe, expect, it } from "vitest";

import { SequenceTracker } from "./sequenceTracker";

describe("SequenceTracker", () => {
  it("accepts the first sequence and monotonic increments", () => {
    const tracker = new SequenceTracker();
    expect(tracker.apply(1)).toBe("accepted");
    expect(tracker.apply(2)).toBe("accepted");
    expect(tracker.apply(2)).toBe("duplicate");
  });

  it("detects sequence gaps", () => {
    const tracker = new SequenceTracker();
    tracker.apply(1);
    expect(tracker.apply(3)).toBe("gap");
  });

  it("resets after REST resync", () => {
    const tracker = new SequenceTracker();
    tracker.apply(5);
    tracker.clear();
    expect(tracker.apply(6)).toBe("accepted");
  });
});
