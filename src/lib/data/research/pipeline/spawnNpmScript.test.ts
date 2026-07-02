import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import {
  createNpmScriptRunner,
  formatPipelineSpawnError,
  formatPipelineStepFailureMessage,
  resolveNpmSpawnSpec,
  spawnNpmScript,
  tailCapturedOutput,
} from "./spawnNpmScript";

function createMockChild(output: {
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = stdout;
  child.stderr = stderr;

  queueMicrotask(() => {
    if (output.error) {
      child.emit("error", output.error);
      return;
    }

    if (output.stdout) {
      stdout.emit("data", output.stdout);
    }

    if (output.stderr) {
      stderr.emit("data", output.stderr);
    }

    child.emit("close", output.exitCode ?? 0);
  });

  return child;
}

describe("resolveNpmSpawnSpec", () => {
  it("uses cmd.exe on Windows so npm.cmd is not spawned directly", () => {
    const spec = resolveNpmSpawnSpec("discover:markets", ["--series", "KXBTC15M"], "win32");

    expect(spec.command).toBe("cmd.exe");
    expect(spec.args).toEqual([
      "/d",
      "/s",
      "/c",
      "npm",
      "run",
      "discover:markets",
      "--",
      "--series",
      "KXBTC15M",
    ]);
    expect(spec.options.shell).toBe(false);
    expect(spec.options.windowsHide).toBe(true);
  });

  it("uses npm directly on Unix without a shell", () => {
    const spec = resolveNpmSpawnSpec("discover:markets", ["--limit", "100"], "linux");

    expect(spec.command).toBe("npm");
    expect(spec.args).toEqual([
      "run",
      "discover:markets",
      "--",
      "--limit",
      "100",
    ]);
    expect(spec.options.shell).toBe(false);
    expect(spec.options.windowsHide).toBeUndefined();
  });
});

describe("formatPipelineStepFailureMessage", () => {
  it("prefers stderr and appends stdout when both are present", () => {
    expect(
      formatPipelineStepFailureMessage({
        exitCode: 1,
        stdout: "stdout details",
        stderr: "stderr details",
      }),
    ).toBe("stderr details\nstdout details");
  });

  it("falls back to stdout and then exit code", () => {
    expect(
      formatPipelineStepFailureMessage({
        exitCode: 2,
        stdout: "stdout only",
        stderr: "   ",
      }),
    ).toBe("stdout only");

    expect(
      formatPipelineStepFailureMessage({
        exitCode: 3,
        stdout: "",
        stderr: "",
      }),
    ).toBe("Step exited with code 3");
  });
});

describe("formatPipelineSpawnError", () => {
  it("includes spawn metadata and the attempted command", () => {
    const error = Object.assign(new Error("spawn EINVAL"), {
      code: "EINVAL",
      errno: -4071,
    });

    expect(formatPipelineSpawnError(error, "npm run discover:markets -- --series KXBTC15M"))
      .toContain("spawn EINVAL");
    expect(formatPipelineSpawnError(error, "npm run discover:markets -- --series KXBTC15M"))
      .toContain("code=EINVAL");
    expect(formatPipelineSpawnError(error, "npm run discover:markets -- --series KXBTC15M"))
      .toContain("npm run discover:markets -- --series KXBTC15M");
  });
});

describe("tailCapturedOutput", () => {
  it("returns undefined for blank output and truncates long tails", () => {
    expect(tailCapturedOutput("   ")).toBeUndefined();

    const longOutput = "x".repeat(2_100);
    expect(tailCapturedOutput(longOutput)).toHaveLength(2_000);
    expect(tailCapturedOutput(longOutput)?.endsWith("x")).toBe(true);
  });
});

describe("spawnNpmScript", () => {
  it("captures stdout and stderr from a successful child process", async () => {
    const spawnImpl = vi.fn(() =>
      createMockChild({
        exitCode: 0,
        stdout: "ok",
        stderr: "warn",
      }),
    );

    const result = await spawnNpmScript(
      "discover:markets",
      ["--series", "KXBTC15M"],
      { platform: "win32", spawnImpl },
    );

    expect(spawnImpl).toHaveBeenCalledOnce();
    expect(result).toEqual({
      exitCode: 0,
      stdout: "ok",
      stderr: "warn",
    });
  });

  it("streams stderr chunks while still capturing output", async () => {
    const streamed: string[] = [];
    const spawnImpl = vi.fn(() =>
      createMockChild({
        exitCode: 0,
        stdout: "ok",
        stderr: "[Import]\nprogress",
      }),
    );

    const result = await spawnNpmScript(
      "import:batch",
      [],
      {
        platform: "linux",
        spawnImpl,
        onStderrChunk: (chunk) => {
          streamed.push(chunk);
        },
      },
    );

    expect(streamed).toEqual(["[Import]\nprogress"]);
    expect(result.stderr).toBe("[Import]\nprogress");
  });

  it("rejects when the child process fails to spawn", async () => {
    const spawnImpl = vi.fn(() =>
      createMockChild({
        error: Object.assign(new Error("spawn EINVAL"), { code: "EINVAL" }),
      }),
    );

    await expect(
      spawnNpmScript("discover:markets", [], { platform: "win32", spawnImpl }),
    ).rejects.toMatchObject({ message: "spawn EINVAL", code: "EINVAL" });
  });
});

describe("createNpmScriptRunner", () => {
  it("delegates to spawnNpmScript", async () => {
    const runner = createNpmScriptRunner({
      platform: "linux",
      spawnImpl: vi.fn(() =>
        createMockChild({
          exitCode: 0,
          stdout: "",
          stderr: "",
        }),
      ),
    });

    await expect(runner("fixtures:batch", [])).resolves.toEqual({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
  });
});
