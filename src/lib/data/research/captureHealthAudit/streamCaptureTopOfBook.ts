import type { JsonlStreamSummary } from "@/lib/data/research/jsonl";

import type { CaptureHealthAuditIo, ParsedTopOfBookRecord } from "./captureHealthAuditTypes";
import { parseTopOfBookLine } from "./parseCaptureHealthRecords";

export type StreamCaptureTopOfBookProgress = {
  recordsProcessed: number;
  invalidLineCount: number;
  elapsedMs: number;
  fileSizeBytes: number | null;
};

export type StreamCaptureTopOfBookResult = {
  topOfBookCount: number;
  invalidLineCount: number;
  summary: JsonlStreamSummary;
};

/**
 * Stream top-of-book JSONL one parsed record at a time.
 * Callers must discard each record after processing; this helper retains none.
 */
export async function streamCaptureTopOfBook(input: {
  path: string;
  io: CaptureHealthAuditIo;
  onRecord: (record: ParsedTopOfBookRecord) => void | Promise<void>;
  onProgress?: (progress: StreamCaptureTopOfBookProgress) => void;
  progressEveryRecords?: number;
}): Promise<StreamCaptureTopOfBookResult> {
  const startedAt = Date.now();
  const fileSizeBytes = input.io.fileSizeBytes?.(input.path) ?? null;
  const progressEveryRecords = input.progressEveryRecords ?? 250_000;
  let topOfBookCount = 0;
  let invalidLineCount = 0;

  const summary = await input.io.iterateJsonl(input.path, {
    onLine: async (line, lineNumber) => {
      let record: ParsedTopOfBookRecord | null;
      try {
        record = parseTopOfBookLine(line, lineNumber);
      } catch {
        invalidLineCount += 1;
        return "skip";
      }
      if (record === null) {
        invalidLineCount += 1;
        return "skip";
      }

      // Consumer/accumulator failures must abort the audit. Do not catch them
      // as invalid JSONL lines.
      await input.onRecord(record);
      topOfBookCount += 1;
      if (
        input.onProgress
        && topOfBookCount > 0
        && topOfBookCount % progressEveryRecords === 0
      ) {
        input.onProgress({
          recordsProcessed: topOfBookCount,
          invalidLineCount,
          elapsedMs: Date.now() - startedAt,
          fileSizeBytes,
        });
      }
      return "continue";
    },
  });

  input.onProgress?.({
    recordsProcessed: topOfBookCount,
    invalidLineCount: summary.invalidLineCount,
    elapsedMs: Date.now() - startedAt,
    fileSizeBytes,
  });

  return {
    topOfBookCount,
    invalidLineCount: summary.invalidLineCount,
    summary,
  };
}
