import {
  computeKalshiScheduleFeeCents,
  KALSHI_FEE_SCHEDULE_ROLE,
  KALSHI_FEE_SCHEDULE_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";

import type {
  EvaluableTrade,
  SelectedEntry,
  SettlementLabelRow,
  UnevaluableReason,
} from "./types";

export type LabelJoinResult = {
  evaluable: EvaluableTrade[];
  unevaluable: Array<{
    entry: SelectedEntry;
    reason: UnevaluableReason;
    detail?: string;
  }>;
  reasonCounts: Record<UnevaluableReason, number>;
};

function normalizeResult(value: unknown): "yes" | "no" | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "yes" || v === "no") return v;
  return null;
}

export function computeEntryTakerFeeCents(noAskCents: number): number {
  return computeKalshiScheduleFeeCents({
    quantity: 1,
    priceCents: noAskCents,
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
  });
}

export function computeHoldToSettlementPnl(input: {
  noAskCents: number;
  settlementResult: "yes" | "no";
  entryFeeCents: number;
}): { grossPnlCents: number; netPnlCents: number } {
  const grossPnlCents =
    input.settlementResult === "no"
      ? 100 - input.noAskCents
      : -input.noAskCents;
  return {
    grossPnlCents,
    netPnlCents: grossPnlCents - input.entryFeeCents,
  };
}

/**
 * Join official labels after entries are frozen. Missing labels do not reselect.
 */
export function joinSettlementOutcomes(
  entries: readonly SelectedEntry[],
  labels: readonly SettlementLabelRow[],
): LabelJoinResult {
  const byTicker = new Map<string, SettlementLabelRow[]>();
  for (const label of labels) {
    if (typeof label.marketTicker !== "string" || !label.marketTicker) continue;
    const list = byTicker.get(label.marketTicker) ?? [];
    list.push(label);
    byTicker.set(label.marketTicker, list);
  }

  const evaluable: EvaluableTrade[] = [];
  const unevaluable: LabelJoinResult["unevaluable"] = [];
  const reasonCounts: Record<UnevaluableReason, number> = {
    "missing-label": 0,
    "invalid-result": 0,
    "conflicting-labels": 0,
  };

  for (const entry of entries) {
    const rows = byTicker.get(entry.marketTicker) ?? [];
    if (rows.length === 0) {
      reasonCounts["missing-label"] += 1;
      unevaluable.push({ entry, reason: "missing-label" });
      continue;
    }
    const normalized = rows.map((r) => normalizeResult(r.result));
    const uniq = new Set(normalized);
    if ([...uniq].some((v) => v == null) || uniq.has(null)) {
      // some invalid
      if ([...uniq].every((v) => v == null)) {
        reasonCounts["invalid-result"] += 1;
        unevaluable.push({
          entry,
          reason: "invalid-result",
          detail: `raw=${JSON.stringify(rows.map((r) => r.result))}`,
        });
        continue;
      }
      reasonCounts["conflicting-labels"] += 1;
      unevaluable.push({
        entry,
        reason: "conflicting-labels",
        detail: `results=${JSON.stringify(normalized)}`,
      });
      continue;
    }
    if (uniq.size !== 1) {
      reasonCounts["conflicting-labels"] += 1;
      unevaluable.push({
        entry,
        reason: "conflicting-labels",
        detail: `results=${JSON.stringify(normalized)}`,
      });
      continue;
    }
    const settlementResult = [...uniq][0] as "yes" | "no";

    const entryFeeCents = computeEntryTakerFeeCents(entry.noAskCents);
    const pnl = computeHoldToSettlementPnl({
      noAskCents: entry.noAskCents,
      settlementResult,
      entryFeeCents,
    });
    const primary = rows[0]!;
    evaluable.push({
      ...entry,
      settlementResult,
      entryFeeCents,
      grossPnlCents: pnl.grossPnlCents,
      netPnlCents: pnl.netPnlCents,
      labelCloseTime: typeof primary.closeTime === "string" ? primary.closeTime : null,
      labelSettlementTs:
        typeof primary.settlementTs === "string" ? primary.settlementTs : null,
    });
  }

  return { evaluable, unevaluable, reasonCounts };
}
