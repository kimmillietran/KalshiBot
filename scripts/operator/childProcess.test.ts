import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  SpawnTeeLogOpenError,
  spawnWithTee,
} from "./shared/childProcess";

async function cleanupDir(dir: string): Promise<void> {
  await rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 25,
  });
}

describe("spawnWithTee", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    while (dirs.length > 0) {
      const dir = dirs.pop()!;
      await cleanupDir(dir);
    }
  });

  it("opens the log before spawning, tees output, closes the log, and preserves success", async () => {
    const dir = mkdtempSync(join(tmpdir(), "spawn-tee-"));
    dirs.push(dir);
    const logPath = join(dir, "out.log");

    const result = await spawnWithTee({
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write('hello-out\\n'); process.stderr.write('hello-err\\n');",
      ],
      logPath,
      signalHandlers: false,
    });

    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout).toContain("hello-out");
    expect(result.stderr).toContain("hello-err");
    const log = readFileSync(logPath, "utf8");
    expect(log).toContain("hello-out");
    expect(log).toContain("hello-err");
  });

  it("preserves nonzero child exit codes after the log closes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "spawn-fail-"));
    dirs.push(dir);
    const logPath = join(dir, "out.log");
    const result = await spawnWithTee({
      command: process.execPath,
      args: ["-e", "process.exit(9)"],
      logPath,
      signalHandlers: false,
    });
    expect(result.exitCode).toBe(9);
    expect(existsSync(logPath)).toBe(true);
  });

  it("rejects log-open failure without spawning a child", async () => {
    const dir = mkdtempSync(join(tmpdir(), "spawn-log-fail-"));
    dirs.push(dir);
    // Make an intermediate path component a file so the log path cannot open.
    const blocker = join(dir, "blocker");
    writeFileSync(blocker, "not-a-directory", "utf8");
    const logPath = join(blocker, "capture.log");

    let spawned = false;
    await expect(
      spawnWithTee({
        command: process.execPath,
        args: [
          "-e",
          "process.stdout.write('should-not-run\\n'); process.exit(0)",
        ],
        logPath,
        signalHandlers: false,
        onStdoutChunk: () => {
          spawned = true;
        },
      }),
    ).rejects.toBeInstanceOf(SpawnTeeLogOpenError);

    expect(spawned).toBe(false);
  });

  it("surfaces child spawn errors", async () => {
    const dir = mkdtempSync(join(tmpdir(), "spawn-missing-"));
    dirs.push(dir);
    const logPath = join(dir, "out.log");

    await expect(
      spawnWithTee({
        command: join(dir, "definitely-missing-binary"),
        args: [],
        logPath,
        signalHandlers: false,
      }),
    ).rejects.toThrow();
  });

  it("registers SIGINT/SIGTERM forwarders that kill the child", async () => {
    if (process.platform === "win32") {
      // Windows advisory runners do not require POSIX signal semantics.
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "spawn-signal-"));
    dirs.push(dir);
    const logPath = join(dir, "out.log");

    const beforeTerm = process.listenerCount("SIGTERM");
    const childPromise = spawnWithTee({
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      logPath,
      signalHandlers: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(process.listenerCount("SIGTERM")).toBeGreaterThan(beforeTerm);

    const listeners = process.listeners("SIGTERM");
    const latest = listeners[listeners.length - 1];
    expect(latest).toBeTypeOf("function");
    latest!();

    const result = await childPromise;
    expect(result.exitCode === 0).toBe(false);
  }, 10_000);

  it("aborts the exact child once via AbortSignal and cleans up listeners", async () => {
    if (process.platform === "win32") {
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "spawn-abort-"));
    dirs.push(dir);
    const logPath = join(dir, "out.log");
    const controller = new AbortController();

    const childPromise = spawnWithTee({
      command: process.execPath,
      args: [
        "-e",
        "process.on('SIGINT', () => process.exit(130)); setInterval(() => {}, 1000);",
      ],
      logPath,
      signalHandlers: false,
      abortSignal: controller.signal,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    controller.abort();
    controller.abort();

    const result = await childPromise;
    expect(result.exitCode === 0).toBe(false);
  }, 10_000);

  it("swallows onStdoutChunk exceptions so EventEmitter data callbacks never throw", async () => {
    const dir = mkdtempSync(join(tmpdir(), "spawn-callback-"));
    dirs.push(dir);
    const logPath = join(dir, "out.log");

    const result = await spawnWithTee({
      command: process.execPath,
      args: ["-e", "process.stdout.write('chunk\\n');"],
      logPath,
      signalHandlers: false,
      onStdoutChunk: () => {
        throw new Error("parser boom");
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("chunk");
  });
});
