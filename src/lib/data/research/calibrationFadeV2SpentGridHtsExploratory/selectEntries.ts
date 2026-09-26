import { isClassBReconstructionUncertain } from "./classBProxy";
import { evaluatePreentryEligibility } from "./eligibility";
import type {
  EligibilityFailureReason,
  PreentryFeatureRow,
  SelectedEntry,
} from "./types";

export type SelectionResult = {
  rowsScanned: number;
  eligibleRows: number;
  selected: SelectedEntry[];
  duplicateConflicts: Array<{
    marketTicker: string;
    entryTimestampMs: number;
    rowCount: number;
  }>;
  exclusionCounts: Record<EligibilityFailureReason | "duplicate-conflict", number>;
};

function bump(
  map: Record<string, number>,
  key: string,
): void {
  map[key] = (map[key] ?? 0) + 1;
}

/**
 * Freeze entries from pre-entry fields only: earliest eligible timestamp per market.
 * Duplicate rows at the same earliest timestamp are flagged, not selected.
 */
export function selectEarliestEligibleEntries(
  rows: readonly PreentryFeatureRow[],
): SelectionResult {
  const exclusionCounts: Record<string, number> = {};
  let eligibleRows = 0;

  type Cand = { row: PreentryFeatureRow };
  const byMarket = new Map<string, Cand[]>();

  for (const row of rows) {
    const verdict = evaluatePreentryEligibility(row);
    if (!verdict.ok) {
      bump(exclusionCounts, verdict.reason);
      continue;
    }
    eligibleRows += 1;
    const list = byMarket.get(row.marketTicker) ?? [];
    list.push({ row });
    byMarket.set(row.marketTicker, list);
  }

  const selected: SelectedEntry[] = [];
  const duplicateConflicts: SelectionResult["duplicateConflicts"] = [];

  for (const [marketTicker, cands] of [...byMarket.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    let minTs = Number.POSITIVE_INFINITY;
    for (const c of cands) {
      if (c.row.entryTimestampMs < minTs) minTs = c.row.entryTimestampMs;
    }
    const atMin = cands.filter((c) => c.row.entryTimestampMs === minTs);
    if (atMin.length !== 1) {
      duplicateConflicts.push({
        marketTicker,
        entryTimestampMs: minTs,
        rowCount: atMin.length,
      });
      bump(exclusionCounts, "duplicate-conflict");
      continue;
    }
    const row = atMin[0]!.row;
    const mismatch = row.halfSpreadMismatch ?? null;
    selected.push({
      marketTicker,
      utcDayKey: row.utcDayKey,
      entryTimestampMs: row.entryTimestampMs,
      closeTimeMs:
        typeof row.closeTimeMs === "number" && Number.isFinite(row.closeTimeMs)
          ? row.closeTimeMs
          : null,
      timeRemainingMs: row.timeRemainingMs as number,
      yesBidCents: row.yesBidCents as number,
      yesAskCents: row.yesAskCents as number,
      yesMidpoint: row.yesMidpoint as number,
      noAskCents: row.noAskCents as number,
      yesBidSize:
        typeof row.yesBidSize === "number" && Number.isFinite(row.yesBidSize)
          ? row.yesBidSize
          : null,
      yesAskSize:
        typeof row.yesAskSize === "number" && Number.isFinite(row.yesAskSize)
          ? row.yesAskSize
          : null,
      annualizedRealizedVolatility:
        typeof row.annualizedRealizedVolatility === "number"
          && Number.isFinite(row.annualizedRealizedVolatility)
          ? row.annualizedRealizedVolatility
          : null,
      halfSpreadMismatchPresent: mismatch != null,
      classBReconstructionUncertain: isClassBReconstructionUncertain({
        yesBidCents: row.yesBidCents as number,
        yesAskCents: row.yesAskCents as number,
        halfSpreadMismatch: mismatch,
      }),
      retainedEntryHalfSpreadCents:
        typeof row.retainedEntryHalfSpreadCents === "number"
          && Number.isFinite(row.retainedEntryHalfSpreadCents)
          ? row.retainedEntryHalfSpreadCents
          : null,
    });
  }

  selected.sort((a, b) =>
    a.utcDayKey.localeCompare(b.utcDayKey)
    || a.marketTicker.localeCompare(b.marketTicker)
    || a.entryTimestampMs - b.entryTimestampMs
  );

  return {
    rowsScanned: rows.length,
    eligibleRows,
    selected,
    duplicateConflicts,
    exclusionCounts: exclusionCounts as SelectionResult["exclusionCounts"],
  };
}
