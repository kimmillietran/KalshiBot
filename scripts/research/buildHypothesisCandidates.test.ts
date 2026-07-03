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
});
