import { describe, expect, it } from "vitest";

import { runHypothesisCandidatesCommand } from "./buildHypothesisCandidates";

const GENERATED_AT = "2026-07-02T12:00:00.000Z";
const OUTPUT_PATH = "data/research-results/hypothesis-candidates.json";

describe("runHypothesisCandidatesCommand", () => {
  it("writes hypothesis-candidates.json and research-hypotheses.html for missing input artifacts", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runHypothesisCandidatesCommand([], {
      readFile: () => {
        throw new Error("should not read");
      },
      fileExists: () => false,
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: () => {},
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    const serialized = writes.get(OUTPUT_PATH);
    expect(serialized).toBeDefined();

    const parsed = JSON.parse(serialized!);
    expect(parsed.generatedAt).toBe(GENERATED_AT);
    expect(parsed.candidates).toEqual([]);
    expect(parsed.summary.noCandidateReasons.length).toBeGreaterThan(0);

    const html = writes.get("data/reports/research-hypotheses.html");
    expect(html).toBeDefined();
    expect(html).toContain("Hypothesis Evidence Report");

    const stdoutPayload = JSON.parse(stdout);
    expect(stdoutPayload.outputPath).toBe(OUTPUT_PATH);
    expect(stdoutPayload.htmlOutputPath).toBe("data/reports/research-hypotheses.html");
  });

  it("accepts custom artifact paths and min sample overrides", () => {
    const writes = new Map<string, string>();

    const exitCode = runHypothesisCandidatesCommand(
      [
        "--output",
        OUTPUT_PATH,
        "--mispricing-atlas",
        "custom/mispricing-atlas.json",
        "--min-sample",
        "10",
      ],
      {
        readFile: () => {
          throw new Error("should not read");
        },
        fileExists: () => false,
        writeStdout: () => {},
        writeStderr: () => {},
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
      },
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(writes.get(OUTPUT_PATH)!);
    expect(parsed.config.minSampleSize).toBe(10);
    expect(parsed.inputs.mispricingAtlasPath).toBe("custom/mispricing-atlas.json");
  });

  it("includes memory diagnostics when --memory-report is passed", () => {
    let stdout = "";

    const exitCode = runHypothesisCandidatesCommand(["--memory-report"], {
      readFile: () => {
        throw new Error("should not read");
      },
      fileExists: () => false,
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: () => {},
      writeFile: () => {},
      mkdirSync: () => {},
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    const stdoutPayload = JSON.parse(stdout);
    expect(stdoutPayload.memoryDiagnostics).toEqual(
      expect.objectContaining({
        candidateCount: 0,
        largestIntermediateCollection: "mispricing-atlas-input",
      }),
    );
  });

  it("enumerates research output paths without reading file contents", () => {
    const root = "data/research-results";
    let readCount = 0;

    const exitCode = runHypothesisCandidatesCommand(
      [
        "--memory-report",
        "--research-input-root",
        root,
        "--mispricing-atlas",
        `${root}/mispricing-atlas.json`,
      ],
      {
        readFile: (path) => {
          readCount += 1;
          if (path.endsWith("mispricing-atlas.json")) {
            return JSON.stringify({
              generatedAt: GENERATED_AT,
              inputRoot: root,
              outputPath: `${root}/mispricing-atlas.json`,
              sampleCounts: {
                totalObservations: 0,
                marketCount: 0,
                skippedMissingSettlement: 0,
                skippedMissingProbability: 0,
                skippedMissingContext: 0,
              },
              overallCalibration: {
                bucketId: "overall",
                bucketLabel: "Overall",
                observations: 0,
                averageImpliedProbability: null,
                realizedFrequency: null,
                calibrationError: null,
                brierScore: null,
                averageAbsoluteError: null,
              },
              probabilityBuckets: [],
              timeRemainingBuckets: [],
              moneynessBuckets: [],
              volatilityBuckets: [],
              coarseBuckets: {
                probabilityOnly: [],
                probabilityTime: [],
                probabilityRegime: [],
                probabilityMoneyness: [],
                moneynessTime: [],
                volatilityMoneyness: [],
                volatilityProbabilityTime: [],
              },
              warnings: [],
            });
          }

          if (path.endsWith("research-output.json")) {
            return "{}";
          }

          throw new Error(`unexpected read: ${path}`);
        },
        fileExists: (path) =>
          path.endsWith("mispricing-atlas.json")
          || path.endsWith("research-output.json")
          || path.endsWith("KXBTC15M")
          || path.endsWith("noop")
          || path === root,
        writeStdout: () => {},
        writeStderr: () => {},
        writeFile: () => {},
        mkdirSync: () => {},
      },
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(readCount).toBe(1);
  });
});
