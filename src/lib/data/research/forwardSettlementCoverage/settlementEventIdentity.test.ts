import { describe, expect, it } from "vitest";

import { classifyMarketSettlementCoverage } from "./classifyMarketSettlementCoverage";
import {
  classifySettlementEventIdentity,
  detectSettlementConflicts,
  parseAllImportResultSettlements,
} from "./loadMarketImportSettlementState";
import type {
  CapturedMarketInventoryEntry,
  ForwardSettlementCoverageIo,
  ParsedSettlementCandidate,
} from "./forwardSettlementCoverageTypes";

const MARKET = "KXBTC15M-26SEP080400-00";
const SERIES = "KXBTC15M";
const EVENT = "KXBTC15M-26SEP080400";
const OTHER_EVENT = "KXBTC15M-26SEP080415";
const SETTLEMENT_TS = "2026-09-08T08:00:05.501719Z";
const EVALUATED_AT = "2026-09-08T12:00:00.000Z";

function candidate(input: {
  outcome: "yes" | "no";
  settlementTime: string | null;
  eventTicker: string | null;
  contentType?: string;
}): ParsedSettlementCandidate {
  return {
    settledOutcome: input.outcome,
    settlementTime: input.settlementTime,
    openTime: "2026-09-08T07:45:00.000Z",
    closeTime: "2026-09-08T08:00:00.000Z",
    eventTicker: input.eventTicker,
    contentType: input.contentType ?? "kalshi.historical.settlement",
    sourceArtifact: `data/imports/${SERIES}/${MARKET}/import-result.json`,
    retrievedAt: "2026-09-08T08:05:00.000Z",
    joinConfidence: input.contentType === "kalshi.historical.market" ? "medium" : "high",
  };
}

function createIo(files: Record<string, string>): ForwardSettlementCoverageIo {
  return {
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) {
        throw new Error(`Missing file: ${path}`);
      }
      return content;
    },
    fileExists: (path) => path in files,
    readdir: () => [],
    isDirectory: () => false,
    iterateJsonl: async () => ({
      linesRead: 0,
      blankLinesSkipped: 0,
      invalidLineCount: 0,
      recordsHandled: 0,
      truncated: false,
    }),
  };
}

function inventory(overrides: Partial<CapturedMarketInventoryEntry> = {}): CapturedMarketInventoryEntry {
  return {
    marketTicker: MARKET,
    seriesTicker: SERIES,
    firstObservedAt: "2026-09-08T07:46:45.078Z",
    lastObservedAt: "2026-09-08T08:00:17.331Z",
    observationCount: 10,
    marketCloseTime: "2026-09-08T08:00:00.000Z",
    expectedSettlementAvailability: "available",
    eventTicker: EVENT,
    sourceArtifacts: [`data/live-capture/forward-quotes/run/top-of-book.jsonl`],
    ...overrides,
  };
}

function productionMarketSettlementImportResult(): string {
  return JSON.stringify({
    metadata: {
      valid: true,
      collectionTime: "2026-09-08T08:05:00.000Z",
      settlementPresent: true,
    },
    bronzeRecords: [
      {
        contentType: "kalshi.historical.market",
        ticker: MARKET,
        collectionTime: "2026-09-08T08:05:00.000Z",
        payload: {
          market: {
            ticker: MARKET,
            result: "yes",
            settlement_ts: SETTLEMENT_TS,
            close_time: "2026-09-08T08:00:00Z",
            event_ticker: EVENT,
          },
        },
      },
      {
        contentType: "kalshi.historical.settlement",
        ticker: MARKET,
        collectionTime: "2026-09-08T08:05:00.000Z",
        payload: {
          market: {
            ticker: MARKET,
            result: "yes",
            settlement_ts: SETTLEMENT_TS,
            close_time: SETTLEMENT_TS,
            event_ticker: SERIES,
          },
        },
      },
    ],
  });
}

describe("M12.6e.3 settlement event identity compatibility", () => {
  it("1: production MARKET event-level + SETTLEMENT series-level do not conflict", () => {
    const candidates = [
      candidate({
        outcome: "yes",
        settlementTime: SETTLEMENT_TS,
        eventTicker: EVENT,
        contentType: "kalshi.historical.market",
      }),
      candidate({
        outcome: "yes",
        settlementTime: SETTLEMENT_TS,
        eventTicker: SERIES,
      }),
    ];

    expect(
      detectSettlementConflicts({
        candidates,
        marketTicker: MARKET,
        seriesTicker: SERIES,
        expectedEventTicker: EVENT,
      }),
    ).toBeNull();
  });

  it("2: differing specific event identities conflict", () => {
    const candidates = [
      candidate({ outcome: "yes", settlementTime: SETTLEMENT_TS, eventTicker: EVENT }),
      candidate({ outcome: "yes", settlementTime: SETTLEMENT_TS, eventTicker: OTHER_EVENT }),
    ];

    expect(
      detectSettlementConflicts({
        candidates,
        marketTicker: MARKET,
        seriesTicker: SERIES,
        expectedEventTicker: EVENT,
      }),
    ).toBe("market metadata disagrees with settlement record event ticker");
  });

  it("3: series + matching specific event do not conflict", () => {
    expect(
      detectSettlementConflicts({
        candidates: [
          candidate({ outcome: "yes", settlementTime: SETTLEMENT_TS, eventTicker: SERIES }),
          candidate({ outcome: "yes", settlementTime: SETTLEMENT_TS, eventTicker: EVENT }),
        ],
        marketTicker: MARKET,
        seriesTicker: SERIES,
        expectedEventTicker: EVENT,
      }),
    ).toBeNull();
  });

  it("4: repeated identical specific event does not conflict", () => {
    expect(
      detectSettlementConflicts({
        candidates: [
          candidate({ outcome: "yes", settlementTime: SETTLEMENT_TS, eventTicker: EVENT }),
          candidate({
            outcome: "yes",
            settlementTime: SETTLEMENT_TS,
            eventTicker: EVENT,
            contentType: "kalshi.historical.market",
          }),
        ],
        marketTicker: MARKET,
        seriesTicker: SERIES,
        expectedEventTicker: EVENT,
      }),
    ).toBeNull();
  });

  it("5: wrong family event identity fails closed", () => {
    expect(classifySettlementEventIdentity({
      eventTicker: "KXETH15M-26SEP080400",
      seriesTicker: SERIES,
      expectedEventTicker: EVENT,
    })).toBe("incompatible");

    expect(
      detectSettlementConflicts({
        candidates: [
          candidate({ outcome: "yes", settlementTime: SETTLEMENT_TS, eventTicker: EVENT }),
          candidate({
            outcome: "yes",
            settlementTime: SETTLEMENT_TS,
            eventTicker: "KXETH15M-26SEP080400",
          }),
        ],
        marketTicker: MARKET,
        seriesTicker: SERIES,
        expectedEventTicker: EVENT,
      }),
    ).toBe("market metadata disagrees with settlement record event ticker");
  });

  it("6: missing eventTicker plus compatible specific does not conflict", () => {
    expect(
      detectSettlementConflicts({
        candidates: [
          candidate({ outcome: "yes", settlementTime: SETTLEMENT_TS, eventTicker: null }),
          candidate({ outcome: "yes", settlementTime: SETTLEMENT_TS, eventTicker: EVENT }),
        ],
        marketTicker: MARKET,
        seriesTicker: SERIES,
        expectedEventTicker: EVENT,
      }),
    ).toBeNull();
  });

  it("7: outcome conflict remains hard fail-closed", () => {
    expect(
      detectSettlementConflicts({
        candidates: [
          candidate({ outcome: "yes", settlementTime: SETTLEMENT_TS, eventTicker: EVENT }),
          candidate({ outcome: "no", settlementTime: SETTLEMENT_TS, eventTicker: EVENT }),
        ],
        marketTicker: MARKET,
        seriesTicker: SERIES,
        expectedEventTicker: EVENT,
      }),
    ).toContain("conflicting outcomes");
  });

  it("8: genuine settlement timestamp disagreement remains fail-closed", () => {
    expect(
      detectSettlementConflicts({
        candidates: [
          candidate({
            outcome: "yes",
            settlementTime: SETTLEMENT_TS,
            eventTicker: EVENT,
          }),
          candidate({
            outcome: "yes",
            settlementTime: "2026-09-08T08:00:06.000000Z",
            eventTicker: SERIES,
          }),
        ],
        marketTicker: MARKET,
        seriesTicker: SERIES,
        expectedEventTicker: EVENT,
      }),
    ).toBe("duplicate settlements disagree on settlement timestamp");
  });

  it("9: end-to-end import fixture with MARKET+SETTLEMENT classifies settlement-ready", () => {
    const importPath = `data/imports/${SERIES}/${MARKET}/import-result.json`;
    const files: Record<string, string> = {
      [importPath]: productionMarketSettlementImportResult(),
    };

    const candidates = parseAllImportResultSettlements({
      marketTicker: MARKET,
      importPath,
      content: files[importPath]!,
    });
    expect(candidates).toHaveLength(2);
    expect(candidates.map((entry) => entry.eventTicker).sort()).toEqual([EVENT, SERIES].sort());
    expect(
      detectSettlementConflicts({
        candidates,
        marketTicker: MARKET,
        seriesTicker: SERIES,
        expectedEventTicker: EVENT,
      }),
    ).toBeNull();

    const classified = classifyMarketSettlementCoverage({
      io: createIo(files),
      importsDir: "data/imports",
      inventory: inventory(),
      evaluatedAt: EVALUATED_AT,
      staleAfterCaptureObservation: false,
    });

    expect(classified.classification).toBe("settlement-ready");
    expect(classified.settledOutcome).toBe("yes");
    expect(classified.settlementTime).toBe(SETTLEMENT_TS);
    expect(classified.conflictReason).toBeNull();
  });

  it("10: event-identity checks still reject genuine contradictory event-level records", () => {
    const importPath = `data/imports/${SERIES}/${MARKET}/import-result.json`;
    const files: Record<string, string> = {
      [importPath]: JSON.stringify({
        metadata: {
          valid: true,
          collectionTime: "2026-09-08T08:05:00.000Z",
          settlementPresent: true,
        },
        bronzeRecords: [
          {
            contentType: "kalshi.historical.market",
            ticker: MARKET,
            collectionTime: "2026-09-08T08:05:00.000Z",
            payload: {
              market: {
                ticker: MARKET,
                result: "yes",
                settlement_ts: SETTLEMENT_TS,
                event_ticker: EVENT,
              },
            },
          },
          {
            contentType: "kalshi.historical.settlement",
            ticker: MARKET,
            collectionTime: "2026-09-08T08:05:00.000Z",
            payload: {
              market: {
                ticker: MARKET,
                result: "yes",
                settlement_ts: SETTLEMENT_TS,
                event_ticker: OTHER_EVENT,
              },
            },
          },
        ],
      }),
    };

    const classified = classifyMarketSettlementCoverage({
      io: createIo(files),
      importsDir: "data/imports",
      inventory: inventory(),
      evaluatedAt: EVALUATED_AT,
      staleAfterCaptureObservation: false,
    });

    expect(classified.classification).toBe("settlement-present-but-conflicting");
    expect(classified.conflictReason).toBe(
      "market metadata disagrees with settlement record event ticker",
    );
  });

  it("does not let a stale capture seriesTicker override market-derived series identity", () => {
    const importPath = `data/imports/${SERIES}/${MARKET}/import-result.json`;
    const files: Record<string, string> = {
      [importPath]: productionMarketSettlementImportResult(),
    };

    const classified = classifyMarketSettlementCoverage({
      io: createIo(files),
      importsDir: "data/imports",
      inventory: inventory({
        // Capture metadata wrongly recorded a different series string.
      }),
      evaluatedAt: EVALUATED_AT,
      staleAfterCaptureObservation: false,
    });

    expect(classified.classification).toBe("settlement-ready");
    expect(classified.conflictReason).toBeNull();
    expect(classified.settledOutcome).toBe("yes");
  });

  it("classifies series/event/absent/incompatible identity kinds", () => {
    expect(classifySettlementEventIdentity({
      eventTicker: null,
      seriesTicker: SERIES,
      expectedEventTicker: EVENT,
    })).toBe("absent");
    expect(classifySettlementEventIdentity({
      eventTicker: SERIES,
      seriesTicker: SERIES,
      expectedEventTicker: EVENT,
    })).toBe("series-level");
    expect(classifySettlementEventIdentity({
      eventTicker: EVENT,
      seriesTicker: SERIES,
      expectedEventTicker: EVENT,
    })).toBe("event-level");
    expect(classifySettlementEventIdentity({
      eventTicker: OTHER_EVENT,
      seriesTicker: SERIES,
      expectedEventTicker: EVENT,
    })).toBe("incompatible");
  });
});
