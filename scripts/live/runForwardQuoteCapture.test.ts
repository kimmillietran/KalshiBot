import { describe, expect, it } from "vitest";

import {
  resetForwardCaptureShutdown,
  runForwardQuoteCaptureCommand,
} from "./runForwardQuoteCapture";
import {
  parseForwardQuoteCaptureConfigFromArgv,
} from "./runForwardQuoteCaptureTypes";

describe("parseForwardQuoteCaptureConfigFromArgv", () => {
  it("parses duration-minutes and capture-btc-spot", () => {
    const config = parseForwardQuoteCaptureConfigFromArgv([
      "--series",
      "KXBTC15M",
      "--duration-minutes",
      "5",
      "--max-markets",
      "2",
      "--capture-btc-spot",
      "--dry-run",
    ]);

    expect(config.durationMinutes).toBe(5);
    expect(config.maxMarkets).toBe(2);
    expect(config.captureBtcSpot).toBe(true);
    expect(config.dryRun).toBe(true);
  });
});

describe("runForwardQuoteCaptureCommand", () => {
  it("CLI smoke test dry-run writes artifacts", async () => {
    resetForwardCaptureShutdown();
    const written: Record<string, string> = {};
    const stdout: string[] = [];

    const exitCode = await runForwardQuoteCaptureCommand(
      [
        "--dry-run",
        "--series",
        "KXBTC15M",
        "--duration-minutes",
        "1",
        "--max-markets",
        "1",
        "--capture-btc-spot",
        "--output-dir",
        "out/capture",
        "--html-output",
        "out/report.html",
      ],
      {
        writeStdout: (text) => stdout.push(text),
        writeStderr: () => {},
        writeFile: (path, data) => {
          written[path] = data;
        },
        appendFile: (path, data) => {
          written[path] = (written[path] ?? "") + data;
        },
        mkdirSync: () => {},
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("dry-run-ok");
    expect(written["out/report.html"]).toContain("Capture infrastructure only");
  });

  it("returns exit code 1 when a stream fails only during finalization end()", async () => {
    resetForwardCaptureShutdown();
    const written: Record<string, string> = {};
    const stdout: string[] = [];

    const exitCode = await runForwardQuoteCaptureCommand(
      [
        "--dry-run",
        "--series",
        "KXBTC15M",
        "--duration-minutes",
        "1",
        "--max-markets",
        "1",
        "--output-dir",
        "out/capture",
        "--html-output",
        "out/report.html",
      ],
      {
        writeStdout: (text) => stdout.push(text),
        writeStderr: () => {},
        writeFile: (path, data) => {
          written[path] = data;
        },
        appendFile: (path, data) => {
          written[path] = (written[path] ?? "") + data;
        },
        mkdirSync: () => {},
        createAppendStream: (path) => ({
          write: () => true,
          onceDrain: () => {},
          onError: () => {},
          end: () =>
            path.endsWith("raw-kalshi-ws.jsonl")
              ? Promise.reject(new Error("EIO: flush failed during close"))
              : Promise.resolve(),
        }),
      },
    );

    // The capture itself succeeded; only stream close/flush failed. The
    // process exit code must still report failure.
    expect(exitCode).toBe(1);
    const output = stdout.join("");
    expect(output).toContain("writer-failure");
    expect(output).toContain("capture-writer-failure");
  });
});
