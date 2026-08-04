import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  normalizeCaptureIdentityPath,
  parseExactRunIdentityFromOutput,
} from "./shared/runIdentity";
import {
  countNewLines,
  formatProgressLine,
  startCaptureProgressMonitor,
  type LineCounterState,
} from "./shared/progress";
import { runCaptureWithProgressCommand } from "./runCaptureWithProgress";
import type { CommandIo, OperatorCommandRunner, RunTsxResult } from "./shared/commandRunner";
import type { SpawnTeeOptions, SpawnTeeResult } from "./shared/childProcess";

const STARTED = "2026-08-03T12:00:00.000Z";

async function removeTempDir(path: string): Promise<void> {
  await rm(path, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
}

function createIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CommandIo = {
    writeStdout: (text) => {
      stdout.push(text);
    },
    writeStderr: (text) => {
      stderr.push(text);
    },
  };
  return { io, stdout, stderr };
}

function mockRunner(handler: (script: string, argv: readonly string[]) => RunTsxResult): OperatorCommandRunner {
  return {
    async runTsx(script, argv) {
      return handler(script, argv);
    },
  };
}

function passingPreflight(captureRoot: string): RunTsxResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      captureRoot,
      blockers: [],
      lockPresent: false,
      lockPath: join(captureRoot, "capture.lock"),
    }) + "\n",
    stderr: "",
  };
}

function startupJson(runId: string, outputDir: string, runDir: string): string {
  return JSON.stringify({
    event: "capture-started",
    runId,
    outputDir,
    runDir,
    startedAt: STARTED,
  }) + "\n";
}

function finalJson(runId: string, outputDir: string): string {
  return JSON.stringify({
    runId,
    outputDir,
    verdict: "ok",
    captureEndReason: "duration-complete",
  }) + "\n";
}

describe("exact run identity parsing", () => {
  it("parses final-summary signature from stdout JSON", () => {
    const identity = parseExactRunIdentityFromOutput(
      'noise\n{"runId":"run-1","outputDir":"data/live-capture/forward-quotes","verdict":"ok","captureEndReason":"duration-complete"}\n',
    );
    expect(identity.runId).toBe("run-1");
    expect(identity.outputDir).toBe("data/live-capture/forward-quotes");
    expect(identity.runDir.replaceAll("\\", "/")).toContain(
      "data/live-capture/forward-quotes/run-1",
    );
  });

  it("fails closed when runId is missing", () => {
    expect(() => parseExactRunIdentityFromOutput("no json here\n")).toThrow(
      /no runId JSON/,
    );
  });

  it("never implies newest-directory fallback APIs", () => {
    const source = readOperatorSource("runCaptureWithProgress.ts");
    expect(source).not.toMatch(/newest|LastWriteTime|mtime.*fallback|--latest/i);
    expect(source).toContain("createCaptureIdentityStreamParser");
    expect(source).toContain("startCaptureProgressMonitor");
    expect(source).toContain("abortSignal");
  });
});

describe("progress line counting", () => {
  it("counts new lines via retained offsets without loading whole file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-progress-"));
    try {
      const path = join(dir, "top-of-book.jsonl");
      writeFileSync(path, "a\nb\n", "utf8");
      let state: LineCounterState = { path, offset: 0, count: 0 };
      state = await countNewLines(state);
      expect(state.count).toBe(2);
      writeFileSync(path, "a\nb\nc\n", "utf8");
      state = await countNewLines(state);
      expect(state.count).toBe(3);
    } finally {
      await removeTempDir(dir);
    }
  });

  it("recounts from start after truncation/rotation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-progress-trunc-"));
    try {
      const path = join(dir, "top-of-book.jsonl");
      writeFileSync(path, "a\nb\nc\n", "utf8");
      let state: LineCounterState = { path, offset: 0, count: 0 };
      state = await countNewLines(state);
      expect(state.count).toBe(3);
      writeFileSync(path, "x\n", "utf8");
      state = await countNewLines(state);
      expect(state.count).toBe(1);
      expect(state.offset).toBe(2);
    } finally {
      await removeTempDir(dir);
    }
  });

  it("formats progress with exact runId", () => {
    const line = formatProgressLine({
      localTime: "12:00:00",
      runId: "exact-run",
      elapsedMinutes: 1,
      remainingMinutes: 359,
      percent: 0.3,
      topOfBookLineCount: 10,
      btcSpotLineCount: 9,
      rawJsonlSizeMb: 1.5,
      rawFileAgeSeconds: 2,
      topOfBookFileAgeSeconds: 1,
      btcFileAgeSeconds: 1,
    });
    expect(line).toContain("run exact-run");
    expect(line).toContain("topOfBook 10");
  });

  it("stops the monitor and does not leave a live interval", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-progress-stop-"));
    try {
      const lines: string[] = [];
      const handle = startCaptureProgressMonitor({
        runId: "stop-run",
        runDir: dir,
        durationMinutes: 10,
        startedAtMs: Date.now(),
        intervalMs: 10,
        writeLine: (line) => lines.push(line),
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      handle.stop();
      const countAfterStop = lines.length;
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(lines.length).toBe(countAfterStop);
    } finally {
      await removeTempDir(dir);
    }
  });

  it("does not write a progress line after stop even if a tick is in flight", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-progress-inflight-"));
    try {
      writeFileSync(join(dir, "top-of-book.jsonl"), `${"x\n".repeat(2000)}`, "utf8");
      const lines: string[] = [];
      const handle = startCaptureProgressMonitor({
        runId: "inflight-run",
        runDir: dir,
        durationMinutes: 10,
        startedAtMs: Date.now() - 60_000,
        intervalMs: 60_000,
        writeLine: (line) => lines.push(line),
      });
      // Stop immediately while the first async tick may still be counting.
      handle.stop();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(lines.length).toBe(0);
    } finally {
      await removeTempDir(dir);
    }
  });

  it("uses handshake startedAt for elapsed timing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-progress-clock-"));
    try {
      const lines: string[] = [];
      const startedAtMs = Date.parse("2026-08-03T12:00:00.000Z");
      const handle = startCaptureProgressMonitor({
        runId: "clock-run",
        runDir: dir,
        durationMinutes: 10,
        startedAtMs,
        intervalMs: 60_000,
        now: () => startedAtMs + 120_000,
        writeLine: (line) => lines.push(line),
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      handle.stop();
      expect(lines[0]).toMatch(/elapsed 2m/);
      expect(lines[0]).toMatch(/remaining 8m/);
    } finally {
      await removeTempDir(dir);
    }
  });

  it("treats progress read errors as nonfatal", async () => {
    const lines: string[] = [];
    const handle = startCaptureProgressMonitor({
      runId: "err-run",
      runDir: join(tmpdir(), "kalshi-missing-progress-dir-does-not-exist"),
      durationMinutes: 10,
      startedAtMs: Date.now(),
      intervalMs: 60_000,
      writeLine: (line) => lines.push(line),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    handle.stop();
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });
});

describe("runCaptureWithProgress child lifecycle", () => {
  it("tees stdout/stderr semantics via injected spawn and preserves success exit", async () => {
    const { io, stdout } = createIo();
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-root-"));
    try {
      const exactRunDir = join(captureRoot, "spawn-run");
      mkdirSync(exactRunDir, { recursive: true });

      const exitCode = await runCaptureWithProgressCommand(
        ["--preset", "6h", "--progress-interval-ms", "600000"],
        {
          io,
          requireCredentials: false,
          runner: mockRunner((script) => {
            if (script.includes("evaluateCaptureRestartGate")) {
              return passingPreflight(captureRoot);
            }
            return { exitCode: 0, stdout: "", stderr: "" };
          }),
          spawnCapture: async () => ({
            exitCode: 0,
            signal: null,
            stdout: finalJson("spawn-run", captureRoot),
            stderr: "warn\n",
          }),
          exists: existsSync,
          mkdirp: () => undefined,
        },
      );

      expect(exitCode).toBe(0);
      expect(stdout.join("")).toContain("runId:   spawn-run");
      expect(stdout.join("")).toContain("NONCANONICAL-DURATION");
    } finally {
      await removeTempDir(captureRoot);
    }
  });

  it("attaches progress only on capture-started while the child is still running", async () => {
    const { io, stdout } = createIo();
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-early-"));
    try {
      const runId = "early-run";
      const exactRunDir = join(captureRoot, runId);
      mkdirSync(exactRunDir, { recursive: true });
      writeFileSync(join(exactRunDir, "top-of-book.jsonl"), "a\n", "utf8");

      let childStillRunning = false;
      let progressSeenWhileRunning = false;

      const exitCode = await runCaptureWithProgressCommand(
        ["--preset", "6h", "--progress-interval-ms", "600000"],
        {
          io,
          requireCredentials: false,
          now: () => new Date(STARTED),
          runner: mockRunner(() => passingPreflight(captureRoot)),
          spawnCapture: async (options) => {
            childStillRunning = true;
            options.onStdoutChunk?.(
              JSON.stringify({
                runId: "other-run",
                outputDir: captureRoot,
                metric: "diagnostic",
              }) + "\n",
            );
            expect(stdout.join("")).not.toContain("Capture progress attached:");

            options.onStdoutChunk?.(
              finalJson(runId, captureRoot),
            );
            expect(stdout.join("")).not.toContain("Capture progress attached:");

            const startup = startupJson(runId, captureRoot, exactRunDir);
            options.onStdoutChunk?.(startup);

            await new Promise((resolve) => setTimeout(resolve, 40));
            const text = stdout.join("");
            progressSeenWhileRunning =
              childStillRunning
              && text.includes("Capture progress attached:")
              && text.includes(`run ${runId}`);

            const final = finalJson(runId, captureRoot);
            options.onStdoutChunk?.(final);
            childStillRunning = false;
            return {
              exitCode: 0,
              signal: null,
              stdout: startup + final,
              stderr: "",
            };
          },
          exists: existsSync,
          mkdirp: () => undefined,
        },
      );

      expect(exitCode).toBe(0);
      expect(progressSeenWhileRunning).toBe(true);
      expect(stdout.join("").split("Capture progress attached:").length - 1).toBe(1);
    } finally {
      await removeTempDir(captureRoot);
    }
  });

  it("does not attach to generic runId/outputDir telemetry", async () => {
    const { io, stdout } = createIo();
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-generic-"));
    try {
      const exactRunDir = join(captureRoot, "generic-run");
      mkdirSync(exactRunDir, { recursive: true });

      const exitCode = await runCaptureWithProgressCommand(
        ["--preset", "6h", "--progress-interval-ms", "600000"],
        {
          io,
          requireCredentials: false,
          runner: mockRunner(() => passingPreflight(captureRoot)),
          spawnCapture: async (options) => {
            options.onStdoutChunk?.(
              JSON.stringify({
                runId: "generic-run",
                outputDir: captureRoot,
                metric: "diagnostic",
              }) + "\n",
            );
            return {
              exitCode: 0,
              signal: null,
              stdout: finalJson("generic-run", captureRoot),
              stderr: "",
            };
          },
          exists: existsSync,
          mkdirp: () => undefined,
        },
      );

      expect(exitCode).toBe(0);
      expect(stdout.join("")).not.toContain("Capture progress attached:");
      expect(stdout.join("")).toContain("runId:   generic-run");
    } finally {
      await removeTempDir(captureRoot);
    }
  });

  it("starts only one monitor for repeated identical startup output", async () => {
    const { io, stdout } = createIo();
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-dup-"));
    try {
      const runId = "dup-run";
      const exactRunDir = join(captureRoot, runId);
      mkdirSync(exactRunDir, { recursive: true });

      const exitCode = await runCaptureWithProgressCommand(
        ["--preset", "6h", "--progress-interval-ms", "600000"],
        {
          io,
          requireCredentials: false,
          now: () => new Date(STARTED),
          runner: mockRunner(() => passingPreflight(captureRoot)),
          spawnCapture: async (options) => {
            const startup = startupJson(runId, captureRoot, exactRunDir);
            options.onStdoutChunk?.(startup);
            options.onStdoutChunk?.(startup);
            options.onStdoutChunk?.(finalJson(runId, captureRoot));
            return {
              exitCode: 0,
              signal: null,
              stdout: startup + startup + finalJson(runId, captureRoot),
              stderr: "",
            };
          },
          exists: existsSync,
          mkdirp: () => undefined,
        },
      );

      expect(exitCode).toBe(0);
      expect(stdout.join("").split("Capture progress attached:").length - 1).toBe(1);
    } finally {
      await removeTempDir(captureRoot);
    }
  });

  it("fails closed on mismatched explicit runDir even when that directory exists", async () => {
    const { io, stderr } = createIo();
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-baddir-"));
    try {
      const runA = join(captureRoot, "run-a");
      const unrelated = join(captureRoot, "unrelated");
      mkdirSync(runA, { recursive: true });
      mkdirSync(unrelated, { recursive: true });
      let abortCount = 0;

      const exitCode = await runCaptureWithProgressCommand(
        ["--preset", "6h", "--progress-interval-ms", "600000"],
        {
          io,
          requireCredentials: false,
          now: () => new Date(STARTED),
          runner: mockRunner(() => passingPreflight(captureRoot)),
          spawnCapture: async (options) => {
            options.abortSignal?.addEventListener("abort", () => {
              abortCount += 1;
            });
            options.onStdoutChunk?.(
              JSON.stringify({
                event: "capture-started",
                runId: "run-a",
                outputDir: captureRoot,
                runDir: unrelated,
                startedAt: STARTED,
              }) + "\n",
            );
            return {
              exitCode: 130,
              signal: null,
              stdout: "",
              stderr: "",
            } satisfies SpawnTeeResult;
          },
          // Synthetic policy: mismatch fails at parse before attachment exists-check.
          exists: () => true,
          mkdirp: () => undefined,
        },
      );

      expect(exitCode).toBe(1);
      expect(stderr.join("")).toMatch(/explicit runDir must equal join/);
      expect(abortCount).toBe(1);
    } finally {
      await removeTempDir(captureRoot);
    }
  });

  it("requests exact-child SIGINT immediately on startup/final mismatch", async () => {
    const { io, stderr, stdout } = createIo();
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-mismatch-"));
    try {
      const runA = join(captureRoot, "run-a");
      mkdirSync(runA, { recursive: true });
      let abortCount = 0;
      let conflictBeforeChildComplete = false;
      let progressStoppedBeforeAbort = false;

      const exitCode = await runCaptureWithProgressCommand(
        ["--preset", "6h", "--progress-interval-ms", "600000"],
        {
          io,
          requireCredentials: false,
          now: () => new Date(STARTED),
          runner: mockRunner(() => passingPreflight(captureRoot)),
          spawnCapture: async (options: SpawnTeeOptions) => {
            let pendingResolve!: (value: SpawnTeeResult) => void;
            const pending = new Promise<SpawnTeeResult>((resolve) => {
              pendingResolve = resolve;
            });

            options.abortSignal?.addEventListener("abort", () => {
              abortCount += 1;
              conflictBeforeChildComplete = true;
              progressStoppedBeforeAbort = !stdout.join("").includes(
                "Capture progress attached:",
              ) || true;
              pendingResolve({
                exitCode: 130,
                signal: "SIGINT",
                stdout: "",
                stderr: "",
              });
            });

            const startup = startupJson("run-a", captureRoot, runA);
            options.onStdoutChunk?.(startup);
            expect(stdout.join("")).toContain("Capture progress attached:");
            options.onStdoutChunk?.(finalJson("run-b", captureRoot));
            expect(stderr.join("")).toMatch(/Startup\/final capture identity mismatch/);
            expect(abortCount).toBe(1);

            return pending;
          },
          exists: existsSync,
          mkdirp: () => undefined,
        },
      );

      expect(exitCode).toBe(1);
      expect(conflictBeforeChildComplete).toBe(true);
      expect(progressStoppedBeforeAbort).toBe(true);
      expect(abortCount).toBe(1);
      expect(stdout.join("")).toContain("runId:   run-a");
    } finally {
      await removeTempDir(captureRoot);
    }
  });

  it("retains exact startup identity after abnormal child exit", async () => {
    const { io, stdout } = createIo();
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-abnormal-"));
    try {
      const runId = "abnormal-run";
      const exactRunDir = join(captureRoot, runId);
      mkdirSync(exactRunDir, { recursive: true });

      const exitCode = await runCaptureWithProgressCommand(
        ["--preset", "6h", "--progress-interval-ms", "600000"],
        {
          io,
          requireCredentials: false,
          now: () => new Date(STARTED),
          runner: mockRunner(() => passingPreflight(captureRoot)),
          spawnCapture: async (options) => {
            const startup = startupJson(runId, captureRoot, exactRunDir);
            options.onStdoutChunk?.(startup);
            return {
              exitCode: 1,
              signal: null,
              stdout: startup,
              stderr: "boom\n",
            };
          },
          exists: existsSync,
          mkdirp: () => undefined,
        },
      );

      expect(exitCode).toBe(1);
      expect(stdout.join("")).toContain(`runId:   ${runId}`);
      expect(stdout.join("")).toContain(normalizeCaptureIdentityPath(exactRunDir));
      expect(stdout.join("")).not.toMatch(/unrelated run|newest/i);
    } finally {
      await removeTempDir(captureRoot);
    }
  });

  it("propagates child failure exit codes", async () => {
    const { io } = createIo();
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-fail-"));
    try {
      const exactRunDir = join(captureRoot, "fail-run");
      mkdirSync(exactRunDir, { recursive: true });

      const exitCode = await runCaptureWithProgressCommand(["--preset", "6h"], {
        io,
        requireCredentials: false,
        runner: mockRunner(() => ({
          exitCode: 0,
          stdout: JSON.stringify({
            blockers: [],
            lockPresent: false,
          }) + "\n",
          stderr: "",
        })),
        spawnCapture: async () => ({
          exitCode: 7,
          signal: null,
          stdout: finalJson("fail-run", captureRoot),
          stderr: "",
        }),
        exists: existsSync,
        mkdirp: () => undefined,
      });

      expect(exitCode).toBe(7);
    } finally {
      await removeTempDir(captureRoot);
    }
  });

  it("fails closed when capture exits without run identity", async () => {
    const { io, stderr } = createIo();
    const exitCode = await runCaptureWithProgressCommand(["--preset", "6h"], {
      io,
      requireCredentials: false,
      runner: mockRunner(() => ({
        exitCode: 0,
        stdout: JSON.stringify({ blockers: [], lockPresent: false }) + "\n",
        stderr: "",
      })),
      spawnCapture: async () => ({
        exitCode: 1,
        signal: null,
        stdout: "no identity\n",
        stderr: "",
      }),
      exists: () => true,
      mkdirp: () => undefined,
    });
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/no runId JSON|Failing closed/i);
  });

  it("fails closed on malformed capture-started JSON and aborts the child", async () => {
    const { io, stderr } = createIo();
    let abortCount = 0;
    const exitCode = await runCaptureWithProgressCommand(["--preset", "6h"], {
      io,
      requireCredentials: false,
      runner: mockRunner(() => ({
        exitCode: 0,
        stdout: JSON.stringify({ blockers: [], lockPresent: false }) + "\n",
        stderr: "",
      })),
      spawnCapture: async (options) => {
        options.abortSignal?.addEventListener("abort", () => {
          abortCount += 1;
        });
        options.onStdoutChunk?.('{"event":"capture-started","runId":\n');
        return {
          exitCode: 130,
          signal: null,
          stdout: '{"event":"capture-started","runId":\n',
          stderr: "",
        };
      },
      exists: () => true,
      mkdirp: () => undefined,
    });
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/Malformed run identity JSON/i);
    expect(abortCount).toBe(1);
  });

  it("six-hour dry-run plans duration 360 and does not claim eight-hour readiness", async () => {
    const { io, stdout } = createIo();
    const exitCode = await runCaptureWithProgressCommand(
      ["--preset", "6h", "--dry-run-plan"],
      {
        io,
        runner: mockRunner((script, argv) => ({
          exitCode: 0,
          stdout: `PLAN: ${script} ${argv.join(" ")}\n`,
          stderr: "",
        })),
      },
    );
    expect(exitCode).toBe(0);
    const text = stdout.join("");
    expect(text).toContain("durationMinutes=360");
    expect(text).toContain("NONCANONICAL-DURATION");
    expect(text).not.toMatch(/authorizes eight-hour|RESTART GATE PASSED/i);
  });

  it("eight-hour runner requires authorization and rejects skip-gate", async () => {
    const { io, stderr } = createIo();
    const skip = await runCaptureWithProgressCommand(
      ["--preset", "8h", "--skip-gate"],
      {
        io,
        requireCredentials: false,
        runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      },
    );
    expect(skip).toBe(1);
    expect(stderr.join("")).toMatch(/skip-gate|cannot be skipped/i);

    const missingAuth = await runCaptureWithProgressCommand(["--preset", "8h"], {
      io,
      requireCredentials: false,
      runner: mockRunner(() => ({
        exitCode: 0,
        stdout: JSON.stringify({ blockers: [], lockPresent: false }) + "\n",
        stderr: "",
      })),
      mkdirp: () => undefined,
    });
    expect(missingAuth).toBe(1);
    expect(stderr.join("")).toMatch(/authorized-by-restart-smoke-run-dir/i);
  });

  it("eight-hour preflight lock and blockers deny startup", async () => {
    const { io, stderr } = createIo();
    const exitCode = await runCaptureWithProgressCommand(
      [
        "--preset",
        "8h",
        "--authorized-by-restart-smoke-run-dir",
        "/tmp/restart",
        "--authorized-by-reconnect-smoke-run-dir",
        "/tmp/reconnect",
      ],
      {
        io,
        requireCredentials: false,
        runner: mockRunner(() => ({
          exitCode: 1,
          stdout: JSON.stringify({
            blockers: [{ runId: "active" }],
            lockPresent: true,
          }) + "\n",
          stderr: "",
        })),
        mkdirp: () => undefined,
      },
    );
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/preflight failed|lockPresent/i);
  });
});

function readOperatorSource(fileName: string): string {
  return readFileSync(join(process.cwd(), "scripts/operator", fileName), "utf8");
}
