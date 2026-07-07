import { describe, expect, it } from "vitest";

import { runHypothesisValidationCommand } from "./buildHypothesisValidation";
import { parseInputPathsFromArgv } from "./buildHypothesisValidationTypes";

const GENERATED_AT = "2026-07-02T12:00:00.000Z";
const OUTPUT_PATH = "data/research-results/hypothesis-validation.json";
const HTML_PATH = "data/reports/research-hypothesis-validation.html";

const EMPTY_CANDIDATES = JSON.stringify({
  generatedAt: GENERATED_AT,
  outputPath: "data/research-results/hypothesis-candidates.json",
  config: {
    minSampleSize: 5,
    minCalibrationError: 0.05,
    minLeadLagCorrelation: 0.2,
  },
  inputs: {},
  candidates: [],
  summary: {
    candidateCount: 0,
    noCandidateReasons: ["No inputs"],
  },
});

describe("runHypothesisValidationCommand", () => {
  it("returns non-zero when required input artifacts are missing", () => {
    let stderr = "";

    const exitCode = runHypothesisValidationCommand([], {
      readFile: () => {
        throw new Error("should not read");
      },
      fileExists: () => false,
      writeStdout: () => {},
      writeStderr: (text) => {
        stderr += text;
      },
      writeFile: () => {},
      mkdirSync: () => {},
      readdir: () => [],
      isDirectory: () => false,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Missing hypothesis candidates file");
  });

  it("writes validation JSON and HTML when inputs exist", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runHypothesisValidationCommand([], {
      readFile: (path) => {
        if (path.endsWith("hypothesis-candidates.json")) {
          return EMPTY_CANDIDATES;
        }

        if (path.endsWith("mispricing-atlas.json")) {
          return JSON.stringify({ generatedAt: GENERATED_AT });
        }

        return "{}";
      },
      fileExists: (path) =>
        path.endsWith("hypothesis-candidates.json")
        || path.endsWith("mispricing-atlas.json"),
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: () => {},
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
      readdir: () => [],
      isDirectory: (path) => path.replace(/\\/g, "/").endsWith("data/research-results"),
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    expect(writes.has(OUTPUT_PATH)).toBe(true);
    expect(writes.has(HTML_PATH)).toBe(true);

    const parsed = JSON.parse(writes.get(OUTPUT_PATH)!);
    expect(parsed.generatedAt).toBe(GENERATED_AT);
    expect(parsed.validations).toEqual([]);
    expect(JSON.parse(stdout).outputPath).toBe(OUTPUT_PATH);
    expect(writes.get(HTML_PATH)).toContain("Hypothesis Robustness Validation");
  });

  it("includes memory diagnostics when --memory-report is passed", () => {
    let stdout = "";

    const exitCode = runHypothesisValidationCommand(["--memory-report"], {
      readFile: (path) => {
        if (path.endsWith("hypothesis-candidates.json")) {
          return EMPTY_CANDIDATES;
        }

        if (path.endsWith("mispricing-atlas.json")) {
          return JSON.stringify({ generatedAt: GENERATED_AT });
        }

        if (path.endsWith("regime-tags.json")) {
          return JSON.stringify({ regimes: [] });
        }

        return "{}";
      },
      fileExists: (path) =>
        path.endsWith("hypothesis-candidates.json")
        || path.endsWith("mispricing-atlas.json")
        || path.endsWith("regime-tags.json"),
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: () => {},
      writeFile: () => {},
      mkdirSync: () => {},
      readdir: () => [],
      isDirectory: (path) => path.replace(/\\/g, "/").endsWith("data/research-results"),
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.memoryDiagnostics).toEqual(
      expect.objectContaining({
        hypothesisCandidateCount: 0,
        largestIntermediateCollection: "validation-bucket-accumulators",
      }),
    );
  });

  it("accepts --input refinement-hypothesis-candidates.json", () => {
    const paths = parseInputPathsFromArgv([
      "--input",
      "refinement-hypothesis-candidates.json",
    ]);

    expect(paths.hypothesisCandidatesPath).toBe(
      "data/research-results/refinement-hypothesis-candidates.json",
    );
  });
});
