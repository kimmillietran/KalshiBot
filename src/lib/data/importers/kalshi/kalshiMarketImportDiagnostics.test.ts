import { describe, expect, it } from "vitest";

import fixture from "./fixtures/KXBTC15M-25DEC311900-00-market-responses.json";
import {
  buildKalshiMarketDebugArtifactPath,
  buildKalshiMarketParseDiagnostic,
  compareKalshiMarketResponseShapes,
  findMissingKalshiMarketRecordFields,
  findMissingKalshiMarketWireFields,
  formatKalshiMarketParseError,
  KalshiMarketImportCompatibilityError,
  sanitizeKalshiMarketResponseExcerpt,
  saveKalshiMarketDebugArtifact,
} from "./kalshiMarketImportDiagnostics";

describe("kalshiMarketImportDiagnostics", () => {
  it("identifies missing wire fields for the failing expansion ticker detail payload", () => {
    const missing = findMissingKalshiMarketWireFields(fixture.detailMarket);

    expect(missing).toEqual(["expiration_value"]);
    expect(findMissingKalshiMarketWireFields(fixture.listMarket)).toEqual([]);
  });

  it("compares discovery list vs import detail schemas for KXBTC15M-25DEC311900-00", () => {
    const comparison = compareKalshiMarketResponseShapes({
      ticker: fixture.ticker,
      listEndpoint: fixture.listEndpoint,
      detailEndpoint: fixture.detailEndpoint,
      listMarket: fixture.listMarket,
      detailMarket: fixture.detailMarket,
    });

    expect(comparison.schemaDiffers).toBe(true);
    expect(comparison.likelyImportIncompatible).toBe(true);
    expect(comparison.listMissingRequiredFields).toEqual([]);
    expect(comparison.detailMissingRequiredFields).toEqual(["expiration_value"]);
  });

  it("formats actionable parser errors with debug artifact paths", () => {
    const diagnostic = buildKalshiMarketParseDiagnostic({
      ticker: fixture.ticker,
      endpoint: fixture.detailEndpoint,
      requestContext: `GET ${fixture.detailEndpoint}`,
      httpStatus: 200,
      body: { market: fixture.detailMarket },
      missingRequiredFields: ["expiration_value"],
      debugArtifactPath: buildKalshiMarketDebugArtifactPath(fixture.ticker),
    });

    expect(formatKalshiMarketParseError(diagnostic)).toBe(
      "Kalshi historical market response missing required fields: expiration_value. Raw response saved to data/debug/kalshi-market-KXBTC15M-25DEC311900-00.json.",
    );
    expect(new KalshiMarketImportCompatibilityError(diagnostic).message).toContain(
      "expiration_value",
    );
  });

  it("sanitizes secrets and persists debug artifacts", () => {
    const writes = new Map<string, string>();
    const mkdirCalls: string[] = [];
    const diagnostic = buildKalshiMarketParseDiagnostic({
      ticker: fixture.ticker,
      endpoint: fixture.detailEndpoint,
      requestContext: `GET ${fixture.detailEndpoint}`,
      httpStatus: 200,
      body: {
        market: fixture.detailMarket,
        api_key: "secret-value",
      },
      missingRequiredFields: ["expiration_value"],
      debugArtifactPath: buildKalshiMarketDebugArtifactPath(fixture.ticker),
    });

    const path = saveKalshiMarketDebugArtifact({
      ticker: fixture.ticker,
      diagnostic,
      writeFile: (target, data) => {
        writes.set(target, data);
      },
      mkdirSync: (target) => {
        mkdirCalls.push(target);
      },
    });

    expect(path).toBe("data/debug/kalshi-market-KXBTC15M-25DEC311900-00.json");
    expect(mkdirCalls).toEqual(["data/debug"]);
    expect(writes.get(path)).toContain("[redacted]");
    expect(writes.get(path)).not.toContain("secret-value");
    expect(sanitizeKalshiMarketResponseExcerpt({ api_key: "secret" })).toContain("[redacted]");
  });

  it("reports missing parsed record fields for bronze provider validation", () => {
    expect(
      findMissingKalshiMarketRecordFields({
        ticker: fixture.ticker,
        eventTicker: fixture.detailMarket.event_ticker,
        status: fixture.detailMarket.status,
        result: fixture.detailMarket.result,
        openTime: fixture.detailMarket.open_time,
        closeTime: fixture.detailMarket.close_time,
        settlementTs: fixture.detailMarket.settlement_ts ?? null,
        settlementValueDollars: fixture.detailMarket.settlement_value_dollars ?? null,
        expirationValue: "",
        floorStrike: fixture.detailMarket.floor_strike ?? null,
        title: null,
        subtitle: null,
        seriesTicker: fixture.detailMarket.series_ticker ?? null,
      }),
    ).toEqual(["expirationValue"]);
  });
});
