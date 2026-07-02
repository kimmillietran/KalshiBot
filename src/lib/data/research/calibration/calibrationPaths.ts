import { posix } from "node:path";

import {
  CalibrationError,
  CalibrationErrorCode,
  CALIBRATION_REPORT_FILENAME,
} from "./calibrationTypes";

export const INVALID_PATH_SEGMENT_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/;
export const RESERVED_PATH_SEGMENT_PATTERN = /^(?:\.|\.\.)$/;

export function assertSafePathSegment(
  value: string,
  label: string,
  marketTicker?: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new CalibrationError(
      `${label} is required`,
      CalibrationErrorCode.INVALID_OUTPUT_SCHEMA,
      marketTicker,
    );
  }

  if (
    INVALID_PATH_SEGMENT_PATTERN.test(trimmed)
    || RESERVED_PATH_SEGMENT_PATTERN.test(trimmed)
  ) {
    throw new CalibrationError(
      `${label} contains invalid path characters`,
      CalibrationErrorCode.INVALID_OUTPUT_SCHEMA,
      marketTicker ?? trimmed,
    );
  }

  return trimmed;
}

export function normalizeRootPath(root: string): string {
  return root.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function buildCalibrationReportOutputPath(
  outputRoot: string,
  strategyId: string,
  seriesTicker: string,
): string {
  const safeStrategy = assertSafePathSegment(strategyId, "strategyId");
  const safeSeries = assertSafePathSegment(seriesTicker, "seriesTicker");
  return posix.join(
    normalizeRootPath(outputRoot),
    safeStrategy,
    safeSeries,
    CALIBRATION_REPORT_FILENAME,
  );
}

export function buildCalibrationMarketKey(
  strategyId: string,
  seriesTicker: string,
  marketTicker: string,
): string {
  return `${strategyId}/${seriesTicker}/${marketTicker}`;
}
