import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { spawnWithTee } from "./shared/childProcess";

describe("spawnWithTee", () => {
  it("tees stdout/stderr to a log, closes the log, and preserves success", async () => {
    const dir = mkdtempSync(join(tmpdir(), "spawn-tee-"));
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
    expect(result.stdout).toContain("hello-out");
    expect(result.stderr).toContain("hello-err");
    const log = readFileSync(logPath, "utf8");
    expect(log).toContain("hello-out");
    expect(log).toContain("hello-err");
    rmSync(dir, { recursive: true, force: true });
  });

  it("preserves nonzero child exit codes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "spawn-fail-"));
    const logPath = join(dir, "out.log");
    const result = await spawnWithTee({
      command: process.execPath,
      args: ["-e", "process.exit(9)"],
      logPath,
      signalHandlers: false,
    });
    expect(result.exitCode).toBe(9);
    rmSync(dir, { recursive: true, force: true });
  });
});
