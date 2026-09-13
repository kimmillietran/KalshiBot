import { describe, expect, it } from "vitest";

import { createMemoryMomentumDiscoveryIo } from "../kalshiTobMomentumDiscovery";

import {
  assertBlindIncidenceHasNoOutcomeFields,
  FORBIDDEN_MOMENTUM_VALIDATION_OUTCOME_FIELD_NAMES,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  streamLockedCandidateBlindIncidence,
} from "./index";

function tobLine(input: {
  marketTicker: string;
  receivedAtLocal: string;
  yesBestBidCents: number;
  noBestBidCents: number;
  yesBestBidSize?: number;
  noBestBidSize?: number;
}): string {
  return JSON.stringify({
    marketTicker: input.marketTicker,
    eventTicker: input.marketTicker.replace(/-\d+$/, ""),
    seriesTicker: "KXBTC15M",
    receivedAtLocal: input.receivedAtLocal,
    exchangeTimestampMs: null,
    bookState: "valid",
    isEconomicallyValid: true,
    yesBestBidCents: input.yesBestBidCents,
    noBestBidCents: input.noBestBidCents,
    yesBestBidSize: input.yesBestBidSize ?? 10,
    noBestBidSize: input.noBestBidSize ?? 10,
    yesBestAskCents: 100 - input.noBestBidCents,
    noBestAskCents: 100 - input.yesBestBidCents,
  });
}

describe("streamLockedCandidateBlindIncidence", () => {
  it("counts outcome-blind ESS for locked candidate without outcome fields", async () => {
    const marketTicker = "KXBTC15M-26SEP131200-00";
    const t0 = Date.parse("2026-09-13T12:00:00.000Z");
    const closeTime = "2026-09-13T12:10:00.000Z";
    const captureRunDir = "/fixture/seg2-blind";
    const tobPath = `${captureRunDir}/top-of-book.jsonl`;
    const metaPath = `${captureRunDir}/market-metadata.jsonl`;

    // mid = (yesBid - noBid)/2 + 50 when bids are complementary around mid.
    // Use yesBid=mid, noBid=100-mid → mid = mid.
    const lines = [
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0).toISOString(),
        yesBestBidCents: 40,
        noBestBidCents: 60,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 5_000).toISOString(),
        yesBestBidCents: 42,
        noBestBidCents: 58,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 35_000).toISOString(),
        yesBestBidCents: 43,
        noBestBidCents: 57,
      }),
    ].join("\n");

    const io = createMemoryMomentumDiscoveryIo({
      [tobPath]: `${lines}\n`,
      [metaPath]: `${JSON.stringify({
        marketTicker,
        closeTime,
        status: "active",
        action: "subscribed",
      })}\n`,
    });

    const result = await streamLockedCandidateBlindIncidence({
      io,
      segmentRunId: "fixture-seg2",
      captureRunDir,
    });

    expect(result.diagnostics.candidateId).toBe(LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID);
    expect(result.diagnostics.outcomesOpened).toBe(false);
    expect(result.diagnostics.firstCrossingEvents).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics.refractoryEpisodes).toBeGreaterThanOrEqual(1);
    expect(result.incidence.outcomesOpened).toBe(false);
    expect(result.incidence.independentEss).toBeGreaterThanOrEqual(1);
    expect(result.incidence.qualifyingEpisodeCount).toBeGreaterThanOrEqual(1);
    expect(result.incidence.responseObservableCount).toBeGreaterThanOrEqual(1);
    expect(result.incidence.executableObservableCount).toBeGreaterThanOrEqual(1);
    assertBlindIncidenceHasNoOutcomeFields(result.incidence);
    for (const field of FORBIDDEN_MOMENTUM_VALIDATION_OUTCOME_FIELD_NAMES) {
      expect(result.incidence).not.toHaveProperty(field);
    }
    expect(JSON.stringify(result.incidence).toLowerCase()).not.toMatch(
      /pnl|midpoint|signed|continuation|pvalue|directionconsist/,
    );
  });

  it("rejects non-locked candidate ids", async () => {
    const captureRunDir = "/fixture/reject";
    const io = createMemoryMomentumDiscoveryIo({
      [`${captureRunDir}/top-of-book.jsonl`]: "\n",
    });
    await expect(
      streamLockedCandidateBlindIncidence({
        io,
        segmentRunId: "x",
        captureRunDir,
        candidateId: "W-1000|X-1|H-10000|continuation" as never,
      }),
    ).rejects.toThrow(/locked candidate/i);
  });
});
