import { describe, expect, it } from "vitest";

import { BID_ASK_FIDELITY_WARNING_CODE } from "@/lib/data/datasets/validation/audit";
import { resolveKalshiContractQuotes } from "@/lib/data/research/quotes/resolveKalshiContractQuotes";

import { analyzeLadderFeasibility } from "./analyzeLadderFeasibility";
import { analyzeQuoteFidelity } from "./analyzeQuoteFidelity";
import { auditFieldAvailability } from "./auditFieldAvailability";
import { buildQuoteFidelityGateReport } from "./buildQuoteFidelityGateReport";
import { computeFeeSmokeCheck } from "./computeFeeSmokeCheck";
import { createQuoteFidelityGateConfig } from "./quoteFidelityGateConfig";
import { evaluateQuoteFidelityVerdict } from "./evaluateQuoteFidelityVerdict";
import { resolveEventTickerFromMarketTicker } from "./resolveEventTickerFromMarketTicker";
import {
  serializeQuoteFidelityGateHtml,
  serializeQuoteFidelityGateReport,
} from "./serializeQuoteFidelityGate";
import type { RegistryMarketRecord } from "./quoteFidelityGateTypes";

function createMarket(input: {
  marketTicker: string;
  liveCloseOnly?: boolean;
  zeroSpread?: boolean;
  legacyBidAsk?: boolean;
}): RegistryMarketRecord {
  const liveCloseOnly = input.liveCloseOnly ?? true;
  const zeroSpread = input.zeroSpread ?? true;

  const warnings = [];
  if (liveCloseOnly) {
    warnings.push({ code: BID_ASK_FIDELITY_WARNING_CODE.LIVE_CLOSE_ONLY_QUOTES });
  }
  if (zeroSpread) {
    warnings.push({ code: BID_ASK_FIDELITY_WARNING_CODE.ALL_CANDLES_ZERO_SPREAD });
  }

  return {
    marketTicker: input.marketTicker,
    marketCloseTime: "2026-05-08T23:45:00Z",
    fixturePath: `data/fixtures/KXBTC15M/${input.marketTicker}/fixture.json`,
    bidAskFidelity: {
      statistics: {
        candleCount: 10,
        liveCloseOnlyCount: liveCloseOnly ? 10 : 0,
        percentZeroSpread: zeroSpread ? 100 : 0,
        equalBidAskCount: zeroSpread ? 10 : 0,
      },
      warnings,
      suspiciousZeroSpread: zeroSpread,
    },
  };
}

describe("resolveEventTickerFromMarketTicker", () => {
  it("strips final strike-offset suffix", () => {
    expect(resolveEventTickerFromMarketTicker("KXBTC15M-26MAY081945-45")).toBe(
      "KXBTC15M-26MAY081945",
    );
    expect(resolveEventTickerFromMarketTicker("KXBTC15M-26MAY081930-30")).toBe(
      "KXBTC15M-26MAY081930",
    );
  });

  it("returns null for invalid tickers", () => {
    expect(resolveEventTickerFromMarketTicker("KXBTC15M")).toBeNull();
    expect(resolveEventTickerFromMarketTicker("")).toBeNull();
  });
});

describe("analyzeLadderFeasibility", () => {
  it("reports single-strike event histogram", () => {
    const markets = [
      createMarket({ marketTicker: "KXBTC15M-26MAY081945-45" }),
      createMarket({ marketTicker: "KXBTC15M-26MAY081930-30" }),
    ];

    const ladder = analyzeLadderFeasibility({
      markets,
      fixtureMetadataByTicker: new Map(),
    });

    expect(ladder.eventCount).toBe(2);
    expect(ladder.eventsWith1Strike).toBe(2);
    expect(ladder.eventsWith2PlusStrikes).toBe(0);
    expect(ladder.maxStrikesPerEvent).toBe(1);
    expect(ladder.ladderHistogram).toEqual([{ strikesPerEvent: 1, eventCount: 2 }]);
  });

  it("reports multi-strike synthetic event histogram", () => {
    const markets = [
      createMarket({ marketTicker: "KXBTC15M-26MAY081945-45" }),
      createMarket({ marketTicker: "KXBTC15M-26MAY081945-00" }),
      createMarket({ marketTicker: "KXBTC15M-26MAY081945-15" }),
    ];

    const ladder = analyzeLadderFeasibility({
      markets,
      fixtureMetadataByTicker: new Map(),
    });

    expect(ladder.eventCount).toBe(1);
    expect(ladder.eventsWith3PlusStrikes).toBe(1);
    expect(ladder.maxStrikesPerEvent).toBe(3);
  });

  it("prefers fixture eventTicker over parsed when available", () => {
    const markets = [createMarket({ marketTicker: "KXBTC15M-26MAY081945-45" })];
    const ladder = analyzeLadderFeasibility({
      markets,
      fixtureMetadataByTicker: new Map([
        [
          "KXBTC15M-26MAY081945-45",
          { eventTicker: "KXBTC15M-26MAY081945", floorStrike: 80203.39 },
        ],
      ]),
    });

    expect(ladder.sampleEvents[0]?.eventTickerSource).toBe("fixture");
    expect(ladder.sampleEvents[0]?.eventTicker).toBe("KXBTC15M-26MAY081945");
  });
});

describe("analyzeQuoteFidelity", () => {
  it("classifies live-close-only and zero-spread markets", () => {
    const summary = analyzeQuoteFidelity([
      createMarket({ marketTicker: "m1" }),
      createMarket({ marketTicker: "m2" }),
    ]);

    expect(summary.liveCloseOnlyQuoteShare).toBe(1);
    expect(summary.zeroSpreadMarketShare).toBe(1);
    expect(summary.executableParityResearchFeasible).toBe(false);
  });

  it("marks executable when legacy bid/ask exists without close-only dominance", () => {
    const summary = analyzeQuoteFidelity([
      createMarket({
        marketTicker: "m1",
        liveCloseOnly: false,
        zeroSpread: false,
        legacyBidAsk: true,
      }),
    ]);

    expect(summary.legacyBidAskCount).toBe(1);
    expect(summary.executableParityResearchFeasible).toBe(true);
  });
});

describe("evaluateQuoteFidelityVerdict", () => {
  const config = createQuoteFidelityGateConfig();

  it("returns blocked-no-ladder for single-strike corpus", () => {
    const markets = [createMarket({ marketTicker: "KXBTC15M-26MAY081945-45" })];
    const quoteFidelity = analyzeQuoteFidelity(markets);
    const ladder = analyzeLadderFeasibility({
      markets,
      fixtureMetadataByTicker: new Map(),
    });

    expect(
      evaluateQuoteFidelityVerdict({
        config,
        quoteFidelity,
        ladder,
        marketCount: 1,
      }).verdict,
    ).toBe("blocked-no-ladder");
  });

  it("returns blocked-close-only-quotes when ladder exists but quotes are synthetic", () => {
    const markets = [
      createMarket({ marketTicker: "KXBTC15M-26MAY081945-45" }),
      createMarket({ marketTicker: "KXBTC15M-26MAY081945-00" }),
    ];
    const quoteFidelity = analyzeQuoteFidelity(markets);
    const ladder = analyzeLadderFeasibility({
      markets,
      fixtureMetadataByTicker: new Map(),
    });

    expect(
      evaluateQuoteFidelityVerdict({
        config,
        quoteFidelity,
        ladder,
        marketCount: 2,
      }).verdict,
    ).toBe("blocked-close-only-quotes");
  });

  it("returns proceed-cross-strike-ladder when ladder and executable quotes exist", () => {
    const markets = [
      createMarket({
        marketTicker: "KXBTC15M-26MAY081945-45",
        liveCloseOnly: false,
        zeroSpread: false,
        legacyBidAsk: true,
      }),
      createMarket({
        marketTicker: "KXBTC15M-26MAY081945-00",
        liveCloseOnly: false,
        zeroSpread: false,
        legacyBidAsk: true,
      }),
    ];
    const quoteFidelity = analyzeQuoteFidelity(markets);
    const ladder = analyzeLadderFeasibility({
      markets,
      fixtureMetadataByTicker: new Map(),
    });

    expect(
      evaluateQuoteFidelityVerdict({
        config,
        quoteFidelity,
        ladder,
        marketCount: 2,
      }).verdict,
    ).toBe("proceed-cross-strike-ladder");
  });
});

describe("resolveKalshiContractQuotes", () => {
  it("derives NO side from YES complement", () => {
    const quotes = resolveKalshiContractQuotes({ yesBidCents: 40, yesAskCents: 45 });
    expect(quotes?.noBidCents).toBe(55);
    expect(quotes?.noAskCents).toBe(60);
    expect(quotes?.noSideDerived).toBe(true);
  });
});

describe("computeFeeSmokeCheck", () => {
  it("shows zero-spread parity is net-negative after fees", () => {
    const check = computeFeeSmokeCheck();
    expect(check.sampleYesAskCents + check.sampleNoAskCents).toBe(100);
    expect(check.buyBothParityProfitableAfterFees).toBe(false);
    expect(check.zeroSpreadParityNetEdgeCents).toBeLessThan(0);
  });
});

describe("buildQuoteFidelityGateReport", () => {
  it("serializes stable JSON and HTML with verdict and caveats", () => {
    const config = createQuoteFidelityGateConfig();
    const markets = [createMarket({ marketTicker: "KXBTC15M-26MAY081945-45" })];

    const report = buildQuoteFidelityGateReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      config,
      inputPaths: {
        datasetRegistryPath: "data/research-datasets/KXBTC15M/dataset-registry.json",
        fixturesDir: "data/fixtures/KXBTC15M",
        researchResultsDir: "data/research-results",
      },
      loadedInputs: {
        seriesTicker: "KXBTC15M",
        registryMarketCount: 1,
        markets,
        fixtureSamplePaths: [],
        researchOutputMarketCount: null,
      },
      io: {
        readFile: () => "{}",
        fileExists: () => false,
        readdir: () => [],
        isDirectory: () => false,
      },
    });

    const json = JSON.parse(serializeQuoteFidelityGateReport(report));
    const html = serializeQuoteFidelityGateHtml(report);

    expect(json.summary.verdict).toBe("blocked-no-ladder");
    expect(html).toContain("blocked-no-ladder");
    expect(html).toContain("Do Not Claim");
    expect(report.fieldAvailability.length).toBeGreaterThan(0);
  });

  it("sorts sample events deterministically", () => {
    const markets = [
      createMarket({ marketTicker: "KXBTC15M-26MAY081930-30" }),
      createMarket({ marketTicker: "KXBTC15M-26MAY081945-45" }),
    ];
    const ladder = analyzeLadderFeasibility({
      markets,
      fixtureMetadataByTicker: new Map(),
    });

    const tickers = ladder.sampleEvents.map((event) => event.eventTicker);
    expect(tickers).toEqual([...tickers].sort());
  });
});

describe("auditFieldAvailability", () => {
  it("reports silver MarketWindow lacks eventTicker", () => {
    const entries = auditFieldAvailability({
      markets: [createMarket({ marketTicker: "m1" })],
      fixtureSampleSize: 0,
      io: { readFile: () => "", fileExists: () => false },
    });

    const eventEntry = entries.find(
      (entry) => entry.field === "eventTicker in silver MarketWindow",
    );
    expect(eventEntry?.present).toBe(false);
  });
});
