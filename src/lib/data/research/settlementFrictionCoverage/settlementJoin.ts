/**
 * Settlement-label join by marketTicker — coverage only, no outcome inference.
 */

export type SettlementLabelRecord = {
  marketTicker: string;
  result?: string | null;
  expirationValue?: string | null;
  floorStrike?: number | null;
  closeTime?: string | null;
  settlementTs?: string | null;
};

export type SettlementLabelFlags = {
  marketTicker: string;
  finalizedResult: boolean;
  nonEmptyExpirationValue: boolean;
  validNumericExpirationValue: boolean;
  jointFinalizedAndNonEmptyExpiration: boolean;
  finiteStrike: boolean;
  parseableCloseTime: boolean;
  parseableSettlementTs: boolean;
};

export type SettlementLabelCoverageSummary = {
  denominatorTickers: number;
  finalizedResultCount: number;
  nonEmptyExpirationValueCount: number;
  validNumericExpirationValueCount: number;
  jointFinalizedAndNonEmptyExpirationCount: number;
  finiteStrikeCount: number;
  parseableCloseTimeCount: number;
  parseableSettlementTsCount: number;
  duplicateTickerCount: number;
  conflictingTickerCount: number;
  brtiPathCoverageNote:
    "Not measured; historical BRTI paths and causal availability are not established.";
};

function isFinalizedResult(result: string | null | undefined): boolean {
  return result === "yes" || result === "no";
}

function isNonEmptyExpiration(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidNumericExpiration(value: string | null | undefined): boolean {
  if (!isNonEmptyExpiration(value)) return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function isParseableIso(value: string | null | undefined): boolean {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

export function classifySettlementLabel(
  record: SettlementLabelRecord,
): SettlementLabelFlags {
  const finalizedResult = isFinalizedResult(record.result ?? null);
  const nonEmptyExpirationValue = isNonEmptyExpiration(record.expirationValue);
  return {
    marketTicker: record.marketTicker,
    finalizedResult,
    nonEmptyExpirationValue,
    validNumericExpirationValue: isValidNumericExpiration(record.expirationValue),
    jointFinalizedAndNonEmptyExpiration:
      finalizedResult && nonEmptyExpirationValue,
    finiteStrike:
      record.floorStrike != null
      && Number.isFinite(record.floorStrike)
      && record.floorStrike > 0,
    parseableCloseTime: isParseableIso(record.closeTime),
    parseableSettlementTs: isParseableIso(record.settlementTs),
  };
}

function recordsConflict(a: SettlementLabelRecord, b: SettlementLabelRecord): boolean {
  const keys: (keyof SettlementLabelRecord)[] = [
    "result",
    "expirationValue",
    "floorStrike",
    "closeTime",
    "settlementTs",
  ];
  for (const key of keys) {
    const av = a[key] ?? null;
    const bv = b[key] ?? null;
    if (av !== bv) return true;
  }
  return false;
}

/**
 * Build ticker → label map. Duplicates that disagree are counted as conflicts;
 * first record kept for coverage flags (fail-soft for join, hard-count conflicts).
 */
export function indexSettlementLabels(records: readonly SettlementLabelRecord[]): {
  byTicker: Map<string, SettlementLabelRecord>;
  duplicateTickerCount: number;
  conflictingTickerCount: number;
} {
  const byTicker = new Map<string, SettlementLabelRecord>();
  const duplicateTickers = new Set<string>();
  const conflictingTickers = new Set<string>();
  for (const record of records) {
    const prev = byTicker.get(record.marketTicker);
    if (!prev) {
      byTicker.set(record.marketTicker, record);
      continue;
    }
    duplicateTickers.add(record.marketTicker);
    if (recordsConflict(prev, record)) {
      conflictingTickers.add(record.marketTicker);
    }
  }
  return {
    byTicker,
    duplicateTickerCount: duplicateTickers.size,
    conflictingTickerCount: conflictingTickers.size,
  };
}

export function summarizeSettlementLabelCoverage(input: {
  denominatorTickers: readonly string[];
  labels: readonly SettlementLabelRecord[];
}): SettlementLabelCoverageSummary {
  const { byTicker, duplicateTickerCount, conflictingTickerCount } =
    indexSettlementLabels(input.labels);
  let finalizedResultCount = 0;
  let nonEmptyExpirationValueCount = 0;
  let validNumericExpirationValueCount = 0;
  let jointFinalizedAndNonEmptyExpirationCount = 0;
  let finiteStrikeCount = 0;
  let parseableCloseTimeCount = 0;
  let parseableSettlementTsCount = 0;

  for (const ticker of input.denominatorTickers) {
    const label = byTicker.get(ticker);
    if (!label) continue;
    const flags = classifySettlementLabel(label);
    if (flags.finalizedResult) finalizedResultCount += 1;
    if (flags.nonEmptyExpirationValue) nonEmptyExpirationValueCount += 1;
    if (flags.validNumericExpirationValue) validNumericExpirationValueCount += 1;
    if (flags.jointFinalizedAndNonEmptyExpiration) {
      jointFinalizedAndNonEmptyExpirationCount += 1;
    }
    if (flags.finiteStrike) finiteStrikeCount += 1;
    if (flags.parseableCloseTime) parseableCloseTimeCount += 1;
    if (flags.parseableSettlementTs) parseableSettlementTsCount += 1;
  }

  return {
    denominatorTickers: input.denominatorTickers.length,
    finalizedResultCount,
    nonEmptyExpirationValueCount,
    validNumericExpirationValueCount,
    jointFinalizedAndNonEmptyExpirationCount,
    finiteStrikeCount,
    parseableCloseTimeCount,
    parseableSettlementTsCount,
    duplicateTickerCount,
    conflictingTickerCount,
    brtiPathCoverageNote:
      "Not measured; historical BRTI paths and causal availability are not established.",
  };
}
