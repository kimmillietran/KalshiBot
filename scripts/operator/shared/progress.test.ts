import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  countNewLines,
  formatProgressLine,
  startCaptureProgressMonitor,
  type LineCounterState,
} from "./progress";

async function removeTempDir(path: string): Promise<void> {
  await rm(path, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
}

async function waitForFirstLine(lines: string[]): Promise<string> {
  await vi.waitFor(() => {
    expect(lines.length).toBeGreaterThan(0);
  });
  return lines[0]!;
}

describe("countNewLines incremental candle counting", () => {
  it("counts candle JSONL lines via retained offsets without loading the whole file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-candle-progress-"));
    try {
      const path = join(dir, "btc-candles-1m.jsonl");
      writeFileSync(path, "a\nb\n", "utf8");
      let state: LineCounterState = { path, offset: 0, count: 0 };
      state = await countNewLines(state);
      expect(state.count).toBe(2);
      writeFileSync(path, "a\nb\nc\n", "utf8");
      state = await countNewLines(state);
      expect(state.count).toBe(3);
      expect(state.offset).toBeGreaterThan(0);
    } finally {
      await removeTempDir(dir);
    }
  });

  it("does not use whole-file readFileSync in the progress module", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/operator/shared/progress.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/readFileSync/);
    expect(source).toContain("createReadStream");
    expect(source).toContain("start: state.offset");
  });
});

describe("formatProgressLine candle and BTC conditionals", () => {
  const base = {
    localTime: "16:42:10",
    runId: "2026-09-07T16-42-00-000Z",
    elapsedMinutes: 2.2,
    remainingMinutes: 5.8,
    percent: 27.1,
    topOfBookLineCount: 8432,
    btcSpotLineCount: 27,
    rawJsonlSizeMb: 42.3,
    rawFileAgeSeconds: 0,
    topOfBookFileAgeSeconds: 0,
    btcFileAgeSeconds: 2,
  };

  it("preserves the legacy line when candles are not enabled", () => {
    expect(formatProgressLine(base)).toBe(
      "[16:42:10] 27.1% | run 2026-09-07T16-42-00-000Z | elapsed 2.2m | remaining 5.8m | "
        + "topOfBook 8432 | btc 27 | raw 42.3MB | file ages: raw 0s, TOB 0s, BTC 2s",
    );
  });

  it("shows candle count and age when enabled", () => {
    const line = formatProgressLine({
      ...base,
      includeBtcCandles1m: true,
      btcCandles1mLineCount: 17,
      btcCandles1mFileAgeSeconds: 4,
    });
    expect(line).toContain("candles 17");
    expect(line).toContain("candles 4s");
    expect(line).toContain("btc 27");
  });

  it("omits candle fields when disabled", () => {
    const line = formatProgressLine({
      ...base,
      includeBtcCandles1m: false,
      btcCandles1mLineCount: 99,
      btcCandles1mFileAgeSeconds: 1,
    });
    expect(line).not.toContain("candles");
  });

  it("omits BTC count and age when spot is disabled", () => {
    const line = formatProgressLine({
      ...base,
      includeBtcSpot: false,
    });
    expect(line).not.toMatch(/\bbtc \d+/);
    expect(line).not.toContain("BTC ");
    expect(line).toContain("topOfBook 8432");
  });
});

describe("startCaptureProgressMonitor candle support", () => {
  it("shows incremental candle count and age when enabled", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-candle-on-"));
    try {
      writeFileSync(join(dir, "btc-candles-1m.jsonl"), "c1\nc2\n", "utf8");
      const nowMs = Date.now();
      const lines: string[] = [];
      const handle = startCaptureProgressMonitor({
        runId: "candle-run",
        runDir: dir,
        durationMinutes: 8,
        startedAtMs: nowMs,
        intervalMs: 60_000,
        now: () => nowMs,
        includeBtcCandles1m: true,
        writeLine: (line) => lines.push(line),
      });
      const line = await waitForFirstLine(lines);
      handle.stop();
      expect(line).toContain("candles 2");
      expect(line).toMatch(/candles \d+s/);
    } finally {
      await removeTempDir(dir);
    }
  });

  it("omits candle fields when disabled even if an empty eager file exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-candle-eager-"));
    try {
      writeFileSync(join(dir, "btc-candles-1m.jsonl"), "", "utf8");
      const lines: string[] = [];
      const handle = startCaptureProgressMonitor({
        runId: "eager-run",
        runDir: dir,
        durationMinutes: 8,
        startedAtMs: Date.now(),
        intervalMs: 60_000,
        includeBtcCandles1m: false,
        writeLine: (line) => lines.push(line),
      });
      const line = await waitForFirstLine(lines);
      handle.stop();
      expect(line).not.toContain("candles");
    } finally {
      await removeTempDir(dir);
    }
  });

  it("reports zero/n/a for a missing candle file when candles are enabled", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-candle-missing-"));
    try {
      const lines: string[] = [];
      const handle = startCaptureProgressMonitor({
        runId: "missing-candle-run",
        runDir: dir,
        durationMinutes: 8,
        startedAtMs: Date.now(),
        intervalMs: 60_000,
        includeBtcCandles1m: true,
        writeLine: (line) => lines.push(line),
      });
      const line = await waitForFirstLine(lines);
      handle.stop();
      expect(line).toContain("candles 0");
      expect(line).toContain("candles n/a");
    } finally {
      await removeTempDir(dir);
    }
  });

  it("omits BTC when includeBtcSpot is false even if a spot file exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-spot-off-"));
    try {
      writeFileSync(join(dir, "btc-spot.jsonl"), "s1\ns2\n", "utf8");
      const lines: string[] = [];
      const handle = startCaptureProgressMonitor({
        runId: "spot-off-run",
        runDir: dir,
        durationMinutes: 8,
        startedAtMs: Date.now(),
        intervalMs: 60_000,
        includeBtcSpot: false,
        writeLine: (line) => lines.push(line),
      });
      const line = await waitForFirstLine(lines);
      handle.stop();
      expect(line).not.toMatch(/\bbtc \d+/);
      expect(line).not.toContain("BTC ");
    } finally {
      await removeTempDir(dir);
    }
  });

  it("keeps the first tick immediate and treats tick failures as non-fatal", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-tick-fail-"));
    try {
      const lines: string[] = [];
      const handle = startCaptureProgressMonitor({
        runId: "tick-fail-run",
        runDir: dir,
        durationMinutes: 8,
        startedAtMs: Date.now(),
        intervalMs: 60_000,
        writeLine: (line) => {
          lines.push(line);
          throw new Error("progress tick boom");
        },
      });
      await waitForFirstLine(lines);
      handle.stop();
      expect(lines.length).toBeGreaterThanOrEqual(1);
    } finally {
      await removeTempDir(dir);
    }
  });

  it("emits an immediate initial tick without waiting for the interval", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-immediate-"));
    try {
      const lines: string[] = [];
      const handle = startCaptureProgressMonitor({
        runId: "immediate-run",
        runDir: dir,
        durationMinutes: 8,
        startedAtMs: Date.now(),
        intervalMs: 60_000,
        writeLine: (line) => lines.push(line),
      });
      await waitForFirstLine(lines);
      handle.stop();
      expect(lines.length).toBe(1);
    } finally {
      await removeTempDir(dir);
    }
  });
});
