import { describe, expect, it } from "vitest";

import { StrategySweepError, StrategySweepErrorCode } from "./strategySweepTypes";
import {
  buildSynthesizedSweepStrategyId,
  resolveSynthesizedStrategySweepEntries,
} from "./resolveSynthesizedStrategySweepEntries";

const SYNTHESIS_PATH = "data/research-results/strategy-synthesis-candidates.json";

function createSynthesisJson(strategies: unknown[]): string {
  return JSON.stringify({ strategies });
}

describe("resolveSynthesizedStrategySweepEntries", () => {
  it("returns supported synthesized entries with labeled sweep strategy ids", () => {
    const result = resolveSynthesizedStrategySweepEntries({
      synthesisPath: SYNTHESIS_PATH,
      readFile: () =>
        createSynthesisJson([
          {
            strategyId: "synth-atlas-vol-high-over",
            hypothesisId: "atlas-volatility-vol-high-over",
            strategyFamily: "calibration-fade",
            direction: "fade-yes",
            entryConditions: { yesMidThresholdCents: 55 },
            exitAssumption: "Hold to settlement",
            requiredData: ["research-output.json"],
            riskNotes: [],
            validationSummary: {
              robustnessScore: 84,
              passes: true,
              observationCount: 12,
            },
            promotionStatus: "candidate",
          },
        ]),
      fileExists: (path) => path === SYNTHESIS_PATH,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      sweepStrategyId: buildSynthesizedSweepStrategyId("synth-atlas-vol-high-over"),
      synthesizedStrategyId: "synth-atlas-vol-high-over",
      hypothesisId: "atlas-volatility-vol-high-over",
      strategyFamily: "calibration-fade",
      pluginStrategyId: "calibration-fade",
    });
    expect(result.warnings).toEqual([]);
  });

  it("throws when synthesis file is missing", () => {
    expect(() =>
      resolveSynthesizedStrategySweepEntries({
        synthesisPath: SYNTHESIS_PATH,
        readFile: () => "",
        fileExists: () => false,
      }),
    ).toThrow(StrategySweepError);

    try {
      resolveSynthesizedStrategySweepEntries({
        synthesisPath: SYNTHESIS_PATH,
        readFile: () => "",
        fileExists: () => false,
      });
    } catch (error) {
      expect((error as StrategySweepError).code).toBe(
        StrategySweepErrorCode.MISSING_SYNTHESIS_FILE,
      );
    }
  });

  it("skips unsupported specs with warnings", () => {
    const result = resolveSynthesizedStrategySweepEntries({
      synthesisPath: SYNTHESIS_PATH,
      readFile: () =>
        createSynthesisJson([
          {
            strategyId: "synth-delayed",
            hypothesisId: "lead-lag-btc-over",
            strategyFamily: "delayed-reaction",
            direction: "buy-yes",
            entryConditions: { yesMidThresholdCents: 50 },
            exitAssumption: "Hold to settlement",
            requiredData: [],
            riskNotes: [],
            validationSummary: {
              robustnessScore: 50,
              passes: false,
              observationCount: 4,
            },
            promotionStatus: "experimental",
          },
        ]),
      fileExists: (path) => path === SYNTHESIS_PATH,
    });

    expect(result.entries).toEqual([]);
    expect(result.warnings[0]).toContain("Skipped unsupported synthesized strategy");
    expect(result.warnings[0]).toContain("synth-delayed");
  });
});
