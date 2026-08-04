import { describe, expect, it } from "vitest";

import { runCaptureRestartSmokeCommand } from "./runCaptureRestartSmoke";
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

describe("runCaptureRestartSmokeCommand", () => {
  it("preserves the five-step gate sequence and exact argv in dry-run-plan", async () => {
    const { io, stdout } = createIo();
    const planned: string[] = [];
    const exitCode = await runCaptureRestartSmokeCommand(
      ["--duration-minutes", "20", "--dry-run-plan"],
      {
        io,
        runner: mockRunner((script, argv) => {
          planned.push(`${script} ${argv.join(" ")}`);
          return {
            exitCode: 0,
            stdout: `PLAN: ${script}\n`,
            stderr: "",
          };
        }),
      },
    );
    expect(exitCode).toBe(0);
    const text = stdout.join("");
    expect(text).toContain("1) assert-no-active-capture");
    expect(text).toContain("5) evaluateCaptureRestartGate");
    expect(text).toContain("does not authorize eight-hour restart");
    expect(planned[0]).toContain("evaluateCaptureRestartGate.ts");
    expect(planned[0]).toContain("--assert-no-active-capture");
    expect(planned[1]).toContain("runForwardQuoteCapture.ts");
    expect(planned[1]).toContain("--duration-minutes 20");
    expect(planned[1]).toContain("--series KXBTC15M");
    expect(planned[1]).toContain("--max-markets 5");
  });

  it("propagates stage failures and uses exact-run identity", async () => {
    const { io, stdout } = createIo();
    const { mkdirSync, mkdtempSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const root = mkdtempSync(join(tmpdir(), "restart-smoke-"));
    const runDir = join(root, "exact-run");
    mkdirSync(runDir, { recursive: true });

    let step = 0;
    const exitCode = await runCaptureRestartSmokeCommand(
      ["--duration-minutes", "20"],
      {
        io,
        requireCredentials: false,
        runner: mockRunner((script) => {
          step += 1;
          if (script.includes("evaluateCaptureRestartGate") && step === 1) {
            return { exitCode: 0, stdout: "{}\n", stderr: "" };
          }
          if (script.includes("runForwardQuoteCapture")) {
            return {
              exitCode: 0,
              stdout:
                JSON.stringify({
                  runId: "exact-run",
                  outputDir: root,
                  verdict: "ok",
                  captureEndReason: "duration-complete",
                }) + "\n",
              stderr: "",
            };
          }
          if (script.includes("buildCaptureHealthAudit")) {
            return { exitCode: 1, stdout: "", stderr: "audit fail\n" };
          }
          if (script.includes("buildBidSizeCoverageAudit")) {
            return { exitCode: 0, stdout: "", stderr: "" };
          }
          if (script.includes("buildCaptureHealthReconciliation")) {
            return { exitCode: 0, stdout: "", stderr: "" };
          }
          if (script.includes("evaluateCaptureRestartGate")) {
            return { exitCode: 1, stdout: "", stderr: "gate fail\n" };
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        }),
      },
    );

    expect(exitCode).toBe(1);
    expect(stdout.join("")).toContain("runId:   exact-run");
    expect(stdout.join("")).toContain("RESTART GATE FAILED");
    expect(stdout.join("")).toContain("capture-health-audit");
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects out-of-range durations", async () => {
    const { io, stderr } = createIo();
    const exitCode = await runCaptureRestartSmokeCommand(
      ["--duration-minutes", "5"],
      {
        io,
        requireCredentials: false,
        runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      },
    );
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/between 15 and 30/);
  });
});
