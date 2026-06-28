export type SequenceApplyResult = "accepted" | "duplicate" | "gap";

/** Tracks monotonic Kalshi orderbook `seq` values for a subscription. */
export class SequenceTracker {
  private lastSeq: number | null = null;

  peek(): number | null {
    return this.lastSeq;
  }

  reset(seq: number): void {
    this.lastSeq = seq;
  }

  clear(): void {
    this.lastSeq = null;
  }

  apply(seq: number): SequenceApplyResult {
    if (this.lastSeq === null) {
      this.lastSeq = seq;
      return "accepted";
    }

    if (seq <= this.lastSeq) {
      return "duplicate";
    }

    if (seq === this.lastSeq + 1) {
      this.lastSeq = seq;
      return "accepted";
    }

    return "gap";
  }
}
