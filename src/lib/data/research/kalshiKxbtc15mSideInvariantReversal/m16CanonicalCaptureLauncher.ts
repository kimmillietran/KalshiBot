/**
 * M16.2a canonical KXBTC15M forward-quote capture launcher.
 * Operational only — does not alter the sealed scientific protocol.
 * No order placement. Live websockets only when explicitly invoked.
 */
import { openSync, closeSync, constants as fsConstants } from "node:fs";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE,
  DEFAULT_FORWARD_QUOTE_CAPTURE_OUTPUT_DIR,
  runForwardQuoteCapture,
  type ForwardQuoteCaptureConfig,
} from "@/lib/data/live/forwardQuoteCapture";
import type { ForwardQuoteCaptureIo } from "@/lib/data/live/forwardQuoteCapture/forwardQuoteCaptureTypes";
import { createNodeForwardCaptureAppendStream } from "@/lib/data/live/forwardQuoteCapture/nodeForwardCaptureAppendStream";
import { DEFAULT_KALSHI_WS_WATCHDOG_CONFIG } from "@/lib/data/live/forwardQuoteCapture/kalshiWsLivenessWatchdog";
import { hashCaptureTopOfBookIdentity } from "@/lib/data/research/kalshiTobMomentumValidationCohort";

import { M16_STANDARD_SEGMENT_DURATION_MINUTES } from "./m16ProspectiveCohortPlan";
import {
  M16ValidationCollectionError,
  type M16ValidationCaptureLauncherResult,
  type M16ValidationReservation,
} from "./m16ValidationCohortTypes";

export const M16_VALIDATION_ALLOW_LIVE_CAPTURE_ENV =
  "M16_VALIDATION_ALLOW_LIVE_CAPTURE" as const;

export const M16_CANONICAL_CAPTURE_SERIES = "KXBTC15M" as const;

export function isM16LiveCaptureAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[M16_VALIDATION_ALLOW_LIVE_CAPTURE_ENV] === "1";
}

/**
 * Build the sealed operational capture config for one M16 validation segment.
 * Workload matches canonical KXBTC15M profile; duration is the sealed 240m.
 */
export function buildM16CanonicalForwardQuoteCaptureConfig(input?: {
  durationMinutes?: number;
  outputDir?: string;
  dryRun?: boolean;
}): ForwardQuoteCaptureConfig {
  const duration =
    input?.durationMinutes ?? M16_STANDARD_SEGMENT_DURATION_MINUTES;
  if (duration !== M16_STANDARD_SEGMENT_DURATION_MINUTES) {
    throw new M16ValidationCollectionError(
      `M16.2a capture duration must be ${M16_STANDARD_SEGMENT_DURATION_MINUTES}m; got ${duration}`,
    );
  }
  const profile = CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE;
  return {
    series: profile.series,
    durationMinutes: duration,
    maxMarkets: profile.maxMarkets,
    outputDir: input?.outputDir ?? DEFAULT_FORWARD_QUOTE_CAPTURE_OUTPUT_DIR,
    dryRun: input?.dryRun ?? false,
    captureBtcSpot: profile.captureBtcSpot,
    rolloverCheckSeconds: 30,
    healthFlushSeconds: 60,
    topOfBookThrottleMs: profile.topOfBookThrottleMs,
    wsWatchdogEnabled: profile.wsWatchdogEnabled,
    wsSoftSilenceThresholdMs:
      DEFAULT_KALSHI_WS_WATCHDOG_CONFIG.wsSoftSilenceThresholdMs,
    wsHardStallThresholdMs:
      DEFAULT_KALSHI_WS_WATCHDOG_CONFIG.wsHardStallThresholdMs,
    wsProbeGraceMs: DEFAULT_KALSHI_WS_WATCHDOG_CONFIG.wsProbeGraceMs,
    wsRecoveryMaxAttempts:
      DEFAULT_KALSHI_WS_WATCHDOG_CONFIG.wsRecoveryMaxAttempts,
    priceRepresentation: profile.priceRepresentation,
  };
}

export function createProductionM16CaptureIo(): ForwardQuoteCaptureIo {
  return {
    readFile: (path) => readFileSync(path, "utf8"),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    appendFile: (path, data) => appendFileSync(path, data, "utf8"),
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
    createAppendStream: createNodeForwardCaptureAppendStream,
    renameFile: (from, to) => renameSync(from, to),
    createExclusiveFile: (path, data) => {
      const fd = openSync(path, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY);
      try {
        writeFileSync(fd, data, "utf8");
      } finally {
        closeSync(fd);
      }
    },
    deleteFile: (path) => unlinkSync(path),
    now: () => new Date(),
    monotonicNowMs: () => performance.now(),
  };
}

export type M16CanonicalCaptureLauncherDeps = {
  runCapture?: typeof runForwardQuoteCapture;
  createIo?: () => ForwardQuoteCaptureIo;
  hashTopOfBook?: (tobPath: string) => Promise<string>;
  assertLiveAllowed?: () => void;
};

/**
 * Canonical live launcher. Requires M16_VALIDATION_ALLOW_LIVE_CAPTURE=1.
 * Does not place orders. Returns identity fields for post-capture admit.
 */
export async function launchM16CanonicalForwardQuoteCapture(
  input: {
    reservation: M16ValidationReservation;
    windowStartIso: string;
    durationMinutes: number;
  },
  deps: M16CanonicalCaptureLauncherDeps = {},
): Promise<M16ValidationCaptureLauncherResult> {
  const assertLive =
    deps.assertLiveAllowed
    ?? (() => {
      if (!isM16LiveCaptureAllowed()) {
        throw new M16ValidationCollectionError(
          "real capture disabled; set M16_VALIDATION_ALLOW_LIVE_CAPTURE=1",
        );
      }
    });
  assertLive();

  if (input.durationMinutes !== M16_STANDARD_SEGMENT_DURATION_MINUTES) {
    throw new M16ValidationCollectionError(
      `launcher duration must be ${M16_STANDARD_SEGMENT_DURATION_MINUTES}m`,
    );
  }
  if (input.windowStartIso !== input.reservation.plannedStartIso) {
    throw new M16ValidationCollectionError(
      "launcher windowStartIso must match reservation plannedStartIso "
        + `(no shifted window)`,
    );
  }
  if (input.reservation.fixedUtcWindow !== "18:00-22:00Z") {
    throw new M16ValidationCollectionError(
      "launcher refuses non-18:00–22:00Z reservation",
    );
  }

  const config = buildM16CanonicalForwardQuoteCaptureConfig({
    durationMinutes: input.durationMinutes,
    dryRun: false,
  });
  if (config.series !== M16_CANONICAL_CAPTURE_SERIES) {
    throw new M16ValidationCollectionError("series must be KXBTC15M");
  }

  const runCapture = deps.runCapture ?? runForwardQuoteCapture;
  const io = (deps.createIo ?? createProductionM16CaptureIo)();
  const result = await runCapture({ config, io });

  const captureRunDir = join(config.outputDir, result.runId).replaceAll("\\", "/");
  const tobPath = join(captureRunDir, "top-of-book.jsonl");
  const hashTopOfBook =
    deps.hashTopOfBook ?? ((p: string) => hashCaptureTopOfBookIdentity(p));
  const captureIdentityHash = await hashTopOfBook(tobPath);

  return {
    runId: result.runId,
    captureRunDir,
    captureIdentityHash,
    captureStartIso: input.reservation.plannedStartIso,
    captureEndIso: input.reservation.plannedEndIso,
  };
}
