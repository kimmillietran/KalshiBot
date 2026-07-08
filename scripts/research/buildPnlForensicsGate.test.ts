import { describe, expect, it } from "vitest";

import { runPnlForensicsGateCommand } from "./buildPnlForensicsGate";

const CANDIDATES_FIXTURE = JSON.stringify({
  generatedAt: "2026-01-01T00:00:00.000Z",
  outputPath: "data/research-results/hypothesis-candidates.json",
  config: {
    minSampleSize: 30,
    minCalibrationError: 0.05,
    minLeadLagCorrelation: 0,
  },
  inputs: {},
  candidates: [],
  summary: {},
});

describe("runPnlForensicsGateCommand", () => {
  it("writes json and html outputs when replay artifact exists", () => {
    const writes = new Map<string, string>();
    const fixture = JSON.stringify({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "data/research-results/hypothesis-trade-replay.json",
      htmlOutputPath: "data/reports/hypothesis-trade-replay.html",
      disclaimer: "fixture",
      config: {
        executionMode: "cross-spread",
        maxSpreadCents: 10,
        minNetEdgeCents: 0,
        slippageBufferCents: 0,
        officialOnly: true,
        feeModel: { kind: "kalshi-fee-schedule", role: "taker", schedule: "standard" },
      },
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
        costAwareAtlasPath: "data/research-results/cost-aware-atlas.json",
        researchResultsDir: "data/research-results",
        regimeTagsPath: "data/research-results/regime-tags.json",
      },
      inputStatus: {
        hypothesisCandidatesPresent: true,
        mispricingAtlasPresent: true,
        costAwareAtlasPresent: true,
      },
      summary: {
        replayedHypothesisCount: 0,
        evaluatedTradeCount: 0,
        filledTradeCount: 0,
        skippedTradeCount: 0,
        positiveNetHypothesisCount: 0,
        killedByCostOrFillabilityCount: 0,
        untradeableHypothesisCount: 0,
        descriptiveButUnprofitableCount: 0,
      },
      entries: [],
    });

    const exitCode = runPnlForensicsGateCommand(
      [
        "--hypothesis-trade-replay",
        "tmp/hypothesis-trade-replay.json",
        "--output",
        "tmp/pnl-forensics-gate.json",
        "--html-output",
        "tmp/pnl-forensics-gate.html",
      ],
      {
        readFile: (path) => {
          if (path.endsWith("hypothesis-trade-replay.json")) {
            return fixture;
          }
          if (path.endsWith("hypothesis-candidates.json")) {
            return CANDIDATES_FIXTURE;
          }
          throw new Error(`missing ${path}`);
        },
        fileExists: (path) =>
          path.endsWith("hypothesis-trade-replay.json")
          || path.endsWith("hypothesis-candidates.json"),
        readdir: () => [],
        isDirectory: () => true,
        mkdirSync: () => undefined,
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        writeStdout: () => undefined,
        writeStderr: () => undefined,
      },
      { generatedAt: "2026-01-01T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(writes.has("tmp/pnl-forensics-gate.json")).toBe(true);
    expect(writes.has("tmp/pnl-forensics-gate.html")).toBe(true);
  });
});
