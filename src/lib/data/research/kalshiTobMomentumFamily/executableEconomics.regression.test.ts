import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { stableStringify } from "@/lib/trading/config/hashConfig";
import { midpointOnlyCannotAuthorizeEconomicSupport } from "../momentumEvidenceContract";

import {
  buildAnchorPolicy,
  buildComplementBookSemantics,
  buildDirectionConventionSpec,
  buildEligibilityGates,
  buildIndependentUnitPolicy,
  buildMidpointFormulaSpec,
  buildMomentumFamilyDefinitionReport,
  buildMomentumFamilyIdentityPayload,
  buildOutcomeSemantics,
  buildRefractoryPolicy,
  buildResponseMatchContract,
  computeGrossExecutableOneContractPnlCents,
  deriveNoBestAskCents,
  deriveYesBestAskCents,
  diagnosticSignedMidpointContinuationCents,
  enumerateMomentumHypotheses,
  resolveComplementExecutablePrices,
  yesMidCents,
} from "./index";

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Tier-A executable / complement economics regressions.
 * Exact-cent assertions on asymmetric books — 50/50 fixtures can hide inversions.
 */
describe("Tier-A executable economics regressions", () => {
  describe("complement-book arithmetic (asymmetric)", () => {
    it("YES ask = 100 - NO bid and NO ask = 100 - YES bid for representative books", () => {
      // Conceptually: YES bid=37, NO bid=61 → YES ask=39, NO ask=63
      expect(deriveYesBestAskCents(61)).toBe(39);
      expect(deriveNoBestAskCents(37)).toBe(63);

      const resolved = resolveComplementExecutablePrices({
        yesBestBidCents: 37,
        noBestBidCents: 61,
      });
      expect(resolved.yesBestAskCents).toBe(39);
      expect(resolved.noBestAskCents).toBe(63);
      expect(resolved.executableBuyYesCents).toBe(39);
      expect(resolved.executableSellYesCents).toBe(37);
      expect(resolved.executableBuyNoCents).toBe(63);
      expect(resolved.executableSellNoCents).toBe(61);
    });

    it("covers additional asymmetric complement books with exact cents", () => {
      const books = [
        { yesBid: 22, noBid: 70, yesAsk: 30, noAsk: 78 },
        { yesBid: 41, noBid: 52, yesAsk: 48, noAsk: 59 },
        { yesBid: 15, noBid: 80, yesAsk: 20, noAsk: 85 },
        { yesBid: 1, noBid: 97, yesAsk: 3, noAsk: 99 },
        { yesBid: 48, noBid: 50, yesAsk: 50, noAsk: 52 }, // one-cent effective YES spread via complement
      ] as const;

      for (const book of books) {
        expect(deriveYesBestAskCents(book.noBid)).toBe(book.yesAsk);
        expect(deriveNoBestAskCents(book.yesBid)).toBe(book.noAsk);
        const resolved = resolveComplementExecutablePrices({
          yesBestBidCents: book.yesBid,
          noBestBidCents: book.noBid,
        });
        expect(resolved.yesBestAskCents).toBe(book.yesAsk);
        expect(resolved.noBestAskCents).toBe(book.noAsk);
      }
    });

    it("does not hide inversion when YES and NO bids differ (not 50/50)", () => {
      // If deriveNoBestAskCents were inverted to use noBid, this would wrongly yield 39.
      expect(deriveNoBestAskCents(37)).not.toBe(39);
      expect(deriveNoBestAskCents(37)).toBe(63);
      // If deriveYesBestAskCents were inverted to use yesBid, this would wrongly yield 63.
      expect(deriveYesBestAskCents(61)).not.toBe(63);
      expect(deriveYesBestAskCents(61)).toBe(39);
    });

    it("semantics rules document the exact complement transforms", () => {
      const semantics = buildComplementBookSemantics();
      expect(semantics.derivedYesAskCentsRule).toBe("100 - noBestBidCents");
      expect(semantics.derivedNoAskCentsRule).toBe("100 - yesBestBidCents");
      expect(semantics.askSideIndependentlyCaptured).toBe(false);
    });
  });

  describe("gross executable P&L — upward continuation", () => {
    it("asserts exact event YES ask, response YES bid, and gross P&L cents", () => {
      // Entry: YES bid=37 / NO bid=61 → YES ask=39
      // Exit:  YES bid=41 / NO bid=57 → YES ask=43
      // Upward: buy YES @ 39, sell YES @ 41 → +2¢
      const entry = resolveComplementExecutablePrices({
        yesBestBidCents: 37,
        noBestBidCents: 61,
      });
      const exit = resolveComplementExecutablePrices({
        yesBestBidCents: 41,
        noBestBidCents: 57,
      });
      expect(entry.executableBuyYesCents).toBe(39);
      expect(exit.executableSellYesCents).toBe(41);

      const pnl = computeGrossExecutableOneContractPnlCents({
        continuationSign: 1,
        entryYesBestBidCents: 37,
        entryNoBestBidCents: 61,
        exitYesBestBidCents: 41,
        exitNoBestBidCents: 57,
      });
      expect(pnl).toBe(2);
      expect(pnl).toBe(exit.executableSellYesCents! - entry.executableBuyYesCents!);
    });

    it("covers profitable, flat, and losing upward cases with exact cents", () => {
      expect(
        computeGrossExecutableOneContractPnlCents({
          continuationSign: 1,
          entryYesBestBidCents: 37,
          entryNoBestBidCents: 61,
          exitYesBestBidCents: 42,
          exitNoBestBidCents: 56,
        }),
      ).toBe(3); // buy 39, sell 42

      expect(
        computeGrossExecutableOneContractPnlCents({
          continuationSign: 1,
          entryYesBestBidCents: 37,
          entryNoBestBidCents: 61,
          exitYesBestBidCents: 39,
          exitNoBestBidCents: 59,
        }),
      ).toBe(0); // buy 39, sell 39

      expect(
        computeGrossExecutableOneContractPnlCents({
          continuationSign: 1,
          entryYesBestBidCents: 37,
          entryNoBestBidCents: 61,
          exitYesBestBidCents: 36,
          exitNoBestBidCents: 62,
        }),
      ).toBe(-3); // buy 39, sell 36
    });
  });

  describe("gross executable P&L — downward continuation", () => {
    it("asserts exact event NO ask, response NO bid, and gross P&L cents", () => {
      // Entry: YES bid=37 / NO bid=61 → NO ask=63
      // Exit:  YES bid=33 / NO bid=65 → NO ask=67
      // Downward NO path: buy NO @ 63, sell NO @ 65 → +2¢
      const entry = resolveComplementExecutablePrices({
        yesBestBidCents: 37,
        noBestBidCents: 61,
      });
      const exit = resolveComplementExecutablePrices({
        yesBestBidCents: 33,
        noBestBidCents: 65,
      });
      expect(entry.executableBuyNoCents).toBe(63);
      expect(exit.executableSellNoCents).toBe(65);

      const pnl = computeGrossExecutableOneContractPnlCents({
        continuationSign: -1,
        entryYesBestBidCents: 37,
        entryNoBestBidCents: 61,
        exitYesBestBidCents: 33,
        exitNoBestBidCents: 65,
      });
      expect(pnl).toBe(2);
      expect(pnl).toBe(exit.executableSellNoCents! - entry.executableBuyNoCents!);
    });

    it("covers profitable, flat, and losing downward cases with exact cents", () => {
      expect(
        computeGrossExecutableOneContractPnlCents({
          continuationSign: -1,
          entryYesBestBidCents: 40,
          entryNoBestBidCents: 55,
          exitYesBestBidCents: 35,
          exitNoBestBidCents: 62,
        }),
      ).toBe(2); // NO ask entry=60, NO bid exit=62

      expect(
        computeGrossExecutableOneContractPnlCents({
          continuationSign: -1,
          entryYesBestBidCents: 40,
          entryNoBestBidCents: 55,
          exitYesBestBidCents: 38,
          exitNoBestBidCents: 60,
        }),
      ).toBe(0); // buy NO@60, sell NO@60

      expect(
        computeGrossExecutableOneContractPnlCents({
          continuationSign: -1,
          entryYesBestBidCents: 40,
          entryNoBestBidCents: 55,
          exitYesBestBidCents: 45,
          exitNoBestBidCents: 52,
        }),
      ).toBe(-8); // buy NO@60, sell NO@52
    });
  });

  describe("YES/NO economic symmetry under complement transforms", () => {
    it("downward NO-path P&L equals the complementary YES short path", () => {
      const cases = [
        {
          entryYesBid: 37,
          entryNoBid: 61,
          exitYesBid: 33,
          exitNoBid: 65,
          expected: 2,
        },
        {
          entryYesBid: 22,
          entryNoBid: 70,
          exitYesBid: 18,
          exitNoBid: 82,
          expected: 4,
        },
        {
          entryYesBid: 48,
          entryNoBid: 50,
          exitYesBid: 46,
          exitNoBid: 51,
          expected: -1,
        },
      ] as const;

      for (const row of cases) {
        const entry = resolveComplementExecutablePrices({
          yesBestBidCents: row.entryYesBid,
          noBestBidCents: row.entryNoBid,
        });
        const exit = resolveComplementExecutablePrices({
          yesBestBidCents: row.exitYesBid,
          noBestBidCents: row.exitNoBid,
        });
        const noPath =
          exit.executableSellNoCents! - entry.executableBuyNoCents!;
        const yesShortPath =
          entry.executableSellYesCents! - exit.executableBuyYesCents!;
        const computed = computeGrossExecutableOneContractPnlCents({
          continuationSign: -1,
          entryYesBestBidCents: row.entryYesBid,
          entryNoBestBidCents: row.entryNoBid,
          exitYesBestBidCents: row.exitYesBid,
          exitNoBestBidCents: row.exitNoBid,
        });
        expect(noPath).toBe(yesShortPath);
        expect(computed).toBe(noPath);
        expect(computed).toBe(row.expected);
      }
    });

    it("upward YES-path P&L is the complement of a mirrored downward trade", () => {
      // Mirror: swap sides via complement — upward move in YES ↔ downward in NO space.
      const upward = computeGrossExecutableOneContractPnlCents({
        continuationSign: 1,
        entryYesBestBidCents: 37,
        entryNoBestBidCents: 61,
        exitYesBestBidCents: 41,
        exitNoBestBidCents: 57,
      });
      // Complement-mirror books: YES' = prior NO, NO' = prior YES
      const mirroredDownward = computeGrossExecutableOneContractPnlCents({
        continuationSign: -1,
        entryYesBestBidCents: 61,
        entryNoBestBidCents: 37,
        exitYesBestBidCents: 57,
        exitNoBestBidCents: 41,
      });
      expect(upward).toBe(2);
      expect(mirroredDownward).toBe(2);
      expect(upward).toBe(mirroredDownward);
    });
  });

  describe("midpoint diagnostic vs executable economics", () => {
    it("reports exact midpoint and exact different executable when mid looks good but exec does not", () => {
      // Entry mid: yes=37, no=61 → mid = (37+39)/2 = 38
      // Exit mid:  yes=40, no=58 → mid = (40+42)/2 = 41 → mid continuation = +3
      // Upward exec: buy YES@39, sell YES@40 → +1
      const eventMid = yesMidCents({ yesBestBidCents: 37, noBestBidCents: 61 });
      const responseMid = yesMidCents({ yesBestBidCents: 40, noBestBidCents: 58 });
      expect(eventMid).toBe(38);
      expect(responseMid).toBe(41);

      const midContinuation = diagnosticSignedMidpointContinuationCents({
        continuationSign: 1,
        eventMidCents: eventMid,
        responseMidCents: responseMid,
      });
      expect(midContinuation).toBe(3);

      const execPnl = computeGrossExecutableOneContractPnlCents({
        continuationSign: 1,
        entryYesBestBidCents: 37,
        entryNoBestBidCents: 61,
        exitYesBestBidCents: 40,
        exitNoBestBidCents: 58,
      });
      expect(execPnl).toBe(1);
      expect(midContinuation).not.toBe(execPnl);
    });

    it("midpoint positive while executable is zero (spread consumes the move)", () => {
      // Entry: yes=37 no=61 mid=38 ask=39
      // Exit:  yes=39 no=59 mid=40 ask=41 → mid +2, exec buy@39 sell@39 = 0
      const mid = diagnosticSignedMidpointContinuationCents({
        continuationSign: 1,
        eventMidCents: yesMidCents({ yesBestBidCents: 37, noBestBidCents: 61 }),
        responseMidCents: yesMidCents({ yesBestBidCents: 39, noBestBidCents: 59 }),
      });
      const exec = computeGrossExecutableOneContractPnlCents({
        continuationSign: 1,
        entryYesBestBidCents: 37,
        entryNoBestBidCents: 61,
        exitYesBestBidCents: 39,
        exitNoBestBidCents: 59,
      });
      expect(mid).toBe(2);
      expect(exec).toBe(0);
      expect(mid).toBeGreaterThan(0);
      expect(exec).toBeLessThanOrEqual(0);
    });

    it("midpoint positive while executable is negative", () => {
      // Entry mid 38; exit yes=38 no=60 → mid=39 (+1) but exec buy@39 sell@38 = -1
      const mid = diagnosticSignedMidpointContinuationCents({
        continuationSign: 1,
        eventMidCents: yesMidCents({ yesBestBidCents: 37, noBestBidCents: 61 }),
        responseMidCents: yesMidCents({ yesBestBidCents: 38, noBestBidCents: 60 }),
      });
      const exec = computeGrossExecutableOneContractPnlCents({
        continuationSign: 1,
        entryYesBestBidCents: 37,
        entryNoBestBidCents: 61,
        exitYesBestBidCents: 38,
        exitNoBestBidCents: 60,
      });
      expect(mid).toBe(1);
      expect(exec).toBe(-1);
      expect(mid).toBeGreaterThan(0);
      expect(exec).toBeLessThan(0);
      // Exact values differ — midpoint must not be treated as the executable estimand.
      expect(mid).not.toBe(exec);
    });

    it("midpoint cannot substitute for executable P&L in governance", () => {
      const midpointOnlyGate = midpointOnlyCannotAuthorizeEconomicSupport({
        midpointContinuationCents: 5,
        executablePnlCents: null,
        executableObservable: false,
      });
      expect(midpointOnlyGate.economicSupportAuthorized).toBe(false);

      // Even a favorable midpoint with non-positive executable must not be confused
      // with the primary estimand — values remain distinct fields.
      const mid = 5;
      const exec = 0;
      expect(mid).not.toBe(exec);
      expect(mid).toBeGreaterThan(0);
      expect(exec).toBeLessThanOrEqual(0);
    });
  });

  describe("integer-cent boundaries", () => {
    it("handles near 1/99 bids, one-cent and wider spreads, and ±1/±2 P&L", () => {
      expect(deriveYesBestAskCents(97)).toBe(3);
      expect(deriveNoBestAskCents(1)).toBe(99);
      expect(deriveYesBestAskCents(1)).toBe(99);
      expect(deriveNoBestAskCents(99)).toBe(1);

      // One-cent YES spread: bid 48 / ask 49 (noBid=51)
      expect(deriveYesBestAskCents(51)).toBe(49);
      expect(yesMidCents({ yesBestBidCents: 48, noBestBidCents: 51 })).toBe(48.5);

      // Wider spread: bid 30 / ask 45 (noBid=55)
      expect(deriveYesBestAskCents(55)).toBe(45);

      expect(
        computeGrossExecutableOneContractPnlCents({
          continuationSign: 1,
          entryYesBestBidCents: 40,
          entryNoBestBidCents: 55, // ask 45
          exitYesBestBidCents: 45,
          exitNoBestBidCents: 50,
        }),
      ).toBe(0);

      expect(
        computeGrossExecutableOneContractPnlCents({
          continuationSign: 1,
          entryYesBestBidCents: 40,
          entryNoBestBidCents: 55,
          exitYesBestBidCents: 46,
          exitNoBestBidCents: 49,
        }),
      ).toBe(1);

      expect(
        computeGrossExecutableOneContractPnlCents({
          continuationSign: 1,
          entryYesBestBidCents: 40,
          entryNoBestBidCents: 55,
          exitYesBestBidCents: 44,
          exitNoBestBidCents: 51,
        }),
      ).toBe(-1);

      expect(
        computeGrossExecutableOneContractPnlCents({
          continuationSign: -1,
          entryYesBestBidCents: 40,
          entryNoBestBidCents: 55, // NO ask 60
          exitYesBestBidCents: 38,
          exitNoBestBidCents: 62,
        }),
      ).toBe(2);

      expect(
        computeGrossExecutableOneContractPnlCents({
          continuationSign: -1,
          entryYesBestBidCents: 40,
          entryNoBestBidCents: 55,
          exitYesBestBidCents: 42,
          exitNoBestBidCents: 58,
        }),
      ).toBe(-2);
    });
  });

  describe("family identity sensitivity", () => {
    it("generatedAt does not change family definition identity", () => {
      const a = buildMomentumFamilyDefinitionReport({
        generatedAt: "2026-09-10T00:00:00.000Z",
      });
      const b = buildMomentumFamilyDefinitionReport({
        generatedAt: "2099-01-01T00:00:00.000Z",
      });
      expect(a.familyDefinitionIdentityHash).toBe(b.familyDefinitionIdentityHash);
    });

    it("changing an authoritative sealed field changes identity hash", () => {
      const hypotheses = enumerateMomentumHypotheses();
      const basePayload = buildMomentumFamilyIdentityPayload({
        complementBookSemantics: buildComplementBookSemantics(),
        midpointFormula: buildMidpointFormulaSpec(),
        directionConvention: buildDirectionConventionSpec(),
        anchorPolicy: buildAnchorPolicy(),
        responseMatchContract: buildResponseMatchContract(),
        eligibilityGates: buildEligibilityGates(),
        refractoryPolicy: buildRefractoryPolicy(),
        independentUnitPolicy: buildIndependentUnitPolicy(),
        outcomeSemantics: buildOutcomeSemantics(),
        hypotheses,
      });
      const baseHash = sha256Hex(stableStringify(basePayload));
      expect(baseHash).toBe(
        buildMomentumFamilyDefinitionReport({
          generatedAt: "2026-09-10T00:00:00.000Z",
        }).familyDefinitionIdentityHash,
      );

      const mutatedWindows = {
        ...basePayload,
        backwardWindowsMs: [1, 2],
      };
      expect(sha256Hex(stableStringify(mutatedWindows))).not.toBe(baseHash);

      const mutatedThresholds = {
        ...basePayload,
        returnThresholdsCents: [9, 10],
      };
      expect(sha256Hex(stableStringify(mutatedThresholds))).not.toBe(baseHash);

      const mutatedDirection = {
        ...basePayload,
        directionConvention: {
          ...(basePayload.directionConvention as Record<string, unknown>),
          convention: "reversal",
        },
      };
      expect(sha256Hex(stableStringify(mutatedDirection))).not.toBe(baseHash);

      const mutatedComplement = {
        ...basePayload,
        complementBookSemantics: {
          ...(basePayload.complementBookSemantics as Record<string, unknown>),
          derivedNoAskCentsRule: "100 - noBestBidCents", // inverted wrong rule
        },
      };
      expect(sha256Hex(stableStringify(mutatedComplement))).not.toBe(baseHash);
    });
  });
});
