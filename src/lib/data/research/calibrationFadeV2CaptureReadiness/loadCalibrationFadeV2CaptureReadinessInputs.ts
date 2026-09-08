import { dirname } from "node:path";

import { CAPTURE_LOCK_FILENAME } from "@/lib/data/live/forwardQuoteCapture/captureLock";
import {
  CAPTURE_RUN_STATUS_FILENAME,
  parseCaptureRunStatus,
  type CaptureRunStatusArtifact,
} from "@/lib/data/live/forwardQuoteCapture/captureRunStatus";
import { V2_CANDLE_ARTIFACT_FILENAME } from "../calibrationFadeV2ForwardValidation/calibrationFadeV2ForwardValidationTypes";
import { joinPath } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleUtils";
import {
  isRecord,
  readString,
  resolveSelectedRunId,
} from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";
import {
  loadCalibrationFadeV2HypothesisSpec,
  loadCalibrationFadeV2Provenance,
  type CalibrationFadeV2HypothesisSpec,
  type CalibrationFadeV2ProvenanceManifest,
} from "../calibrationFadeV2Preregistration";

import type { CalibrationFadeV2CaptureReadinessIo } from "./calibrationFadeV2CaptureReadinessTypes";

export type ParsedCaptureHealthIdentity = {
  runId: string | null;
  startedAt: string | null;
  processEpochId: string | null;
  writerFailureArtifact: string | null;
  writerFailureReason: string | null;
  parseable: boolean;
};

export type CalibrationFadeV2CaptureReadinessInputs = {
  selectedRunId: string;
  captureRunDir: string;
  captureRootDir: string;
  directoryExists: boolean;
  statusPath: string;
  healthPath: string;
  candleArtifactPath: string;
  quoteArtifactPath: string;
  spotArtifactPath: string;
  lockPath: string;
  status: CaptureRunStatusArtifact | null;
  statusPresent: boolean;
  health: ParsedCaptureHealthIdentity | null;
  healthPresent: boolean;
  lockRunId: string | null;
  lockPresent: boolean;
  spec: CalibrationFadeV2HypothesisSpec;
  provenance: CalibrationFadeV2ProvenanceManifest;
};

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const parsed: unknown = JSON.parse(normalized);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseCaptureHealthIdentity(text: string): ParsedCaptureHealthIdentity {
  const record = parseJsonObject(text);
  if (!record) {
    return {
      runId: null,
      startedAt: null,
      processEpochId: null,
      writerFailureArtifact: null,
      writerFailureReason: null,
      parseable: false,
    };
  }

  const candles = isRecord(record.btcCandles1m) ? record.btcCandles1m : null;
  const writer = isRecord(record.writer) ? record.writer : null;
  const writerFailure = writer && isRecord(writer.failure) ? writer.failure : null;

  return {
    runId: readString(record.runId),
    startedAt: typeof record.startedAt === "string" ? record.startedAt : null,
    processEpochId: candles ? readString(candles.processEpochId) : null,
    writerFailureArtifact: writerFailure ? readString(writerFailure.artifact) : null,
    writerFailureReason: writerFailure ? readString(writerFailure.reason) : null,
    parseable: true,
  };
}

export function parseCaptureLockRunId(text: string): string | null {
  const record = parseJsonObject(text);
  return record ? readString(record.runId) : null;
}

export function identifiesSelectedCandleWriterFailure(input: {
  status: CaptureRunStatusArtifact | null;
  health: ParsedCaptureHealthIdentity | null;
}): boolean {
  const artifact = input.health?.writerFailureArtifact;
  if (artifact === "btcCandles") {
    return true;
  }
  if (typeof artifact === "string" && artifact.includes("btc-candles-1m")) {
    return true;
  }
  if (input.status?.captureEndReason === "writer-failure") {
    const reason = input.status.failureReason ?? input.health?.writerFailureReason ?? "";
    return /btc-candles|btcCandles|candle sidecar/i.test(reason);
  }
  return false;
}

/** Reads only the selected run directory plus frozen v2 repo artifacts. */
export function loadCalibrationFadeV2CaptureReadinessInputs(input: {
  io: CalibrationFadeV2CaptureReadinessIo;
  captureRunDir: string;
  hypothesisConfigPath: string;
  provenancePath: string;
}): CalibrationFadeV2CaptureReadinessInputs {
  const captureRunDir = input.captureRunDir.replace(/\\/g, "/").replace(/\/$/, "");
  const selectedRunId = resolveSelectedRunId(captureRunDir);
  const captureRootDir = dirname(captureRunDir).replace(/\\/g, "/");
  const directoryExists = input.io.fileExists(captureRunDir) && input.io.isDirectory(captureRunDir);

  const statusPath = joinPath(captureRunDir, CAPTURE_RUN_STATUS_FILENAME);
  const healthPath = joinPath(captureRunDir, "capture-health.json");
  const candleArtifactPath = joinPath(captureRunDir, V2_CANDLE_ARTIFACT_FILENAME);
  const quoteArtifactPath = joinPath(captureRunDir, "top-of-book.jsonl");
  const spotArtifactPath = joinPath(captureRunDir, "btc-spot.jsonl");
  const lockPath = joinPath(captureRootDir, CAPTURE_LOCK_FILENAME);

  const statusPresent = input.io.fileExists(statusPath);
  const status = statusPresent ? parseCaptureRunStatus(input.io.readFile(statusPath)) : null;

  const healthPresent = input.io.fileExists(healthPath);
  const health = healthPresent ? parseCaptureHealthIdentity(input.io.readFile(healthPath)) : null;

  const lockPresent = input.io.fileExists(lockPath);
  const lockRunId = lockPresent ? parseCaptureLockRunId(input.io.readFile(lockPath)) : null;

  const { spec } = loadCalibrationFadeV2HypothesisSpec({
    io: input.io,
    hypothesisConfigPath: input.hypothesisConfigPath,
  });
  const { provenance } = loadCalibrationFadeV2Provenance({
    io: input.io,
    provenancePath: input.provenancePath,
  });

  return {
    selectedRunId,
    captureRunDir,
    captureRootDir,
    directoryExists,
    statusPath,
    healthPath,
    candleArtifactPath,
    quoteArtifactPath,
    spotArtifactPath,
    lockPath,
    status,
    statusPresent,
    health,
    healthPresent,
    lockRunId,
    lockPresent,
    spec,
    provenance,
  };
}
