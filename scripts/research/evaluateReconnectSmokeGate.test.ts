import { describe, expect, it } from "vitest";

import { runEvaluateReconnectSmokeGateCommand } from "./evaluateReconnectSmokeGate";

describe("evaluateReconnectSmokeGate CLI flags", () => {
  it("rejects unknown flags", () => {
    const stderr: string[] = [];
    const exitCode = runEvaluateReconnectSmokeGateCommand(
      ["--run-id", "x", "--unknown", "1"],
      {
        writeStdout: () => {},
        writeStderr: (text) => stderr.push(text),
      },
    );
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/Unknown flag/);
  });

  it("rejects duplicate flags", () => {
    const stderr: string[] = [];
    const exitCode = runEvaluateReconnectSmokeGateCommand(
      [
        "--run-id",
        "a",
        "--run-dir",
        "a",
        "--duration-minutes",
        "20",
        "--capture-exit-code",
        "0",
        "--audit-exit-code",
        "0",
        "--restart-gate-exit-code",
        "0",
        "--post-run-preflight-exit-code",
        "0",
        "--lock-present",
        "false",
        "--run-id",
        "b",
      ],
      {
        writeStdout: () => {},
        writeStderr: (text) => stderr.push(text),
      },
    );
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/Duplicate flag/);
  });

  it("rejects missing flag values", () => {
    const stderr: string[] = [];
    const exitCode = runEvaluateReconnectSmokeGateCommand(["--run-id"], {
      writeStdout: () => {},
      writeStderr: (text) => stderr.push(text),
    });
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/Missing value|Missing required/);
  });
});
