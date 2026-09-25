/**
 * Frozen vs unfrozen M17 decision inventory for SPENT exploratory evaluation.
 */

import type { M17FrozenDecisionItem } from "./types";
import { M17_CITED_REGIME_FILTERS } from "./types";

/**
 * Inventory of decisions required to simulate M17 hold-to-settlement entries.
 * Items with status !== "frozen" block P&L computation.
 */
export function buildM17FrozenDecisionInventory(): M17FrozenDecisionItem[] {
  return [
    {
      id: "hold-to-settlement-primary-track",
      status: "frozen",
      summary:
        "Primary economic track is enter on executable quote and hold to official settlement.",
      authority:
        "docs/research/m17-settlement-state-research-design-draft.md §D.1 (proposed primary; accepted as fixed for this family) + PR #124 strategyDefinitionFixed",
    },
    {
      id: "side-no-calibration-fade-direction-over",
      status: "frozen",
      summary:
        "Target side is NO under historical calibration direction “over” (fade overconfident YES).",
      authority:
        `${M17_CITED_REGIME_FILTERS.sourceHypothesisPath} + PR #124 terminal-mispricing NO side`,
    },
    {
      id: "one-standard-taker-fee",
      status: "frozen",
      summary:
        "Charge one STANDARD schedule taker fee at entry (qty=1, ceil-to-cent); not a flat 4¢ round-trip.",
      authority:
        "M16-ER / friction fee contract identity 2c1059ecc142dd6ca9b82375e03fd84b42f55ce6d6f1435a667111eea2d0548f",
    },
    {
      id: "outcome-label-official-expiration-value",
      status: "frozen",
      summary:
        "Official expiration_value / result is the post-entry outcome label only; never a pre-entry input.",
      authority: "PR #123 SettlementEstimate authoritative rule + PR #124 join audit",
    },
    {
      id: "avg60s-not-wired-into-gates",
      status: "frozen",
      summary:
        "avg_60s_data is research-only empirical candidate; not wired into strategy gates or orders.",
      authority: "PR #123 settlementEstimate.ts",
    },
    {
      id: "cited-late-high-vol-regime-bucket-bounds",
      status: "frozen",
      summary:
        "Cited regime bounds: high vol ≥0.6 annualized (Coinbase completed 1m OHLC), YES mid ∈ [1/3, 2/3), time remaining < 15 minutes.",
      authority: M17_CITED_REGIME_FILTERS.sourceHypothesisPath,
    },
    {
      id: "settlement-state-to-yes-overpriced-entry-mapping",
      status: "proposed-unfrozen",
      summary:
        "No frozen rule maps remaining-average threshold T (or SettlementEstimate) to “YES is overpriced → enter NO”. T is arithmetic reachability only; P(YES|F_t) requires a predeclared model that the M17 draft marks unresolved.",
      authority:
        "docs/research/m17-settlement-state-research-design-draft.md §C.1–C.2 (Proposed / unresolved)",
    },
    {
      id: "official-banked-sample-field-and-window-identity",
      status: "proposed-unfrozen",
      summary:
        "Official banked settlement-sample field identity and window semantics remain unresolved (5Hz→60×1s mapping not frozen).",
      authority: "PR #112 feasibility; PR #116 mapping diagnostic; M17 draft §0.1 #5–#6",
    },
    {
      id: "historical-brti-banked-paths-on-spent-cs-days",
      status: "absent-on-retained-data",
      summary:
        "Retained CryptoStruct executable books do not carry pre-entry BRTI / banked settlement-sample paths; PR #124 reported validBtcSettlementPathInputs = 0.",
      authority:
        "PR #113/#124 BRTI-path coverage note; local settlement-friction samples.jsonl schema",
    },
    {
      id: "retained-sample-regime-feature-columns",
      status: "absent-on-retained-data",
      summary:
        "Retained friction samples lack YES bid/ask midpoint, NO ask level, and Coinbase volatility columns required to recompute the cited regime filters without regenerating quote streams.",
      authority:
        "data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl",
    },
  ];
}

export function listMissingFrozenDecisionsBlockingPnl(
  inventory: readonly M17FrozenDecisionItem[],
): string[] {
  return inventory
    .filter((item) => item.status !== "frozen")
    .map((item) => item.id);
}
