/**
 * Evidence-based timing / clock policy.
 *
 * Do not invent cross-venue synchronization. Timestamp availability ≠ aligned clocks.
 * Historical exchange-time analysis is not proof a bot could observe and act then.
 */

import type { ClockDomain, DelayClaimStatus } from "./types";

export const CLOCK_POLICY = {
  id: "adapter-domain-consistent-v1",
  bookReconstructionOrder:
    "Native file/stream order with prevEventId continuity; never reorder by exchangeTs",
  preserveBothTimestamps: true,
  decisionClockDomain: "adapter" as ClockDomain,
  clockAlignmentStatus: "unknown" as const,
  alignmentNote:
    "Cross-venue exchange-clock alignment is unknown. No independently established "
    + "millisecond uncertainty band is claimed. Prior same-venue CryptoStruct↔KalshiBot "
    + "receive lag (~5–6ms p50) is not an external BTC lead measurement and does not "
    + "calibrate Coinbase↔Kalshi absolute sync.",
  eventObservationTime:
    "adapterTimestampMs of the external BBO point that crosses the magnitude boundary",
  decisionTime:
    "eventObservationTime + scenarioDelayMs in the same adapter domain",
  simulatedOrderArrival:
    "Modeled equal to decisionTime. No extra RTT/queue/ack. This is a scenario assumption, "
    + "not measured production latency and not proof of live feasibility.",
  forbidSilentDomainMix: true,
  evidenceRequiredForVerifiedTradability: [
    "Documented absolute UTC alignment (or bounded skew) between Coinbase and Kalshi "
      + "exchange timestamps, or a single co-located receive clock for both feeds",
    "Measured detection + order RTT distribution for the intended bot path",
    "Explicit mapping from historical stamps to bot observation/act times",
  ],
} as const;

export const TIMING_QUALITY = {
  ...CLOCK_POLICY,
  exchangeVsAdapter: {
    exchangeTimestamp:
      "Venue-reported event time (ns). Origin/precision vary by venue topic capabilities.",
    adapterTimestamp:
      "CryptoStruct recorder receive time (ns). Always present; used for stream sequencing "
      + "and for this pilot's decision clock domain.",
    doNotMix:
      "Never join an exchange-domain event time to an adapter-domain quote series without "
      + "an explicit, fixed conversion — which we do not claim to have.",
  },
  observedSamplesNotSyncBounds: {
    kalshiBookUpdates:
      "Retained KXBTC15M sample: book/trade lines often carry non-zero exchangeTs; "
      + "snapshots may be 0.",
    coinbaseProxyLtc:
      "Coinbase LTC free sample (schema proxy, not BTC-USD pilot input): adapter−exchange "
      + "latency on that sample is descriptive only — not a cross-venue sync bound.",
  },
  delayClaimPolicy: {
    "250ms": "diagnostic-only at most; never verified tradability",
    "1000ms": "scenario-assumption-unverified; primary delay for reporting; not auto-promoted",
    "3000ms": "scenario-assumption-unverified; sensitivity only; not auto-promoted",
  },
  joinPolicy: {
    type: "causal-as-of",
    rule: "last observation with observationTimestampMs <= decisionTimestampMs in SAME domain",
    forbidden: "nearest-neighbor joins that can pull future observations; silent domain mix",
  },
} as const;

export type DualTimestamps = {
  adapterTimestampNs: number;
  exchangeTimestampNs: number | null | undefined;
};

export function nsToMs(ns: number): number {
  return Math.floor(ns / 1e6);
}

/** Resolve timestamps without silently substituting domains into each other. */
export function resolveDualTimestamps(input: DualTimestamps): {
  adapterTimestampMs: number;
  exchangeTimestampMs: number | null;
  exchangeAvailable: boolean;
} {
  const adapterTimestampMs = nsToMs(input.adapterTimestampNs);
  const exchangeNs = input.exchangeTimestampNs ?? 0;
  const exchangeAvailable =
    typeof exchangeNs === "number" && Number.isFinite(exchangeNs) && exchangeNs > 0;
  return {
    adapterTimestampMs,
    exchangeTimestampMs: exchangeAvailable ? nsToMs(exchangeNs) : null,
    exchangeAvailable,
  };
}

/**
 * Decision-clock timestamp for joins. Always uses the declared domain.
 * Missing exchange when domain=exchange → null (caller must reject / block).
 */
export function timestampInDomain(
  dual: ReturnType<typeof resolveDualTimestamps>,
  domain: ClockDomain,
): number | null {
  return domain === "adapter" ? dual.adapterTimestampMs : dual.exchangeTimestampMs;
}

/**
 * Evidence-based delay claim status.
 * Never returns verified tradability. ≥1s is still only a scenario assumption.
 */
export function delayClaimSupport(input: {
  delayMs: number;
  decisionClockDomain: ClockDomain;
  eventClockDomain: ClockDomain;
  quoteClockDomain: ClockDomain;
  eventHasDomainTimestamp: boolean;
  quoteHasDomainTimestamp: boolean;
}): DelayClaimStatus {
  if (
    input.eventClockDomain !== input.decisionClockDomain
    || input.quoteClockDomain !== input.decisionClockDomain
  ) {
    return "blocked-domain-mix";
  }
  if (!input.eventHasDomainTimestamp || !input.quoteHasDomainTimestamp) {
    return "blocked-missing-timestamps";
  }
  if (input.delayMs <= 250) {
    return "diagnostic-only";
  }
  return "scenario-assumption-unverified";
}
