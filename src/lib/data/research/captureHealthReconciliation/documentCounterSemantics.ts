import type { LoadedCaptureHealthJson } from "@/lib/data/research/captureHealthAudit/loadCaptureRunArtifacts";

import type { CounterSemanticDefinition } from "./captureHealthReconciliationTypes";

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Documents reconnect and sequence-gap counter semantics from capture-health.json. */
export function documentCounterSemantics(
  captureHealth: LoadedCaptureHealthJson | null,
): CounterSemanticDefinition[] {
  const orderbook = captureHealth?.orderbook ?? {};
  const connection = (captureHealth as { connection?: Record<string, unknown> } | null)?.connection ?? {};

  const sequenceGapCount =
    readNumber(orderbook.sequenceGapCount)
    ?? null;
  const reconnectCount =
    readNumber(connection.reconnectCount)
    ?? readNumber(orderbook.reconnectCount)
    ?? null;
  const outOfOrderCount = readNumber(orderbook.outOfOrderCount) ?? null;

  return [
    {
      fieldName: "sequenceGapCount",
      reportedValue: sequenceGapCount,
      semanticDefinition:
        "Compatibility counter. Captures before M12.1D: one increment per delta classified as gap (including every delta received while resyncing). Captures from M12.1D on: one increment per distinct sequence-gap episode (equals sequenceGapEpisodeCount); deltas received while awaiting recovery are counted separately in deltasQuarantinedDuringResync.",
      incrementRule:
        "M12.1D+: increment once per gap-initiated delta in ForwardCaptureMessageProcessor.processRawPayload; quarantined deltas do not increment.",
      sourcePath: "capture-health.json orderbook.sequenceGapCount",
      notes: [
        "Legacy captures can report multimillion values from a single unresolved episode.",
        "Use sequenceGapEpisodeCount and deltasQuarantinedDuringResync for episode-level attribution on new captures.",
      ],
    },
    {
      fieldName: "outOfOrderCount",
      reportedValue: outOfOrderCount,
      semanticDefinition:
        "Count of duplicate or out-of-order sequence deltas ignored by the sequence tracker.",
      incrementRule:
        "Increment when applyDelta returns duplicate in ForwardCaptureMessageProcessor.",
      sourcePath: "capture-health.json orderbook.outOfOrderCount",
      notes: [],
    },
    {
      fieldName: "reconnectCount",
      reportedValue: reconnectCount,
      semanticDefinition:
        "Count of WebSocket reconnect attempts scheduled after transport close in live capture.",
      incrementRule:
        "Increment in runLiveForwardQuoteCapture scheduleReconnect when onClose fires.",
      sourcePath: "capture-health.json connection.reconnectCount (fallback orderbook.reconnectCount)",
      notes: [
        "Legacy captures may only persist orderbook.reconnectCount.",
        "Each reconnect attempt triggers re-subscription and snapshot reload.",
      ],
    },
    {
      fieldName: "sequenceGapEpisodeCount",
      reportedValue:
        readNumber(orderbook.sequenceGapEpisodeCount) ?? null,
      semanticDefinition:
        "Distinct sequence discontinuity episodes (one per gap, per market). Persisted natively from M12.1D on; derived offline from top-of-book gap-detected streaks for older captures.",
      incrementRule:
        "Increment once when a synchronized book observes a non-contiguous sequence (gap-initiated), never for deltas quarantined while awaiting recovery.",
      sourcePath: "capture-health.json orderbook.sequenceGapEpisodeCount",
      notes: ["Null for captures recorded before M12.1D."],
    },
  ];
}
