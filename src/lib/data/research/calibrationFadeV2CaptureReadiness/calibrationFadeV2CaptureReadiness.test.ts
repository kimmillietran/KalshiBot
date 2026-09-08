import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createMemoryCalibrationFadeForwardValidationIo } from "../calibrationFadeForwardValidation/createCalibrationFadeForwardValidationIo";
import {
  CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
  CALIBRATION_FADE_V2_FREEZE_TIMESTAMP,
  DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
  DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
  PENDING_FREEZE_IDENTITY,
} from "../calibrationFadeV2Preregistration";
import { V2_CANDLE_CLOSE_OFFSET_MS } from "../calibrationFadeV2ForwardValidation/calibrationFadeV2ForwardValidationTypes";

import { buildCalibrationFadeV2CaptureReadiness } from "./buildCalibrationFadeV2CaptureReadiness";
import {
  CalibrationFadeV2CaptureReadinessError,
  V2_CAPTURE_READINESS_VERDICT_PRECEDENCE,
  V2_READINESS_REQUIRED_CLOSE_COUNT,
  V2_READINESS_REQUIRED_PRODUCT_ID,
  V2_READINESS_REQUIRED_PROVIDER,
  V2_READINESS_REQUIRED_SOURCE,
  V2_READINESS_REQUIRED_SOURCE_RECORD_TYPE,
} from "./calibrationFadeV2CaptureReadinessTypes";
import { evaluateCalibrationFadeV2CaptureReadiness } from "./evaluateCalibrationFadeV2CaptureReadiness";
import { parseCalibrationFadeV2CaptureReadinessArgv } from "./parseCalibrationFadeV2CaptureReadinessArgv";
import { resolveCalibrationFadeV2CaptureReadinessOutputPaths } from "./resolveCalibrationFadeV2CaptureReadinessOutputPaths";
import { serializeCalibrationFadeV2CaptureReadinessHtml } from "./serializeCalibrationFadeV2CaptureReadiness";

const V2_CONFIG_TEXT = readFileSync(DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH, "utf8");
const V2_PROVENANCE_TEXT = readFileSync(DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH, "utf8");
const FREEZE_MS = Date.parse(CALIBRATION_FADE_V2_FREEZE_TIMESTAMP);
const POST_FREEZE = new Date(FREEZE_MS + 1).toISOString();
const EQUAL_FREEZE = CALIBRATION_FADE_V2_FREEZE_TIMESTAMP;
const PRE_FREEZE = new Date(FREEZE_MS - 1).toISOString();
const GENERATED_AT = "2026-09-07T18:00:00.000Z";
const EPOCH = "epoch-ready-1";
const OPEN0_MS = Date.parse("2026-09-07T12:00:00.000Z");
const OBSERVED_MS = OPEN0_MS + 11 * 60_000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function runDir(runId: string): string {
  return `tmp/v2-readiness-fixtures/forward-quotes/${runId}`;
}

function captureRoot(): string {
  return "tmp/v2-readiness-fixtures/forward-quotes";
}

function candleRow(input: {
  runId: string;
  openTimeMs: number;
  closeOffsetMs?: number;
  observedAtMs?: number;
  firstObservedAtMs?: number;
  requestStartedAtMs?: number;
  processEpochId?: string;
  provider?: string;
  productId?: string;
  sourceRecordType?: string;
  source?: string;
  granularityMs?: number;
  revisionClass?: string;
  ohlc?: { open: number; high: number; low: number; close: number };
  omit?: readonly string[];
}): string {
  const open = input.ohlc?.open ?? 100_000;
  const record: Record<string, unknown> = {
    runId: input.runId,
    processEpochId: input.processEpochId ?? EPOCH,
    provider: input.provider ?? V2_READINESS_REQUIRED_PROVIDER,
    productId: input.productId ?? V2_READINESS_REQUIRED_PRODUCT_ID,
    sourceRecordType: input.sourceRecordType ?? V2_READINESS_REQUIRED_SOURCE_RECORD_TYPE,
    source: input.source ?? V2_READINESS_REQUIRED_SOURCE,
    granularityMs: input.granularityMs ?? 60_000,
    candleOpenTime: iso(input.openTimeMs),
    candleCloseTime: iso(input.openTimeMs + (input.closeOffsetMs ?? V2_CANDLE_CLOSE_OFFSET_MS)),
    open,
    high: input.ohlc?.high ?? open + 10,
    low: input.ohlc?.low ?? open - 10,
    close: input.ohlc?.close ?? open,
    volume: 1,
    observedAtLocal: iso(input.observedAtMs ?? OBSERVED_MS),
    firstObservedAtLocal: iso(input.firstObservedAtMs ?? input.observedAtMs ?? OBSERVED_MS),
    requestStartedAtLocal: iso(input.requestStartedAtMs ?? (input.observedAtMs ?? OBSERVED_MS) - 50),
    retrievalMethod: "rest-poll",
    revisionClass: input.revisionClass ?? "first-observation",
    observationIndex: 1,
  };
  for (const key of input.omit ?? []) {
    delete record[key];
  }
  return JSON.stringify(record);
}

function candles(runId: string, count: number, openTimes?: readonly number[]): string {
  const times = openTimes ?? Array.from({ length: count }, (_, index) => OPEN0_MS + index * 60_000);
  const lastCloseMs = Math.max(...times) + V2_CANDLE_CLOSE_OFFSET_MS;
  const observedAtMs = Math.max(OBSERVED_MS, lastCloseMs + 1_000);
  return times.map((openTimeMs) => candleRow({ runId, openTimeMs, observedAtMs, firstObservedAtMs: observedAtMs })).join("\n");
}

function quoteRow(): string {
  return JSON.stringify({
    marketTicker: "KXBTC15M-26SEP071200-00",
    receivedAtLocal: iso(OBSERVED_MS),
    exchangeTimestampMs: OBSERVED_MS,
  });
}

function spotRow(): string {
  return JSON.stringify({
    receivedAtLocal: iso(OBSERVED_MS - 1_000),
    timestamp: iso(OBSERVED_MS - 1_000),
    priceUsd: 100_123.5,
  });
}

function statusArtifact(input: {
  runId: string;
  startedAt: string;
  state?: "active" | "finalizing" | "completed" | "failed" | "user-cancelled";
  endedAt?: string | null;
  captureEndReason?: string | null;
  failureReason?: string | null;
}): string {
  const state = input.state ?? "completed";
  const terminal = state === "completed" || state === "failed" || state === "user-cancelled";
  return `${JSON.stringify({
    schemaVersion: 1,
    runId: input.runId,
    state,
    startedAt: input.startedAt,
    updatedAt: input.startedAt,
    endedAt: input.endedAt === undefined ? (terminal ? iso(OBSERVED_MS + 60_000) : null) : input.endedAt,
    captureEndReason: input.captureEndReason ?? (state === "completed" ? "duration-complete" : null),
    failureReason: input.failureReason ?? null,
  }, null, 2)}\n`;
}

function healthArtifact(input: {
  runId: string;
  startedAt: string;
  processEpochId?: string | null;
  writerFailure?: { artifact: string; reason: string } | null;
}): string {
  return `${JSON.stringify({
    runId: input.runId,
    startedAt: input.startedAt,
    config: { durationSeconds: 60 },
    btcCandles1m: { processEpochId: input.processEpochId ?? EPOCH },
    writer: { failure: input.writerFailure ?? null },
  })}\n`;
}

function fixture(input: {
  runId: string;
  startedAt?: string;
  status?: string;
  health?: string | null;
  candleLines?: string | null;
  quotes?: string | null;
  spots?: string | null;
  lock?: string | null;
  provenance?: string;
  config?: string;
}): { dirs: string[]; files: Record<string, string> } {
  const captureRunDir = runDir(input.runId);
  const startedAt = input.startedAt ?? POST_FREEZE;
  const files: Record<string, string> = {
    [DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH]: input.config ?? V2_CONFIG_TEXT,
    [DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH]: input.provenance ?? V2_PROVENANCE_TEXT,
    [`${captureRunDir}/capture-run-status.json`]:
      input.status ?? statusArtifact({ runId: input.runId, startedAt }),
  };
  if (input.health !== null) {
    files[`${captureRunDir}/capture-health.json`] =
      input.health ?? healthArtifact({ runId: input.runId, startedAt });
  }
  if (input.candleLines !== null) {
    files[`${captureRunDir}/btc-candles-1m.jsonl`] =
      input.candleLines ?? candles(input.runId, V2_READINESS_REQUIRED_CLOSE_COUNT);
  }
  if (input.quotes !== null) {
    files[`${captureRunDir}/top-of-book.jsonl`] = input.quotes ?? quoteRow();
  }
  if (input.spots !== null) {
    files[`${captureRunDir}/btc-spot.jsonl`] = input.spots ?? spotRow();
  }
  if (input.lock) {
    files[`${captureRoot()}/capture.lock`] = input.lock;
  }
  return {
    dirs: [captureRunDir, captureRoot(), "tmp/v2-readiness-fixtures"],
    files,
  };
}

async function evaluate(input: {
  runId: string;
  files: Record<string, string>;
  dirs: string[];
}) {
  const captureRunDir = runDir(input.runId);
  const io = createMemoryCalibrationFadeForwardValidationIo(input.files, input.dirs);
  return evaluateCalibrationFadeV2CaptureReadiness({
    generatedAt: GENERATED_AT,
    config: {
      captureRunDir,
      hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
      provenancePath: DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
    },
    paths: resolveCalibrationFadeV2CaptureReadinessOutputPaths({ captureRunDir }),
    io,
  });
}

function moduleSources(): string {
  const root = "src/lib/data/research/calibrationFadeV2CaptureReadiness";
  return [
    "calibrationFadeV2CaptureReadinessTypes.ts",
    "parseCalibrationFadeV2CaptureReadinessArgv.ts",
    "resolveCalibrationFadeV2CaptureReadinessOutputPaths.ts",
    "loadCalibrationFadeV2CaptureReadinessInputs.ts",
    "parseStrictLiveCandleObservation.ts",
    "probeQuoteAndSpotSources.ts",
    "evaluateCalibrationFadeV2CaptureReadiness.ts",
    "serializeCalibrationFadeV2CaptureReadiness.ts",
    "buildCalibrationFadeV2CaptureReadiness.ts",
    "index.ts",
  ]
    .map((name) => readFileSync(`${root}/${name}`, "utf8"))
    .join("\n");
}

describe("calibration-fade v2 exact-run capture readiness", () => {
  it("1. explicit valid exact run is v2-capture-ready", async () => {
    const runId = "ready-run";
    const built = fixture({ runId });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-ready");
    expect(report.classification).toBe("capture-source-readiness");
    expect(report.confirmatoryEligibility).toBe(true);
    expect(report.distinctValidCompletedMinutes).toBe(11);
    expect(report.recommendedNextAction).toBe("evaluate-exact-run-under-governed-evidence-mode");
    expect(report.blockingReasons).toEqual([]);
    expect(report.freezeCommitSha).toBe(CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA);
    expect(report.freezeTimestamp).toBe(CALIBRATION_FADE_V2_FREEZE_TIMESTAMP);
    expect(report.sourceContract.requireBtcJoin).toBe(true);
    expect(report.sourceContract.maximumSourceGapMs).toBeNull();
    expect(report.jsonOutputPath).toBe(
      `data/research-results/calibration-fade-v2/readiness/${runId}/capture-readiness.json`,
    );
    expect(report.htmlOutputPath).toBe(
      `data/reports/calibration-fade-v2/readiness/${runId}/capture-readiness.html`,
    );
  });

  it("2. --latest is rejected", () => {
    expect(() => parseCalibrationFadeV2CaptureReadinessArgv(["--latest"])).toThrow(
      /does not support --latest/,
    );
  });

  it("3. --use-latest is rejected", () => {
    expect(() => parseCalibrationFadeV2CaptureReadinessArgv(["--use-latest"])).toThrow(
      /does not support --use-latest/,
    );
  });

  it("4. missing --capture-run-dir is rejected", () => {
    expect(() => parseCalibrationFadeV2CaptureReadinessArgv([])).toThrow(/--capture-run-dir is required/);
  });

  it("5. invalid run directory is identity-invalid", async () => {
    const runId = "missing-dir";
    const files = {
      [DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH]: V2_CONFIG_TEXT,
      [DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH]: V2_PROVENANCE_TEXT,
    };
    const report = await evaluate({ runId, files, dirs: [] });
    expect(report.verdict).toBe("v2-run-identity-invalid");
    expect(report.blockingReasons).toContain("capture-run-dir-missing");
  });

  it("6. status runId mismatch is identity-invalid", async () => {
    const runId = "status-mismatch";
    const built = fixture({
      runId,
      status: statusArtifact({ runId: "other-run", startedAt: POST_FREEZE }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-run-identity-invalid");
    expect(report.blockingReasons).toContain("status-run-id-mismatch");
  });

  it("7. health runId mismatch is identity-invalid", async () => {
    const runId = "health-mismatch";
    const built = fixture({
      runId,
      health: healthArtifact({ runId: "other-run", startedAt: POST_FREEZE }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-run-identity-invalid");
    expect(report.blockingReasons).toContain("health-run-id-mismatch");
  });

  it("8. health/status startedAt disagreement is started-at-unavailable", async () => {
    const runId = "started-disagree";
    const built = fixture({
      runId,
      status: statusArtifact({ runId, startedAt: POST_FREEZE }),
      health: healthArtifact({ runId, startedAt: iso(FREEZE_MS + 5_000) }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-started-at-unavailable");
    expect(report.blockingReasons).toContain("health-status-started-at-disagreement");
  });

  it("9. active status is not terminal", async () => {
    const runId = "active-run";
    const built = fixture({
      runId,
      status: statusArtifact({ runId, startedAt: POST_FREEZE, state: "active" }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-not-terminal");
  });

  it("10. finalizing status is not terminal", async () => {
    const runId = "finalizing-run";
    const built = fixture({
      runId,
      status: statusArtifact({ runId, startedAt: POST_FREEZE, state: "finalizing" }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-not-terminal");
  });

  it("11. selected-run lock present is not terminal and is not deleted", async () => {
    const runId = "locked-run";
    const lock = `${JSON.stringify({ runId, pid: 1, acquiredAt: POST_FREEZE })}\n`;
    const built = fixture({ runId, lock });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-not-terminal");
    expect(report.blockingReasons).toContain("selected-run-lock-present");
    expect(built.files[`${captureRoot()}/capture.lock`]).toBe(lock);
  });

  it("12. missing candles are source-unavailable", async () => {
    const runId = "no-candles";
    const built = fixture({ runId, candleLines: null });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-source-unavailable");
    expect(report.blockingReasons).toContain("candle-artifact-missing");
  });

  it("13. empty candles are source-unavailable", async () => {
    const runId = "empty-candles";
    const built = fixture({ runId, candleLines: "\n\n" });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-source-unavailable");
    expect(report.blockingReasons).toContain("candle-artifact-empty");
  });

  it("14. malformed candle JSONL is identity-invalid", async () => {
    const runId = "malformed-candles";
    const built = fixture({ runId, candleLines: "{not-json" });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-jsonl-malformed");
  });

  it("15. missing candle runId is identity-invalid", async () => {
    const runId = "missing-candle-runid";
    const built = fixture({
      runId,
      candleLines: candleRow({ runId, openTimeMs: OPEN0_MS, omit: ["runId"] }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-run-id-missing");
  });

  it("16. foreign candle runId is identity-invalid", async () => {
    const runId = "foreign-candle-runid";
    const built = fixture({
      runId,
      candleLines: candles("other-run", 11),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-run-id-mismatch");
  });

  it("17. mixed candle runIds are identity-invalid", async () => {
    const runId = "mixed-candle-runid";
    const built = fixture({
      runId,
      candleLines: `${candles(runId, 10)}\n${candleRow({ runId: "other-run", openTimeMs: OPEN0_MS + 10 * 60_000 })}`,
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-run-id-mixed");
  });

  it("18. missing processEpochId is identity-invalid", async () => {
    const runId = "missing-epoch";
    const built = fixture({
      runId,
      candleLines: candleRow({ runId, openTimeMs: OPEN0_MS, omit: ["processEpochId"] }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-process-epoch-missing");
  });

  it("19. mixed processEpochId is identity-invalid", async () => {
    const runId = "mixed-epoch";
    const built = fixture({
      runId,
      candleLines: `${candleRow({ runId, openTimeMs: OPEN0_MS, processEpochId: "epoch-a" })}\n${candleRow({ runId, openTimeMs: OPEN0_MS + 60_000, processEpochId: "epoch-b" })}`,
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-process-epoch-mixed");
  });

  it("20. health epoch mismatch is identity-invalid", async () => {
    const runId = "health-epoch-mismatch";
    const built = fixture({
      runId,
      health: healthArtifact({ runId, startedAt: POST_FREEZE, processEpochId: "epoch-other" }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-health-epoch-mismatch");
  });

  it("21. wrong provider is identity-invalid", async () => {
    const runId = "wrong-provider";
    const built = fixture({
      runId,
      candleLines: candleRow({ runId, openTimeMs: OPEN0_MS, provider: "binance" }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-provider-invalid");
  });

  it("22. wrong product is identity-invalid", async () => {
    const runId = "wrong-product";
    const built = fixture({
      runId,
      candleLines: candleRow({ runId, openTimeMs: OPEN0_MS, productId: "ETH-USD" }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-product-invalid");
  });

  it("23. wrong sourceRecordType is identity-invalid", async () => {
    const runId = "wrong-source-record";
    const built = fixture({
      runId,
      candleLines: candleRow({ runId, openTimeMs: OPEN0_MS, sourceRecordType: "btc-spot-jsonl-points" }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-source-record-type-invalid");
  });

  it("24. source=coinbase-spot alias is rejected for readiness", async () => {
    const runId = "source-alias";
    const built = fixture({
      runId,
      candleLines: candleRow({ runId, openTimeMs: OPEN0_MS, source: "coinbase-spot" }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-source-alias-rejected");
  });

  it("25. wrong granularity is identity-invalid", async () => {
    const runId = "wrong-granularity";
    const built = fixture({
      runId,
      candleLines: candleRow({ runId, openTimeMs: OPEN0_MS, granularityMs: 300_000 }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-granularity-invalid");
  });

  it("26. bad open/close ISO is identity-invalid", async () => {
    const runId = "bad-iso";
    const row = JSON.parse(candleRow({ runId, openTimeMs: OPEN0_MS })) as Record<string, unknown>;
    row.candleOpenTime = "not-a-timestamp";
    const built = fixture({ runId, candleLines: JSON.stringify(row) });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-open-close-invalid");
  });

  it("27. close offset +60000 is rejected", async () => {
    const runId = "close-60000";
    const built = fixture({
      runId,
      candleLines: candleRow({ runId, openTimeMs: OPEN0_MS, closeOffsetMs: 60_000 }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-close-offset-invalid");
  });

  it("28. close offset +59999 is accepted on an otherwise ready run", async () => {
    const runId = "close-59999";
    const built = fixture({ runId });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-ready");
    expect(JSON.parse(built.files[`${runDir(runId)}/btc-candles-1m.jsonl`]!.split("\n")[0]!).candleCloseTime)
      .toBe(iso(OPEN0_MS + 59_999));
  });

  it("29. in-progress persisted candle is rejected", async () => {
    const runId = "in-progress";
    const built = fixture({
      runId,
      candleLines: candleRow({
        runId,
        openTimeMs: OPEN0_MS,
        observedAtMs: OPEN0_MS + 30_000,
        firstObservedAtMs: OPEN0_MS + 30_000,
        revisionClass: "first-observation",
      }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-in-progress");
  });

  it("30. firstObserved > observed is rejected", async () => {
    const runId = "first-after-observed";
    const built = fixture({
      runId,
      candleLines: candleRow({
        runId,
        openTimeMs: OPEN0_MS,
        observedAtMs: OBSERVED_MS,
        firstObservedAtMs: OBSERVED_MS + 1_000,
        revisionClass: "volume-only",
      }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-observer-clock-invalid");
  });

  it("31. revision firstObserved before current request is accepted", async () => {
    const runId = "revision-clocks";
    const requestStartedAtMs = OBSERVED_MS - 10;
    const firstRow = candleRow({
      runId,
      openTimeMs: OPEN0_MS,
      observedAtMs: OBSERVED_MS - 20,
      firstObservedAtMs: OBSERVED_MS - 20,
      requestStartedAtMs: OBSERVED_MS - 30,
      revisionClass: "first-observation",
    });
    const revision = candleRow({
      runId,
      openTimeMs: OPEN0_MS,
      observedAtMs: OBSERVED_MS,
      firstObservedAtMs: OBSERVED_MS - 20,
      requestStartedAtMs,
      revisionClass: "volume-only",
    });
    const rest = candles(runId, 10, Array.from({ length: 10 }, (_, index) => OPEN0_MS + (index + 1) * 60_000));
    const built = fixture({ runId, candleLines: `${firstRow}\n${revision}\n${rest}` });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-ready");
    expect(report.candleRecordCount).toBe(12);
    expect(report.distinctValidCompletedMinutes).toBe(11);
  });

  it("32. first-observation firstObserved != observed is rejected", async () => {
    const runId = "first-obs-mismatch";
    const built = fixture({
      runId,
      candleLines: candleRow({
        runId,
        openTimeMs: OPEN0_MS,
        observedAtMs: OBSERVED_MS,
        firstObservedAtMs: OBSERVED_MS - 1_000,
        revisionClass: "first-observation",
      }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-first-observation-clock-mismatch");
  });

  it("33. invalid OHLC is rejected", async () => {
    const runId = "bad-ohlc";
    const built = fixture({
      runId,
      candleLines: candleRow({
        runId,
        openTimeMs: OPEN0_MS,
        ohlc: { open: 100, high: 90, low: 95, close: 100 },
      }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-ohlc-invalid");
  });

  it("34. conflicting closeTime for same open is rejected", async () => {
    const runId = "close-conflict";
    const first = candleRow({ runId, openTimeMs: OPEN0_MS, closeOffsetMs: 59_999 });
    const second = candleRow({ runId, openTimeMs: OPEN0_MS, closeOffsetMs: 60_000 });
    const built = fixture({ runId, candleLines: `${first}\n${second}` });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-close-identity-conflict");
  });

  it("35. append revision is accepted", async () => {
    const runId = "append-revision";
    const first = candleRow({
      runId,
      openTimeMs: OPEN0_MS,
      revisionClass: "first-observation",
    });
    const revision = candleRow({
      runId,
      openTimeMs: OPEN0_MS,
      observedAtMs: OBSERVED_MS + 1_000,
      firstObservedAtMs: OBSERVED_MS,
      requestStartedAtMs: OBSERVED_MS + 900,
      revisionClass: "ohlc-revision",
      ohlc: { open: 100_000, high: 100_050, low: 99_950, close: 100_020 },
    });
    const rest = candles(runId, 10, Array.from({ length: 10 }, (_, index) => OPEN0_MS + (index + 1) * 60_000));
    const built = fixture({ runId, candleLines: `${first}\n${revision}\n${rest}` });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-ready");
  });

  it("36. 10 distinct valid minutes are diagnostic-only", async () => {
    const runId = "ten-minutes";
    const built = fixture({ runId, candleLines: candles(runId, 10) });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-diagnostic-only");
    expect(report.blockingReasons).toContain("insufficient-distinct-completed-minutes");
    expect(report.distinctValidCompletedMinutes).toBe(10);
    expect(report.recommendedNextAction).toBe("diagnostic-evaluator-only");
  });

  it("37. 11 distinct valid minutes are sufficient", async () => {
    const runId = "eleven-minutes";
    const built = fixture({ runId, candleLines: candles(runId, 11) });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-ready");
    expect(report.distinctValidCompletedMinutes).toBe(11);
  });

  it("38. 11 nonconsecutive valid minutes are sufficient", async () => {
    const runId = "nonconsecutive";
    const openTimes = Array.from({ length: 11 }, (_, index) => OPEN0_MS + index * 5 * 60_000);
    const built = fixture({ runId, candleLines: candles(runId, 11, openTimes) });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-ready");
    expect(report.distinctValidCompletedMinutes).toBe(11);
  });

  it("39. missing TOB is quote-source-unavailable", async () => {
    const runId = "missing-tob";
    const built = fixture({ runId, quotes: null });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-quote-source-unavailable");
    expect(report.blockingReasons).toContain("quote-artifact-missing");
  });

  it("40. unparseable-only TOB is quote-source-unavailable", async () => {
    const runId = "bad-tob";
    const built = fixture({ runId, quotes: "{\"noTicker\":true}\nnot-json" });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-quote-source-unavailable");
    expect(report.blockingReasons).toContain("quote-artifact-unparseable-only");
  });

  it("41. missing spot with requireBtcJoin=true is spot-join-source-unavailable", async () => {
    const runId = "missing-spot";
    const built = fixture({ runId, spots: null });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-spot-join-source-unavailable");
    expect(report.blockingReasons).toContain("spot-artifact-missing");
    expect(report.sourceContract.requireBtcJoin).toBe(true);
  });

  it("42. unparseable-only spot is spot-join-source-unavailable", async () => {
    const runId = "bad-spot";
    const built = fixture({ runId, spots: "{\"priceUsd\":\"x\"}" });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-spot-join-source-unavailable");
    expect(report.blockingReasons).toContain("spot-artifact-unparseable-only");
  });

  it("43. pre-freeze run is boundary-ineligible", async () => {
    const runId = "pre-freeze";
    const built = fixture({ runId, startedAt: PRE_FREEZE });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-prospective-boundary-ineligible");
    expect(report.confirmatoryEligibility).toBe(false);
    expect(report.recommendedNextAction).toBe("diagnostic-evaluator-only");
  });

  it("44. exactly-equal freeze timestamp is boundary-ineligible", async () => {
    const runId = "equal-freeze";
    const built = fixture({ runId, startedAt: EQUAL_FREEZE });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-prospective-boundary-ineligible");
    expect(report.confirmatoryEligibility).toBe(false);
  });

  it("45. post-freeze run is eligible", async () => {
    const runId = "post-freeze";
    const built = fixture({ runId, startedAt: POST_FREEZE });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-ready");
    expect(report.confirmatoryEligibility).toBe(true);
  });

  it("46. missing startedAt is started-at-unavailable", async () => {
    const runId = "missing-started";
    const health = JSON.parse(healthArtifact({ runId, startedAt: POST_FREEZE })) as Record<string, unknown>;
    health.startedAt = "not-an-iso-timestamp";
    const built = fixture({
      runId,
      status: statusArtifact({ runId, startedAt: POST_FREEZE }),
      health: `${JSON.stringify(health)}\n`,
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-started-at-unavailable");
    expect(report.blockingReasons).toContain("capture-started-at-unparseable");
  });

  it("47. canonical freeze pending/wrong identity fails closed", async () => {
    const runId = "pending-freeze";
    const pendingDoc = JSON.parse(V2_PROVENANCE_TEXT) as Record<string, unknown>;
    const boundary = pendingDoc.prospectiveEvidenceBoundary as Record<string, unknown>;
    boundary.freezeCommitSha = PENDING_FREEZE_IDENTITY;
    boundary.freezeTimestamp = PENDING_FREEZE_IDENTITY;
    pendingDoc.v2FreezeCommitSha = PENDING_FREEZE_IDENTITY;
    pendingDoc.v2FreezeCommitTimestamp = PENDING_FREEZE_IDENTITY;
    pendingDoc.originalFreezeCommitSha = PENDING_FREEZE_IDENTITY;
    const pendingBuilt = fixture({ runId, provenance: `${JSON.stringify(pendingDoc)}\n` });
    const pendingReport = await evaluate({ runId, ...pendingBuilt });
    expect(pendingReport.verdict).toBe("v2-prospective-boundary-ineligible");
    expect(pendingReport.blockingReasons).toContain("freeze-identity-not-finalized");
    expect(pendingReport.confirmatoryEligibility).toBe(false);

    const wrongDoc = JSON.parse(V2_PROVENANCE_TEXT) as Record<string, unknown>;
    const wrongBoundary = wrongDoc.prospectiveEvidenceBoundary as Record<string, unknown>;
    wrongBoundary.freezeCommitSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    wrongDoc.v2FreezeCommitSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    wrongDoc.originalFreezeCommitSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const wrongBuilt = fixture({
      runId: "wrong-freeze",
      provenance: `${JSON.stringify(wrongDoc)}\n`,
    });
    await expect(evaluate({ runId: "wrong-freeze", ...wrongBuilt })).rejects.toThrow(
      /freeze|pending|canonical|fails closed|must be/i,
    );
  });

  it("48. terminal failed capture with trustworthy artifacts can still be ready", async () => {
    const runId = "failed-but-trustworthy";
    const built = fixture({
      runId,
      status: statusArtifact({
        runId,
        startedAt: POST_FREEZE,
        state: "failed",
        captureEndReason: "unexpected-error",
        failureReason: "websocket ended",
      }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-ready");
    expect(report.captureTerminalState).toBe("failed");
  });

  it("49. candle writer durability failure is candle-identity-invalid", async () => {
    const runId = "writer-fail";
    const built = fixture({
      runId,
      status: statusArtifact({
        runId,
        startedAt: POST_FREEZE,
        state: "failed",
        captureEndReason: "writer-failure",
        failureReason: "btcCandles disk full",
      }),
      health: healthArtifact({
        runId,
        startedAt: POST_FREEZE,
        writerFailure: { artifact: "btcCandles", reason: "disk full" },
      }),
    });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-candle-identity-invalid");
    expect(report.blockingReasons).toContain("candle-writer-durability-failure");
  });

  it("50. v1 capture-too-short does not block v2 readiness", async () => {
    const runId = "short-but-v2-ready";
    const built = fixture({ runId });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-ready");
    expect(JSON.stringify(report)).not.toMatch(/capture-too-short|capture-research-ready|researchReadyVerified/);
  });

  it("51. candidate count absent does not block readiness", async () => {
    const runId = "no-candidates";
    const built = fixture({ runId });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-ready");
    expect(report).not.toHaveProperty("candidateMarketCount");
  });

  it("52. settlements absent do not block readiness", async () => {
    const runId = "without-settles";
    const built = fixture({ runId });
    expect(Object.keys(built.files).some((path) => /settlement/i.test(path.split("/").pop() ?? ""))).toBe(false);
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-ready");
  });

  it("53. maximumSourceGapMs is not applied", async () => {
    const runId = "gappy-minutes";
    const openTimes = Array.from({ length: 11 }, (_, index) => OPEN0_MS + index * 3_600_000);
    const built = fixture({ runId, candleLines: candles(runId, 11, openTimes) });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-ready");
    expect(report.sourceContract.maximumSourceGapMs).toBeNull();
    expect(report.sourceContract.adjacentSourceGapPolicy).toBe("none");
  });

  it("54. nonconsecutive minutes are not rejected", async () => {
    const runId = "holes-ok";
    const openTimes = [0, 2, 5, 8, 10, 13, 21, 34, 55, 89, 144].map((n) => OPEN0_MS + n * 60_000);
    const built = fixture({ runId, candleLines: candles(runId, 11, openTimes) });
    const report = await evaluate({ runId, ...built });
    expect(report.verdict).toBe("v2-capture-ready");
  });

  it("55. source report is deterministic", async () => {
    const runId = "deterministic";
    const built = fixture({ runId });
    const first = await evaluate({ runId, ...built });
    const second = await evaluate({ runId, ...built });
    expect(first).toEqual(second);
  });

  it("56. no latest/mtime selection path exists", () => {
    const source = moduleSources();
    expect(source).not.toMatch(/fileMtimeMs/);
    expect(source).not.toMatch(/newest directory|use latest|selectLatest/);
    expect(source).toMatch(/does not support --latest/);
    expect(() =>
      resolveCalibrationFadeV2CaptureReadinessOutputPaths({
        captureRunDir: runDir("ready-run"),
        jsonOutputPath: "data/research-results/calibration-fade-v2/readiness/latest/capture-readiness.json",
      }),
    ).toThrow(/latest/);
  });

  it("publishes isolated readiness artifacts and does not mutate capture inputs", async () => {
    const runId = "publish-run";
    const built = fixture({ runId });
    const candlePath = `${runDir(runId)}/btc-candles-1m.jsonl`;
    const originalCandles = built.files[candlePath];
    const io = createMemoryCalibrationFadeForwardValidationIo(built.files, built.dirs);
    const captureRunDir = runDir(runId);
    const report = await buildCalibrationFadeV2CaptureReadiness({
      generatedAt: GENERATED_AT,
      config: {
        captureRunDir,
        hypothesisConfigPath: DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
        provenancePath: DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
      },
      paths: resolveCalibrationFadeV2CaptureReadinessOutputPaths({ captureRunDir }),
      io,
    });
    expect(io.fileExists(report.jsonOutputPath)).toBe(true);
    expect(io.fileExists(report.htmlOutputPath)).toBe(true);
    expect(io.readFile(candlePath)).toBe(originalCandles);
    const html = serializeCalibrationFadeV2CaptureReadinessHtml(report);
    expect(html).not.toMatch(/hypothesis supported|profitable|trade|candidate absent/i);
  });

  it("stops the quote/spot probe after the first valid record", async () => {
    const runId = "bounded-probe";
    const quotes = [quoteRow(), quoteRow(), quoteRow()].join("\n");
    const built = fixture({ runId, quotes });
    const report = await evaluate({ runId, ...built });
    expect(report.quoteProbe.parseableRecordCount).toBe(1);
    expect(report.quoteProbe.stoppedAfterFirstValid).toBe(true);
    expect(report.quoteProbe.nonblankLineCount).toBe(1);
  });

  it("does not import v1 readiness helpers", () => {
    const source = moduleSources();
    expect(source).not.toMatch(/evaluateCaptureReadinessVerdict/);
    expect(source).not.toMatch(/capture-research-ready/);
    expect(source).not.toMatch(/researchReadyVerified/);
  });

  it("uses the governed verdict precedence order", () => {
    expect(V2_CAPTURE_READINESS_VERDICT_PRECEDENCE).toEqual([
      "v2-run-identity-invalid",
      "v2-capture-not-terminal",
      "v2-capture-started-at-unavailable",
      "v2-candle-source-unavailable",
      "v2-candle-identity-invalid",
      "v2-quote-source-unavailable",
      "v2-spot-join-source-unavailable",
      "v2-prospective-boundary-ineligible",
      "v2-capture-diagnostic-only",
      "v2-capture-ready",
    ]);
  });

  it("treats requireBtcJoin=false as making the spot check non-applicable", async () => {
    const runId = "spot-optional";
    const mutated = JSON.parse(V2_CONFIG_TEXT) as {
      marketEligibilityRules: { requireBtcJoin: boolean };
    };
    mutated.marketEligibilityRules.requireBtcJoin = false;
    const built = fixture({
      runId,
      spots: null,
      config: `${JSON.stringify(mutated)}\n`,
    });
    const report = await evaluate({ runId, ...built });
    expect(report.sourceContract.requireBtcJoin).toBe(false);
    expect(report.verdict).toBe("v2-capture-ready");
  });

  it("rejects empty capture-run-dir values at parse time", () => {
    expect(() => parseCalibrationFadeV2CaptureReadinessArgv(["--capture-run-dir"])).toThrow(
      CalibrationFadeV2CaptureReadinessError,
    );
  });

  it("CLI argv resolves exact-run identity from the directory segment only", () => {
    const parsed = parseCalibrationFadeV2CaptureReadinessArgv([
      "--capture-run-dir",
      "data/live-capture/forward-quotes/2026-09-07T23-38-33-005Z",
    ]);
    expect(parsed.config.captureRunDir).toBe("data/live-capture/forward-quotes/2026-09-07T23-38-33-005Z");
    expect(parsed.paths.jsonOutputPath).toContain("/readiness/2026-09-07T23-38-33-005Z/");
    expect(parsed.paths.jsonOutputPath).not.toContain("/latest");
  });
});
