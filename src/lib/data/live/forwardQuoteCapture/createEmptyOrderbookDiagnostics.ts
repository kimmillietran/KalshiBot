import type { ForwardCaptureOrderbookDiagnostics } from "./forwardQuoteCaptureTypes";

export function createEmptyOrderbookDiagnostics(): ForwardCaptureOrderbookDiagnostics {
  return {
    rawMessageCount: 0,
    snapshotsReceived: 0,
    deltasReceived: 0,
    unknownMessagesReceived: 0,
    sequenceGapCount: 0,
    outOfOrderCount: 0,
    resyncAttemptCount: 0,
    resyncSuccessCount: 0,
    topOfBookRecordsEmitted: 0,
    validTopOfBookRecords: 0,
    sequenceValidTopOfBookRecords: 0,
    economicallyValidTopOfBookRecords: 0,
    parityUsableTopOfBookRecords: 0,
    crossedTopOfBookRecords: 0,
    lockedTopOfBookRecords: 0,
    insufficientDepthTopOfBookRecords: 0,
    awaitingSnapshotTopOfBookRecords: 0,
    invalidPriceTopOfBookRecords: 0,
    marketsWithValidBook: 0,
    marketsAwaitingSnapshot: 0,
    validBookStateDurationMs: 0,
    invalidBookStateDurationMs: 0,
  };
}
