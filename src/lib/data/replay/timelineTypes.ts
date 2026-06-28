import type { HistoricalTradingSnapshot } from "@/lib/data/snapshots/types";

/** Ordered immutable sequence of historical trading snapshots for replay. */
export type ReplayTimelineSnapshotSequence = readonly HistoricalTradingSnapshot[];

/** Cursor position within a replay timeline. */
export type ReplayTimelineCursor = {
  /** Zero-based step index; equals `totalSteps` when replay is complete. */
  index: number;
  /** Number of snapshots in the timeline. */
  totalSteps: number;
};

/** Immutable replay cursor state exposed after each step. */
export type ReplayTimelineState = {
  cursor: ReplayTimelineCursor;
  /** Snapshot at the current step, or null when empty or complete. */
  current: HistoricalTradingSnapshot | null;
  /** True when the timeline contains no snapshots. */
  isEmpty: boolean;
  /** True when the cursor has advanced past the final snapshot. */
  isComplete: boolean;
  /** True when another snapshot remains after the current step. */
  hasNext: boolean;
};

export type CreateReplayTimelineInput = {
  snapshots: ReplayTimelineSnapshotSequence;
};
