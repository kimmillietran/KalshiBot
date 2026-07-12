import type { SequenceGapCounterSemantics } from "./downstreamAnalysisScopeTypes";

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Documents sequence-gap counter semantics from capture-health.json orderbook fields. */
export function documentSequenceGapSemantics(
  captureHealth: Record<string, unknown> | null,
): SequenceGapCounterSemantics[] {
  const orderbook = captureHealth && typeof captureHealth.orderbook === "object"
    ? captureHealth.orderbook as Record<string, unknown>
    : {};
  const connection = captureHealth && typeof captureHealth.connection === "object"
    ? captureHealth.connection as Record<string, unknown>
    : {};

  const sequenceGapCount = readNumber(orderbook.sequenceGapCount);
  const reconnectCount =
    readNumber(connection.reconnectCount)
    ?? readNumber(orderbook.reconnectCount);

  return [
    {
      fieldName: "sequenceGapCount",
      reportedValue: sequenceGapCount,
      semanticDefinition:
        "Count of orderbook_delta messages classified as gap events (non-contiguous sequence or resync state).",
      notes: [
        "This is a per-delta event count, not a count of missing sequence numbers.",
        "High values during long captures do not imply separate outage episodes.",
        "Use top-of-book bookState gap-detected runs for episode-style attribution.",
      ],
    },
    {
      fieldName: "missingSequenceNumberCount",
      reportedValue: null,
      semanticDefinition:
        "Not persisted in capture-health.json; would require offline replay to compute.",
      notes: [],
    },
    {
      fieldName: "sequenceGapEpisodeCount",
      reportedValue: null,
      semanticDefinition:
        "Not persisted in capture-health.json; derived offline from top-of-book gap-detected streaks when available.",
      notes: [],
    },
    {
      fieldName: "reconnectCount",
      reportedValue: reconnectCount,
      semanticDefinition:
        "Count of WebSocket reconnect attempts during capture.",
      notes: ["reconnectCount = 0 does not imply sequenceGapCount = 0."],
    },
  ];
}
