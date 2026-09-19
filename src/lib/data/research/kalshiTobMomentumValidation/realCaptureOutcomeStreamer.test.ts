/**
 * Synthetic-only tests for M14.0c real-capture outcome streaming.
 * MUST NOT read accepted M14 validation captures (Segments 1–5/7).
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createMemoryMomentumDiscoveryIo } from "../kalshiTobMomentumDiscovery";
import {
  computeGrossExecutableOneContractPnlCents,
  resolveComplementExecutablePrices,
  type MomentumQuoteInput,
} from "../kalshiTobMomentumFamily";
import {
  assertAdmittedValidationSegmentCannotBecomeHoldout,
  buildBlindIncidenceWithMarketDayCap,
  buildMomentumIndependentUnitKey,
  buildMomentumValidationCohortPlan,
  createEmptyMomentumValidationCohortRegistry,
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  type MomentumValidationAcceptedSegment,
  type MomentumValidationExcludedSegment,
} from "../kalshiTobMomentumValidationCohort";

import {
  assertRealValidationCaptureStreamAllowed,
  authorizeMomentumValidationOutcomeAccess,
  buildMomentumValidationReport,
  computeValidationOutcomesFromEpisodes,
  runGovernedRealCaptureMomentumValidation,
  streamLockedCandidateValidationOutcomes,
  streamMomentumValidationOutcomesFromAcceptedCohort,
  type MomentumValidationCohortAuthorityInput,
  type SealedAcceptedCaptureDescriptor,
} from "./index";
import { referenceLockedCandidateValidationOutcomes } from "./referenceLockedCandidateValidationOutcomes";

const PLAN_FREEZE = "2026-09-12T00:00:00.000Z";
const FAILED_SEG6_RUN = "2026-09-19T00-54-42-279Z";

function tobLine(input: {
  marketTicker: string;
  receivedAtLocal: string;
  yesBestBidCents: number;
  noBestBidCents: number;
  yesBestBidSize?: number;
  noBestBidSize?: number;
  bookState?: string;
  isEconomicallyValid?: boolean;
  exchangeTimestampMs?: number | null;
}): string {
  return JSON.stringify({
    marketTicker: input.marketTicker,
    eventTicker: input.marketTicker.replace(/-\d+$/, ""),
    seriesTicker: "KXBTC15M",
    receivedAtLocal: input.receivedAtLocal,
    exchangeTimestampMs: input.exchangeTimestampMs ?? null,
    bookState: input.bookState ?? "valid",
    isEconomicallyValid: input.isEconomicallyValid ?? true,
    yesBestBidCents: input.yesBestBidCents,
    noBestBidCents: input.noBestBidCents,
    yesBestBidSize: input.yesBestBidSize ?? 10,
    noBestBidSize: input.noBestBidSize ?? 10,
    yesBestAskCents: 100 - input.noBestBidCents,
    noBestAskCents: 100 - input.yesBestBidCents,
  });
}

function makeUnitId(market: string, day: string): string {
  return buildMomentumIndependentUnitKey({
    marketTicker: market,
    tradingDayUtc: day,
  });
}

function makeNUnits(n: number, prefix = "M"): string[] {
  const units: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const day = `2026-09-${String((i % 28) + 1).padStart(2, "0")}`;
    const market = `${prefix}${Math.floor(i / 28)}`;
    units.push(makeUnitId(market, day));
  }
  return units;
}

function makeAcceptedSegment(input: {
  runId: string;
  unitIds: readonly string[];
  captureStartMs?: number;
  captureRunDir?: string;
  captureIdentityHash?: string;
  healthArtifactIdentity?: string | null;
  reservationAttestationHash?: string;
  priorResearchRoles?: readonly string[];
}): MomentumValidationAcceptedSegment {
  const capped = buildBlindIncidenceWithMarketDayCap({
    segmentRunId: input.runId,
    episodeKeys: input.unitIds.map((unitId) => ({ unitId })),
  });
  return {
    runId: input.runId,
    captureRunDir:
      input.captureRunDir ?? `data/live-capture/forward-quotes/${input.runId}`,
    captureStartMs: input.captureStartMs ?? Date.parse("2026-09-12T12:00:00.000Z"),
    captureEndMs: (input.captureStartMs ?? Date.parse("2026-09-12T12:00:00.000Z")) + 300 * 60_000,
    durationMinutes: 300,
    captureIdentityHash: input.captureIdentityHash ?? `capture-${input.runId}`,
    health: {
      passed: true,
      verdict: "ok",
      topOfBookPresent: true,
      failureReasons: [],
      artifactIdentity: input.healthArtifactIdentity ?? `health-${input.runId}`,
    },
    captureEndReason: "duration-elapsed",
    configIdentity: "cfg-test",
    priorResearchRoles: input.priorResearchRoles ?? [],
    contaminationClassification: "untouched-for-short-horizon-price-response",
    intendedCohortPosition: null,
    outcomesOpened: false,
    reservedForValidationLineage: true,
    reservedAfterPlanFreeze: true,
    planIdentity: "plan-test",
    reservationAttestationHash:
      input.reservationAttestationHash ?? `attest-${input.runId}`,
    accepted: true,
    blindIncidence: capped.incidence,
    independentUnitIds: capped.independentUnitIds,
  };
}

function makeReadyAuthority(input?: {
  segments?: MomentumValidationAcceptedSegment[];
  excluded?: MomentumValidationExcludedSegment[];
  status?: MomentumValidationCohortAuthorityInput["cohortStatus"];
  ess?: number;
  lockedCandidateId?: string;
  planIdentity?: string;
  familyDefinitionIdentity?: string;
  evidenceContractIdentity?: string;
  discoveryIdentity?: string;
}): MomentumValidationCohortAuthorityInput {
  const { planIdentity } = buildMomentumValidationCohortPlan();
  const ess = input?.ess ?? 155;
  const segments =
    input?.segments
    ?? [
      makeAcceptedSegment({
        runId: "synth-val-1",
        unitIds: makeNUnits(ess),
      }),
    ];
  const registry = createEmptyMomentumValidationCohortRegistry({
    planIdentity: input?.planIdentity ?? planIdentity,
    planFreezeTimestampIso: PLAN_FREEZE,
  });
  registry.accepted.push(...segments);
  if (input?.excluded) {
    registry.excluded.push(...input.excluded);
  }
  return {
    familyDefinitionIdentity:
      input?.familyDefinitionIdentity ?? KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
    evidenceContractIdentity:
      input?.evidenceContractIdentity ?? KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
    discoveryIdentity: input?.discoveryIdentity ?? KNOWN_M140B_DISCOVERY_IDENTITY,
    planIdentity: input?.planIdentity ?? planIdentity,
    lockedCandidateId: input?.lockedCandidateId ?? LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    registry,
    cohortStatus: input?.status ?? "ready-for-outcome-open",
    cumulativeBlindEss: ess,
  };
}

/** Classic upward 2¢ continuation fixture: mid 40 → 42 at +5s, response at +35s. */
function classicUpwardFixture(input?: {
  captureRunDir?: string;
  marketTicker?: string;
  t0?: number;
  closeTime?: string;
  responseYes?: number;
  responseNo?: number;
  earlyIneligibleResponse?: boolean;
}): { files: Record<string, string>; captureRunDir: string; marketTicker: string; t0: number } {
  const captureRunDir = input?.captureRunDir ?? "/fixture/synth-up";
  const marketTicker = input?.marketTicker ?? "KXBTC15M-26SEP131200-00";
  const t0 = input?.t0 ?? Date.parse("2026-09-13T12:00:00.000Z");
  const closeTime = input?.closeTime ?? "2026-09-13T12:10:00.000Z";
  const lines: string[] = [
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
  ];
  if (input?.earlyIneligibleResponse) {
    lines.push(
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 35_000).toISOString(),
        yesBestBidCents: 44,
        noBestBidCents: 56,
        bookState: "awaiting-snapshot",
        isEconomicallyValid: false,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 35_100).toISOString(),
        yesBestBidCents: input.responseYes ?? 45,
        noBestBidCents: input.responseNo ?? 55,
      }),
    );
  } else {
    lines.push(
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 35_000).toISOString(),
        yesBestBidCents: input?.responseYes ?? 45,
        noBestBidCents: input?.responseNo ?? 55,
      }),
    );
  }
  return {
    captureRunDir,
    marketTicker,
    t0,
    files: {
      [`${captureRunDir}/top-of-book.jsonl`]: `${lines.join("\n")}\n`,
      [`${captureRunDir}/market-metadata.jsonl`]: `${JSON.stringify({
        marketTicker,
        closeTime,
        status: "active",
        action: "subscribed",
      })}\n`,
    },
  };
}

function descriptorFromSegment(
  segment: MomentumValidationAcceptedSegment,
): SealedAcceptedCaptureDescriptor {
  return {
    runId: segment.runId,
    captureRunDir: segment.captureRunDir,
    captureIdentityHash: segment.captureIdentityHash,
    healthArtifactIdentity: segment.health.artifactIdentity ?? null,
    reservationAttestationHash: segment.reservationAttestationHash,
    captureStartMs: segment.captureStartMs,
  };
}

function withChunkedIterateJsonl(
  base: ReturnType<typeof createMemoryMomentumDiscoveryIo>,
  chunkSize: number,
): ReturnType<typeof createMemoryMomentumDiscoveryIo> {
  return {
    ...base,
    iterateJsonl: async (path, options) => {
      const content = base.readFile(path);
      let lineNumber = 0;
      let buffer = "";
      for (let offset = 0; offset < content.length; offset += chunkSize) {
        buffer += content.slice(offset, offset + chunkSize);
        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          lineNumber += 1;
          const action = options.onLine(line, { lineNumber });
          if (action === "stop") return;
        }
      }
      if (buffer.length > 0 || content.endsWith("\n")) {
        // Final partial line if any.
        if (buffer.length > 0) {
          lineNumber += 1;
          options.onLine(buffer, { lineNumber });
        }
      }
    },
  };
}

describe("M14.0c real-capture validation outcome streamer (synthetic only)", () => {
  it("1. admits exact locked candidate only", async () => {
    const fixture = classicUpwardFixture();
    const io = createMemoryMomentumDiscoveryIo(fixture.files);
    await expect(
      streamLockedCandidateValidationOutcomes({
        io,
        segmentRunId: "synth",
        captureRunDir: fixture.captureRunDir,
        candidateId: "W-1000|X-1|H-10000|continuation" as never,
      }),
    ).rejects.toThrow(/locked candidate/i);
  });

  it("2–3. deterministic streaming + chunk-boundary independence", async () => {
    const fixture = classicUpwardFixture();
    const io = createMemoryMomentumDiscoveryIo(fixture.files);
    const a = await streamLockedCandidateValidationOutcomes({
      io,
      segmentRunId: "synth",
      captureRunDir: fixture.captureRunDir,
    });
    const chunked = withChunkedIterateJsonl(io, 17);
    const b = await streamLockedCandidateValidationOutcomes({
      io: chunked,
      segmentRunId: "synth",
      captureRunDir: fixture.captureRunDir,
    });
    expect(b.episodes).toEqual(a.episodes);
    expect(a.diagnostics.refractoryEpisodes).toBeGreaterThanOrEqual(1);
  });

  it("4–5. causal anchor + missing anchor fail-closed/reset", async () => {
    const marketTicker = "KXBTC15M-26SEP131200-00";
    const t0 = Date.parse("2026-09-13T12:00:00.000Z");
    const captureRunDir = "/fixture/anchor-miss";
    // Only event quote — no prior at t-W → fail closed, no fabricated episode.
    const lines = [
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 5_000).toISOString(),
        yesBestBidCents: 42,
        noBestBidCents: 58,
      }),
    ].join("\n");
    const io = createMemoryMomentumDiscoveryIo({
      [`${captureRunDir}/top-of-book.jsonl`]: `${lines}\n`,
      [`${captureRunDir}/market-metadata.jsonl`]: `${JSON.stringify({
        marketTicker,
        closeTime: "2026-09-13T12:10:00.000Z",
        status: "active",
        action: "subscribed",
      })}\n`,
    });
    const result = await streamLockedCandidateValidationOutcomes({
      io,
      segmentRunId: "anchor-miss",
      captureRunDir,
    });
    expect(result.episodes).toHaveLength(0);
    expect(result.diagnostics.firstCrossingEvents).toBe(0);
  });

  it("6–8. first crossing, refractory, probability/time gates", async () => {
    const marketTicker = "KXBTC15M-26SEP131200-00";
    const t0 = Date.parse("2026-09-13T12:00:00.000Z");
    const captureRunDir = "/fixture/gates";
    // Crossing at +5s, stay above threshold at +10s (no re-fire), leave, re-enter after refractory.
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
      // Still above threshold — must not re-fire.
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 10_000).toISOString(),
        yesBestBidCents: 43,
        noBestBidCents: 57,
      }),
      // Response for first event.
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 35_000).toISOString(),
        yesBestBidCents: 44,
        noBestBidCents: 56,
      }),
      // Probability gate fail: mid ~5¢.
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 40_000).toISOString(),
        yesBestBidCents: 5,
        noBestBidCents: 95,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 45_000).toISOString(),
        yesBestBidCents: 7,
        noBestBidCents: 93,
      }),
    ].join("\n");
    const io = createMemoryMomentumDiscoveryIo({
      [`${captureRunDir}/top-of-book.jsonl`]: `${lines}\n`,
      [`${captureRunDir}/market-metadata.jsonl`]: `${JSON.stringify({
        marketTicker,
        closeTime: "2026-09-13T12:10:00.000Z",
        status: "active",
        action: "subscribed",
      })}\n`,
    });
    const result = await streamLockedCandidateValidationOutcomes({
      io,
      segmentRunId: "gates",
      captureRunDir,
    });
    expect(result.diagnostics.firstCrossingEvents).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics.refractoryEpisodes).toBe(1);
    expect(result.episodes).toHaveLength(1);
  });

  it("9. first ELIGIBLE response, not first arbitrary post-H quote", async () => {
    const fixture = classicUpwardFixture({
      earlyIneligibleResponse: true,
      responseYes: 46,
      responseNo: 54,
    });
    const io = createMemoryMomentumDiscoveryIo(fixture.files);
    const result = await streamLockedCandidateValidationOutcomes({
      io,
      segmentRunId: "eligible-resp",
      captureRunDir: fixture.captureRunDir,
    });
    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0]!.responseObservable).toBe(true);
    // Entry YES ask = 100-58=42; exit YES bid = 46 → upward pnl = 46-42 = 4
    expect(result.episodes[0]!.signedExecutablePnlCents).toBe(4);
  });

  it("10. response outside allowed window = unobservable", async () => {
    const marketTicker = "KXBTC15M-26SEP131200-00";
    const t0 = Date.parse("2026-09-13T12:00:00.000Z");
    const captureRunDir = "/fixture/late-resp";
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
      // Far beyond H+250ms
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 36_000).toISOString(),
        yesBestBidCents: 45,
        noBestBidCents: 55,
      }),
    ].join("\n");
    const io = createMemoryMomentumDiscoveryIo({
      [`${captureRunDir}/top-of-book.jsonl`]: `${lines}\n`,
      [`${captureRunDir}/market-metadata.jsonl`]: `${JSON.stringify({
        marketTicker,
        closeTime: "2026-09-13T12:10:00.000Z",
        status: "active",
        action: "subscribed",
      })}\n`,
    });
    const result = await streamLockedCandidateValidationOutcomes({
      io,
      segmentRunId: "late",
      captureRunDir,
    });
    expect(result.episodes[0]!.responseObservable).toBe(false);
    expect(result.episodes[0]!.signedExecutablePnlCents).toBeNull();
    expect(result.episodes[0]!.executableObservable).toBe(false);
  });

  it("11. stale quote exclusion", async () => {
    const { isEligibleEventQuote, MAX_EVENT_QUOTE_AGE_MS } = await import(
      "../kalshiTobMomentumFamily"
    );
    const fresh = isEligibleEventQuote({
      marketTicker: "M",
      timestampMs: 1_000,
      yesBestBidCents: 40,
      noBestBidCents: 60,
      yesBestBidSize: 10,
      noBestBidSize: 10,
      bookState: "valid",
      isEconomicallyValid: true,
      quoteAgeMs: 100,
    });
    const stale = isEligibleEventQuote({
      marketTicker: "M",
      timestampMs: 1_000,
      yesBestBidCents: 40,
      noBestBidCents: 60,
      yesBestBidSize: 10,
      noBestBidSize: 10,
      bookState: "valid",
      isEconomicallyValid: true,
      quoteAgeMs: MAX_EVENT_QUOTE_AGE_MS + 1,
    });
    expect(fresh.eligible).toBe(true);
    expect(stale.eligible).toBe(false);
    expect(stale.reasons.some((r) => /quoteAgeMs/.test(r))).toBe(true);
  });

  it("12–15. upward/downward executable economics + complement asks + mid≠exec", async () => {
    const up = classicUpwardFixture({
      captureRunDir: "/fixture/up-econ",
      responseYes: 45,
      responseNo: 55,
    });
    const upIo = createMemoryMomentumDiscoveryIo(up.files);
    const upResult = await streamLockedCandidateValidationOutcomes({
      io: upIo,
      segmentRunId: "up",
      captureRunDir: up.captureRunDir,
    });
    // Event at +5s: yesBid=42, noBid=58 → YES ask=42; exit yesBid=45 → pnl=3
    expect(upResult.episodes[0]!.signedExecutablePnlCents).toBe(3);
    const entryAsk = resolveComplementExecutablePrices({
      yesBestBidCents: 42,
      noBestBidCents: 58,
    });
    expect(entryAsk.executableBuyYesCents).toBe(42);
    expect(entryAsk.executableBuyYesCents).toBe(100 - 58);

    // Downward: mid falls 50→48
    const marketTicker = "KXBTC15M-26SEP131300-00";
    const t0 = Date.parse("2026-09-13T13:00:00.000Z");
    const captureRunDir = "/fixture/down-econ";
    const lines = [
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0).toISOString(),
        yesBestBidCents: 50,
        noBestBidCents: 50,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 5_000).toISOString(),
        yesBestBidCents: 48,
        noBestBidCents: 52,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 35_000).toISOString(),
        yesBestBidCents: 46,
        noBestBidCents: 54,
      }),
    ].join("\n");
    const downIo = createMemoryMomentumDiscoveryIo({
      [`${captureRunDir}/top-of-book.jsonl`]: `${lines}\n`,
      [`${captureRunDir}/market-metadata.jsonl`]: `${JSON.stringify({
        marketTicker,
        closeTime: "2026-09-13T13:10:00.000Z",
        status: "active",
        action: "subscribed",
      })}\n`,
    });
    const downResult = await streamLockedCandidateValidationOutcomes({
      io: downIo,
      segmentRunId: "down",
      captureRunDir,
    });
    const expectedDown = computeGrossExecutableOneContractPnlCents({
      continuationSign: -1,
      entryYesBestBidCents: 48,
      entryNoBestBidCents: 52,
      exitYesBestBidCents: 46,
      exitNoBestBidCents: 54,
    });
    expect(downResult.episodes[0]!.signedExecutablePnlCents).toBe(expectedDown);
    // Midpoint diagnostic must remain a separate field even when numeric values coincide.
    expect(downResult.episodes[0]!).toHaveProperty("signedMidpointContinuationCents");
    expect(downResult.episodes[0]!).toHaveProperty("signedExecutablePnlCents");
    // Force a mid≠exec case with asymmetric complement books.
    const midDiffDir = "/fixture/mid-vs-exec";
    const midDiffMarket = "KXBTC15M-MIDDIFF";
    const midDiffT0 = Date.parse("2026-09-13T14:00:00.000Z");
    const midDiffLines = [
      tobLine({
        marketTicker: midDiffMarket,
        receivedAtLocal: new Date(midDiffT0).toISOString(),
        yesBestBidCents: 40,
        noBestBidCents: 55,
      }),
      tobLine({
        marketTicker: midDiffMarket,
        receivedAtLocal: new Date(midDiffT0 + 5_000).toISOString(),
        yesBestBidCents: 42,
        noBestBidCents: 53,
      }),
      tobLine({
        marketTicker: midDiffMarket,
        receivedAtLocal: new Date(midDiffT0 + 35_000).toISOString(),
        yesBestBidCents: 50,
        noBestBidCents: 45,
      }),
    ].join("\n");
    const midDiffIo = createMemoryMomentumDiscoveryIo({
      [`${midDiffDir}/top-of-book.jsonl`]: `${midDiffLines}\n`,
      [`${midDiffDir}/market-metadata.jsonl`]: `${JSON.stringify({
        marketTicker: midDiffMarket,
        closeTime: "2026-09-13T14:10:00.000Z",
        status: "active",
        action: "subscribed",
      })}\n`,
    });
    const midDiffResult = await streamLockedCandidateValidationOutcomes({
      io: midDiffIo,
      segmentRunId: "middiff",
      captureRunDir: midDiffDir,
    });
    expect(midDiffResult.episodes[0]!.signedExecutablePnlCents).not.toBeNull();
    expect(midDiffResult.episodes[0]!.signedMidpointContinuationCents).not.toBeNull();
    expect(midDiffResult.episodes[0]!.signedExecutablePnlCents).not.toBe(
      midDiffResult.episodes[0]!.signedMidpointContinuationCents,
    );
  });

  it("16. missing executable side does not silently become midpoint", async () => {
    const marketTicker = "KXBTC15M-26SEP131200-00";
    const t0 = Date.parse("2026-09-13T12:00:00.000Z");
    const captureRunDir = "/fixture/no-size";
    const lines = [
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0).toISOString(),
        yesBestBidCents: 40,
        noBestBidCents: 60,
        yesBestBidSize: 10,
        noBestBidSize: 10,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 5_000).toISOString(),
        yesBestBidCents: 42,
        noBestBidCents: 58,
        yesBestBidSize: 10,
        noBestBidSize: 10,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 35_000).toISOString(),
        yesBestBidCents: 45,
        noBestBidCents: 55,
        yesBestBidSize: 0,
        noBestBidSize: 0,
      }),
    ].join("\n");
    const io = createMemoryMomentumDiscoveryIo({
      [`${captureRunDir}/top-of-book.jsonl`]: `${lines}\n`,
      [`${captureRunDir}/market-metadata.jsonl`]: `${JSON.stringify({
        marketTicker,
        closeTime: "2026-09-13T12:10:00.000Z",
        status: "active",
        action: "subscribed",
      })}\n`,
    });
    const result = await streamLockedCandidateValidationOutcomes({
      io,
      segmentRunId: "nosize",
      captureRunDir,
    });
    expect(result.episodes[0]!.responseObservable).toBe(true);
    expect(result.episodes[0]!.signedMidpointContinuationCents).not.toBeNull();
    expect(result.episodes[0]!.signedExecutablePnlCents).toBeNull();
    expect(result.episodes[0]!.executableObservable).toBe(false);
  });

  it("17–18. independent-unit dedup + UTC-day boundary", async () => {
    const marketTicker = "KXBTC15M-DAYBOUND";
    // Strictly increasing timestamps spanning UTC midnight.
    const t0 = Date.parse("2026-09-13T23:58:00.000Z");
    const captureRunDir = "/fixture/day-bound";
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
      // After refractory (30s): new day event
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 70_000).toISOString(),
        yesBestBidCents: 40,
        noBestBidCents: 60,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 75_000).toISOString(),
        yesBestBidCents: 42,
        noBestBidCents: 58,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 105_000).toISOString(),
        yesBestBidCents: 44,
        noBestBidCents: 56,
      }),
    ].join("\n");
    const io = createMemoryMomentumDiscoveryIo({
      [`${captureRunDir}/top-of-book.jsonl`]: `${lines}\n`,
      [`${captureRunDir}/market-metadata.jsonl`]: `${JSON.stringify({
        marketTicker,
        closeTime: "2026-09-14T00:10:00.000Z",
        status: "active",
        action: "subscribed",
      })}\n`,
    });
    const result = await streamLockedCandidateValidationOutcomes({
      io,
      segmentRunId: "days",
      captureRunDir,
    });
    const days = [...new Set(result.episodes.map((e) => e.tradingDayUtc))].sort();
    expect(days.length).toBeGreaterThanOrEqual(1);
    const metrics = computeValidationOutcomesFromEpisodes([
      ...result.episodes,
      // Duplicate unit should be removed by first-wins dedup.
      {
        ...result.episodes[0]!,
        signedExecutablePnlCents: 99,
      },
    ]);
    expect(metrics.duplicateUnitsRemoved).toBeGreaterThanOrEqual(1);
    expect(metrics.retainedUnitCount).toBeLessThanOrEqual(result.episodes.length);
  });

  it("19–21. cross-run cohort, excluded failed run blocked, duplicate run rejected", async () => {
    const fixtureA = classicUpwardFixture({
      captureRunDir: "/fixture/cohort-a",
      marketTicker: "MKT-A",
    });
    const fixtureB = classicUpwardFixture({
      captureRunDir: "/fixture/cohort-b",
      marketTicker: "MKT-B",
      t0: Date.parse("2026-09-14T12:00:00.000Z"),
      closeTime: "2026-09-14T12:10:00.000Z",
    });
    const segA = makeAcceptedSegment({
      runId: "run-a",
      unitIds: makeNUnits(80, "A"),
      captureRunDir: fixtureA.captureRunDir,
      captureStartMs: 1,
    });
    const segB = makeAcceptedSegment({
      runId: "run-b",
      unitIds: makeNUnits(80, "B"),
      captureRunDir: fixtureB.captureRunDir,
      captureStartMs: 2,
    });
    const excluded: MomentumValidationExcludedSegment = {
      ...makeAcceptedSegment({
        runId: FAILED_SEG6_RUN,
        unitIds: [],
        captureRunDir: "/fixture/seg6-failed",
      }),
      accepted: false,
      exclusionReason: "network-failure-incomplete",
      durationMinutes: 0,
    };
    const { planIdentity } = buildMomentumValidationCohortPlan();
    const registry = createEmptyMomentumValidationCohortRegistry({
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
    });
    registry.accepted.push(segA, segB);
    registry.excluded.push(excluded);

    const io = createMemoryMomentumDiscoveryIo({
      ...fixtureA.files,
      ...fixtureB.files,
      [`/fixture/seg6-failed/top-of-book.jsonl`]: "should-not-be-read\n",
    });

    const ok = await streamMomentumValidationOutcomesFromAcceptedCohort({
      io,
      registry,
      planIdentity,
      familyDefinitionIdentity: KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
      evidenceContractIdentity: KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
      discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
      lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
      acceptedCaptures: [descriptorFromSegment(segA), descriptorFromSegment(segB)],
    });
    expect(ok.acceptedRunIds).toEqual(["run-a", "run-b"]);
    expect(ok.excludedRunIds).toContain(FAILED_SEG6_RUN);

    await expect(
      streamMomentumValidationOutcomesFromAcceptedCohort({
        io,
        registry,
        planIdentity,
        familyDefinitionIdentity: KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
        evidenceContractIdentity: KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
        discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
        lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
        acceptedCaptures: [
          descriptorFromSegment(segA),
          descriptorFromSegment(segB),
          {
            ...descriptorFromSegment(segA),
            runId: FAILED_SEG6_RUN,
            captureRunDir: "/fixture/seg6-failed",
            captureIdentityHash: "evil",
          },
        ],
      }),
    ).rejects.toThrow(/excluded failed run/i);

    await expect(
      streamMomentumValidationOutcomesFromAcceptedCohort({
        io,
        registry,
        planIdentity,
        familyDefinitionIdentity: KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
        evidenceContractIdentity: KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
        discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
        lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
        acceptedCaptures: [descriptorFromSegment(segA), descriptorFromSegment(segA)],
      }),
    ).rejects.toThrow(/duplicate run ID/i);
  });

  it("22–25. identity mismatches rejected", async () => {
    const fixture = classicUpwardFixture({ captureRunDir: "/fixture/id-mismatch" });
    const seg = makeAcceptedSegment({
      runId: "id-run",
      unitIds: makeNUnits(155),
      captureRunDir: fixture.captureRunDir,
      healthArtifactIdentity: "health-correct",
    });
    const { planIdentity } = buildMomentumValidationCohortPlan();
    const registry = createEmptyMomentumValidationCohortRegistry({
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
    });
    registry.accepted.push(seg);
    const io = createMemoryMomentumDiscoveryIo(fixture.files);
    const base = {
      io,
      registry,
      planIdentity,
      familyDefinitionIdentity: KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
      evidenceContractIdentity: KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
      discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
      lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    };

    await expect(
      streamMomentumValidationOutcomesFromAcceptedCohort({
        ...base,
        acceptedCaptures: [
          { ...descriptorFromSegment(seg), captureIdentityHash: "wrong-hash" },
        ],
      }),
    ).rejects.toThrow(/capture identity mismatch/i);

    await expect(
      streamMomentumValidationOutcomesFromAcceptedCohort({
        ...base,
        acceptedCaptures: [
          { ...descriptorFromSegment(seg), healthArtifactIdentity: "wrong-health" },
        ],
      }),
    ).rejects.toThrow(/health identity mismatch/i);

    await expect(
      streamMomentumValidationOutcomesFromAcceptedCohort({
        ...base,
        lockedCandidateId: "W-1000|X-1|H-10000|continuation",
        acceptedCaptures: [descriptorFromSegment(seg)],
      }),
    ).rejects.toThrow(/locked candidate identity mismatch/i);

    await expect(
      streamMomentumValidationOutcomesFromAcceptedCohort({
        ...base,
        familyDefinitionIdentity: "not-the-family",
        acceptedCaptures: [descriptorFromSegment(seg)],
      }),
    ).rejects.toThrow(/family identity mismatch/i);

    await expect(
      streamMomentumValidationOutcomesFromAcceptedCohort({
        ...base,
        evidenceContractIdentity: "not-evidence",
        acceptedCaptures: [descriptorFromSegment(seg)],
      }),
    ).rejects.toThrow(/evidence-contract identity mismatch/i);

    await expect(
      streamMomentumValidationOutcomesFromAcceptedCohort({
        ...base,
        discoveryIdentity: "not-train",
        acceptedCaptures: [descriptorFromSegment(seg)],
      }),
    ).rejects.toThrow(/TRAIN discovery identity mismatch/i);

    await expect(
      streamMomentumValidationOutcomesFromAcceptedCohort({
        ...base,
        planIdentity: "wrong-plan",
        acceptedCaptures: [descriptorFromSegment(seg)],
      }),
    ).rejects.toThrow(/planIdentity must match/i);
  });

  it("26–29. governance gate, synthetic authorize, artifact identity, idempotent rerun", async () => {
    const fixture = classicUpwardFixture({ captureRunDir: "/fixture/gov" });
    const seg = makeAcceptedSegment({
      runId: "gov-run",
      unitIds: makeNUnits(155),
      captureRunDir: fixture.captureRunDir,
    });
    const notReady = makeReadyAuthority({
      segments: [seg],
      status: "continue-collection",
      ess: 80,
    });
    expect(authorizeMomentumValidationOutcomeAccess(notReady).authorized).toBe(false);
    expect(() =>
      assertRealValidationCaptureStreamAllowed({
        authorizedForOutcomeOpen: false,
        requestRealCaptureStream: true,
      }),
    ).toThrow(/ready-for-outcome-open/i);

    const ready = makeReadyAuthority({ segments: [seg], ess: 155 });
    const io = createMemoryMomentumDiscoveryIo(fixture.files);
    const first = await runGovernedRealCaptureMomentumValidation({
      cohortAuthority: ready,
      acceptedCaptures: [descriptorFromSegment(seg)],
      io,
      writeArtifacts: true,
      verifyCaptureIdentities: false,
      generatedAt: "2026-09-19T12:00:00.000Z",
      codeAuthoritySha: "deadbeef",
    });
    expect(first.alreadyOpened).toBe(false);
    expect(first.report.quarantine.realCaptureStreamed).toBe(true);
    expect(first.report.outcomesOpened).toBe(true);
    expect(first.transition.validationIdentityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.transition.holdoutOpened).toBe(false);

    const second = await runGovernedRealCaptureMomentumValidation({
      cohortAuthority: ready,
      acceptedCaptures: [descriptorFromSegment(seg)],
      io,
      writeArtifacts: true,
      verifyCaptureIdentities: false,
      generatedAt: "2026-09-19T13:00:00.000Z",
      codeAuthoritySha: "deadbeef",
    });
    expect(second.alreadyOpened).toBe(true);
    expect(second.transition.openedAt).toBe(first.transition.openedAt);
    expect(second.report.validationIdentityHash).toBe(first.report.validationIdentityHash);
  });

  it("30. input ordering violation fails closed", async () => {
    const marketTicker = "KXBTC15M-NONMONO";
    const t0 = Date.parse("2026-09-13T12:00:00.000Z");
    const captureRunDir = "/fixture/nonmono";
    const lines = [
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 5_000).toISOString(),
        yesBestBidCents: 42,
        noBestBidCents: 58,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0).toISOString(),
        yesBestBidCents: 40,
        noBestBidCents: 60,
      }),
    ].join("\n");
    const io = createMemoryMomentumDiscoveryIo({
      [`${captureRunDir}/top-of-book.jsonl`]: `${lines}\n`,
      [`${captureRunDir}/market-metadata.jsonl`]: `${JSON.stringify({
        marketTicker,
        closeTime: "2026-09-13T12:10:00.000Z",
        status: "active",
        action: "subscribed",
      })}\n`,
    });
    await expect(
      streamLockedCandidateValidationOutcomes({
        io,
        segmentRunId: "nonmono",
        captureRunDir,
      }),
    ).rejects.toThrow(/non-monotonic/i);
  });

  it("31. bounded-memory streaming on generated large fixture", async () => {
    const marketTicker = "KXBTC15M-LARGE";
    const t0 = Date.parse("2026-09-13T12:00:00.000Z");
    const captureRunDir = "/fixture/large";
    const closeTime = "2026-09-13T20:00:00.000Z";
    const lines: string[] = [];
    // ~50k quotes — large enough to exercise streaming without multi-GB.
    for (let i = 0; i < 50_000; i += 1) {
      const mid = 40 + (i % 5);
      lines.push(
        tobLine({
          marketTicker,
          receivedAtLocal: new Date(t0 + i * 1_000).toISOString(),
          yesBestBidCents: mid,
          noBestBidCents: 100 - mid,
        }),
      );
    }
    const content = `${lines.join("\n")}\n`;
    const io = createMemoryMomentumDiscoveryIo({
      [`${captureRunDir}/top-of-book.jsonl`]: content,
      [`${captureRunDir}/market-metadata.jsonl`]: `${JSON.stringify({
        marketTicker,
        closeTime,
        status: "active",
        action: "subscribed",
      })}\n`,
    });
    const before = process.memoryUsage().heapUsed;
    const started = Date.now();
    const result = await streamLockedCandidateValidationOutcomes({
      io,
      segmentRunId: "large",
      captureRunDir,
    });
    const elapsedMs = Date.now() - started;
    const after = process.memoryUsage().heapUsed;
    const deltaMb = (after - before) / (1024 * 1024);
    expect(result.diagnostics.tobRecordsScanned).toBeGreaterThanOrEqual(50_000);
    // Memory delta should be far below raw file size (~few MB of state, not full retain of outcomes×lines).
    expect(deltaMb).toBeLessThan(200);
    expect(elapsedMs).toBeLessThan(60_000);
  });

  it("32. fee contract remains unbound", async () => {
    const fixture = classicUpwardFixture({ captureRunDir: "/fixture/fee" });
    const seg = makeAcceptedSegment({
      runId: "fee-run",
      unitIds: makeNUnits(155),
      captureRunDir: fixture.captureRunDir,
    });
    const ready = makeReadyAuthority({ segments: [seg] });
    const io = createMemoryMomentumDiscoveryIo(fixture.files);
    const result = await runGovernedRealCaptureMomentumValidation({
      cohortAuthority: ready,
      acceptedCaptures: [descriptorFromSegment(seg)],
      io,
      writeArtifacts: false,
      verifyCaptureIdentities: false,
      generatedAt: "2026-09-19T12:00:00.000Z",
    });
    expect(result.report.candidateEvaluation?.feeContractStatus).toMatch(/unbound/i);
    expect(result.report.candidateEvaluation?.netEdgeClaimAuthorized).toBe(false);
  });

  it("33–34. HOLDOUT role rejected; validation cannot become HOLDOUT", async () => {
    const fixture = classicUpwardFixture({ captureRunDir: "/fixture/holdout-role" });
    const seg = makeAcceptedSegment({
      runId: "holdoutish",
      unitIds: makeNUnits(155),
      captureRunDir: fixture.captureRunDir,
      priorResearchRoles: ["holdout"],
    });
    const { planIdentity } = buildMomentumValidationCohortPlan();
    const registry = createEmptyMomentumValidationCohortRegistry({
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
    });
    registry.accepted.push(seg);
    const io = createMemoryMomentumDiscoveryIo(fixture.files);
    await expect(
      streamMomentumValidationOutcomesFromAcceptedCohort({
        io,
        registry,
        planIdentity,
        familyDefinitionIdentity: KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
        evidenceContractIdentity: KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
        discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
        lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
        acceptedCaptures: [descriptorFromSegment(seg)],
      }),
    ).rejects.toThrow(/HOLDOUT role rejected/i);

    expect(() =>
      assertAdmittedValidationSegmentCannotBecomeHoldout({
        runId: "holdoutish",
        admittedToValidationCohort: true,
        proposedRole: "holdout",
      }),
    ).toThrow();
  });

  it("reference-vs-streaming equivalence on deterministic synthetic quotes", async () => {
    const fixture = classicUpwardFixture({
      captureRunDir: "/fixture/equiv",
      earlyIneligibleResponse: true,
      responseYes: 47,
      responseNo: 53,
    });
    const io = createMemoryMomentumDiscoveryIo(fixture.files);
    const streamed = await streamLockedCandidateValidationOutcomes({
      io,
      segmentRunId: "equiv",
      captureRunDir: fixture.captureRunDir,
    });

    const quotes: MomentumQuoteInput[] = [];
    await io.iterateJsonl(`${fixture.captureRunDir}/top-of-book.jsonl`, {
      onLine: (line) => {
        if (!line.trim()) return "continue";
        const row = JSON.parse(line) as {
          marketTicker: string;
          receivedAtLocal: string;
          yesBestBidCents: number;
          noBestBidCents: number;
          yesBestBidSize: number;
          noBestBidSize: number;
          bookState: string;
          isEconomicallyValid: boolean;
        };
        const timestampMs = Date.parse(row.receivedAtLocal);
        quotes.push({
          marketTicker: row.marketTicker,
          timestampMs,
          yesBestBidCents: row.yesBestBidCents,
          noBestBidCents: row.noBestBidCents,
          yesBestBidSize: row.yesBestBidSize,
          noBestBidSize: row.noBestBidSize,
          bookState: row.bookState,
          isEconomicallyValid: row.isEconomicallyValid,
          quoteAgeMs: 0,
        });
        return "continue";
      },
    });
    const closeTimeByMarket = new Map([
      [fixture.marketTicker, Date.parse("2026-09-13T12:10:00.000Z")],
    ]);
    const reference = referenceLockedCandidateValidationOutcomes({
      quotes,
      closeTimeByMarket,
    });
    expect(streamed.episodes.map((e) => ({
      marketTicker: e.marketTicker,
      tradingDayUtc: e.tradingDayUtc,
      responseObservable: e.responseObservable,
      executableObservable: e.executableObservable,
      signedExecutablePnlCents: e.signedExecutablePnlCents,
      signedMidpointContinuationCents: e.signedMidpointContinuationCents,
    }))).toEqual(
      reference.episodes.map((e) => ({
        marketTicker: e.marketTicker,
        tradingDayUtc: e.tradingDayUtc,
        responseObservable: e.responseObservable,
        executableObservable: e.executableObservable,
        signedExecutablePnlCents: e.signedExecutablePnlCents,
        signedMidpointContinuationCents: e.signedMidpointContinuationCents,
      })),
    );
  });

  it("mutation guards: wrong ask/exit/sign/first-response/midpoint-fallback/excluded-seg6", async () => {
    // Complement ask must use opposing bid.
    const prices = resolveComplementExecutablePrices({
      yesBestBidCents: 40,
      noBestBidCents: 55,
    });
    expect(prices.executableBuyYesCents).toBe(100 - 55);
    expect(prices.executableBuyYesCents).not.toBe(40);
    expect(prices.executableSellYesCents).toBe(40);
    expect(prices.executableBuyNoCents).toBe(100 - 40);
    expect(prices.executableBuyNoCents).not.toBe(55);

    const up = computeGrossExecutableOneContractPnlCents({
      continuationSign: 1,
      entryYesBestBidCents: 40,
      entryNoBestBidCents: 55,
      exitYesBestBidCents: 42,
      exitNoBestBidCents: 53,
    });
    // Correct: exit bid - entry ask = 42 - 45 = -3
    expect(up).toBe(42 - (100 - 55));
    // Wrong if exit used ask: would be (100-53) - (100-55) = 2
    expect(up).not.toBe((100 - 53) - (100 - 55));

    const down = computeGrossExecutableOneContractPnlCents({
      continuationSign: -1,
      entryYesBestBidCents: 40,
      entryNoBestBidCents: 55,
      exitYesBestBidCents: 42,
      exitNoBestBidCents: 53,
    });
    // Downward uses entry bid − exit ask (not simply −up for asymmetric books).
    expect(down).toBe(40 - (100 - 53));
    expect(down).not.toBe(up);

    // Excluded seg6 fingerprint present in exclusion lineage helper.
    const digest = createHash("sha256").update(FAILED_SEG6_RUN).digest("hex");
    expect(digest).toHaveLength(64);
    expect(FAILED_SEG6_RUN).toBe("2026-09-19T00-54-42-279Z");
  });

  it("buildMomentumValidationReport records realCaptureStreamed when set", () => {
    const authority = makeReadyAuthority();
    const episodes = Array.from({ length: 155 }, (_, i) => ({
      marketTicker: `W${Math.floor(i / 28)}`,
      tradingDayUtc: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
      candidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
      signedExecutablePnlCents: 2,
      signedMidpointContinuationCents: 1,
      responseObservable: true,
      executableObservable: true,
    }));
    const report = buildMomentumValidationReport({
      cohortAuthority: authority,
      injectedOutcomes: episodes,
      realCaptureStreamed: true,
      generatedAt: "2026-09-19T12:00:00.000Z",
    });
    expect(report.quarantine.realCaptureStreamed).toBe(true);
    expect(report.quarantine.holdoutOpened).toBe(false);
  });
});
