import {
  AUTHORIZED_FOLLOW_UP_HOUR_START_UTC,
  SELECTED_FOLLOW_UP_TICKER,
  extractHistoryObservations,
  inspectCadence,
  inspectHistoryPayload,
  loadOfficialMetadataForSelectedTarget,
  loadRetainedHttpResponse,
  retainedHistoryMatchesBoundRequest,
} from "@/lib/data/research/kalshiBrtiAccessProbe";
import { V1_PROBE_RAW_DIR } from "@/lib/data/research/kalshiBrtiAccessProbe/types";

import {
  AGGREGATION_KINDS,
  compareRoundedUsd,
  describeWindow,
  inspectPhaseAlignment,
  lastTickPerSecond,
  meanOf,
  selectWindowObservations,
  WINDOW_BOUNDARY_KINDS,
} from "./windowBoundaries";
import {
  EXPECTED_RETAINED_HISTORY_BODY_SHA256,
  HISTORICAL_INSPECTION_HOUR_END_EXCLUSIVE_UTC,
  HISTORICAL_INSPECTION_HOUR_START_UTC,
  HISTORICAL_INSPECTION_TICKER,
} from "./types";

export type HistoricalSamplingCandidate = {
  windowKind: (typeof WINDOW_BOUNDARY_KINDS)[number];
  windowNotation: string;
  justification: string;
  aggregation: (typeof AGGREGATION_KINDS)[number];
  observationCount: number;
  uniqueSecondBuckets: number;
  missingSecondCount: number;
  duplicateTimeCount: number;
  arithmeticJustified: boolean;
  meanRaw: string | null;
  roundedUsd: string | null;
  officialComparison: ReturnType<typeof compareRoundedUsd>;
  classification: "supported-by-documentation" | "consistent-with-timestamps" | "contradicted" | "indistinguishable";
};

export type HistoricalHourInspection = {
  retainedAvailable: boolean;
  retainedVerified: boolean;
  blockedReason: string | null;
  provenance: Record<string, unknown> | null;
  payloadKind: string | null;
  inHourCount: number;
  cadence: ReturnType<typeof inspectCadence> | null;
  hourPhase: ReturnType<typeof inspectPhaseAlignment> | null;
  officialExpirationRaw: string | null;
  officialCloseUtc: string | null;
  boundaryDiscrepancy: {
    documentedLiveAccumulation: string;
    payloadWindowIdentity: string;
    officialHelpText: string;
    sameConcept: false;
    explanation: string;
  };
  candidates: HistoricalSamplingCandidate[];
  remainingAmbiguities: string[];
};

function classifyCandidate(input: {
  windowKind: (typeof WINDOW_BOUNDARY_KINDS)[number];
  aggregation: (typeof AGGREGATION_KINDS)[number];
  uniqueSecondBuckets: number;
  observationCount: number;
}): HistoricalSamplingCandidate["classification"] {
  if (input.observationCount === 0) {
    return "contradicted";
  }
  if (input.aggregation === "all-5hz-mean") {
    return "consistent-with-timestamps";
  }
  if (input.windowKind === "payload-start-inclusive-end-exclusive" && input.uniqueSecondBuckets === 60) {
    return "supported-by-documentation";
  }
  if (input.windowKind === "documented-live-accumulation" && input.uniqueSecondBuckets === 60) {
    return "supported-by-documentation";
  }
  if (input.uniqueSecondBuckets === 61 && input.windowKind === "documented-live-accumulation") {
    return "consistent-with-timestamps";
  }
  return "consistent-with-timestamps";
}

export function inspectHistoricalHour(input: {
  repoRoot: string;
  readFile?: (path: string) => string | null;
  injectedBody?: unknown;
  injectedOfficialExpiration?: string | null;
  injectedCloseUtc?: string;
}): HistoricalHourInspection {
  const boundaryDiscrepancy = {
    documentedLiveAccumulation: "(close−60s, close]",
    payloadWindowIdentity: "[window_start_ts_ms, window_end_ts_exclusive)",
    officialHelpText: "average of 60 one-second RTI readings in the expiration minute",
    sameConcept: false as const,
    explanation: [
      "The documented live accumulation interval and the payload [start, end) identity",
      "are two different 60-second intervals that differ at both endpoints.",
      "Official help describes 60 one-second readings, not a 5Hz mean and not a fitted offset.",
      "These are distinct concepts; a single matching average is not used to pick a boundary.",
    ].join(" "),
  };
  const officialBind = loadOfficialMetadataForSelectedTarget({
    repoRoot: input.repoRoot,
    selectedTicker: HISTORICAL_INSPECTION_TICKER,
    readFile: input.readFile,
  });
  const officialCloseUtc = input.injectedCloseUtc
    ?? (officialBind.status === "bound" ? officialBind.metadata.closeTimeUtc : null);
  const officialExpirationRaw = input.injectedOfficialExpiration
    ?? (officialBind.status === "bound" ? officialBind.metadata.expirationValue : null);

  let body: unknown = input.injectedBody;
  let provenance: Record<string, unknown> | null = null;
  let retainedAvailable = input.injectedBody !== undefined;
  let retainedVerified = input.injectedBody !== undefined;
  const blockedReason: string | null = null;

  if (input.injectedBody === undefined) {
    const retained = loadRetainedHttpResponse({
      rawDir: `${input.repoRoot}/${V1_PROBE_RAW_DIR}`,
      readFile: input.readFile,
      expectedHash: EXPECTED_RETAINED_HISTORY_BODY_SHA256,
    });
    if (retained == null) {
      return {
        retainedAvailable: false,
        retainedVerified: false,
        blockedReason: "retained-historical-hour-absent-or-hash-mismatch; historical download is not authorized",
        provenance: null,
        payloadKind: null,
        inHourCount: 0,
        cadence: null,
        hourPhase: null,
        officialExpirationRaw,
        officialCloseUtc,
        boundaryDiscrepancy,
        candidates: [],
        remainingAmbiguities: [
          "Historical raw ticks cannot be re-inspected without the verified retained HOUR body.",
          "Official historical sample selection remains unverified.",
        ],
      };
    }
    const match = retainedHistoryMatchesBoundRequest({
      retained,
      hourStartUtc: HISTORICAL_INSPECTION_HOUR_START_UTC,
      expectedHash: EXPECTED_RETAINED_HISTORY_BODY_SHA256,
    });
    retainedAvailable = true;
    retainedVerified = match.matches
      && retained.status === 200
      && retained.bodyTextHash === EXPECTED_RETAINED_HISTORY_BODY_SHA256;
    if (!retainedVerified) {
      return {
        retainedAvailable: true,
        retainedVerified: false,
        blockedReason: match.reason ?? "retained-history-provenance-mismatch",
        provenance: {
          url: retained.url,
          signPath: retained.signPath,
          status: retained.status,
          bodyTextHash: retained.bodyTextHash,
          capturedAtUtc: retained.capturedAtUtc,
        },
        payloadKind: null,
        inHourCount: 0,
        cadence: null,
        hourPhase: null,
        officialExpirationRaw,
        officialCloseUtc,
        boundaryDiscrepancy,
        candidates: [],
        remainingAmbiguities: [
          "Retained file exists but request provenance or body hash does not match the authorized HOUR.",
        ],
      };
    }
    body = retained.body;
    provenance = {
      ticker: HISTORICAL_INSPECTION_TICKER,
      selectedFollowUpTicker: SELECTED_FOLLOW_UP_TICKER,
      authorizedHourStartUtc: AUTHORIZED_FOLLOW_UP_HOUR_START_UTC,
      hourStartUtc: HISTORICAL_INSPECTION_HOUR_START_UTC,
      hourEndExclusiveUtc: HISTORICAL_INSPECTION_HOUR_END_EXCLUSIVE_UTC,
      url: retained.url,
      signPath: retained.signPath,
      status: retained.status,
      category: retained.category,
      bodyTextHash: retained.bodyTextHash,
      capturedAtUtc: retained.capturedAtUtc,
      expectedBodyTextHash: EXPECTED_RETAINED_HISTORY_BODY_SHA256,
    };
  } else {
    provenance = {
      source: "injected-fixture",
      ticker: HISTORICAL_INSPECTION_TICKER,
      hourStartUtc: HISTORICAL_INSPECTION_HOUR_START_UTC,
    };
  }

  const hourStartMs = Date.parse(HISTORICAL_INSPECTION_HOUR_START_UTC);
  const hourEndExclusiveMs = Date.parse(HISTORICAL_INSPECTION_HOUR_END_EXCLUSIVE_UTC);
  const closeMs = officialCloseUtc != null ? Date.parse(officialCloseUtc) : Date.parse("2026-08-30T18:15:00Z");
  const payload = inspectHistoryPayload({
    body,
    hourStartMs,
    hourEndExclusiveMs,
    closeTimeMs: closeMs,
  });
  const observations = extractHistoryObservations(body);
  const inHour = observations.filter((observation) => (
    observation.timeMs != null
    && observation.timeMs >= hourStartMs
    && observation.timeMs < hourEndExclusiveMs
  ));
  const cadence = inspectCadence(inHour);
  const hourPhase = inspectPhaseAlignment(inHour);
  const candidates: HistoricalSamplingCandidate[] = [];
  for (const windowKind of WINDOW_BOUNDARY_KINDS) {
    const windowObservations = selectWindowObservations(inHour, closeMs, windowKind);
    const phase = inspectPhaseAlignment(windowObservations);
    for (const aggregation of AGGREGATION_KINDS) {
      const used = aggregation === "last-tick-per-second"
        ? lastTickPerSecond(windowObservations)
        : windowObservations;
      const arithmeticJustified = aggregation === "last-tick-per-second"
        ? used.length > 0
        : windowObservations.length > 0;
      const stats = arithmeticJustified ? meanOf(used) : meanOf([]);
      const officialComparison = compareRoundedUsd(stats.roundedUsd, officialExpirationRaw);
      candidates.push({
        windowKind,
        windowNotation: describeWindow(windowKind).notation,
        justification: `${describeWindow(windowKind).justification}; aggregation=${aggregation} (not fitted)`,
        aggregation,
        observationCount: used.length,
        uniqueSecondBuckets: phase.uniqueSecondBuckets,
        missingSecondCount: phase.missingSecondBuckets.length,
        duplicateTimeCount: phase.duplicateTimeCount,
        arithmeticJustified,
        meanRaw: stats.meanRaw,
        roundedUsd: stats.roundedUsd,
        officialComparison,
        classification: classifyCandidate({
          windowKind,
          aggregation,
          uniqueSecondBuckets: aggregation === "last-tick-per-second" ? used.length : phase.uniqueSecondBuckets,
          observationCount: used.length,
        }),
      });
    }
  }

  const agreeing = candidates.filter((candidate) => candidate.officialComparison.status === "agree");
  const remainingAmbiguities = [
    "Index observation timestamps are not historical receipt times.",
    "Official historical sample selection remains unverified.",
    "A matching average from one hour is exploratory evidence, not the official sampling rule.",
    agreeing.length > 1
      ? `${agreeing.length} fixed interpretations agree with official expiration after USD rounding; they are not uniquely identified.`
      : agreeing.length === 1
        ? "One fixed interpretation agrees after rounding; that is not treated as proof of the official rule."
        : "No fixed interpretation agrees with official expiration after USD rounding.",
    "5Hz raw cadence versus the stated 60-sample convention is not resolved by historical ticks alone.",
  ];

  return {
    retainedAvailable,
    retainedVerified,
    blockedReason,
    provenance,
    payloadKind: payload.kind,
    inHourCount: inHour.length,
    cadence,
    hourPhase,
    officialExpirationRaw,
    officialCloseUtc,
    boundaryDiscrepancy,
    candidates,
    remainingAmbiguities,
  };
}
