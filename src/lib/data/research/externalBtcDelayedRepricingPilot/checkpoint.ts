/**
 * Durable checkpoints for quote caches and per-day simulation results.
 * Partial files are ignored; identity must match before resume.
 */

import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
  BBO_EMISSION_POLICY,
  REPLAY_IMPLEMENTATION_VERSION,
} from "./bookReplay";
import { CLOCK_POLICY } from "./timingQuality";
import {
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID,
  type DaySummary,
  type ExternalBtcEvent,
  type SelectedContract,
  type SimulatedTrade,
} from "./types";
import { FROZEN_PILOT_SPEC } from "./pilotSpec";
import { EXIT_FAILURE_POLICY } from "./simulateTrades";
import { PILOT_DELAY_MS } from "./types";

export const QUOTE_CACHE_SCHEMA_VERSION = "sparse-jsonl-v1" as const;
export const DAY_RESULT_SCHEMA_VERSION = "day-result-v1" as const;

export function simulationSpecHash(): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        studyId: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID,
        analysisVersion: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
        eventDefinition: FROZEN_PILOT_SPEC.eventDefinition,
        execution: FROZEN_PILOT_SPEC.execution,
        positionPolicy: FROZEN_PILOT_SPEC.positionPolicy,
        delaysMs: [...PILOT_DELAY_MS.SENSITIVITY],
        primaryDelayMs: PILOT_DELAY_MS.PRIMARY,
        exitFailurePolicy: EXIT_FAILURE_POLICY.id,
        clockPolicy: CLOCK_POLICY,
        daySelection: FROZEN_PILOT_SPEC.daySelection,
      }),
    )
    .digest("hex");
}

export type QuoteCacheIdentity = {
  kind: "quote-cache";
  schemaVersion: typeof QUOTE_CACHE_SCHEMA_VERSION;
  emissionPolicy: typeof BBO_EMISSION_POLICY;
  replayImplementation: typeof REPLAY_IMPLEMENTATION_VERSION;
  decisionClockDomain: typeof CLOCK_POLICY.decisionClockDomain;
  rawInputSha256: string;
  sourceLabel: string;
};

export type DayResultIdentity = {
  kind: "day-result";
  schemaVersion: typeof DAY_RESULT_SCHEMA_VERSION;
  analysisVersion: typeof EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION;
  simulationSpecSha256: string;
  replayImplementation: typeof REPLAY_IMPLEMENTATION_VERSION;
  quoteCacheSchemaVersion: typeof QUOTE_CACHE_SCHEMA_VERSION;
  coinbaseRawSha256: string;
  kalshiZipSha256: string;
  utcDay: string;
};

export function quoteCacheIdentityKey(id: QuoteCacheIdentity): string {
  const canonical: QuoteCacheIdentity = {
    kind: "quote-cache",
    schemaVersion: id.schemaVersion,
    emissionPolicy: id.emissionPolicy,
    replayImplementation: id.replayImplementation,
    decisionClockDomain: id.decisionClockDomain,
    rawInputSha256: id.rawInputSha256,
    sourceLabel: id.sourceLabel,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function dayResultIdentityKey(id: DayResultIdentity): string {
  const canonical: DayResultIdentity = {
    kind: "day-result",
    schemaVersion: id.schemaVersion,
    analysisVersion: id.analysisVersion,
    simulationSpecSha256: id.simulationSpecSha256,
    replayImplementation: id.replayImplementation,
    quoteCacheSchemaVersion: id.quoteCacheSchemaVersion,
    coinbaseRawSha256: id.coinbaseRawSha256,
    kalshiZipSha256: id.kalshiZipSha256,
    utcDay: id.utcDay,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export type QuoteCacheManifest = QuoteCacheIdentity & {
  complete: true;
  outputSha256: string;
  quoteCount: number;
  compressedBytesRead: number | null;
  decompressedBytesApprox: number | null;
  messagesSeen: number;
  bookMessagesApplied: number;
  writtenAtIso: string;
};

export type DayResultArtifact = DayResultIdentity & {
  complete: true;
  writtenAtIso: string;
  contracts: SelectedContract[];
  events: ExternalBtcEvent[];
  trades: SimulatedTrade[];
  daySummary: DaySummary;
  timingNotes: Array<{ eventId: string; delayMs: number; status: string }>;
  coinbaseQuoteCacheKey: string;
  kalshiQuoteCacheKeys: Record<string, string>;
  peakRssBytes: number | null;
  elapsedMs: number;
};

function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.partial.${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function writeQuoteCacheManifest(
  path: string,
  manifest: QuoteCacheManifest,
): void {
  atomicWriteJson(path, manifest);
}

export function readCompleteQuoteCacheManifest(
  path: string,
  expected: QuoteCacheIdentity,
): QuoteCacheManifest | null {
  if (!existsSync(path)) return null;
  if (existsSync(`${path}.partial`) || path.endsWith(".partial")) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as QuoteCacheManifest;
    if (!parsed.complete) return null;
    if (quoteCacheIdentityKey(parsed) !== quoteCacheIdentityKey(expected)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeDayResult(path: string, artifact: DayResultArtifact): void {
  atomicWriteJson(path, artifact);
}

export function readCompleteDayResult(
  path: string,
  expected: DayResultIdentity,
): DayResultArtifact | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as DayResultArtifact;
    if (!parsed.complete) return null;
    if (dayResultIdentityKey(parsed) !== dayResultIdentityKey(expected)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function defaultCacheRoot(outDir: string): string {
  return join(outDir, "cache");
}

export function coinbaseSparsePath(cacheRoot: string, key: string): string {
  return join(cacheRoot, "quotes", "coinbase", `${key}.jsonl`);
}

export function coinbaseManifestPath(cacheRoot: string, key: string): string {
  return join(cacheRoot, "quotes", "coinbase", `${key}.manifest.json`);
}

export function kalshiSparsePath(
  cacheRoot: string,
  key: string,
): string {
  return join(cacheRoot, "quotes", "kalshi", `${key}.jsonl`);
}

export function kalshiManifestPath(cacheRoot: string, key: string): string {
  return join(cacheRoot, "quotes", "kalshi", `${key}.manifest.json`);
}

export function dayResultPath(cacheRoot: string, key: string): string {
  return join(cacheRoot, "day-results", `${key}.json`);
}

/** Append-only JSONL writer with fsync on close. */
export function createJsonlAppender(path: string): {
  writeLine: (value: unknown) => void;
  bytesWritten: () => number;
  close: () => Promise<void>;
} {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.partial.${process.pid}`;
  const stream = createWriteStream(tmp, { flags: "w" });
  let bytes = 0;
  return {
    writeLine(value: unknown) {
      const line = `${JSON.stringify(value)}\n`;
      bytes += Buffer.byteLength(line, "utf8");
      stream.write(line);
    },
    bytesWritten: () => bytes,
    async close() {
      await new Promise<void>((resolve, reject) => {
        stream.end(() => {
          try {
            renameSync(tmp, path);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
        stream.on("error", reject);
      });
    },
  };
}

export function fileSizeOrNull(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}
