import {
  DEFAULT_CAPTURE_HEALTH_AUDIT_HTML_OUTPUT_PATH,
  DEFAULT_CAPTURE_HEALTH_AUDIT_OUTPUT_PATH,
  CaptureHealthAuditError,
} from "@/lib/data/research/captureHealthAudit";
import type { JsonlIo } from "@/lib/data/research/jsonl";

export class CaptureHealthAuditCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureHealthAuditCommandError";
  }
}

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

function readNumericFlag(argv: readonly string[], flag: string): number | undefined {
  const value = readFlagValue(argv, flag);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseCaptureRunDirFromArgv(argv: readonly string[]): string {
  const captureRunDir = readFlagValue(argv, "--capture-run-dir");
  if (!captureRunDir) {
    throw new CaptureHealthAuditCommandError("--capture-run-dir is required");
  }

  return captureRunDir;
}

export function parseOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--output") ?? DEFAULT_CAPTURE_HEALTH_AUDIT_OUTPUT_PATH;
}

export function parseHtmlOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--html-output") ?? DEFAULT_CAPTURE_HEALTH_AUDIT_HTML_OUTPUT_PATH;
}

export function parseThresholdOverridesFromArgv(argv: readonly string[]) {
  return {
    minDurationSeconds: readNumericFlag(argv, "--min-duration-seconds"),
    maxP90TopOfBookGapMs: readNumericFlag(argv, "--max-p90-gap-ms"),
    minValidBookShare: readNumericFlag(argv, "--min-valid-book-share"),
    minBtcJoinCoverageShare: readNumericFlag(argv, "--min-btc-join-share"),
    maxZeroSpreadShare: readNumericFlag(argv, "--max-zero-spread-share"),
    btcJoinMaxDistanceMs: readNumericFlag(argv, "--btc-join-max-distance-ms"),
  };
}

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof CaptureHealthAuditCommandError) {
    return error.message;
  }

  if (error instanceof CaptureHealthAuditError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Capture health audit failed";
}

export type CaptureHealthAuditCommandIo = JsonlIo & {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  isDirectory: (path: string) => boolean;
  fileExists?: (path: string) => boolean;
  unlinkFile?: (path: string) => void;
  renameFile?: (from: string, to: string) => void;
};
