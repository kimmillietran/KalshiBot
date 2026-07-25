import { describe, expect, it } from "vitest";

import { runAuditCaptureCommand } from "./auditCapture";
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

describe("runAuditCaptureCommand", () => {
  it("requires an explicit selector and prints selected run without substitution", async () => {
    const { io, stdout } = createIo();
    const selected = {
      outcome: "selected",
      runId: "selected-run",
      runDir: "data/live-capture/forward-quotes/selected-run",
      runState: "completed",
      warnings: [],
    };

    const exitCode = await runAuditCaptureCommand(["--latest"], {
      io,
      runner: mockRunner((script) => {
        if (script.includes("selectAuditableCaptureRun")) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(selected) + "\n",
            stderr: "",
          };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      }),
    });

    expect(exitCode).toBe(0);
    const text = stdout.join("");
    expect(text).toContain("runId:    selected-run");
    expect(text).toContain("Done auditing capture run: selected-run");
    expect(text).not.toContain("substituted");
  });

  it("dry-run-plan documents selector without auditing live data", async () => {
    const { io, stdout } = createIo();
    const exitCode = await runAuditCaptureCommand(
      ["--run-id", "abc", "--full", "--dry-run-plan"],
      {
        io,
        runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      },
    );
    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("--run-id abc");
    expect(stdout.join("")).toContain("does not audit a live capture run");
  });

  it("rejects missing selectors", async () => {
    const { io, stderr } = createIo();
    const exitCode = await runAuditCaptureCommand([], {
      io,
      runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
    });
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/Select a run/);
  });
});
