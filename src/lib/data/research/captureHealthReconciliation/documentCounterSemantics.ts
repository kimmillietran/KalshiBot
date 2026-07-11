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
        "Count of orderbook_delta messages where applyDelta returned gap (non-contiguous sequence, awaiting snapshot, or resync state).",
      incrementRule:
        "Increment once per delta message classified as gap in ForwardCaptureMessageProcessor.processRawPayload.",
      sourcePath: "capture-health.json orderbook.sequenceGapCount",
      notes: [
        "This is a raw event count, not a count of missing sequence numbers.",
        "Multiple gap deltas can occur during one resynchronization episode.",
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
      reportedValue: null,
      semanticDefinition:
        "Derived offline count of contiguous top-of-book gap-detected record runs.",
      incrementRule:
        "Computed during timeline attribution from emitted top-of-book bookState transitions.",
      sourcePath: "derived in capture-timeline-attribution",
      notes: ["Not persisted in capture-health.json today."],
    },
  ];
}
