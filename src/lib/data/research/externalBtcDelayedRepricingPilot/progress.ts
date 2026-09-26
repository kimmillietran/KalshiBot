/**
 * Structured progress reporting (no false %-complete estimates).
 */

export type ProgressStage =
  | "hash-inputs"
  | "ingest-coinbase"
  | "ingest-kalshi-member"
  | "rebuild-contract-metadata"
  | "detect-events"
  | "simulate"
  | "write-day-result"
  | "aggregate"
  | "idle";

export type ProgressSnapshot = {
  utcDay: string | null;
  stage: ProgressStage;
  file: string | null;
  messagesSeen: number;
  bookMessagesApplied: number;
  quotesEmitted: number;
  /** Compressed file size when known (bytes). Not a progress cursor unless noted. */
  compressedFileBytes: number | null;
  /** Approximate UTF-8 bytes of lines processed after decompress. */
  decompressedBytesApprox: number;
  elapsedMs: number;
  messagesPerSec: number | null;
  rssBytes: number | null;
  heapUsedBytes: number | null;
  note: string | null;
};

export function createProgressReporter(input: {
  onProgress?: (snap: ProgressSnapshot) => void;
  intervalMs?: number;
}): {
  setDay: (utcDay: string | null) => void;
  setStage: (stage: ProgressStage, file?: string | null) => void;
  setCompressedFileBytes: (n: number | null) => void;
  bump: (delta: {
    messagesSeen?: number;
    bookMessagesApplied?: number;
    quotesEmitted?: number;
    decompressedBytesApprox?: number;
  }) => void;
  note: (text: string | null) => void;
  snapshot: () => ProgressSnapshot;
  flush: () => void;
  close: () => void;
} {
  const started = Date.now();
  const intervalMs = input.intervalMs ?? 5_000;
  let utcDay: string | null = null;
  let stage: ProgressStage = "idle";
  let file: string | null = null;
  let messagesSeen = 0;
  let bookMessagesApplied = 0;
  let quotesEmitted = 0;
  let compressedFileBytes: number | null = null;
  let decompressedBytesApprox = 0;
  let note: string | null = null;

  const emit = () => {
    const elapsedMs = Date.now() - started;
    const mem = process.memoryUsage();
    const snap: ProgressSnapshot = {
      utcDay,
      stage,
      file,
      messagesSeen,
      bookMessagesApplied,
      quotesEmitted,
      compressedFileBytes,
      decompressedBytesApprox,
      elapsedMs,
      messagesPerSec: elapsedMs > 0 ? (messagesSeen * 1000) / elapsedMs : null,
      rssBytes: typeof mem.rss === "number" ? mem.rss : null,
      heapUsedBytes: mem.heapUsed,
      note,
    };
    input.onProgress?.(snap);
    // Always mirror to stderr so monitors see heartbeats without corrupting JSON stdout.
    console.error(`[pilot-progress] ${JSON.stringify(snap)}`);
  };

  const timer = setInterval(emit, intervalMs);
  if (typeof timer.unref === "function") timer.unref();

  return {
    setDay(d) {
      utcDay = d;
    },
    setStage(s, f = null) {
      stage = s;
      file = f;
      emit();
    },
    setCompressedFileBytes(n) {
      compressedFileBytes = n;
    },
    bump(delta) {
      messagesSeen += delta.messagesSeen ?? 0;
      bookMessagesApplied += delta.bookMessagesApplied ?? 0;
      quotesEmitted += delta.quotesEmitted ?? 0;
      decompressedBytesApprox += delta.decompressedBytesApprox ?? 0;
    },
    note(text) {
      note = text;
    },
    snapshot() {
      const elapsedMs = Date.now() - started;
      const mem = process.memoryUsage();
      return {
        utcDay,
        stage,
        file,
        messagesSeen,
        bookMessagesApplied,
        quotesEmitted,
        compressedFileBytes,
        decompressedBytesApprox,
        elapsedMs,
        messagesPerSec: elapsedMs > 0 ? (messagesSeen * 1000) / elapsedMs : null,
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        note,
      };
    },
    flush: emit,
    close() {
      clearInterval(timer);
      emit();
    },
  };
}
