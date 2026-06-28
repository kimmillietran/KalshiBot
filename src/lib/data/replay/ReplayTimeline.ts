import { serializeHistoricalTradingSnapshot } from "@/lib/data/snapshots/HistoricalSnapshotAssembler";
import type { HistoricalTradingSnapshot } from "@/lib/data/snapshots/types";

import type {
  CreateReplayTimelineInput,
  ReplayTimelineCursor,
  ReplayTimelineSnapshotSequence,
  ReplayTimelineState,
} from "./timelineTypes";

function compareSnapshots(
  left: HistoricalTradingSnapshot,
  right: HistoricalTradingSnapshot,
): number {
  const eventTimeCompare = left.temporal.eventTime.localeCompare(
    right.temporal.eventTime,
  );
  if (eventTimeCompare !== 0) {
    return eventTimeCompare;
  }

  const collectionTimeCompare = left.temporal.collectionTime.localeCompare(
    right.temporal.collectionTime,
  );
  if (collectionTimeCompare !== 0) {
    return collectionTimeCompare;
  }

  const tickerCompare = left.ticker.localeCompare(right.ticker);
  if (tickerCompare !== 0) {
    return tickerCompare;
  }

  return serializeHistoricalTradingSnapshot(left).localeCompare(
    serializeHistoricalTradingSnapshot(right),
  );
}

/** Deterministic ordering: eventTime → collectionTime → ticker → serialization. */
export function orderReplaySnapshots(
  snapshots: ReplayTimelineSnapshotSequence,
): readonly HistoricalTradingSnapshot[] {
  const ordered = snapshots
    .map((snapshot, inputIndex) => ({ snapshot, inputIndex }))
    .sort((left, right) => {
      const comparison = compareSnapshots(left.snapshot, right.snapshot);
      if (comparison !== 0) {
        return comparison;
      }
      return left.inputIndex - right.inputIndex;
    })
    .map(({ snapshot }) => snapshot);

  return Object.freeze(ordered);
}

function buildCursor(index: number, totalSteps: number): ReplayTimelineCursor {
  return Object.freeze({ index, totalSteps });
}

function buildState(
  snapshots: ReplayTimelineSnapshotSequence,
  cursorIndex: number,
): ReplayTimelineState {
  const totalSteps = snapshots.length;
  const isEmpty = totalSteps === 0;
  const isComplete = isEmpty || cursorIndex >= totalSteps;
  const current =
    isEmpty || isComplete ? null : snapshots[cursorIndex] ?? null;
  const hasNext = !isEmpty && !isComplete && cursorIndex < totalSteps - 1;

  return Object.freeze({
    cursor: buildCursor(cursorIndex, totalSteps),
    current,
    isEmpty,
    isComplete,
    hasNext,
  });
}

/** Deterministic replay timeline with immutable cursor advancement. */
export class ReplayTimeline {
  private readonly snapshots: ReplayTimelineSnapshotSequence;
  private readonly cursorIndex: number;

  private constructor(
    snapshots: ReplayTimelineSnapshotSequence,
    cursorIndex: number,
  ) {
    this.snapshots = snapshots;
    this.cursorIndex = cursorIndex;
  }

  static create(input: CreateReplayTimelineInput): ReplayTimeline {
    const ordered = orderReplaySnapshots(input.snapshots);
    return new ReplayTimeline(ordered, 0);
  }

  getState(): ReplayTimelineState {
    return buildState(this.snapshots, this.cursorIndex);
  }

  getOrderedSnapshots(): ReplayTimelineSnapshotSequence {
    return this.snapshots;
  }

  /** Returns a new timeline advanced one step; no-op when already complete. */
  stepNext(): ReplayTimeline {
    const { isEmpty, isComplete, hasNext } = this.getState();
    if (isEmpty || isComplete || !hasNext) {
      if (!isEmpty && !isComplete && !hasNext) {
        return new ReplayTimeline(this.snapshots, this.snapshots.length);
      }
      return this;
    }

    return new ReplayTimeline(this.snapshots, this.cursorIndex + 1);
  }

  /** Returns a new timeline reset to the first snapshot. */
  reset(): ReplayTimeline {
    return new ReplayTimeline(this.snapshots, 0);
  }

  /** Yields every snapshot in deterministic timeline order from the start. */
  *iterateAll(): Generator<HistoricalTradingSnapshot, void, undefined> {
    for (const snapshot of this.snapshots) {
      yield snapshot;
    }
  }
}
