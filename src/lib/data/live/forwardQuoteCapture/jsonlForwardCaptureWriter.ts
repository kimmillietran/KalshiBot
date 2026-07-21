import { posix } from "node:path";

import type { ForwardQuoteCaptureIo } from "./forwardQuoteCaptureTypes";

export function createRunOutputPaths(outputDir: string, runId: string) {
  const runDir = posix.join(outputDir.replaceAll("\\", "/"), runId);
  return {
    runDir,
    rawKalshiWsPath: posix.join(runDir, "raw-kalshi-ws.jsonl"),
    topOfBookPath: posix.join(runDir, "top-of-book.jsonl"),
    btcSpotPath: posix.join(runDir, "btc-spot.jsonl"),
    marketMetadataPath: posix.join(runDir, "market-metadata.jsonl"),
    captureHealthPath: posix.join(runDir, "capture-health.json"),
    captureLifecyclePath: posix.join(runDir, "capture-lifecycle.jsonl"),
    captureRunStatusPath: posix.join(runDir, "capture-run-status.json"),
  };
}

/**
 * Injectable append-only sink for one JSONL artifact. Mirrors the minimal
 * Node write-stream contract the buffered writer needs, so tests can supply
 * deterministic in-memory sinks with scripted backpressure/errors.
 */
export type ForwardCaptureAppendStream = {
  /** Returns false when the sink is above its high-water mark (backpressure). */
  write(chunk: string): boolean;
  /** One-shot callback invoked when a backpressured sink can accept writes again. */
  onceDrain(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
  /** Flush all buffered data and close the sink. */
  end(): Promise<void>;
};

export type ForwardCaptureWriterLimits = {
  /** Maximum records queued (above the sink's own buffer) per artifact. */
  maxPendingRecordsPerArtifact: number;
  /** Maximum bytes queued (above the sink's own buffer) per artifact. */
  maxPendingBytesPerArtifact: number;
  /** Maximum tolerated time a sink may stay backpressured without draining. */
  maxDrainDelayMs: number;
};

export const DEFAULT_FORWARD_CAPTURE_WRITER_LIMITS: ForwardCaptureWriterLimits = {
  maxPendingRecordsPerArtifact: 100_000,
  maxPendingBytesPerArtifact: 64 * 1024 * 1024,
  maxDrainDelayMs: 30_000,
};

export const FORWARD_CAPTURE_ARTIFACT_KEYS = [
  "raw",
  "topOfBook",
  "btcSpot",
  "marketMetadata",
  "lifecycle",
] as const;

export type ForwardCaptureArtifactKey = (typeof FORWARD_CAPTURE_ARTIFACT_KEYS)[number];

export type ForwardCaptureWriterFailure = {
  artifact: ForwardCaptureArtifactKey;
  reason: string;
  detectedAt: string;
};

export type ForwardCaptureWriterArtifactDiagnostics = {
  recordsQueued: number;
  /** Records accepted by the underlying sink (durability is confirmed by allStreamsDrained). */
  recordsWritten: number;
  pendingRecords: number;
  pendingBytes: number;
  /** Records visibly dropped after the writer entered a terminal failure state. */
  recordsDroppedAfterFailure: number;
};

export type ForwardCaptureWriterDiagnostics = {
  perArtifact: Record<ForwardCaptureArtifactKey, ForwardCaptureWriterArtifactDiagnostics>;
  limits: ForwardCaptureWriterLimits;
  maxPendingRecords: number;
  maxPendingBytes: number;
  backpressureEventCount: number;
  /** Null when no backpressure drain was ever observed (metric unavailable). */
  maxDrainDelayMs: number | null;
  writeFailureCount: number;
  writesRejectedAfterFinalization: number;
  /** Null until finalization completes (metric unavailable). */
  flushDurationMs: number | null;
  /** Null until finalization completes (metric unavailable). */
  allStreamsDrained: boolean | null;
  failure: ForwardCaptureWriterFailure | null;
};

/**
 * FIFO queue with a head index so draining is amortized O(1). A plain array
 * drained with shift() copies the remaining elements on every removal, which
 * becomes quadratic for a backlog approaching the 100k pending-record limit —
 * exactly the event-loop stall this writer exists to eliminate.
 */
class PendingChunkQueue {
  private items: (string | undefined)[] = [];
  private head = 0;

  get length(): number {
    return this.items.length - this.head;
  }

  push(chunk: string): void {
    this.items.push(chunk);
  }

  shift(): string | undefined {
    if (this.head >= this.items.length) {
      return undefined;
    }
    const chunk = this.items[this.head];
    this.items[this.head] = undefined;
    this.head += 1;
    // Compact once the dead prefix dominates so memory is reclaimed without
    // per-shift copying.
    if (this.head >= 1_024 && this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return chunk;
  }
}

type WriterChannel = {
  key: ForwardCaptureArtifactKey;
  stream: ForwardCaptureAppendStream;
  pendingChunks: PendingChunkQueue;
  pendingBytes: number;
  backpressured: boolean;
  backpressureStartedAtMs: number | null;
  recordsQueued: number;
  recordsWritten: number;
  recordsDroppedAfterFailure: number;
};

function chunkByteLength(chunk: string): number {
  return typeof Buffer !== "undefined" ? Buffer.byteLength(chunk, "utf8") : chunk.length;
}

/**
 * Fallback sink built on the legacy synchronous appendFile io. It never
 * backpressures, preserving pre-M12.1E behavior for in-memory test io and
 * dry-run captures when no createAppendStream factory is provided.
 */
function createAppendFileShimStream(
  io: ForwardQuoteCaptureIo,
  path: string,
): ForwardCaptureAppendStream {
  return {
    write(chunk) {
      io.appendFile(path, chunk);
      return true;
    },
    onceDrain() {},
    onError() {},
    end: () => Promise.resolve(),
  };
}

export type CreateJsonlForwardCaptureWriterOptions = {
  limits?: Partial<ForwardCaptureWriterLimits>;
  onFailure?: (failure: ForwardCaptureWriterFailure) => void;
};

export function createJsonlForwardCaptureWriter(
  io: ForwardQuoteCaptureIo,
  paths: ReturnType<typeof createRunOutputPaths>,
  options: CreateJsonlForwardCaptureWriterOptions = {},
) {
  io.mkdirSync(paths.runDir, { recursive: true });

  const limits: ForwardCaptureWriterLimits = {
    ...DEFAULT_FORWARD_CAPTURE_WRITER_LIMITS,
    ...options.limits,
  };

  const artifactPaths: Record<ForwardCaptureArtifactKey, string> = {
    raw: paths.rawKalshiWsPath,
    topOfBook: paths.topOfBookPath,
    btcSpot: paths.btcSpotPath,
    marketMetadata: paths.marketMetadataPath,
    lifecycle: paths.captureLifecyclePath,
  };

  const createStream =
    io.createAppendStream ?? ((path: string) => createAppendFileShimStream(io, path));

  let state: "accepting" | "finalizing" | "finalized" = "accepting";
  let failure: ForwardCaptureWriterFailure | null = null;
  let backpressureEventCount = 0;
  let maxDrainDelayMs: number | null = null;
  let writeFailureCount = 0;
  let writesRejectedAfterFinalization = 0;
  let maxPendingRecords = 0;
  let maxPendingBytes = 0;
  let flushDurationMs: number | null = null;
  let allStreamsDrained: boolean | null = null;
  let pendingFlushWaiter: (() => void) | null = null;
  let finalizePromise: Promise<void> | null = null;

  const counts = {
    raw: 0,
    topOfBook: 0,
    btcSpot: 0,
    marketMetadata: 0,
    lifecycle: 0,
  };

  const channels = {} as Record<ForwardCaptureArtifactKey, WriterChannel>;
  for (const key of FORWARD_CAPTURE_ARTIFACT_KEYS) {
    const channel: WriterChannel = {
      key,
      stream: createStream(artifactPaths[key]),
      pendingChunks: new PendingChunkQueue(),
      pendingBytes: 0,
      backpressured: false,
      backpressureStartedAtMs: null,
      recordsQueued: 0,
      recordsWritten: 0,
      recordsDroppedAfterFailure: 0,
    };
    channel.stream.onError((error) => {
      recordFailure(channel, error.message);
    });
    channels[key] = channel;
  }

  function recordFailure(channel: WriterChannel, reason: string): void {
    writeFailureCount += 1;
    if (failure === null) {
      failure = {
        artifact: channel.key,
        reason,
        detectedAt: io.now().toISOString(),
      };
      options.onFailure?.(failure);
    }
    resolvePendingFlushWaiter();
  }

  function resolvePendingFlushWaiter(): void {
    if (pendingFlushWaiter === null) {
      return;
    }
    const allEmpty = FORWARD_CAPTURE_ARTIFACT_KEYS.every(
      (key) => channels[key].pendingChunks.length === 0,
    );
    if (allEmpty || failure !== null) {
      const waiter = pendingFlushWaiter;
      pendingFlushWaiter = null;
      waiter();
    }
  }

  function writeChunk(channel: WriterChannel, chunk: string): void {
    let accepted: boolean;
    try {
      accepted = channel.stream.write(chunk);
    } catch (error) {
      recordFailure(
        channel,
        error instanceof Error ? error.message : "Capture stream write failed",
      );
      return;
    }
    channel.recordsWritten += 1;
    if (!accepted && !channel.backpressured) {
      channel.backpressured = true;
      channel.backpressureStartedAtMs = io.monotonicNowMs();
      backpressureEventCount += 1;
      channel.stream.onceDrain(() => handleDrain(channel));
    }
  }

  function handleDrain(channel: WriterChannel): void {
    if (channel.backpressureStartedAtMs !== null) {
      const delay = io.monotonicNowMs() - channel.backpressureStartedAtMs;
      maxDrainDelayMs = Math.max(maxDrainDelayMs ?? 0, delay);
    }
    channel.backpressured = false;
    channel.backpressureStartedAtMs = null;

    while (
      channel.pendingChunks.length > 0
      && !channel.backpressured
      && failure === null
    ) {
      const chunk = channel.pendingChunks.shift()!;
      channel.pendingBytes -= chunkByteLength(chunk);
      writeChunk(channel, chunk);
    }
    resolvePendingFlushWaiter();
  }

  function trackPendingHighWater(channel: WriterChannel): void {
    if (channel.pendingChunks.length > maxPendingRecords) {
      maxPendingRecords = channel.pendingChunks.length;
    }
    if (channel.pendingBytes > maxPendingBytes) {
      maxPendingBytes = channel.pendingBytes;
    }
  }

  function enforceBoundedBuffering(channel: WriterChannel): void {
    if (channel.pendingChunks.length > limits.maxPendingRecordsPerArtifact) {
      recordFailure(
        channel,
        `Pending record limit exceeded (${channel.pendingChunks.length} > ${limits.maxPendingRecordsPerArtifact})`,
      );
      return;
    }
    if (channel.pendingBytes > limits.maxPendingBytesPerArtifact) {
      recordFailure(
        channel,
        `Pending byte limit exceeded (${channel.pendingBytes} > ${limits.maxPendingBytesPerArtifact})`,
      );
      return;
    }
    if (
      channel.backpressureStartedAtMs !== null
      && io.monotonicNowMs() - channel.backpressureStartedAtMs > limits.maxDrainDelayMs
    ) {
      recordFailure(
        channel,
        `Drain delay limit exceeded (backpressured longer than ${limits.maxDrainDelayMs}ms)`,
      );
    }
  }

  function append(key: ForwardCaptureArtifactKey, record: unknown): void {
    const channel = channels[key];
    if (state !== "accepting") {
      writesRejectedAfterFinalization += 1;
      return;
    }
    if (failure !== null && key !== "lifecycle") {
      // The run is already classified as failed; count (never silently hide)
      // records that arrive between failure detection and capture shutdown.
      // Lifecycle events are still attempted best-effort so the failure
      // itself can be recorded in capture-lifecycle.jsonl.
      channel.recordsDroppedAfterFailure += 1;
      return;
    }

    const chunk = `${JSON.stringify(record)}\n`;
    channel.recordsQueued += 1;
    counts[key] += 1;

    if (channel.backpressured || channel.pendingChunks.length > 0) {
      channel.pendingChunks.push(chunk);
      channel.pendingBytes += chunkByteLength(chunk);
      trackPendingHighWater(channel);
      enforceBoundedBuffering(channel);
      return;
    }

    writeChunk(channel, chunk);
  }

  function waitForPendingFlush(): Promise<void> {
    const allEmpty = FORWARD_CAPTURE_ARTIFACT_KEYS.every(
      (key) => channels[key].pendingChunks.length === 0,
    );
    if (allEmpty || failure !== null) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (pendingFlushWaiter !== null) {
          pendingFlushWaiter = null;
          const stillPending = FORWARD_CAPTURE_ARTIFACT_KEYS.find(
            (key) => channels[key].pendingChunks.length > 0,
          );
          if (stillPending) {
            recordFailure(
              channels[stillPending],
              `Finalization drain timed out after ${limits.maxDrainDelayMs}ms with pending records`,
            );
          }
          resolve();
        }
      }, limits.maxDrainDelayMs);

      pendingFlushWaiter = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  function finalize(): Promise<void> {
    if (finalizePromise !== null) {
      return finalizePromise;
    }
    state = "finalizing";
    finalizePromise = (async () => {
      const startedAtMs = io.monotonicNowMs();
      await waitForPendingFlush();
      await Promise.all(
        FORWARD_CAPTURE_ARTIFACT_KEYS.map(async (key) => {
          try {
            await channels[key].stream.end();
          } catch (error) {
            recordFailure(
              channels[key],
              error instanceof Error ? error.message : "Capture stream close failed",
            );
          }
        }),
      );
      flushDurationMs = io.monotonicNowMs() - startedAtMs;
      allStreamsDrained =
        failure === null
        && FORWARD_CAPTURE_ARTIFACT_KEYS.every(
          (key) => channels[key].pendingChunks.length === 0,
        );
      state = "finalized";
    })();
    return finalizePromise;
  }

  function diagnostics(): ForwardCaptureWriterDiagnostics {
    const perArtifact = {} as Record<
      ForwardCaptureArtifactKey,
      ForwardCaptureWriterArtifactDiagnostics
    >;
    for (const key of FORWARD_CAPTURE_ARTIFACT_KEYS) {
      const channel = channels[key];
      perArtifact[key] = {
        recordsQueued: channel.recordsQueued,
        recordsWritten: channel.recordsWritten,
        pendingRecords: channel.pendingChunks.length,
        pendingBytes: channel.pendingBytes,
        recordsDroppedAfterFailure: channel.recordsDroppedAfterFailure,
      };
    }
    return {
      perArtifact,
      limits,
      maxPendingRecords,
      maxPendingBytes,
      backpressureEventCount,
      maxDrainDelayMs,
      writeFailureCount,
      writesRejectedAfterFinalization,
      flushDurationMs,
      allStreamsDrained,
      failure,
    };
  }

  return {
    paths,
    counts,
    appendRawKalshiWs(record: unknown) {
      append("raw", record);
    },
    appendTopOfBook(record: unknown) {
      append("topOfBook", record);
    },
    appendBtcSpot(record: unknown) {
      append("btcSpot", record);
    },
    appendMarketMetadata(record: unknown) {
      append("marketMetadata", record);
    },
    appendLifecycleEvent(record: unknown) {
      append("lifecycle", record);
    },
    hasFailed(): boolean {
      return failure !== null;
    },
    getFailure(): ForwardCaptureWriterFailure | null {
      return failure;
    },
    finalize,
    diagnostics,
  };
}

export type ForwardCaptureWriter = ReturnType<typeof createJsonlForwardCaptureWriter>;
