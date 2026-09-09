import { describe, expect, it } from "vitest";

import type { UniqueCandidateMarket } from "../calibrationFadeCrossRunValidation/calibrationFadeCrossRunValidationTypes";
import {
  computeV2NoHoldToSettlementGrossReturnCents,
  deriveV2NoHoldToSettlementReturns,
} from "../calibrationFadeV2ForwardValidation/deriveV2NoHoldToSettlementReturns";

import { applyOfflineSettlementOverlay } from "./applyOfflineSettlementOverlay";
import type { SealedV2CandidateMarket } from "./admitV2ConfirmatoryRuns";
import { computeV2SettlementSnapshotHash } from "./computeV2SettlementSnapshotHash";
import { CalibrationFadeV2CrossRunValidationError } from "./calibrationFadeV2CrossRunValidationTypes";

function sealedMarket(
  overrides: Partial<SealedV2CandidateMarket> = {},
): SealedV2CandidateMarket {
  return {
    marketTicker: "KXBTC15M-26SEP081000-00",
    entryTimestamp: "2026-09-08T10:00:05.000Z",
    impliedYesProbability: 0.52,
    noAskCents: 48,
    executableAvailable: true,
    settlementStatus: "unknown",
    settledOutcome: "unknown",
    grossReturnCents: null,
    feeAdjustedReturnCents: null,
    calibrationGapSigned: null,
    ...overrides,
  };
}

function asUnique(market: SealedV2CandidateMarket): UniqueCandidateMarket {
  const appearance = {
    ...market,
    selectedRunId: "run-a",
    selectedRunDirectory: "data/live-capture/forward-quotes/run-a",
    hypothesisConfigurationHash: "deadbeef",
    targetOutcomeSide: "no" as const,
    suppressed: false,
    suppressionReason: null,
    conflicting: false,
    conflictReasons: [],
  };
  return {
    marketTicker: market.marketTicker,
    appearances: [appearance],
    selectedCanonicalEntry: appearance,
    appearanceCount: 1,
    sourceRunIds: ["run-a"],
    conflicting: false,
    conflictReasons: [],
    evaluated: market.settledOutcome === "yes" || market.settledOutcome === "no",
  };
}

function importResult(ticker: string, outcome: "yes" | "no"): string {
  return JSON.stringify({
    metadata: {
      valid: true,
      collectionTime: "2026-09-08T12:00:00.000Z",
      settlementPresent: true,
    },
    bronzeRecords: [
      {
        contentType: "kalshi.historical.settlement",
        ticker,
        collectionTime: "2026-09-08T12:00:00.000Z",
        payload: {
          market: {
            ticker,
            result: outcome,
            settlement_ts: "2026-09-08T11:15:00.000Z",
          },
        },
      },
    ],
  });
}

describe("M12.6e.4 executable settlement overlay returns", () => {
  it("1: unknown settlement + executable entry → null returns", () => {
    expect(
      deriveV2NoHoldToSettlementReturns({
        noAskCents: 48,
        executableAvailable: true,
        settledOutcome: "unknown",
      }),
    ).toEqual({
      grossReturnCents: null,
      feeAdjustedReturnCents: null,
    });
  });

  it("2: known YES settlement + NO ask → negative gross return", () => {
    expect(computeV2NoHoldToSettlementGrossReturnCents(45, "yes")).toBe(-45);
    expect(
      deriveV2NoHoldToSettlementReturns({
        noAskCents: 45,
        executableAvailable: true,
        settledOutcome: "yes",
      }),
    ).toEqual({
      grossReturnCents: -45,
      feeAdjustedReturnCents: -46,
    });
  });

  it("3: known NO settlement + NO ask → positive gross return", () => {
    expect(computeV2NoHoldToSettlementGrossReturnCents(47, "no")).toBe(53);
    expect(
      deriveV2NoHoldToSettlementReturns({
        noAskCents: 47,
        executableAvailable: true,
        settledOutcome: "no",
      }),
    ).toEqual({
      grossReturnCents: 53,
      feeAdjustedReturnCents: 52,
    });
  });

  it("4: fee-adjusted return uses production 1¢ per-contract fee model", () => {
    const derived = deriveV2NoHoldToSettlementReturns({
      noAskCents: 34,
      executableAvailable: true,
      settledOutcome: "no",
    });
    expect(derived.grossReturnCents).toBe(66);
    expect(derived.feeAdjustedReturnCents).toBe(65);
  });

  it("5: no executable price → returns remain null", () => {
    expect(
      deriveV2NoHoldToSettlementReturns({
        noAskCents: null,
        executableAvailable: false,
        settledOutcome: "no",
      }),
    ).toEqual({
      grossReturnCents: null,
      feeAdjustedReturnCents: null,
    });
  });

  it("6: imported settlement conflicts with sealed known outcome → fail closed", () => {
    const ticker = "KXBTC15M-26SEP081000-00";
    const files: Record<string, string> = {
      [`data/imports/KXBTC15M/${ticker}/import-result.json`]: importResult(ticker, "yes"),
    };
    expect(() =>
      applyOfflineSettlementOverlay({
        io: {
          readFile: (path) => files[path] ?? "",
          fileExists: (path) => path in files || path === "data/imports",
          readdir: () => [],
          isDirectory: (path) => path === "data/imports" || path === "data/imports/KXBTC15M",
        },
        importsDir: "data/imports",
        markets: [
          sealedMarket({
            settledOutcome: "no",
            settlementStatus: "known",
            grossReturnCents: 52,
            feeAdjustedReturnCents: 51,
          }),
        ],
      }),
    ).toThrow(CalibrationFadeV2CrossRunValidationError);
  });

  it("7: partial executable-return pair → fail closed", () => {
    expect(() =>
      applyOfflineSettlementOverlay({
        io: {
          readFile: () => "",
          fileExists: () => false,
          readdir: () => [],
          isDirectory: () => false,
        },
        importsDir: null,
        markets: [
          sealedMarket({
            grossReturnCents: 52,
            feeAdjustedReturnCents: null,
          }),
        ],
      }),
    ).toThrow(/partial executable returns/);
  });

  it("8: preexisting consistent sealed executable-return pair remains consistent", () => {
    const ticker = "KXBTC15M-26SEP081000-00";
    const files: Record<string, string> = {
      [`data/imports/KXBTC15M/${ticker}/import-result.json`]: importResult(ticker, "no"),
    };
    const result = applyOfflineSettlementOverlay({
      io: {
        readFile: (path) => files[path] ?? "",
        fileExists: (path) => path in files || path.startsWith("data/imports"),
        readdir: () => [],
        isDirectory: (path) => path.startsWith("data/imports"),
      },
      importsDir: "data/imports",
      markets: [
        sealedMarket({
          settledOutcome: "no",
          settlementStatus: "known",
          grossReturnCents: 57,
          feeAdjustedReturnCents: 56,
          calibrationGapSigned: -0.5,
        }),
      ],
    });
    expect(result.markets[0]?.grossReturnCents).toBe(57);
    expect(result.markets[0]?.feeAdjustedReturnCents).toBe(56);
  });

  it("9: overlay does not alter ticker/entry/admission-facing identity fields", () => {
    const ticker = "KXBTC15M-26SEP081000-00";
    const entryTimestamp = "2026-09-08T10:00:05.000Z";
    const files: Record<string, string> = {
      [`data/imports/KXBTC15M/${ticker}/import-result.json`]: importResult(ticker, "yes"),
    };
    const result = applyOfflineSettlementOverlay({
      io: {
        readFile: (path) => files[path] ?? "",
        fileExists: (path) => path in files || path.startsWith("data/imports"),
        readdir: () => [],
        isDirectory: (path) => path.startsWith("data/imports"),
      },
      importsDir: "data/imports",
      markets: [sealedMarket({ marketTicker: ticker, entryTimestamp })],
    });
    expect(result.markets[0]?.marketTicker).toBe(ticker);
    expect(result.markets[0]?.entryTimestamp).toBe(entryTimestamp);
    expect(result.markets[0]?.noAskCents).toBe(48);
    expect(result.markets[0]?.executableAvailable).toBe(true);
    expect(result.markets[0]?.grossReturnCents).toBe(-48);
    expect(result.markets[0]?.feeAdjustedReturnCents).toBe(-49);
  });

  it("10: settlement snapshot hash changes when executable return state changes", () => {
    const before = computeV2SettlementSnapshotHash({
      runSetHash: "38b3f877",
      uniqueMarkets: [asUnique(sealedMarket())],
    });
    const after = computeV2SettlementSnapshotHash({
      runSetHash: "38b3f877",
      uniqueMarkets: [
        asUnique(
          sealedMarket({
            settlementStatus: "known",
            settledOutcome: "no",
            grossReturnCents: 52,
            feeAdjustedReturnCents: 51,
            calibrationGapSigned: -0.5,
          }),
        ),
      ],
    });
    expect(before.settlementSnapshotHash).not.toBe(after.settlementSnapshotHash);
  });

  it("12: settlement after seal no longer forces zero evaluated executable returns", () => {
    const ticker = "KXBTC15M-26SEP081000-00";
    const files: Record<string, string> = {
      [`data/imports/KXBTC15M/${ticker}/import-result.json`]: importResult(ticker, "no"),
    };
    const result = applyOfflineSettlementOverlay({
      io: {
        readFile: (path) => files[path] ?? "",
        fileExists: (path) => path in files || path.startsWith("data/imports"),
        readdir: () => [],
        isDirectory: (path) => path.startsWith("data/imports"),
      },
      importsDir: "data/imports",
      markets: [sealedMarket()],
    });
    expect(result.markets[0]?.settledOutcome).toBe("no");
    expect(result.markets[0]?.grossReturnCents).toBe(52);
    expect(result.markets[0]?.feeAdjustedReturnCents).toBe(51);
  });
});
