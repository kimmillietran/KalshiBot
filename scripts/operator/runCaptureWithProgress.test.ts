import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
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

describe("exact run identity parsing", () => {
  it("parses runId/outputDir from stdout JSON", () => {
    const identity = parseExactRunIdentityFromOutput(
      'noise\n{"runId":"run-1","outputDir":"data/live-capture/forward-quotes"}\n',
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

  it("fails closed on malformed JSON containing runId text", () => {
    expect(() =>
      parseExactRunIdentityFromOutput('{"runId":\n'),
    ).toThrow(/Malformed run identity JSON/);
  });

  it("never implies newest-directory fallback APIs", () => {
    const source = readOperatorSource("runCaptureWithProgress.ts");
    expect(source).not.toMatch(/newest|LastWriteTime|mtime.*fallback|--latest/i);
    expect(source).toContain("parseExactRunIdentityFromOutput");
    expect(source).toContain("startCaptureProgressMonitor");
  });
});

describe("progress line counting", () => {
  it("counts new lines via retained offsets without loading whole file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-progress-"));
    const path = join(dir, "top-of-book.jsonl");
    writeFileSync(path, "a\nb\n", "utf8");
    let state: LineCounterState = { path, offset: 0, count: 0 };
    state = await countNewLines(state);
    expect(state.count).toBe(2);
    writeFileSync(path, "a\nb\nc\n", "utf8");
    state = await countNewLines(state);
    expect(state.count).toBe(3);
    rmSync(dir, { recursive: true, force: true });
  });

  it("recounts from start after truncation/rotation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kalshi-progress-trunc-"));
    const path = join(dir, "top-of-book.jsonl");
    writeFileSync(path, "a\nb\nc\n", "utf8");
    let state: LineCounterState = { path, offset: 0, count: 0 };
    state = await countNewLines(state);
    expect(state.count).toBe(3);
    writeFileSync(path, "x\n", "utf8");
    state = await countNewLines(state);
    expect(state.count).toBe(1);
    expect(state.offset).toBe(2);
    rmSync(dir, { recursive: true, force: true });
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
    rmSync(dir, { recursive: true, force: true });
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
    const runDir = mkdtempSync(join(tmpdir(), "kalshi-run-"));
    const calls: string[] = [];

    // Fix identity paths: outputDir should be parent of runDir named spawn-run
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-root-"));
    const exactRunDir = join(captureRoot, "spawn-run");
    // create exact dir
    writeFileSync(join(captureRoot, ".keep"), "");
    mkdirSync(exactRunDir, { recursive: true });

    const exitCode = await runCaptureWithProgressCommand(
      ["--preset", "6h", "--progress-interval-ms", "600000"],
      {
        io,
        requireCredentials: false,
        runner: mockRunner((script) => {
          calls.push(script);
          if (script.includes("evaluateCaptureRestartGate")) {
            return passingPreflight(captureRoot);
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        }),
        spawnCapture: async (options) => {
          expect(options.logPath).toContain("capture-");
          return {
            exitCode: 0,
            signal: null,
            stdout:
              JSON.stringify({
                runId: "spawn-run",
                outputDir: captureRoot,
              }) + "\n",
            stderr: "warn\n",
          };
        },
        exists: (path) => path === exactRunDir || path.startsWith(captureRoot),
        mkdirp: () => undefined,
      },
    );

    expect(exitCode).toBe(0);
    expect(calls.some((entry) => entry.includes("evaluateCaptureRestartGate"))).toBe(
      true,
    );
    expect(stdout.join("")).toContain("runId:   spawn-run");
    expect(stdout.join("")).toContain("NONCANONICAL-DURATION");
    rmSync(runDir, { recursive: true, force: true });
    rmSync(captureRoot, { recursive: true, force: true });
  });

  it("attaches progress on capture-started while the child is still running", async () => {
    const { io, stdout } = createIo();
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-early-"));
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
        runner: mockRunner(() => passingPreflight(captureRoot)),
        spawnCapture: async (options) => {
          childStillRunning = true;
          const startup =
            JSON.stringify({
              event: "capture-started",
              runId,
              outputDir: captureRoot,
              runDir: exactRunDir,
              startedAt: "2026-08-03T12:00:00.000Z",
            }) + "\n";
          options.onStdoutChunk?.(startup);

          await new Promise((resolve) => setTimeout(resolve, 40));
          const text = stdout.join("");
          progressSeenWhileRunning =
            childStillRunning
            && text.includes("Capture progress attached:")
            && text.includes(`run ${runId}`);

          const final =
            JSON.stringify({
              runId,
              outputDir: captureRoot,
              verdict: "ok",
            }) + "\n";
          options.onStdoutChunk?.(final);
          childStillRunning = false;
          return {
            exitCode: 0,
            signal: null,
            stdout: startup + final,
            stderr: "",
          };
        },
        exists: (path) => path === exactRunDir || path.startsWith(captureRoot),
        mkdirp: () => undefined,
      },
    );

    expect(exitCode).toBe(0);
    expect(progressSeenWhileRunning).toBe(true);
    expect(stdout.join("")).toContain("Capture progress attached:");
    expect(stdout.join("")).toContain(`runId:  ${runId}`);
    rmSync(captureRoot, { recursive: true, force: true });
  });

  it("starts only one monitor for repeated identical identity output", async () => {
    const { io, stdout } = createIo();
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-dup-"));
    const runId = "dup-run";
    const exactRunDir = join(captureRoot, runId);
    mkdirSync(exactRunDir, { recursive: true });

    const exitCode = await runCaptureWithProgressCommand(
      ["--preset", "6h", "--progress-interval-ms", "600000"],
      {
        io,
        requireCredentials: false,
        runner: mockRunner(() => passingPreflight(captureRoot)),
        spawnCapture: async (options) => {
          const startup =
            JSON.stringify({
              event: "capture-started",
              runId,
              outputDir: captureRoot,
              runDir: exactRunDir,
              startedAt: "2026-08-03T12:00:00.000Z",
            }) + "\n";
          options.onStdoutChunk?.(startup);
          options.onStdoutChunk?.(startup);
          options.onStdoutChunk?.(
            JSON.stringify({ runId, outputDir: captureRoot }) + "\n",
          );
          return {
            exitCode: 0,
            signal: null,
            stdout: startup + startup + JSON.stringify({ runId, outputDir: captureRoot }) + "\n",
            stderr: "",
          };
        },
        exists: (path) => path === exactRunDir || path.startsWith(captureRoot),
        mkdirp: () => undefined,
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("").split("Capture progress attached:").length - 1).toBe(1);
    rmSync(captureRoot, { recursive: true, force: true });
  });

  it("fails closed on startup/final identity mismatch", async () => {
    const { io, stderr, stdout } = createIo();
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-mismatch-"));
    const runA = join(captureRoot, "run-a");
    const runB = join(captureRoot, "run-b");
    mkdirSync(runA, { recursive: true });
    mkdirSync(runB, { recursive: true });

    const exitCode = await runCaptureWithProgressCommand(
      ["--preset", "6h", "--progress-interval-ms", "600000"],
      {
        io,
        requireCredentials: false,
        runner: mockRunner(() => passingPreflight(captureRoot)),
        spawnCapture: async (options) => {
          const startup =
            JSON.stringify({
              event: "capture-started",
              runId: "run-a",
              outputDir: captureRoot,
              runDir: runA,
              startedAt: "2026-08-03T12:00:00.000Z",
            }) + "\n";
          const final =
            JSON.stringify({
              runId: "run-b",
              outputDir: captureRoot,
            }) + "\n";
          options.onStdoutChunk?.(startup);
          options.onStdoutChunk?.(final);
          return {
            exitCode: 0,
            signal: null,
            stdout: startup + final,
            stderr: "",
          };
        },
        exists: (path) =>
          path === runA || path === runB || path.startsWith(captureRoot),
        mkdirp: () => undefined,
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("") + stdout.join("")).toMatch(
      /Startup\/final capture identity mismatch/,
    );
    rmSync(captureRoot, { recursive: true, force: true });
  });

  it("retains exact startup identity after abnormal child exit", async () => {
    const { io, stdout } = createIo();
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-abnormal-"));
    const runId = "abnormal-run";
    const exactRunDir = join(captureRoot, runId);
    mkdirSync(exactRunDir, { recursive: true });

    const exitCode = await runCaptureWithProgressCommand(
      ["--preset", "6h", "--progress-interval-ms", "600000"],
      {
        io,
        requireCredentials: false,
        runner: mockRunner(() => passingPreflight(captureRoot)),
        spawnCapture: async (options) => {
          const startup =
            JSON.stringify({
              event: "capture-started",
              runId,
              outputDir: captureRoot,
              runDir: exactRunDir,
              startedAt: "2026-08-03T12:00:00.000Z",
            }) + "\n";
          options.onStdoutChunk?.(startup);
          return {
            exitCode: 1,
            signal: null,
            stdout: startup,
            stderr: "boom\n",
          };
        },
        exists: (path) => path === exactRunDir || path.startsWith(captureRoot),
        mkdirp: () => undefined,
      },
    );

    expect(exitCode).toBe(1);
    expect(stdout.join("")).toContain(`runId:   ${runId}`);
    expect(stdout.join("")).toContain(exactRunDir);
    expect(stdout.join("")).not.toMatch(/unrelated run|newest/i);
    rmSync(captureRoot, { recursive: true, force: true });
  });

  it("propagates child failure exit codes", async () => {
    const { io } = createIo();
    const captureRoot = mkdtempSync(join(tmpdir(), "kalshi-fail-"));
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
        stdout: JSON.stringify({ runId: "fail-run", outputDir: captureRoot }) + "\n",
        stderr: "",
      }),
      exists: (path) => path === exactRunDir || true,
      mkdirp: () => undefined,
    });

    expect(exitCode).toBe(7);
    rmSync(captureRoot, { recursive: true, force: true });
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

  it("fails closed on malformed identity JSON", async () => {
    const { io, stderr } = createIo();
    const exitCode = await runCaptureWithProgressCommand(["--preset", "6h"], {
      io,
      requireCredentials: false,
      runner: mockRunner(() => ({
        exitCode: 0,
        stdout: JSON.stringify({ blockers: [], lockPresent: false }) + "\n",
        stderr: "",
      })),
      spawnCapture: async (options) => {
        const bad = '{"runId":"x","outputDir":\n';
        options.onStdoutChunk?.(bad);
        return {
          exitCode: 1,
          signal: null,
          stdout: bad,
          stderr: "",
        };
      },
      exists: () => true,
      mkdirp: () => undefined,
    });
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/Malformed run identity JSON/i);
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
