import { describe, expect, it } from "vitest";

import {
  exactCaptureIdentitiesMatch,
  listCompleteStdoutLines,
  parseExactRunIdentityFromOutput,
  tryParseExactRunIdentityFromChunk,
} from "./runIdentity";

describe("listCompleteStdoutLines", () => {
  it("buffers an incomplete trailing line until newline arrives", () => {
    expect(listCompleteStdoutLines('{"event":"capture-started","runId":"x"')).toEqual([]);
    expect(
      listCompleteStdoutLines(
        '{"event":"capture-started","runId":"x","outputDir":"out","runDir":"out/x"}\n',
      ),
    ).toEqual([
      '{"event":"capture-started","runId":"x","outputDir":"out","runDir":"out/x"}',
    ]);
  });

  it("handles multiple complete lines in one chunk", () => {
    expect(listCompleteStdoutLines('{"a":1}\n{"b":2}\n')).toEqual([
      '{"a":1}',
      '{"b":2}',
    ]);
  });
});

describe("parseExactRunIdentityFromOutput", () => {
  it("parses capture-started startup identity", () => {
    const identity = parseExactRunIdentityFromOutput(
      '{"event":"capture-started","runId":"run-1","outputDir":"data/live-capture/forward-quotes","runDir":"data/live-capture/forward-quotes/run-1","startedAt":"2026-08-03T00:00:00.000Z"}\n',
    );
    expect(identity.runId).toBe("run-1");
    expect(identity.fromStartupEvent).toBe(true);
    expect(identity.runDir.replaceAll("\\", "/")).toBe(
      "data/live-capture/forward-quotes/run-1",
    );
  });

  it("ignores unrelated BTC metric JSON without outputDir", () => {
    const identity = parseExactRunIdentityFromOutput(
      [
        '{"metric":"btc","runId":"noise","price":1}',
        '{"event":"capture-started","runId":"run-1","outputDir":"out","runDir":"out/run-1","startedAt":"t"}',
        '{"metric":"btc","runId":"noise","price":2}',
        '{"runId":"run-1","outputDir":"out","verdict":"dry-run-ok"}',
        "",
      ].join("\n"),
    );
    expect(identity.runId).toBe("run-1");
    expect(identity.fromStartupEvent).toBe(true);
  });

  it("fails closed on startup/final identity mismatch", () => {
    expect(() =>
      parseExactRunIdentityFromOutput(
        [
          '{"event":"capture-started","runId":"run-a","outputDir":"out","runDir":"out/run-a","startedAt":"t"}',
          '{"runId":"run-b","outputDir":"out","verdict":"ok"}',
          "",
        ].join("\n"),
      ),
    ).toThrow(/Startup\/final capture identity mismatch/);
  });

  it("fails closed when runId is missing", () => {
    expect(() => parseExactRunIdentityFromOutput("no json here\n")).toThrow(
      /no runId JSON/,
    );
  });

  it("fails closed on malformed complete identity JSON", () => {
    expect(() =>
      parseExactRunIdentityFromOutput('{"runId":"x","outputDir":\n'),
    ).toThrow(/Malformed run identity JSON/);
  });
});

describe("tryParseExactRunIdentityFromChunk", () => {
  it("assembles startup JSON split across chunks", () => {
    const part1 = '{"event":"capture-started","runId":"chunk-run","outputDir":"out"';
    expect(tryParseExactRunIdentityFromChunk(part1)).toBeNull();

    const part2 =
      part1 + ',"runDir":"out/chunk-run","startedAt":"2026-08-03T00:00:00.000Z"}\n';
    const parsed = tryParseExactRunIdentityFromChunk(part2);
    expect(parsed?.runId).toBe("chunk-run");
    expect(parsed?.fromStartupEvent).toBe(true);
  });
});

describe("exactCaptureIdentitiesMatch", () => {
  it("normalizes path separators and trailing slashes", () => {
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
