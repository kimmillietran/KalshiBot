import { describe, expect, it, vi } from "vitest";

import {
  createJsonlForwardCaptureWriter,
  createRunOutputPaths,
  type CreateJsonlForwardCaptureWriterOptions,
  type ForwardCaptureAppendStream,
} from "./jsonlForwardCaptureWriter";
import type { ForwardQuoteCaptureIo } from "./forwardQuoteCaptureTypes";

class FakeAppendStream implements ForwardCaptureAppendStream {
  chunks: string[] = [];
  acceptWrites = true;
  throwOnWrite: Error | null = null;
  ended = false;
  endError: Error | null = null;
  private drainCallback: (() => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;

  write(chunk: string): boolean {
    if (this.throwOnWrite) {
      throw this.throwOnWrite;
    }
    this.chunks.push(chunk);
    return this.acceptWrites;
  }

  onceDrain(callback: () => void): void {
    this.drainCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  end(): Promise<void> {
    this.ended = true;
    return this.endError ? Promise.reject(this.endError) : Promise.resolve();
  }

  emitDrain(): void {
    this.acceptWrites = true;
    const callback = this.drainCallback;
    this.drainCallback = null;
    callback?.();
  }

  emitError(error: Error): void {
    this.errorCallback?.(error);
  }
}

function createHarness(options: CreateJsonlForwardCaptureWriterOptions = {}) {
  const streams = new Map<string, FakeAppendStream>();
  let monotonicMs = 0;

  const io: ForwardQuoteCaptureIo = {
    writeFile: () => {},
    appendFile: () => {
      throw new Error("appendFile must not be used when createAppendStream is provided");
    },
    mkdirSync: () => {},
    createAppendStream: (path: string) => {
      const stream = new FakeAppendStream();
      streams.set(path, stream);
      return stream;
    },
    now: () => new Date("2026-07-21T00:00:00.000Z"),
    monotonicNowMs: () => monotonicMs,
  };

  const paths = createRunOutputPaths("out/capture", "run-1");
  const writer = createJsonlForwardCaptureWriter(io, paths, {
    limits: options.limits,
    onFailure: options.onFailure,
  });

  return {
    writer,
    paths,
    rawStream: () => streams.get(paths.rawKalshiWsPath)!,
    topOfBookStream: () => streams.get(paths.topOfBookPath)!,
    lifecycleStream: () => streams.get(paths.captureLifecyclePath)!,
    advanceMonotonic: (ms: number) => {
      monotonicMs += ms;
    },
  };
}

function parseSeq(chunks: string[]): number[] {
  return chunks.map((chunk) => (JSON.parse(chunk) as { seq: number }).seq);
}

describe("createJsonlForwardCaptureWriter (buffered)", () => {
  it("queues writes during backpressure and flushes them without record loss", () => {
    const { writer, rawStream } = createHarness();
    const stream = rawStream();

    stream.acceptWrites = false;
    writer.appendRawKalshiWs({ seq: 1 });
    writer.appendRawKalshiWs({ seq: 2 });
    writer.appendRawKalshiWs({ seq: 3 });

    // Only the first record reached the sink; the rest are pending.
    expect(stream.chunks).toHaveLength(1);
    let diagnostics = writer.diagnostics();
    expect(diagnostics.perArtifact.raw.recordsQueued).toBe(3);
    expect(diagnostics.perArtifact.raw.recordsWritten).toBe(1);
    expect(diagnostics.perArtifact.raw.pendingRecords).toBe(2);
    expect(diagnostics.perArtifact.raw.pendingBytes).toBeGreaterThan(0);
    expect(diagnostics.backpressureEventCount).toBe(1);

    stream.emitDrain();

    diagnostics = writer.diagnostics();
    expect(parseSeq(stream.chunks)).toEqual([1, 2, 3]);
    expect(diagnostics.perArtifact.raw.recordsWritten).toBe(3);
    expect(diagnostics.perArtifact.raw.pendingRecords).toBe(0);
    expect(writer.hasFailed()).toBe(false);
  });

  it("preserves record order across repeated backpressure cycles", () => {
    const { writer, rawStream } = createHarness();
    const stream = rawStream();

    for (let seq = 1; seq <= 50; seq += 1) {
      // Backpressure on every 10th accepted write.
      stream.acceptWrites = stream.chunks.length % 10 !== 9;
      writer.appendRawKalshiWs({ seq });
      if (writer.diagnostics().perArtifact.raw.pendingRecords > 3) {
        stream.emitDrain();
      }
    }
    stream.emitDrain();

    expect(parseSeq(stream.chunks)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
    expect(writer.diagnostics().perArtifact.raw.recordsWritten).toBe(50);
  });

  it("keeps artifacts independent: backpressure on one stream does not block others", () => {
    const { writer, rawStream, topOfBookStream } = createHarness();
    rawStream().acceptWrites = false;

    writer.appendRawKalshiWs({ seq: 1 });
    writer.appendRawKalshiWs({ seq: 2 });
    writer.appendTopOfBook({ seq: 1 });

    expect(topOfBookStream().chunks).toHaveLength(1);
    expect(writer.diagnostics().perArtifact.topOfBook.pendingRecords).toBe(0);
  });

  it("surfaces synchronous write failures and reports them via onFailure", () => {
    const onFailure = vi.fn();
    const { writer, rawStream } = createHarness({ onFailure });
    rawStream().throwOnWrite = new Error("disk full");

    writer.appendRawKalshiWs({ seq: 1 });

    expect(writer.hasFailed()).toBe(true);
    expect(writer.getFailure()).toMatchObject({ artifact: "raw", reason: "disk full" });
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ artifact: "raw", reason: "disk full" }),
    );
    expect(writer.diagnostics().writeFailureCount).toBe(1);
  });

  it("surfaces asynchronous stream errors", () => {
    const { writer, rawStream } = createHarness();
    writer.appendRawKalshiWs({ seq: 1 });

    rawStream().emitError(new Error("EBADF"));

    expect(writer.hasFailed()).toBe(true);
    expect(writer.getFailure()).toMatchObject({ artifact: "raw", reason: "EBADF" });
  });

  it("counts records dropped after failure instead of silently discarding them", () => {
    const { writer, rawStream } = createHarness();
    rawStream().throwOnWrite = new Error("disk full");
    writer.appendRawKalshiWs({ seq: 1 });
    rawStream().throwOnWrite = null;

    writer.appendRawKalshiWs({ seq: 2 });
    writer.appendTopOfBook({ seq: 1 });

    const diagnostics = writer.diagnostics();
    expect(diagnostics.perArtifact.raw.recordsDroppedAfterFailure).toBe(1);
    expect(diagnostics.perArtifact.topOfBook.recordsDroppedAfterFailure).toBe(1);
  });

  it("still attempts lifecycle events after failure so the failure is recorded", () => {
    const { writer, rawStream, lifecycleStream } = createHarness();
    rawStream().throwOnWrite = new Error("disk full");
    writer.appendRawKalshiWs({ seq: 1 });

    writer.appendLifecycleEvent({ type: "writerFailureDetected" });

    expect(lifecycleStream().chunks).toHaveLength(1);
  });

  it("fails the run when the pending record limit is exceeded", () => {
    const { writer, rawStream } = createHarness({
      limits: { maxPendingRecordsPerArtifact: 2 },
    });
    rawStream().acceptWrites = false;

    writer.appendRawKalshiWs({ seq: 1 });
    writer.appendRawKalshiWs({ seq: 2 });
    writer.appendRawKalshiWs({ seq: 3 });
    expect(writer.hasFailed()).toBe(false);

    writer.appendRawKalshiWs({ seq: 4 });

    expect(writer.hasFailed()).toBe(true);
    expect(writer.getFailure()?.reason).toContain("Pending record limit exceeded");
  });

  it("fails the run when the pending byte limit is exceeded", () => {
    const { writer, rawStream } = createHarness({
      limits: { maxPendingBytesPerArtifact: 32 },
    });
    rawStream().acceptWrites = false;

    writer.appendRawKalshiWs({ seq: 1 });
    writer.appendRawKalshiWs({ seq: 2, padding: "x".repeat(64) });

    expect(writer.hasFailed()).toBe(true);
    expect(writer.getFailure()?.reason).toContain("Pending byte limit exceeded");
  });

  it("fails the run when the drain delay limit is exceeded", () => {
    const { writer, rawStream, advanceMonotonic } = createHarness({
      limits: { maxDrainDelayMs: 100 },
    });
    rawStream().acceptWrites = false;

    writer.appendRawKalshiWs({ seq: 1 });
    writer.appendRawKalshiWs({ seq: 2 });
    expect(writer.hasFailed()).toBe(false);

    advanceMonotonic(250);
    writer.appendRawKalshiWs({ seq: 3 });

    expect(writer.hasFailed()).toBe(true);
    expect(writer.getFailure()?.reason).toContain("Drain delay limit exceeded");
  });

  it("records the maximum observed drain delay and leaves it null when unobserved", () => {
    const observed = createHarness();
    observed.rawStream().acceptWrites = false;
    observed.writer.appendRawKalshiWs({ seq: 1 });
    observed.advanceMonotonic(40);
    observed.rawStream().emitDrain();
    expect(observed.writer.diagnostics().maxDrainDelayMs).toBe(40);

    const unobserved = createHarness();
    unobserved.writer.appendRawKalshiWs({ seq: 1 });
    expect(unobserved.writer.diagnostics().maxDrainDelayMs).toBeNull();
  });

  it("reports flushDurationMs and allStreamsDrained as null before finalization", () => {
    const { writer } = createHarness();
    writer.appendRawKalshiWs({ seq: 1 });

    const diagnostics = writer.diagnostics();
    expect(diagnostics.flushDurationMs).toBeNull();
    expect(diagnostics.allStreamsDrained).toBeNull();
  });

  it("finalize waits for pending records to drain before closing streams", async () => {
    const { writer, rawStream } = createHarness();
    const stream = rawStream();
    stream.acceptWrites = false;
    writer.appendRawKalshiWs({ seq: 1 });
    writer.appendRawKalshiWs({ seq: 2 });

    let finalized = false;
    const finalizePromise = writer.finalize().then(() => {
      finalized = true;
    });

    await Promise.resolve();
    expect(finalized).toBe(false);
    expect(stream.ended).toBe(false);

    stream.emitDrain();
    await finalizePromise;

    expect(finalized).toBe(true);
    expect(stream.ended).toBe(true);
    expect(parseSeq(stream.chunks)).toEqual([1, 2]);
    const diagnostics = writer.diagnostics();
    expect(diagnostics.allStreamsDrained).toBe(true);
    expect(diagnostics.flushDurationMs).not.toBeNull();
  });

  it("rejects writes after finalization begins", async () => {
    const { writer, rawStream } = createHarness();
    writer.appendRawKalshiWs({ seq: 1 });

    const finalizePromise = writer.finalize();
    writer.appendRawKalshiWs({ seq: 2 });
    await finalizePromise;
    writer.appendTopOfBook({ seq: 3 });

    expect(rawStream().chunks).toHaveLength(1);
    expect(writer.counts.raw).toBe(1);
    expect(writer.diagnostics().writesRejectedAfterFinalization).toBe(2);
  });

  it("marks allStreamsDrained false when a stream fails to close", async () => {
    const { writer, rawStream } = createHarness();
    writer.appendRawKalshiWs({ seq: 1 });
    rawStream().endError = new Error("close failed");

    await writer.finalize();

    expect(writer.hasFailed()).toBe(true);
    expect(writer.diagnostics().allStreamsDrained).toBe(false);
  });

  it("falls back to synchronous appendFile when no stream factory is provided (JSONL compatibility)", () => {
    const appended: Record<string, string> = {};
    const io: ForwardQuoteCaptureIo = {
      writeFile: () => {},
      appendFile: (path, data) => {
        appended[path] = (appended[path] ?? "") + data;
      },
      mkdirSync: () => {},
      now: () => new Date("2026-07-21T00:00:00.000Z"),
      monotonicNowMs: () => 0,
    };
    const paths = createRunOutputPaths("out/capture", "run-1");
    const writer = createJsonlForwardCaptureWriter(io, paths);

    writer.appendRawKalshiWs({ seq: 1 });
    writer.appendRawKalshiWs({ seq: 2 });

    const lines = appended[paths.rawKalshiWsPath].trimEnd().split("\n");
    expect(lines.map((line) => (JSON.parse(line) as { seq: number }).seq)).toEqual([1, 2]);
    expect(writer.counts.raw).toBe(2);
  });

  it("drains a near-limit accumulated backlog without record loss or reordering", async () => {
    // Uses the default 100k pending-record limit: the backlog accumulates
    // fully before a single drain, exercising the amortized O(1) queue path
    // (repeated Array.shift on a 100k backlog is quadratic and stalls the
    // event loop).
    const { writer, rawStream } = createHarness();
    const stream = rawStream();
    stream.acceptWrites = false;

    const totalRecords = 100_001;
    for (let seq = 1; seq <= totalRecords; seq += 1) {
      writer.appendRawKalshiWs({ seq });
    }

    expect(writer.hasFailed()).toBe(false);
    expect(writer.diagnostics().perArtifact.raw.pendingRecords).toBe(100_000);

    stream.emitDrain();

    const diagnostics = writer.diagnostics();
    expect(diagnostics.perArtifact.raw.pendingRecords).toBe(0);
    expect(diagnostics.perArtifact.raw.pendingBytes).toBe(0);
    expect(diagnostics.perArtifact.raw.recordsWritten).toBe(totalRecords);
    expect(stream.chunks).toHaveLength(totalRecords);
    expect((JSON.parse(stream.chunks[0]) as { seq: number }).seq).toBe(1);
    expect((JSON.parse(stream.chunks[49_999]) as { seq: number }).seq).toBe(50_000);
    expect(
      (JSON.parse(stream.chunks[totalRecords - 1]) as { seq: number }).seq,
    ).toBe(totalRecords);

    await writer.finalize();
    expect(writer.diagnostics().allStreamsDrained).toBe(true);
  });

  it("stays within the bounded memory contract across a millions-of-record simulation", async () => {
    const totalRecords = 1_000_000;
    const maxPendingRecordsPerArtifact = 5_000;
    let sinkWrites = 0;
    let lastChunk = "";
    const drainState: { callback: (() => void) | null } = { callback: null };

    // Discarding sink: backpressures every 1_000 writes, drains on demand.
    const sink: ForwardCaptureAppendStream = {
      write(chunk) {
        sinkWrites += 1;
        lastChunk = chunk;
        return sinkWrites % 1_000 !== 0;
      },
      onceDrain(callback) {
        drainState.callback = callback;
      },
      onError() {},
      end: () => Promise.resolve(),
    };

    const io: ForwardQuoteCaptureIo = {
      writeFile: () => {},
      appendFile: () => {},
      mkdirSync: () => {},
      createAppendStream: () => sink,
      now: () => new Date("2026-07-21T00:00:00.000Z"),
      monotonicNowMs: () => 0,
    };
    const writer = createJsonlForwardCaptureWriter(
      io,
      createRunOutputPaths("out/capture", "run-stress"),
      { limits: { maxPendingRecordsPerArtifact } },
    );

    for (let seq = 1; seq <= totalRecords; seq += 1) {
      writer.appendRawKalshiWs({ seq });
      // Simulate the OS draining the file sink while capture continues.
      if (seq % 500 === 0) {
        const callback = drainState.callback;
        drainState.callback = null;
        callback?.();
      }
    }
    while (drainState.callback) {
      const callback = drainState.callback;
      drainState.callback = null;
      callback();
    }
    await writer.finalize();

    const diagnostics = writer.diagnostics();
    expect(writer.hasFailed()).toBe(false);
    expect(diagnostics.perArtifact.raw.recordsQueued).toBe(totalRecords);
    expect(diagnostics.perArtifact.raw.recordsWritten).toBe(totalRecords);
    expect(diagnostics.maxPendingRecords).toBeLessThanOrEqual(maxPendingRecordsPerArtifact);
    expect(diagnostics.backpressureEventCount).toBeGreaterThan(0);
    expect(diagnostics.allStreamsDrained).toBe(true);
    expect((JSON.parse(lastChunk) as { seq: number }).seq).toBe(totalRecords);
  });
});
