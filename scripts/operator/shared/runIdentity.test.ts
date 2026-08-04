import { describe, expect, it } from "vitest";

import {
  CAPTURE_IDENTITY_MAX_FRAGMENT_BYTES,
  classifyCaptureIdentityLine,
  createCaptureIdentityStreamParser,
  deriveExpectedCaptureRunDir,
  exactCaptureIdentitiesMatch,
  normalizeCaptureIdentityPath,
  parseCaptureStartedAt,
  parseExactRunIdentityFromOutput,
  validateCaptureRunId,
} from "./runIdentity";

const STARTED = "2026-08-03T12:00:00.000Z";
const NOW_MS = Date.parse(STARTED);

function startupLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event: "capture-started",
    runId: "run-1",
    outputDir: "data/live-capture/forward-quotes",
    runDir: "data/live-capture/forward-quotes/run-1",
    startedAt: STARTED,
    ...overrides,
  });
}

function finalLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    runId: "run-1",
    outputDir: "data/live-capture/forward-quotes",
    verdict: "dry-run-ok",
    captureEndReason: "duration-complete",
    ...overrides,
  });
}

describe("normalizeCaptureIdentityPath", () => {
  it("normalizes backslashes, trailing separators, and dot segments", () => {
    expect(normalizeCaptureIdentityPath("out\\capture\\run")).toBe("out/capture/run");
    expect(normalizeCaptureIdentityPath("out/capture/")).toBe("out/capture");
    expect(normalizeCaptureIdentityPath("out/a/../b/./c")).toBe("out/b/c");
    expect(normalizeCaptureIdentityPath("/abs/x/")).toBe("/abs/x");
  });

  it("preserves relative versus absolute distinctions", () => {
    expect(normalizeCaptureIdentityPath("out/run")).not.toBe(
      normalizeCaptureIdentityPath("/out/run"),
    );
  });
});

describe("validateCaptureRunId", () => {
  it("rejects path separators and dot segments", () => {
    expect(() => validateCaptureRunId("a/b")).toThrow(/single path segment/);
    expect(() => validateCaptureRunId("a\\b")).toThrow(/single path segment/);
    expect(() => validateCaptureRunId(".")).toThrow(/\./);
    expect(() => validateCaptureRunId("..")).toThrow(/\.\./);
  });
});

describe("deriveExpectedCaptureRunDir", () => {
  it("derives join(outputDir, runId) portably", () => {
    expect(deriveExpectedCaptureRunDir("out\\capture", "run-1")).toBe(
      "out/capture/run-1",
    );
  });
});

describe("classifyCaptureIdentityLine trust boundary", () => {
  it("accepts explicit capture-started only as startup", () => {
    const identity = classifyCaptureIdentityLine(startupLine(), NOW_MS);
    expect(identity?.kind).toBe("startup");
    expect(identity?.fromStartupEvent).toBe(true);
    expect(identity?.runDir).toBe("data/live-capture/forward-quotes/run-1");
    expect(identity?.startedAtMs).toBe(NOW_MS);
  });

  it("ignores generic runId/outputDir telemetry", () => {
    expect(
      classifyCaptureIdentityLine(
        JSON.stringify({
          runId: "other-run",
          outputDir: "data/live-capture/forward-quotes",
          metric: "diagnostic",
        }),
        NOW_MS,
      ),
    ).toBeNull();
  });

  it("classifies final-summary signature without attaching as startup", () => {
    const identity = classifyCaptureIdentityLine(finalLine(), NOW_MS);
    expect(identity?.kind).toBe("final");
    expect(identity?.fromStartupEvent).toBe(false);
  });

  it("ignores BTC provider metrics", () => {
    expect(
      classifyCaptureIdentityLine(
        JSON.stringify({ metric: "btc", runId: "noise", price: 1 }),
        NOW_MS,
      ),
    ).toBeNull();
  });

  it("fails closed when explicit runDir mismatches join(outputDir, runId)", () => {
    expect(() =>
      classifyCaptureIdentityLine(
        startupLine({
          runId: "A",
          outputDir: "X",
          runDir: "Y/B",
        }),
        NOW_MS,
      ),
    ).toThrow(/explicit runDir must equal join/);
  });

  it("rejects invalid and implausibly future startedAt", () => {
    expect(() =>
      classifyCaptureIdentityLine(startupLine({ startedAt: "not-a-date" }), NOW_MS),
    ).toThrow(/valid ISO/);
    expect(() =>
      parseCaptureStartedAt("2099-01-01T00:00:00.000Z", NOW_MS),
    ).toThrow(/future/);
  });

  it("rejects runId path injection", () => {
    expect(() =>
      classifyCaptureIdentityLine(
        startupLine({
          runId: "a/b",
          runDir: "data/live-capture/forward-quotes/a/b",
        }),
        NOW_MS,
      ),
    ).toThrow(/single path segment/);
  });
});

describe("createCaptureIdentityStreamParser", () => {
  it("assembles startup JSON split across chunks including CRLF", () => {
    const parser = createCaptureIdentityStreamParser({ nowMs: () => NOW_MS });
    const full = `${startupLine()}\r\n`;
    const mid = Math.floor(full.length / 2);
    expect(parser.push(full.slice(0, mid)).startupIdentity).toBeNull();
    const state = parser.push(full.slice(mid));
    expect(state.startupIdentity?.runId).toBe("run-1");
    expect(state.phase).toBe("startup-attached");
    expect(state.diagnostics.completedLinesProcessed).toBe(1);
  });

  it("handles multiple complete lines in one chunk", () => {
    const parser = createCaptureIdentityStreamParser({ nowMs: () => NOW_MS });
    const state = parser.push(
      `${JSON.stringify({ metric: "btc", price: 1 })}\n${startupLine()}\n${finalLine()}\n`,
    );
    expect(state.startupIdentity?.runId).toBe("run-1");
    expect(state.finalIdentity?.runId).toBe("run-1");
    expect(state.diagnostics.completedLinesProcessed).toBe(3);
  });

  it("finish processes trailing fragment once", () => {
    const parser = createCaptureIdentityStreamParser({ nowMs: () => NOW_MS });
    parser.push(startupLine());
    expect(parser.getState().startupIdentity).toBeNull();
    const finished = parser.finish();
    expect(finished.startupIdentity?.runId).toBe("run-1");
    expect(parser.finish().diagnostics.startupEventsAccepted).toBe(1);
  });

  it("treats identical duplicate startup as a no-op", () => {
    const parser = createCaptureIdentityStreamParser({ nowMs: () => NOW_MS });
    parser.push(`${startupLine()}\n`);
    parser.push(`${startupLine()}\n`);
    const state = parser.getState();
    expect(state.diagnostics.startupEventsAccepted).toBe(1);
    expect(state.diagnostics.duplicateStartupNoops).toBe(1);
    expect(state.protocolFailure).toBeNull();
  });

  it("fails conflicting duplicate startup", () => {
    const parser = createCaptureIdentityStreamParser({ nowMs: () => NOW_MS });
    parser.push(`${startupLine()}\n`);
    parser.push(
      `${startupLine({
        runId: "run-2",
        runDir: "data/live-capture/forward-quotes/run-2",
      })}\n`,
    );
    expect(parser.getState().protocolFailure).toMatch(/Conflicting duplicate/);
  });

  it("fails startup/final mismatch", () => {
    const parser = createCaptureIdentityStreamParser({ nowMs: () => NOW_MS });
    parser.push(`${startupLine()}\n`);
    parser.push(`${finalLine({ runId: "run-b" })}\n`);
    expect(parser.getState().protocolFailure).toMatch(
      /Startup\/final capture identity mismatch/,
    );
  });

  it("enforces max fragment size for protocol-shaped lines", () => {
    const parser = createCaptureIdentityStreamParser({
      nowMs: () => NOW_MS,
      maxFragmentBytes: 64,
    });
    parser.push(`{"event":"capture-started","runId":"${"x".repeat(200)}`);
    expect(parser.getState().protocolFailure).toMatch(/max fragment size/);
  });

  it("processes 10_000 metric chunks linearly without retaining history", () => {
    const parser = createCaptureIdentityStreamParser({ nowMs: () => NOW_MS });
    parser.push(`${startupLine()}\n`);

    const metricChunks = 10_000;
    for (let i = 0; i < metricChunks; i += 1) {
      parser.push(
        `${JSON.stringify({
          metric: "btc",
          runId: "noise",
          price: i,
          outputDir: "should-not-attach",
        })}\n`,
      );
    }
    parser.push(`${finalLine()}\n`);
    const state = parser.finish();

    expect(state.startupIdentity?.runId).toBe("run-1");
    expect(state.finalIdentity?.runId).toBe("run-1");
    expect(state.protocolFailure).toBeNull();
    expect(state.diagnostics.completedLinesProcessed).toBe(metricChunks + 2);
    expect(state.diagnostics.identityCandidatesParsed).toBe(2);
    expect(state.diagnostics.startupEventsAccepted).toBe(1);
    expect(state.diagnostics.finalSummariesAccepted).toBe(1);
    expect(state.diagnostics.retainedHistoryBytes).toBe(0);
    expect(state.incompleteFragmentBytes).toBe(0);
    expect(state.diagnostics.maxRetainedFragmentBytes).toBeLessThan(
      CAPTURE_IDENTITY_MAX_FRAGMENT_BYTES,
    );
    // Each completed metric line is processed once — not rescanned with history.
    expect(state.diagnostics.completedLinesProcessed).toBe(metricChunks + 2);
  });

  it("ignores malformed non-protocol telemetry", () => {
    const parser = createCaptureIdentityStreamParser({ nowMs: () => NOW_MS });
    parser.push('{"runId":"x","outputDir":\n');
    expect(parser.getState().protocolFailure).toBeNull();
    parser.push(`${startupLine()}\n`);
    expect(parser.getState().startupIdentity?.runId).toBe("run-1");
  });
});

describe("parseExactRunIdentityFromOutput", () => {
  it("prefers startup and validates matching final", () => {
    const identity = parseExactRunIdentityFromOutput(
      `${JSON.stringify({ metric: "btc", price: 1 })}\n${startupLine()}\n${finalLine()}\n`,
    );
    expect(identity.kind).toBe("startup");
    expect(identity.runId).toBe("run-1");
  });

  it("supports final-only fallback", () => {
    const identity = parseExactRunIdentityFromOutput(`${finalLine()}\n`);
    expect(identity.kind).toBe("final");
    expect(identity.runId).toBe("run-1");
  });

  it("fails closed when identity is missing", () => {
    expect(() => parseExactRunIdentityFromOutput("no json here\n")).toThrow(
      /no runId JSON/,
    );
  });
});

describe("exactCaptureIdentitiesMatch", () => {
  it("matches normalized path variants", () => {
    expect(
      exactCaptureIdentitiesMatch(
        {
          runId: "r1",
          outputDir: "out\\capture",
          runDir: "out\\capture\\r1",
        },
        {
          runId: "r1",
          outputDir: "out/capture/",
          runDir: "out/capture/r1/",
        },
      ),
    ).toBe(true);
  });
});
