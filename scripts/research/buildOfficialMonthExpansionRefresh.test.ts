import { describe, expect, it } from "vitest";

import { runOfficialMonthExpansionRefreshCommand } from "./buildOfficialMonthExpansionRefresh";

describe("runOfficialMonthExpansionRefreshCommand", () => {
  it("returns zero when artifacts exist and import is not executed", async () => {
    const stdout: string[] = [];
    const exitCode = await runOfficialMonthExpansionRefreshCommand(
      [
        "--research-results-dir",
        "data/research-results",
        "--output",
        "out.json",
        "--html-output",
        "out.html",
      ],
      {
        readFile: (path) => {
          if (path.includes("historical-coverage-plan")) {
            return JSON.stringify({
              snapshot: {
                monthCoverage: [],
                missingMonths: [],
                underCoveredMonths: ["2026-05"],
                coveredMonths: ["2026-01"],
              },
              recommendations: [],
            });
          }

          if (path.includes("pnl-forensics-gate")) {
            return JSON.stringify({
              summary: {
                familyNetPnlCents: 7898,
                familyForensicsVerdict: "pause-family-concentrated-pnl",
                uniqueTradingDayCount: 94,
                uniqueMarketCount: 882,
              },
              monthlyPnl: [],
            });
          }

          if (path.includes("derived-month-pnl-sensitivity")) {
            return JSON.stringify({
              summary: {
                fullCorpusNetPnlCents: 7898,
                excludingSensitiveMonthNetPnlCents: 2302,
                familyRecommendation: "collect-more-official-months",
                recommendFullM12: false,
              },
              variants: [
                {
                  variantId: "excluding-sensitive-month",
                  nonSensitivePositiveMonthCount: 3,
                  topMonthShare: 0.847,
                },
              ],
            });
          }

          return JSON.stringify({ candidates: [], summary: {} });
        },
        writeStdout: (text) => {
          stdout.push(text);
        },
        writeStderr: () => {},
        writeFile: () => {},
        mkdirSync: () => {},
        fileExists: () => true,
        readdir: () => [],
        isDirectory: () => false,
        runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      },
      { generatedAt: "2026-01-01T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("finalRecommendation");
  });
});
