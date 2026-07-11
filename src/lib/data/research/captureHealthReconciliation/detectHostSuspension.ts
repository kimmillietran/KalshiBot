import type {
  CaptureHealthReconciliationConfig,
  CaptureHealthReconciliationIo,
  SuspensionDetectionSummary,
  SuspensionInterval,
} from "./captureHealthReconciliationTypes";

type HeartbeatPoint = {
  receivedAtLocal: string;
  receivedAtMs: number;
};

function classifyGap(gapMs: number, config: CaptureHealthReconciliationConfig): SuspensionInterval["classification"] {
  if (gapMs >= config.probableSuspensionGapMs) {
    return "probable-host-suspension";
  }

  if (gapMs >= config.heartbeatWarningGapMs) {
    return "network-outage";
  }

  if (gapMs >= config.expectedBtcHeartbeatMs * 3) {
    return "ordinary-delay";
  }

  return "ordinary-delay";
}

function gapConfidence(classification: SuspensionInterval["classification"]): SuspensionInterval["confidence"] {
  if (classification === "probable-host-suspension") {
    return "high";
  }

  if (classification === "network-outage") {
    return "medium";
  }

  return "low";
}

async function collectBtcHeartbeats(
  io: CaptureHealthReconciliationIo,
  path: string,
): Promise<HeartbeatPoint[]> {
  const points: HeartbeatPoint[] = [];

  await io.streamJsonl(path, {
    onLine: (line) => {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const receivedAtLocal =
          typeof parsed.receivedAtLocal === "string" ? parsed.receivedAtLocal : null;
        if (!receivedAtLocal) {
          return "skip";
        }

        const receivedAtMs = Date.parse(receivedAtLocal);
        if (!Number.isFinite(receivedAtMs)) {
          return "skip";
        }

        points.push({ receivedAtLocal, receivedAtMs });
        return "continue";
      } catch {
        return "skip";
      }
    },
  });

  points.sort((left, right) => left.receivedAtMs - right.receivedAtMs);
  return points;
}

/** Detects probable host suspension from BTC spot heartbeat gaps (streaming). */
export async function detectHostSuspension(input: {
  io: CaptureHealthReconciliationIo;
  btcSpotPath: string | null;
  config: CaptureHealthReconciliationConfig;
}): Promise<SuspensionDetectionSummary> {
  const warnings: string[] = [];
  if (!input.btcSpotPath || !input.io.fileExists(input.btcSpotPath)) {
    warnings.push("btc-spot.jsonl missing; suspension detection skipped.");
    return {
      suspectedSystemSleepEventCount: 0,
      suspectedSystemSleepSeconds: 0,
      longestHeartbeatGapMs: null,
      heartbeatGapCount: 0,
      intervals: [],
      warnings,
    };
  }

  const heartbeats = await collectBtcHeartbeats(input.io, input.btcSpotPath);
  if (heartbeats.length < 2) {
    warnings.push("Insufficient BTC heartbeat records for suspension detection.");
    return {
      suspectedSystemSleepEventCount: 0,
      suspectedSystemSleepSeconds: 0,
      longestHeartbeatGapMs: null,
      heartbeatGapCount: 0,
      intervals: [],
      warnings,
    };
  }

  const intervals: SuspensionInterval[] = [];
  let longestHeartbeatGapMs: number | null = null;
  let heartbeatGapCount = 0;

  for (let index = 1; index < heartbeats.length; index += 1) {
    const previous = heartbeats[index - 1]!;
    const current = heartbeats[index]!;
    const gapMs = current.receivedAtMs - previous.receivedAtMs;
    if (gapMs < input.config.heartbeatWarningGapMs) {
      continue;
    }

    heartbeatGapCount += 1;
    longestHeartbeatGapMs =
      longestHeartbeatGapMs === null ? gapMs : Math.max(longestHeartbeatGapMs, gapMs);

    const classification = classifyGap(gapMs, input.config);
    intervals.push({
      startedAt: previous.receivedAtLocal,
      endedAt: current.receivedAtLocal,
      gapDurationMs: gapMs,
      previousHeartbeatAt: previous.receivedAtLocal,
      nextHeartbeatAt: current.receivedAtLocal,
      classification,
      confidence: gapConfidence(classification),
      corroboratingStreams: ["btc-spot.jsonl"],
      notes: [],
    });
  }

  const suspensionIntervals = intervals.filter(
    (interval) => interval.classification === "probable-host-suspension",
  );
  const suspectedSystemSleepSeconds = Math.round(
    suspensionIntervals.reduce((sum, interval) => sum + interval.gapDurationMs, 0) / 1000,
  );

  return {
    suspectedSystemSleepEventCount: suspensionIntervals.length,
    suspectedSystemSleepSeconds,
    longestHeartbeatGapMs,
    heartbeatGapCount,
    intervals,
    warnings,
  };
}
