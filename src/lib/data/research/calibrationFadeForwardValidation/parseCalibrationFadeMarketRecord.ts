import type { CalibrationFadeMarketRecord } from "./calibrationFadeForwardValidationTypes";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullOrFiniteNumber(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

/**
 * Strict runtime schema for candidate market JSONL rows. A syntactically valid
 * JSON object with an invalid shape (including `{}`) is rejected instead of
 * being cast to CalibrationFadeMarketRecord, so malformed rows fail closed.
 * Returns the reasons a row was rejected; an empty list means the row parsed.
 */
export function validateCalibrationFadeMarketRecord(value: unknown): {
  record: CalibrationFadeMarketRecord | null;
  errors: string[];
} {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { record: null, errors: ["row is not a JSON object"] };
  }
  const row = value as Record<string, unknown>;

  if (typeof row.marketTicker !== "string" || row.marketTicker.trim().length === 0) {
    errors.push("marketTicker must be a non-empty string");
  }

  if (
    typeof row.entryTimestamp !== "string"
    || !Number.isFinite(Date.parse(row.entryTimestamp))
  ) {
    errors.push("entryTimestamp must be a parseable timestamp string");
  }

  if (
    !isFiniteNumber(row.impliedYesProbability)
    || row.impliedYesProbability < 0
    || row.impliedYesProbability > 1
  ) {
    errors.push("impliedYesProbability must be a finite number within 0-1");
  }

  const noAskCents = row.noAskCents;
  if (noAskCents !== null && (!isFiniteNumber(noAskCents) || noAskCents < 0 || noAskCents > 100)) {
    errors.push("noAskCents must be null or a finite cents value within 0-100");
  }

  if (typeof row.executableAvailable !== "boolean") {
    errors.push("executableAvailable must be a boolean");
  } else if (
    row.executableAvailable
    && !(isFiniteNumber(noAskCents) && noAskCents > 0 && noAskCents < 100)
  ) {
    errors.push("executableAvailable=true requires a valid executable noAskCents within 1-99");
  }

  if (typeof row.settlementStatus !== "string" || row.settlementStatus.trim().length === 0) {
    errors.push("settlementStatus must be a non-empty string");
  }

  const settledOutcome = row.settledOutcome;
  const settled = settledOutcome === "yes" || settledOutcome === "no";
  if (!settled && settledOutcome !== "unknown") {
    errors.push('settledOutcome must be "yes", "no", or "unknown"');
  }

  for (const field of ["grossReturnCents", "feeAdjustedReturnCents"] as const) {
    if (!isNullOrFiniteNumber(row[field])) {
      errors.push(`${field} must be null or a finite number`);
    } else if (row[field] !== null && (row.executableAvailable !== true || !settled)) {
      errors.push(
        `${field} must be null unless the market is executable and settled (evaluated)`,
      );
    }
  }

  const gap = row.calibrationGapSigned;
  if (gap !== null && (!isFiniteNumber(gap) || gap < -1 || gap > 1)) {
    errors.push("calibrationGapSigned must be null or a finite value within -1..1");
  } else if (gap !== null && !settled) {
    errors.push("calibrationGapSigned must be null when the market is unsettled");
  }

  if (errors.length > 0) {
    return { record: null, errors };
  }
  return { record: row as unknown as CalibrationFadeMarketRecord, errors: [] };
}
