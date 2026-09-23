import { describe, expect, it } from "vitest";

import {
  M16_ER_MIN_UTC_DAY_CLUSTERS,
  M16_ER_REQUIRED_TRADE_N,
  buildM16ErEvidenceContract,
} from "./m16ErProtocol";
import {
  buildM16ErDayClusterDiagnostics,
  buildM16ErEconomicDiagnostics,
  buildM16ErPrimaryEconomicResult,
  evaluateM16ErPostConfirmationPath,
  type M16ErConfirmationContext,
  type M16ErPostConfirmationTick,
  type M16ErTradeOutcome,
} from "./m16ErOutcomeEvaluator";

function baseCtx(
  overrides: Partial<M16ErConfirmationContext> = {},
): M16ErConfirmationContext {
  return {
    side: "YES",
    setupLowL: 38,
    confirmationTimestampMs: 1_000,
    closeTimeMs: 10_000,
    // yesBid=40, noBid=58 → yesAsk=42 (100-58), noAsk=60 (100-40)
    confirmationYesBestBidCents: 40,
    confirmationNoBestBidCents: 58,
    confirmationBookEligible: true,
    utcDayKey: "2026-08-14",
    ticker: "KXBTC15M-SYNTH-YES",
    ...overrides,
  };
}

describe("m16ErOutcomeEvaluator (synthetic fixtures only)", () => {
  it("hits target on first eligible candidate bid >= 55", () => {
    const ticks: M16ErPostConfirmationTick[] = [
      {
        timestampMs: 2_000,
        yesBestBidCents: 56,
        noBestBidCents: 40,
        bookEligible: true,
      },
    ];
    const out = evaluateM16ErPostConfirmationPath(baseCtx(), ticks);
    expect(out.evaluable).toBe(true);
    if (!out.evaluable) return;
    expect(out.exitRoute).toBe("target");
    expect(out.entryAskCents).toBe(42); // 100 - 58
    expect(out.exitBidCents).toBe(56);
    expect(out.grossPnlCents).toBe(14);
    expect(out.feeAdjustedPnlCents).toBe(
      out.grossPnlCents - out.entryFeeCents - out.exitFeeCents,
    );
  });

  it("structural-stops on first eligible bid strictly below L (bid==L does not stop)", () => {
    const ticks: M16ErPostConfirmationTick[] = [
      {
        timestampMs: 2_000,
        yesBestBidCents: 38, // == L → no stop
        noBestBidCents: 50,
        bookEligible: true,
      },
      {
        timestampMs: 3_000,
        yesBestBidCents: 37, // < L → stop
        noBestBidCents: 50,
        bookEligible: true,
      },
    ];
    const out = evaluateM16ErPostConfirmationPath(baseCtx({ setupLowL: 38 }), ticks);
    expect(out.evaluable).toBe(true);
    if (!out.evaluable) return;
    expect(out.exitRoute).toBe("structural-stop");
    expect(out.exitBidCents).toBe(37);
  });

  it("terminal-flattens at last eligible bid before close when no target/stop", () => {
    const ticks: M16ErPostConfirmationTick[] = [
      {
        timestampMs: 2_000,
        yesBestBidCents: 45,
        noBestBidCents: 50,
        bookEligible: true,
      },
      {
        timestampMs: 9_000,
        yesBestBidCents: 48,
        noBestBidCents: 50,
        bookEligible: true,
      },
      {
        timestampMs: 11_000, // after close — ignored
        yesBestBidCents: 60,
        noBestBidCents: 50,
        bookEligible: true,
      },
    ];
    const out = evaluateM16ErPostConfirmationPath(baseCtx(), ticks);
    expect(out.evaluable).toBe(true);
    if (!out.evaluable) return;
    expect(out.exitRoute).toBe("terminal-flatten");
    expect(out.exitBidCents).toBe(48);
    expect(out.exitTimestampMs).toBe(9_000);
  });

  it("ignores ineligible ticks and never uses midpoint as fill", () => {
    const ticks: M16ErPostConfirmationTick[] = [
      {
        timestampMs: 2_000,
        yesBestBidCents: 60,
        noBestBidCents: 40,
        bookEligible: false, // would be target if eligible — must ignore
      },
      {
        timestampMs: 3_000,
        yesBestBidCents: 50,
        noBestBidCents: 40,
        bookEligible: true,
      },
    ];
    const out = evaluateM16ErPostConfirmationPath(baseCtx(), ticks);
    expect(out.evaluable).toBe(true);
    if (!out.evaluable) return;
    expect(out.exitRoute).toBe("terminal-flatten");
    expect(out.exitBidCents).toBe(50);
  });

  it("NO side uses complement ask/bid executables", () => {
    const ctx = baseCtx({
      side: "NO",
      ticker: "KXBTC15M-SYNTH-NO",
      // yesBid=40 → noAsk=60; noBid=58 → yesAsk=42
      confirmationYesBestBidCents: 40,
      confirmationNoBestBidCents: 58,
      setupLowL: 40,
    });
    const ticks: M16ErPostConfirmationTick[] = [
      {
        timestampMs: 2_000,
        yesBestBidCents: 30,
        noBestBidCents: 55, // NO bid hits target
        bookEligible: true,
      },
    ];
    const out = evaluateM16ErPostConfirmationPath(ctx, ticks);
    expect(out.evaluable).toBe(true);
    if (!out.evaluable) return;
    expect(out.side).toBe("NO");
    expect(out.entryAskCents).toBe(60); // 100 - yesBid
    expect(out.exitBidCents).toBe(55);
    expect(out.exitRoute).toBe("target");
  });

  it("marks unevaluable when entry ask missing / confirmation ineligible", () => {
    const out = evaluateM16ErPostConfirmationPath(
      baseCtx({ confirmationBookEligible: false }),
      [],
    );
    expect(out.evaluable).toBe(false);
    if (out.evaluable) return;
    expect(out.exitRoute).toBe("unevaluable-missing-entry-ask");
  });

  it("marks unevaluable when no post-confirmation eligible bid exists", () => {
    const out = evaluateM16ErPostConfirmationPath(baseCtx(), [
      {
        timestampMs: 2_000,
        yesBestBidCents: 50,
        noBestBidCents: 40,
        bookEligible: false,
      },
    ]);
    expect(out.evaluable).toBe(false);
    if (out.evaluable) return;
    expect(out.exitRoute).toBe("unevaluable-missing-terminal-bid");
  });

  it("builds primary CR2 result and does not treat +5¢ MDE as success threshold", () => {
    const rebuilt: M16ErTradeOutcome[] = [];
    for (let d = 0; d < 28; d++) {
      const day = `2026-09-${String(d + 1).padStart(2, "0")}`;
      for (let i = 0; i < 12; i++) {
        // Small positive mean (~1¢) with cluster and within-day variance — below planning MDE 5¢
        const net = 0.5 + (d % 3) * 0.25 + (i % 4) * 0.1;
        rebuilt.push({
          evaluable: true,
          ticker: `T-${d}-${i}`,
          side: "YES",
          utcDayKey: day,
          confirmationTimestampMs: 1_000,
          exitTimestampMs: 2_000,
          setupLowL: 38,
          entryAskCents: 40,
          exitBidCents: 42,
          exitRoute: "terminal-flatten",
          grossPnlCents: net + 2,
          entryFeeCents: 1,
          exitFeeCents: 1,
          feeCents: 2,
          feeAdjustedPnlCents: net,
          holdingTimeMs: 1_000,
        });
      }
    }
    const primary = buildM16ErPrimaryEconomicResult({
      outcomes: rebuilt,
      blindConfirmations: rebuilt.length,
      requiredN: M16_ER_REQUIRED_TRADE_N,
      requiredG: M16_ER_MIN_UTC_DAY_CLUSTERS,
    });
    expect(primary.primaryN).toBe(28 * 12);
    expect(primary.primaryG).toBe(28);
    expect(primary.meanFeeAdjustedPnlCents).toBeGreaterThan(0);
    expect(primary.meanFeeAdjustedPnlCents).toBeLessThan(5); // below MDE but still testable
    expect(primary.evidenceContractIdentity).toBe(
      buildM16ErEvidenceContract().evidenceContractIdentity,
    );
    // Decision follows CR2 one-sided test — not MDE comparison
    expect(["reject-H0", "fail-to-reject-H0"]).toContain(primary.hypothesisDecision);
  });

  it("reports underpowered disposition when evaluable N/G collapse", () => {
    const primary = buildM16ErPrimaryEconomicResult({
      outcomes: [
        {
          evaluable: false,
          ticker: "T",
          side: "YES",
          utcDayKey: "2026-08-14",
          confirmationTimestampMs: 1,
          setupLowL: 38,
          exitRoute: "unevaluable-missing-terminal-bid",
          reason: "x",
        },
      ],
      blindConfirmations: 461,
      requiredN: M16_ER_REQUIRED_TRADE_N,
      requiredG: M16_ER_MIN_UTC_DAY_CLUSTERS,
    });
    expect(primary.protocolDisposition).toBe(
      "UNDERPOWERED_OR_NON_EVALUABLE_AFTER_OUTCOME_OPEN",
    );
  });

  it("diagnostics and day clusters are descriptive-only helpers", () => {
    const outcomes: M16ErTradeOutcome[] = [
      {
        evaluable: true,
        ticker: "A",
        side: "YES",
        utcDayKey: "2026-08-14",
        confirmationTimestampMs: 1,
        exitTimestampMs: 2,
        setupLowL: 38,
        entryAskCents: 40,
        exitBidCents: 55,
        exitRoute: "target",
        grossPnlCents: 15,
        entryFeeCents: 1,
        exitFeeCents: 1,
        feeCents: 2,
        feeAdjustedPnlCents: 13,
        holdingTimeMs: 1,
      },
      {
        evaluable: true,
        ticker: "B",
        side: "NO",
        utcDayKey: "2026-08-15",
        confirmationTimestampMs: 1,
        exitTimestampMs: 3,
        setupLowL: 38,
        entryAskCents: 40,
        exitBidCents: 30,
        exitRoute: "structural-stop",
        grossPnlCents: -10,
        entryFeeCents: 1,
        exitFeeCents: 1,
        feeCents: 2,
        feeAdjustedPnlCents: -12,
        holdingTimeMs: 2,
      },
    ];
    const diag = buildM16ErEconomicDiagnostics(outcomes);
    expect(diag.yesSide.count).toBe(1);
    expect(diag.noSide.count).toBe(1);
    expect(diag.exitRouteCounts.target).toBe(1);
    const days = buildM16ErDayClusterDiagnostics(outcomes);
    expect(days.positiveMeanDays).toBe(1);
    expect(days.negativeMeanDays).toBe(1);
  });
});
