import { summarizeLiveMessage } from "@/lib/data/research/kalshiBrtiAccessProbe/runLiveCfbProbe";

export type CloseBoundaryRow = {
  sequence: number;
  jsonlLine: number;
  localReceivedAtMs: number;
  localReceivedAtMonoMs: number;
  providerReceivedAtMs: number | null;
  messageType: string | null;
  fieldName: "last_60s_windowed_average_15min" | "avg_60s_data";
  count: number | null;
  windowStartTsMs: number | null;
  windowEndTsExclusive: number | null;
  valueRaw: string | null;
};

export type CloseBoundaryChronology = {
  sourceSha256: string | null;
  closeMs: number;
  rows: CloseBoundaryRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read-only replay of a synchronized JSONL capture around a close.
 * Does not mutate the source file.
 */
export function extractCloseBoundaryChronology(input: {
  jsonl: string;
  closeMs: number;
  preCloseMs?: number;
  postCloseMs?: number;
  sourceSha256?: string | null;
}): CloseBoundaryChronology {
  const preCloseMs = input.preCloseMs ?? 2_500;
  const postCloseMs = input.postCloseMs ?? 4_000;
  const rows: CloseBoundaryRow[] = [];
  const lines = input.jsonl.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line == null || line.trim() === "") {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      continue;
    }
    if (!isRecord(parsed) || typeof parsed.payload !== "string") {
      continue;
    }
    const localReceivedAtMs = typeof parsed.receivedAtMs === "number" ? parsed.receivedAtMs : null;
    const localReceivedAtMonoMs = typeof parsed.receivedAtMonoMs === "number" ? parsed.receivedAtMonoMs : null;
    if (localReceivedAtMs == null || localReceivedAtMonoMs == null) {
      continue;
    }
    if (localReceivedAtMs < input.closeMs - preCloseMs || localReceivedAtMs > input.closeMs + postCloseMs) {
      continue;
    }
    const summary = summarizeLiveMessage(parsed.payload, localReceivedAtMs);
    const candidates = [
      {
        fieldName: "last_60s_windowed_average_15min" as const,
        window: summary.last60sWindowedAverage15min,
      },
      {
        fieldName: "avg_60s_data" as const,
        window: summary.trailingAvg60s,
      },
    ];
    for (const candidate of candidates) {
      if (candidate.window == null) {
        continue;
      }
      rows.push({
        sequence: rows.length + 1,
        jsonlLine: index + 1,
        localReceivedAtMs,
        localReceivedAtMonoMs,
        providerReceivedAtMs: summary.providerReceivedAtMs,
        messageType: summary.type,
        fieldName: candidate.fieldName,
        count: candidate.window.windowSize,
        windowStartTsMs: candidate.window.windowStartTsMs,
        windowEndTsExclusive: candidate.window.windowEndTsExclusive,
        valueRaw: candidate.window.valueRaw,
      });
    }
  }
  return {
    sourceSha256: input.sourceSha256 ?? null,
    closeMs: input.closeMs,
    rows,
  };
}

export function observationsAvailableAt(input: {
  observations: ReadonlyArray<{
    timeMs: number | null;
    valueRaw: string | null;
    value: number | null;
    localReceivedAtMs?: number;
    localReceivedAtMonoMs?: number;
  }>;
  receivedAtMs: number;
  receivedAtMonoMs: number;
}): Array<{ timeRaw: number | null; timeMs: number | null; valueRaw: string | null; value: number | null }> {
  return input.observations
    .filter((observation) => {
      if (observation.localReceivedAtMs == null || observation.localReceivedAtMonoMs == null) {
        return false;
      }
      if (observation.localReceivedAtMs > input.receivedAtMs) {
        return false;
      }
      if (observation.localReceivedAtMs === input.receivedAtMs
        && observation.localReceivedAtMonoMs > input.receivedAtMonoMs) {
        return false;
      }
      return true;
    })
    .map((observation) => ({
      timeRaw: observation.timeMs,
      timeMs: observation.timeMs,
      valueRaw: observation.valueRaw,
      value: observation.value,
    }));
}
