import { basename, join } from "node:path";

import type {
  ExploratoryCaptureIdentity,
  NextFamilyReadinessIo,
} from "./nextFamilyReadinessTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

const FIELD_PROBES: ReadonlyArray<{ field: string; relativePath: string }> = [
  { field: "topOfBook", relativePath: "top-of-book.jsonl" },
  { field: "btcSpot", relativePath: "btc-spot.jsonl" },
  { field: "btcCandles1m", relativePath: "btc-candles-1m.jsonl" },
  { field: "captureHealth", relativePath: "capture-health.json" },
  { field: "markets", relativePath: "markets.json" },
];

/**
 * Read-only exploratory capture identity. Does not scan multi-GB JSONL bodies.
 * Marks every identity as non-confirmatory design data.
 */
export function loadExploratoryCaptureIdentity(
  io: NextFamilyReadinessIo,
  captureRunDir: string,
): ExploratoryCaptureIdentity {
  const runId = basename(captureRunDir.replace(/[/\\]+$/, ""));
  const fieldsObserved: string[] = [];
  for (const probe of FIELD_PROBES) {
    if (io.fileExists(join(captureRunDir, probe.relativePath))) {
      fieldsObserved.push(probe.field);
    }
  }

  let captureHealthVerdict: string | null = null;
  let durationHours: number | null = null;
  const healthPath = join(captureRunDir, "capture-health.json");
  if (io.fileExists(healthPath)) {
    try {
      const health = JSON.parse(io.readFile(healthPath)) as unknown;
      if (isRecord(health)) {
        captureHealthVerdict = readString(health.verdict);
        const config = health.config;
        if (isRecord(config)) {
          const durationSeconds = readNumber(config.durationSeconds);
          const durationMinutes = readNumber(config.durationMinutes);
          const seconds =
            durationSeconds
            ?? (durationMinutes !== null ? durationMinutes * 60 : null);
          durationHours = seconds !== null ? seconds / 3600 : null;
        }
        const capture = health.capture;
        if (isRecord(capture) && readNumber(capture.topOfBookRecordCount) !== null) {
          if (!fieldsObserved.includes("topOfBook")) {
            fieldsObserved.push("topOfBook");
          }
        }
        const btcSpot = health.btcSpot;
        if (isRecord(btcSpot) && readNumber(btcSpot.recordsCaptured) !== null) {
          if (!fieldsObserved.includes("btcSpot")) {
            fieldsObserved.push("btcSpot");
          }
        }
        // Document TOB executable field categories when TOB is present (without inventing depth).
        if (fieldsObserved.includes("topOfBook")) {
          fieldsObserved.push("bestBid", "bestAsk", "spread", "bidSize", "askSize", "validBook");
        }
      }
    } catch {
      // keep nulls
    }
  }

  fieldsObserved.sort((left, right) => left.localeCompare(right));

  return {
    runId,
    captureRunDir,
    role: "exploratory-design-data-not-confirmatory",
    fieldsObserved,
    captureHealthVerdict,
    durationHours,
    note:
      "Inspected read-only for field coverage / feasibility only. "
      + "Must NOT be reused as prospective confirmatory evidence for any next family.",
  };
}

export function loadFadeIndependentMarketsPerEightHours(
  io: NextFamilyReadinessIo,
  reportPaths: readonly string[],
): number | null {
  const rates: number[] = [];
  for (const path of [...reportPaths].sort((left, right) => left.localeCompare(right))) {
    if (!io.fileExists(path)) {
      continue;
    }
    try {
      const parsed = JSON.parse(io.readFile(path)) as unknown;
      if (!isRecord(parsed)) {
        continue;
      }
      const candidateMarketCount = readNumber(parsed.candidateMarketCount);
      const durationSeconds =
        readNumber(parsed.captureDurationSeconds)
        ?? readNumber(parsed.runDurationSeconds)
        ?? null;
      if (candidateMarketCount === null || durationSeconds === null || durationSeconds <= 0) {
        continue;
      }
      rates.push(candidateMarketCount / (durationSeconds / 28_800));
    } catch {
      // skip malformed
    }
  }
  if (rates.length === 0) {
    return null;
  }
  const sum = rates.reduce((acc, value) => acc + value, 0);
  return sum / rates.length;
}
