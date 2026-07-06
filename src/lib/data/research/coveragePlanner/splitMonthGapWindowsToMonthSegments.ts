export type MonthGapWindow = {
  seriesTicker: string;
  startMonth: string;
  endMonth: string;
  targetMonths: string[];
};

/** Splits multi-month gap windows into single-month segments for discovery cache alignment. */
export function splitMonthGapWindowsToMonthSegments(
  windows: readonly MonthGapWindow[],
): MonthGapWindow[] {
  const split: MonthGapWindow[] = [];

  for (const window of windows) {
    if (window.targetMonths.length <= 1) {
      split.push(window);
      continue;
    }

    for (const month of window.targetMonths) {
      split.push({
        seriesTicker: window.seriesTicker,
        startMonth: month,
        endMonth: month,
        targetMonths: [month],
      });
    }
  }

  return split;
}
