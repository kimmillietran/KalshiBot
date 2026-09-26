/**
 * Timestamp / timing quality policy for cross-venue causal joins.
 *
 * Do not invent synchronization. Prefer coarser delays when uncertainty is large.
 */

export const TIMING_QUALITY = {
  exchangeVsAdapter: {
    definition:
      "exchangeTimestamp = venue-reported event time (ns); adapterTimestamp = "
      + "CryptoStruct recorder receive time (ns). Adapter is always present; "
      + "exchange may be 0 (unavailable).",
    kalshiObserved:
      "On retained KXBTC15M sample: snapshot may carry exchangeTs=0; book updates "
      + "(msgType 1) and trades (msgType 2) carried non-zero exchangeTs in the inspected day.",
    coinbaseObservedProxy:
      "Coinbase LTC-USD free sample (same venue schema): book/trade exchangeTs present; "
      + "adapter−exchange latency p50≈1.2ms, p90≈1.5ms, p99≈21ms on first 100k events.",
  },
  crossVenueComparability: {
    canCompareExchangeClocks: "conditionally",
    uncertaintyMsBand: [50, 250] as const,
    rationale:
      "Both legs can expose exchange timestamps on updates/trades, but venue matching-engine "
      + "clocks are not independently audited here for absolute UTC alignment. Conservative "
      + "cross-venue uncertainty is tens to low hundreds of milliseconds. CryptoStruct "
      + "adapter clocks are per-recorder; Coinbase vs Kalshi may not share one co-lo site.",
    priorSameVenueFidelity:
      "cryptostruct-clock-audit.json: Kalshi CryptoStruct↔KalshiBot receive lag p50≈5–6ms "
      + "(same venue, different recorders) — not an external BTC lead measurement.",
  },
  resolutionVsAccuracy: {
    resolution: "integer nanoseconds in file schema",
    accuracy:
      "Resolution ≠ accuracy. Treat sub-50ms cross-venue claims as unsupported; "
      + "250ms sensitivity may sit inside the uncertainty band; 1s and 3s are the "
      + "defensible decision horizons for tradability claims.",
  },
  eventOrdering: {
    withinStream: "prefer event_id chain (prevEventId); fall back to adapter order",
    gaps: "prevEventId mismatch → fail-closed until next snapshot (forceReset)",
    staleBook: "quote older than staleMaxAgeMs at decision time → exclude",
  },
  historicalVsFutureBot: {
    historical:
      "Recorder receipt / exchange stamps in archived files — zero live round-trip, "
      + "no order dread beyond the declared scenario delay.",
    futureBot:
      "Would add detection latency, network RTT, queueing, and Kalshi ack latency on top "
      + "of the scenario delay. Scenario delays are lower bounds on when action is modeled, "
      + "not production SLOs.",
  },
  joinPolicy: {
    type: "causal-as-of",
    rule: "use last observation with decisionTimestampMs >= observationTimestampMs",
    forbidden: "nearest-neighbor joins that can pull future observations",
  },
  subsecondOpportunityPolicy:
    "If only adapter clocks are available on either leg, or exchangeTs is missing for the "
    + "decision stream, do not claim a subsecond opportunity — report timing-quality-block "
    + "for 250ms and keep 1s/3s as the primary defensible set.",
} as const;

export type TimingDecisionClock = {
  timestampMs: number;
  source: "exchange" | "adapter";
};

/** Pick decision clock: exchange when present and >0, else adapter. */
export function resolveDecisionTimestamp(input: {
  exchangeTimestampNs: number | null | undefined;
  adapterTimestampNs: number;
}): TimingDecisionClock {
  const exchangeNs = input.exchangeTimestampNs ?? 0;
  if (typeof exchangeNs === "number" && Number.isFinite(exchangeNs) && exchangeNs > 0) {
    return {
      timestampMs: Math.floor(exchangeNs / 1e6),
      source: "exchange",
    };
  }
  return {
    timestampMs: Math.floor(input.adapterTimestampNs / 1e6),
    source: "adapter",
  };
}

/**
 * Whether a delay scenario is defensible given available timestamp sources.
 * 250ms requires exchange clocks on both legs; otherwise mark blocked for claims.
 */
export function delayClaimSupport(input: {
  delayMs: number;
  externalSource: "exchange" | "adapter";
  kalshiSource: "exchange" | "adapter";
}): "supported" | "diagnostic-only" | "blocked" {
  const bothExchange =
    input.externalSource === "exchange" && input.kalshiSource === "exchange";
  if (input.delayMs < 250) {
    return "blocked";
  }
  if (input.delayMs === 250) {
    return bothExchange ? "diagnostic-only" : "blocked";
  }
  if (input.delayMs < 1_000) {
    return bothExchange ? "diagnostic-only" : "blocked";
  }
  return "supported";
}
