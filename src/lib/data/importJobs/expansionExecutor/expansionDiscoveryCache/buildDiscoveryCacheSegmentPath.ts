import { posix } from "node:path";

/** Builds the on-disk path for a month-scoped expansion discovery cache segment. */
export function buildDiscoveryCacheSegmentPath(input: {
  cacheDir: string;
  seriesTicker: string;
  calendarMonth: string;
}): string {
  return posix.join(
    input.cacheDir.replace(/\\/g, "/"),
    input.seriesTicker,
    `${input.calendarMonth}.json`,
  );
}
