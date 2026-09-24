import type { VenueAverageUpdate } from "./inferVenueAverageMapping";

export type CompletedAverageSelectionStatus =
  | "completed"
  | "incomplete"
  | "missing"
  | "ambiguous";

export type CompletedAverageSelection = {
  status: CompletedAverageSelectionStatus;
  selected: VenueAverageUpdate | null;
  matchingWindowCount: number;
  reason: string;
  laterRepeatsWithSameWindow: number;
};

export function targetSettlementWindow(closeMs: number): {
  startMs: number;
  endExclusiveMs: number;
} {
  return {
    startMs: closeMs - 60_000,
    endExclusiveMs: closeMs,
  };
}

export function updateMatchesTargetWindow(
  update: Pick<VenueAverageUpdate, "windowStartTsMs" | "windowEndTsExclusive">,
  closeMs: number,
): boolean {
  const target = targetSettlementWindow(closeMs);
  return update.windowStartTsMs === target.startMs
    && update.windowEndTsExclusive === target.endExclusiveMs;
}

/**
 * Select a completed venue-average update only when count is 60 and the
 * declared payload window is exactly [close−60s, close). Does not fall back
 * to an incomplete update. If several complete updates share that window,
 * keep the first by monotonic receipt and count later repeats.
 */
export function selectCompletedWindowAverage(input: {
  updates: readonly VenueAverageUpdate[];
  closeMs: number;
  fieldName?: string;
}): CompletedAverageSelection {
  const fieldName = input.fieldName ?? "last_60s_windowed_average_15min";
  const fieldUpdates = input.updates.filter((update) => update.fieldName === fieldName);
  if (fieldUpdates.length === 0) {
    return {
      status: "missing",
      selected: null,
      matchingWindowCount: 0,
      reason: "no-updates-for-field",
      laterRepeatsWithSameWindow: 0,
    };
  }
  const matchingWindow = fieldUpdates.filter((update) => updateMatchesTargetWindow(update, input.closeMs));
  const completed = matchingWindow.filter((update) => update.count === 60);
  if (completed.length === 0) {
    return {
      status: matchingWindow.length > 0 ? "incomplete" : "missing",
      selected: null,
      matchingWindowCount: matchingWindow.length,
      reason: matchingWindow.length > 0
        ? "target-window-present-but-count-is-not-60"
        : "no-update-declares-target-close-window",
      laterRepeatsWithSameWindow: 0,
    };
  }
  const ordered = [...completed].sort((left, right) => {
    if (left.localReceivedAtMonoMs !== right.localReceivedAtMonoMs) {
      return left.localReceivedAtMonoMs - right.localReceivedAtMonoMs;
    }
    return left.localReceivedAtMs - right.localReceivedAtMs;
  });
  return {
    status: completed.length > 1 ? "ambiguous" : "completed",
    selected: ordered[0] ?? null,
    matchingWindowCount: matchingWindow.length,
    reason: completed.length > 1
      ? "multiple-count-60-updates-share-target-window; first-by-monotonic-receipt-selected"
      : "count-60-and-declared-window-bound-to-target-close",
    laterRepeatsWithSameWindow: Math.max(0, completed.length - 1),
  };
}

export function sameAccumulatingWindow(
  previous: Pick<VenueAverageUpdate, "windowStartTsMs" | "fieldName"> | null,
  next: Pick<VenueAverageUpdate, "windowStartTsMs" | "fieldName">,
): boolean {
  if (previous == null) {
    return true;
  }
  return previous.fieldName === next.fieldName
    && previous.windowStartTsMs != null
    && previous.windowStartTsMs === next.windowStartTsMs;
}
