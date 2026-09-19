/**
 * Synthetic tests for capture file-order causality and software-incident retry.
 * No real validation captures / prices / P&L.
 */
import { describe, expect, it } from "vitest";

import { createMemoryMomentumDiscoveryIo } from "../kalshiTobMomentumDiscovery";
import {
  assertSoftwareIncidentRetryLineage,
  buildOutcomeExecutionIncident,
  buildOutcomeExecutionStarted,
  fingerprintCohortRegistryAuthority,
  streamLockedCandidateValidationOutcomes,
  type MomentumValidationCohortAuthorityInput,
  type SoftwareIncidentRetryLineage,
} from "./index";
import {
  buildBlindIncidenceWithMarketDayCap,
  buildMomentumIndependentUnitKey,
  buildMomentumValidationCohortPlan,
  createEmptyMomentumValidationCohortRegistry,
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  type MomentumValidationAcceptedSegment,
} from "../kalshiTobMomentumValidationCohort";

function tobLine(input: {
  marketTicker: string;
  receivedAtLocal: string;
  yesBestBidCents: number;
  noBestBidCents: number;
  exchangeTimestampMs?: number | null;
  sequence?: number;
  bookState?: string;
}): string {
  return JSON.stringify({
    marketTicker: input.marketTicker,
    eventTicker: input.marketTicker.replace(/-\d+$/, ""),
    seriesTicker: "KXBTC15M",
    receivedAtLocal: input.receivedAtLocal,
    exchangeTimestampMs: input.exchangeTimestampMs ?? null,
    sequence: input.sequence ?? 1,
    bookState: input.bookState ?? "valid",
    isEconomicallyValid: true,
    yesBestBidCents: input.yesBestBidCents,
    noBestBidCents: input.noBestBidCents,
    yesBestBidSize: 10,
    noBestBidSize: 10,
    yesBestAskCents: 100 - input.noBestBidCents,
    noBestAskCents: 100 - input.yesBestBidCents,
  });
}

function makeAuthority(): MomentumValidationCohortAuthorityInput {
  const { planIdentity } = buildMomentumValidationCohortPlan();
  const units = Array.from({ length: 155 }, (_, i) =>
    buildMomentumIndependentUnitKey({
      marketTicker: `M${Math.floor(i / 28)}`,
      tradingDayUtc: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
    }),
  );
  const capped = buildBlindIncidenceWithMarketDayCap({
    segmentRunId: "synth",
    episodeKeys: units.map((unitId) => ({ unitId })),
  });
  const segment: MomentumValidationAcceptedSegment = {
    runId: "synth",
    captureRunDir: "/fixture/synth",
    captureStartMs: 1,
    captureEndMs: 2,
    durationMinutes: 300,
    captureIdentityHash: "capture-synth",
    health: {
      passed: true,
      verdict: "ok",
      topOfBookPresent: true,
      failureReasons: [],
    },
    captureEndReason: "duration-elapsed",
    configIdentity: "cfg",
    priorResearchRoles: [],
    contaminationClassification: "untouched-for-short-horizon-price-response",
    intendedCohortPosition: 1,
    outcomesOpened: false,
    reservedForValidationLineage: true,
    reservedAfterPlanFreeze: true,
    planIdentity,
    reservationAttestationHash: "attest",
    accepted: true,
    blindIncidence: capped.incidence,
    independentUnitIds: capped.independentUnitIds,
  };
  const registry = createEmptyMomentumValidationCohortRegistry({
    planIdentity,
    planFreezeTimestampIso: "2026-09-12T00:00:00.000Z",
  });
  registry.accepted.push(segment);
  return {
    familyDefinitionIdentity: KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
    evidenceContractIdentity: KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
    discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
    planIdentity,
    lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    registry,
    cohortStatus: "ready-for-outcome-open",
    cumulativeBlindEss: 155,
  };
}

describe("TOB file-order causality (incident fix)", () => {
  it("1. exact 17ms exchange-ts regression does not abort (file order)", async () => {
    const marketTicker = "KXBTC15M-26SEP130015-15";
    const tRecv0 = Date.parse("2026-09-13T04:05:03.201Z");
    const captureRunDir = "/fixture/17ms";
    const lines = [
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(tRecv0).toISOString(),
        yesBestBidCents: 40,
        noBestBidCents: 60,
        exchangeTimestampMs: 1_789_272_303_201,
        sequence: 1,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(tRecv0 + 4).toISOString(),
        yesBestBidCents: 41,
        noBestBidCents: 59,
        exchangeTimestampMs: 1_789_272_303_184, // −17ms event-time
        sequence: 2,
      }),
    ].join("\n");
    const io = createMemoryMomentumDiscoveryIo({
      [`${captureRunDir}/top-of-book.jsonl`]: `${lines}\n`,
      [`${captureRunDir}/market-metadata.jsonl`]: `${JSON.stringify({
        marketTicker,
        closeTime: "2026-09-13T04:15:00.000Z",
        status: "active",
        action: "subscribed",
      })}\n`,
    });
    const result = await streamLockedCandidateValidationOutcomes({
      io,
      segmentRunId: "17ms",
      captureRunDir,
    });
    expect(result.diagnostics.eventTimeRegressions).toBe(1);
    expect(result.diagnostics.tobRecordsScanned).toBeGreaterThanOrEqual(2);
  });

  it("2. strict monotonic path remains available for adversarial tests", async () => {
    const marketTicker = "M";
    const t0 = Date.parse("2026-09-13T12:00:00.000Z");
    const captureRunDir = "/fixture/strict";
    const lines = [
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0).toISOString(),
        yesBestBidCents: 40,
        noBestBidCents: 60,
        exchangeTimestampMs: t0,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 1).toISOString(),
        yesBestBidCents: 41,
        noBestBidCents: 59,
        exchangeTimestampMs: t0 - 17,
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
        segmentRunId: "strict",
        captureRunDir,
        requireMonotonicTimestamps: true,
      }),
    ).rejects.toThrow(/non-monotonic/i);
  });

  it("3–4. interleaved markets + reconnect-like regression isolated per market", async () => {
    const t0 = Date.parse("2026-09-13T12:00:00.000Z");
    const captureRunDir = "/fixture/interleave";
    const lines = [
      tobLine({
        marketTicker: "A",
        receivedAtLocal: new Date(t0).toISOString(),
        yesBestBidCents: 40,
        noBestBidCents: 60,
        exchangeTimestampMs: t0,
        sequence: 1,
      }),
      tobLine({
        marketTicker: "B",
        receivedAtLocal: new Date(t0 + 1).toISOString(),
        yesBestBidCents: 40,
        noBestBidCents: 60,
        exchangeTimestampMs: t0 + 1,
        sequence: 1,
      }),
      // Market A event-time regresses; B continues forward.
      tobLine({
        marketTicker: "A",
        receivedAtLocal: new Date(t0 + 2).toISOString(),
        yesBestBidCents: 41,
        noBestBidCents: 59,
        exchangeTimestampMs: t0 - 20,
        sequence: 2,
      }),
      tobLine({
        marketTicker: "B",
        receivedAtLocal: new Date(t0 + 3).toISOString(),
        yesBestBidCents: 41,
        noBestBidCents: 59,
        exchangeTimestampMs: t0 + 3,
        sequence: 2,
      }),
    ].join("\n");
    const io = createMemoryMomentumDiscoveryIo({
      [`${captureRunDir}/top-of-book.jsonl`]: `${lines}\n`,
      [`${captureRunDir}/market-metadata.jsonl`]: [
        JSON.stringify({
          marketTicker: "A",
          closeTime: "2026-09-13T12:10:00.000Z",
          status: "active",
          action: "subscribed",
        }),
        JSON.stringify({
          marketTicker: "B",
          closeTime: "2026-09-13T12:10:00.000Z",
          status: "active",
          action: "subscribed",
        }),
      ].join("\n") + "\n",
    });
    const result = await streamLockedCandidateValidationOutcomes({
      io,
      segmentRunId: "interleave",
      captureRunDir,
    });
    expect(result.diagnostics.eventTimeRegressions).toBe(1);
  });

  it("7–9. chunk-boundary independence with regression present", async () => {
    const marketTicker = "CHUNK";
    const t0 = Date.parse("2026-09-13T12:00:00.000Z");
    const captureRunDir = "/fixture/chunk-reg";
    const content = [
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0).toISOString(),
        yesBestBidCents: 40,
        noBestBidCents: 60,
        exchangeTimestampMs: t0 + 5_000,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 5_000).toISOString(),
        yesBestBidCents: 42,
        noBestBidCents: 58,
        exchangeTimestampMs: t0 + 5_000,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 5_010).toISOString(),
        yesBestBidCents: 42,
        noBestBidCents: 58,
        exchangeTimestampMs: t0 + 5_000 - 17,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 35_000).toISOString(),
        yesBestBidCents: 44,
        noBestBidCents: 56,
        exchangeTimestampMs: t0 + 35_000,
      }),
    ].join("\n") + "\n";
    const base = createMemoryMomentumDiscoveryIo({
      [`${captureRunDir}/top-of-book.jsonl`]: content,
      [`${captureRunDir}/market-metadata.jsonl`]: `${JSON.stringify({
        marketTicker,
        closeTime: "2026-09-13T12:10:00.000Z",
        status: "active",
        action: "subscribed",
      })}\n`,
    });
    const chunked = {
      ...base,
      iterateJsonl: async (
        path: string,
        options: { onLine: (line: string, meta: { lineNumber: number }) => "continue" | "stop" },
      ) => {
        const text = base.readFile(path);
        let lineNumber = 0;
        let buffer = "";
        for (let i = 0; i < text.length; i += 13) {
          buffer += text.slice(i, i + 13);
          const parts = buffer.split(/\r?\n/);
          buffer = parts.pop() ?? "";
          for (const line of parts) {
            lineNumber += 1;
            if (options.onLine(line, { lineNumber }) === "stop") return;
          }
        }
        if (buffer.length > 0) {
          lineNumber += 1;
          options.onLine(buffer, { lineNumber });
        }
      },
    };
    const a = await streamLockedCandidateValidationOutcomes({
      io: base,
      segmentRunId: "a",
      captureRunDir,
    });
    const b = await streamLockedCandidateValidationOutcomes({
      io: chunked,
      segmentRunId: "b",
      captureRunDir,
    });
    expect(b.episodes).toEqual(a.episodes);
    expect(b.diagnostics.eventTimeRegressions).toBe(a.diagnostics.eventTimeRegressions);
  });

  it("10–12. no look-ahead: regressed event-time cannot match as future response", async () => {
    const marketTicker = "NOLAHEAD";
    const t0 = Date.parse("2026-09-13T12:00:00.000Z");
    const captureRunDir = "/fixture/nolahead";
    // Crossing at t0+5s; then a file-later row with event-time BEFORE the event
    // must not be treated as a response (response requires timestamp > event).
    const lines = [
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0).toISOString(),
        yesBestBidCents: 40,
        noBestBidCents: 60,
        exchangeTimestampMs: t0,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 5_000).toISOString(),
        yesBestBidCents: 42,
        noBestBidCents: 58,
        exchangeTimestampMs: t0 + 5_000,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 5_010).toISOString(),
        yesBestBidCents: 99,
        noBestBidCents: 1,
        exchangeTimestampMs: t0 + 4_000, // before event in event-time
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 35_000).toISOString(),
        yesBestBidCents: 45,
        noBestBidCents: 55,
        exchangeTimestampMs: t0 + 35_000,
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
      segmentRunId: "nolahead",
      captureRunDir,
    });
    expect(result.diagnostics.eventTimeRegressions).toBeGreaterThanOrEqual(1);
    expect(result.episodes.length).toBeGreaterThanOrEqual(1);
    // Response must use eligible quote at/after H, not the regressive 99/1 book.
    expect(result.episodes[0]!.signedExecutablePnlCents).toBe(3); // 45 - 42
  });

  it("14. executable economics unchanged under regression (anchor path)", async () => {
    const marketTicker = "ECON";
    const t0 = Date.parse("2026-09-13T12:00:00.000Z");
    const captureRunDir = "/fixture/econ-reg";
    const lines = [
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0).toISOString(),
        yesBestBidCents: 40,
        noBestBidCents: 60,
        exchangeTimestampMs: t0,
      }),
      // Noise regression between anchor and event — still file-order processed.
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 1).toISOString(),
        yesBestBidCents: 40,
        noBestBidCents: 60,
        exchangeTimestampMs: t0 - 5,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 5_000).toISOString(),
        yesBestBidCents: 42,
        noBestBidCents: 58,
        exchangeTimestampMs: t0 + 5_000,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 35_000).toISOString(),
        yesBestBidCents: 45,
        noBestBidCents: 55,
        exchangeTimestampMs: t0 + 35_000,
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
      segmentRunId: "econ",
      captureRunDir,
    });
    expect(result.episodes[0]!.signedExecutablePnlCents).toBe(3);
  });
});

describe("software-incident retry lineage", () => {
  it("16–19. same cohort/candidate allowed; alternate cohort/candidate rejected", () => {
    const authority = makeAuthority();
    const incident = buildOutcomeExecutionIncident({
      recordedAt: "2026-09-19T20:59:16.953Z",
      codeAuthoritySha: "fc5f30f9c6138563c886474ba035c1ec239b07ed",
      cohortAuthority: authority,
      acceptedRunIds: ["synth"],
      acceptedCaptureIdentityHashes: ["capture-synth"],
      excludedRunIds: [],
      errorMessage: "non-monotonic TOB timestamp for X: 1 < 2",
    });
    expect(incident.phase).toBe("outcome-execution-incident");
    expect(incident.validationArtifactSealed).toBe(false);
    expect(incident.scientificVerdictEmitted).toBe(false);

    const started = buildOutcomeExecutionStarted({
      startedAt: "2026-09-19T20:58:43.000Z",
      codeAuthoritySha: "fc5f30f",
      cohortAuthority: authority,
      acceptedRunIds: ["synth"],
      acceptedCaptureIdentityHashes: ["capture-synth"],
      excludedRunIds: [],
      priorIncidentIdentity: incident.incidentIdentity,
    });
    expect(started.phase).toBe("outcome-execution-started");
    expect(started.priorIncidentIdentity).toBe(incident.incidentIdentity);

    const retry: SoftwareIncidentRetryLineage = {
      priorIncidentIdentity: incident.incidentIdentity,
      priorIncidentPath: "/incident.json",
      sameCohortRequired: true,
      sameCandidateRequired: true,
      isScientificRevalidation: false,
    };

    expect(() =>
      assertSoftwareIncidentRetryLineage({
        retry,
        incident,
        cohortAuthority: authority,
        acceptedCaptureIdentityHashes: ["capture-synth"],
        lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
      }),
    ).not.toThrow();

    expect(() =>
      assertSoftwareIncidentRetryLineage({
        retry,
        incident,
        cohortAuthority: authority,
        acceptedCaptureIdentityHashes: ["capture-synth"],
        lockedCandidateId: "W-1000|X-1|H-10000|continuation",
      }),
    ).toThrow(/candidate mismatch/i);

    const otherAuthority = {
      ...authority,
      planIdentity: "different-plan",
    };
    expect(() =>
      assertSoftwareIncidentRetryLineage({
        retry,
        incident,
        cohortAuthority: otherAuthority,
        acceptedCaptureIdentityHashes: ["capture-synth"],
        lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
      }),
    ).toThrow(/cohort-plan identity mismatch|fingerprint mismatch/i);

    expect(() =>
      assertSoftwareIncidentRetryLineage({
        retry,
        incident,
        cohortAuthority: authority,
        acceptedCaptureIdentityHashes: ["different-capture"],
        lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
      }),
    ).toThrow(/capture identities mismatch/i);

    expect(fingerprintCohortRegistryAuthority(authority)).toHaveLength(64);
  });

  it("rejects marking retry as scientific revalidation", () => {
    const authority = makeAuthority();
    const incident = buildOutcomeExecutionIncident({
      recordedAt: "2026-09-19T20:59:16.953Z",
      codeAuthoritySha: "fc5f30f",
      cohortAuthority: authority,
      acceptedRunIds: ["synth"],
      acceptedCaptureIdentityHashes: ["capture-synth"],
      excludedRunIds: [],
      errorMessage: "engine failure",
    });
    expect(() =>
      assertSoftwareIncidentRetryLineage({
        retry: {
          priorIncidentIdentity: incident.incidentIdentity,
          priorIncidentPath: "/x",
          sameCohortRequired: true,
          sameCandidateRequired: true,
          isScientificRevalidation: true as unknown as false,
        },
        incident,
        cohortAuthority: authority,
        acceptedCaptureIdentityHashes: ["capture-synth"],
        lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
      }),
    ).toThrow(/scientific revalidation/i);
  });
});
