import { describe, expect, it } from "vitest";

import fixture from "@/lib/data/importers/kalshi/fixtures/KXBTC15M-25DEC311900-00-market-responses.json";
import { mergeKalshiMarketWireFromListDetail } from "@/lib/data/importers/kalshi/kalshiMarketSchemaReconciliation";

import { evaluateExpansionMarketSchemaReconciliation } from "./evaluateExpansionMarketSchemaReconciliation";

describe("evaluateExpansionMarketSchemaReconciliation", () => {
  it("reports list as expirationValueSource when detail omits expiration_value", () => {
    const evaluation = evaluateExpansionMarketSchemaReconciliation({
      listMarketWire: fixture.listMarket,
      detailMarketWire: fixture.detailMarket,
    });

    expect(evaluation.reconciliationSuccess).toBe(true);
    expect(evaluation.expirationValueSource).toBe("list");
    expect(evaluation.reconciliation.mergedFields).toEqual(["expiration_value"]);
    expect(evaluation.reconciliation.mergedWire.expiration_value).toBe("94210.55");
    expect(evaluation.reconciliation.mergedWire.close_time).toBe(
      fixture.detailMarket.close_time,
    );
  });

  it("uses the same merge helper as expansion import prefetch", () => {
    const evaluation = evaluateExpansionMarketSchemaReconciliation({
      listMarketWire: fixture.listMarket,
      detailMarketWire: fixture.detailMarket,
    });
    const directMerge = mergeKalshiMarketWireFromListDetail({
      listMarket: fixture.listMarket,
      detailMarket: fixture.detailMarket,
    });

    expect(evaluation.reconciliation).toEqual(directMerge);
  });

  it("fails when both list and detail omit expiration_value", () => {
    const evaluation = evaluateExpansionMarketSchemaReconciliation({
      listMarketWire: {
        ticker: fixture.ticker,
        open_time: fixture.listMarket.open_time,
        close_time: fixture.listMarket.close_time,
      },
      detailMarketWire: {
        ticker: fixture.ticker,
        open_time: fixture.detailMarket.open_time,
        close_time: fixture.detailMarket.close_time,
      },
    });

    expect(evaluation.reconciliationSuccess).toBe(false);
    expect(evaluation.expirationValueSource).toBe("missing");
    expect(evaluation.mergedMissingRequiredFields).toEqual(["expiration_value"]);
  });

  it("reports detail as expirationValueSource when detail already has expiration_value", () => {
    const evaluation = evaluateExpansionMarketSchemaReconciliation({
      listMarketWire: fixture.listMarket,
      detailMarketWire: {
        ...fixture.detailMarket,
        expiration_value: "94210.55",
      },
    });

    expect(evaluation.reconciliationSuccess).toBe(true);
    expect(evaluation.expirationValueSource).toBe("detail");
    expect(evaluation.reconciliation.mergedFields).toEqual([]);
  });
});
