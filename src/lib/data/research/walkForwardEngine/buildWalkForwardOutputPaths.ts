import { posix } from "node:path";

import {
  WALK_FORWARD_FOLDS_DIR,
  WALK_FORWARD_SUMMARY_FILENAME,
} from "./walkForwardSplitTypes";

export function buildWalkForwardSplitRootPath(
  outputDir: string,
  splitId: string,
): string {
  return posix.join(
    outputDir.replace(/\\/g, "/"),
    splitId.replace(/\\/g, "/"),
  );
}

export function buildWalkForwardSummaryPath(
  outputDir: string,
  splitId: string,
): string {
  return posix.join(
    buildWalkForwardSplitRootPath(outputDir, splitId),
    WALK_FORWARD_SUMMARY_FILENAME,
  );
}

export function buildWalkForwardFoldOutputPath(
  outputDir: string,
  splitId: string,
  foldIndex: number,
): string {
  const paddedIndex = String(foldIndex).padStart(3, "0");
  return posix.join(
    buildWalkForwardSplitRootPath(outputDir, splitId),
    WALK_FORWARD_FOLDS_DIR,
    `fold-${paddedIndex}.json`,
  );
}
