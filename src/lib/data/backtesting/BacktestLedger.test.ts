import { describe, expect, it } from "vitest";

import { BacktestLedger } from "./BacktestLedger";
import { BacktestLedgerError, BacktestLedgerErrorCode } from "./errors";
import type { TradeFillInput } from "./ledgerTypes";

const T0 = "2026-06-26T23:15:00.000Z";
const T1 = "2026-06-26T23:16:00.000Z";
const TICKER_A = "KXBTC15M-26JUN261930-30";
const TICKER_B = "KXBTC15M-26JUN261945-45";

function buyFill(
  overrides: Partial<TradeFillInput> = {},
): TradeFillInput {
  return {
    ticker: TICKER_A,
    side: "yes",
    action: "buy",
    priceCents: 48,
    quantity: 10,
    feeCents: 5,
    occurredAt: T0,
    sourceStepIndex: 0,
    ...overrides,
  };
}

function sellFill(
  overrides: Partial<TradeFillInput> = {},
): TradeFillInput {
  return buyFill({ action: "sell", occurredAt: T1, sourceStepIndex: 1, ...overrides });
}

describe("BacktestLedger", () => {
  it("creates an empty ledger from initial capital", () => {
    const ledger = BacktestLedger.create(10_000);

    expect(ledger.snapshot()).toEqual({
      initialCashCents: 10_000,
      cashCents: 10_000,
      realizedPnLCents: 0,
      fills: [],
      openPositions: [],
    });
  });

  it("records buy entry updates cash and position", () => {
    const ledger = BacktestLedger.create(10_000).recordFill(buyFill());

    expect(ledger.snapshot().cashCents).toBe(10_000 - 10 * 48 - 5);
    expect(ledger.snapshot().openPositions).toEqual([
      {
        ticker: TICKER_A,
        side: "yes",
        quantity: 10,
        averageCostCents: 48,
      },
    ]);
    expect(ledger.snapshot().realizedPnLCents).toBe(0);
  });

  it("records sell exit updates cash and realized P/L", () => {
    const ledger = BacktestLedger.create(10_000)
      .recordFill(buyFill())
      .recordFill(sellFill({ priceCents: 55, quantity: 10, feeCents: 3 }));

    expect(ledger.snapshot().openPositions).toEqual([]);
    expect(ledger.snapshot().realizedPnLCents).toBe((55 - 48) * 10 - 3);
    expect(ledger.snapshot().cashCents).toBe(
      10_000 - 10 * 48 - 5 + 10 * 55 - 3,
    );
  });

  it("supports partial exits", () => {
    const ledger = BacktestLedger.create(10_000)
      .recordFill(buyFill({ quantity: 10 }))
      .recordFill(sellFill({ quantity: 4, priceCents: 52, feeCents: 2 }));

    expect(ledger.snapshot().openPositions).toEqual([
      {
        ticker: TICKER_A,
        side: "yes",
        quantity: 6,
        averageCostCents: 48,
      },
    ]);
    expect(ledger.snapshot().realizedPnLCents).toBe((52 - 48) * 4 - 2);
  });

  it("tracks multiple tickers independently", () => {
    const ledger = BacktestLedger.create(20_000)
      .recordFill(buyFill({ ticker: TICKER_A, quantity: 5, priceCents: 40 }))
      .recordFill(
        buyFill({
          ticker: TICKER_B,
          side: "no",
          quantity: 8,
          priceCents: 35,
          sourceStepIndex: 1,
        }),
      );

    expect(ledger.snapshot().openPositions).toHaveLength(2);
    expect(ledger.snapshot().openPositions).toEqual(
      expect.arrayContaining([
        {
          ticker: TICKER_A,
          side: "yes",
          quantity: 5,
          averageCostCents: 40,
        },
        {
          ticker: TICKER_B,
          side: "no",
          quantity: 8,
          averageCostCents: 35,
        },
      ]),
    );
  });

  it("rejects invalid quantity", () => {
    expect(() =>
      BacktestLedger.create(1_000).recordFill(buyFill({ quantity: 0 })),
    ).toThrow(BacktestLedgerError);
  });

  it("rejects invalid price", () => {
    expect(() =>
      BacktestLedger.create(1_000).recordFill(buyFill({ priceCents: 101 })),
    ).toThrow(BacktestLedgerError);

    try {
      BacktestLedger.create(1_000).recordFill(buyFill({ priceCents: -1 }));
    } catch (error) {
      expect((error as BacktestLedgerError).code).toBe(
        BacktestLedgerErrorCode.INVALID_PRICE,
      );
    }
  });

  it("rejects buys with insufficient cash", () => {
    expect(() =>
      BacktestLedger.create(100).recordFill(buyFill({ quantity: 10, priceCents: 48 })),
    ).toThrow(BacktestLedgerError);

    try {
      BacktestLedger.create(100).recordFill(buyFill());
    } catch (error) {
      expect((error as BacktestLedgerError).code).toBe(
        BacktestLedgerErrorCode.INSUFFICIENT_CASH,
      );
    }
  });

  it("rejects sells larger than the open position", () => {
    const ledger = BacktestLedger.create(10_000).recordFill(
      buyFill({ quantity: 3 }),
    );

    expect(() => ledger.recordFill(sellFill({ quantity: 4 }))).toThrow(
      BacktestLedgerError,
    );
  });

  it("computes unrealized P/L from supplied marks", () => {
    const ledger = BacktestLedger.create(10_000).recordFill(
      buyFill({ quantity: 10, priceCents: 40 }),
    );

    const result = ledger.computeUnrealizedPnL([
      { ticker: TICKER_A, side: "yes", priceCents: 46 },
    ]);

    expect(result.unrealizedPnLCents).toBe((46 - 40) * 10);
  });

  it("produces deterministic results for repeated sequences", () => {
    const sequence = [
      buyFill({ quantity: 5, priceCents: 42, sourceStepIndex: 0 }),
      buyFill({ quantity: 5, priceCents: 46, sourceStepIndex: 1, occurredAt: T1 }),
      sellFill({ quantity: 3, priceCents: 50, sourceStepIndex: 2, occurredAt: T1 }),
    ];

    const run = () =>
      sequence.reduce(
        (ledger, fill) => ledger.recordFill(fill),
        BacktestLedger.create(10_000),
      ).snapshot();

    expect(run()).toEqual(run());
  });

  it("does not mutate previous ledger snapshots", () => {
    const initial = BacktestLedger.create(10_000);
    const before = initial.snapshot();
    const after = initial.recordFill(buyFill());

    expect(before).toEqual({
      initialCashCents: 10_000,
      cashCents: 10_000,
      realizedPnLCents: 0,
      fills: [],
      openPositions: [],
    });
    expect(after.snapshot().fills).toHaveLength(1);
    expect(initial.snapshot()).toEqual(before);
  });

  it("orders fills deterministically by time, step, and fill id", () => {
    const ledger = BacktestLedger.create(10_000)
      .recordFill(
        buyFill({
          occurredAt: T1,
          sourceStepIndex: 2,
          quantity: 1,
          priceCents: 40,
        }),
      )
      .recordFill(
        buyFill({
          occurredAt: T0,
          sourceStepIndex: 1,
          quantity: 1,
          priceCents: 41,
        }),
      );

    const fillIds = ledger.snapshot().fills.map((fill) => fill.fillId);
    expect(fillIds).toEqual(["fill-000002", "fill-000001"]);
    expect(Date.parse(ledger.snapshot().fills[0]!.occurredAt)).toBeLessThan(
      Date.parse(ledger.snapshot().fills[1]!.occurredAt),
    );
  });
});
