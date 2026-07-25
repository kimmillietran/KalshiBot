import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCaptureReconnectSmokeCommand } from "./runCaptureReconnectSmoke";
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

function mockRunner(
  handler: (script: string, argv: readonly string[]) => RunTsxResult,
): OperatorCommandRunner {
  return {
    async runTsx(script, argv) {
      return handler(script, argv);
    },
  };
}

describe("runCaptureReconnectSmokeCommand", () => {
  it("preserves PR #41 lifecycle proof sequence in dry-run-plan", async () => {
    const { io, stdout } = createIo();
    const planned: string[] = [];
    const exitCode = await runCaptureReconnectSmokeCommand(
      ["--duration-minutes", "20", "--dry-run-plan"],
      {
        io,
        runner: mockRunner((script, argv) => {
          planned.push(`${script} ${argv.join(" ")}`);
          return { exitCode: 0, stdout: "", stderr: "" };
        }),
      },
    );
    expect(exitCode).toBe(0);
    const text = stdout.join("");
    expect(text).toContain("forceReconnectAfterFirstValidTopOfBook");
    expect(text).toContain("evaluateReconnectSmokeGate");
    expect(text).toContain("does not prove controlledReconnectProven");
    expect(planned.some((line) => line.includes("runReconnectValidationCapture.ts"))).toBe(
      true,
    );
    expect(planned.some((line) => line.includes("--series KXBTC15M"))).toBe(true);
  });

  it("always runs post-run preflight and named restart-gate arguments", async () => {
    const { io, stdout } = createIo();
    const root = mkdtempSync(join(tmpdir(), "reconnect-smoke-"));
    const runDir = join(root, "reconnect-run");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, "capture-health-audit.json"),
      JSON.stringify({ selectedRunId: "reconnect-run", summary: { verdict: "x" } }),
      "utf8",
    );
    writeFileSync(
      join(runDir, "capture-run-status.json"),
      JSON.stringify({ state: "completed" }),
      "utf8",
    );
    writeFileSync(
      join(runDir, "capture-health.json"),
      JSON.stringify({ verdict: "ok" }),
      "utf8",
    );
    writeFileSync(join(runDir, "capture-lifecycle.jsonl"), "{}\n", "utf8");

    const calls: Array<{ script: string; argv: readonly string[] }> = [];
    const exitCode = await runCaptureReconnectSmokeCommand(
      ["--duration-minutes", "20"],
      {
        io,
        requireCredentials: false,
        lockExists: () => false,
        runner: mockRunner((script, argv) => {
          calls.push({ script, argv });
          if (script.includes("runReconnectValidationCapture")) {
            return {
              exitCode: 0,
              stdout:
                JSON.stringify({ runId: "reconnect-run", outputDir: root }) + "\n",
              stderr: "",
            };
          }
          if (script.includes("evaluateReconnectSmokeGate")) {
            return { exitCode: 0, stdout: '{"passed":true}\n', stderr: "" };
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("RECONNECT GATE PASSED");
    expect(stdout.join("")).toContain("Step 6/6");

    const restartGate = calls.find(
      (call) =>
        call.script.includes("evaluateCaptureRestartGate.ts")
        && call.argv.includes("--capture-run-dir"),
    );
    expect(restartGate?.argv).toEqual([
      "--capture-run-dir",
      runDir,
      "--expected-duration-minutes",
      "20",
    ]);

    const reconnectGate = calls.find((call) =>
      call.script.includes("evaluateReconnectSmokeGate.ts"),
    );
    expect(reconnectGate?.argv).toEqual(
      expect.arrayContaining([
        "--run-id",
        "reconnect-run",
        "--run-dir",
        runDir,
        "--lock-present",
        "false",
        "--post-run-preflight-exit-code",
        "0",
      ]),
    );

    const postRun = calls.filter((call) =>
      call.argv.includes("--assert-no-active-capture"),
    );
    expect(postRun.length).toBeGreaterThanOrEqual(2);

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects durations outside 15-20 and eight-hour attempts", async () => {
    const { io, stderr } = createIo();
    const tooLong = await runCaptureReconnectSmokeCommand(
      ["--duration-minutes", "25"],
      {
        io,
        requireCredentials: false,
        runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      },
    );
    expect(tooLong).toBe(1);
    expect(stderr.join("")).toMatch(/between 15 and 20/);
  });
});
