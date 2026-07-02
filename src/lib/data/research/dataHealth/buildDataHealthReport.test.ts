import { describe, expect, it } from "vitest";

import { buildDataHealthReport, serializeDataHealthReport } from "./buildDataHealthReport";
import { DEFAULT_DATA_HEALTH_CONFIG, scanDataHealthInputs } from "./scanDataHealthInputs";
import type { DataHealthIo } from "./dataHealthTypes";

const GENERATED_AT = "2026-07-02T22:30:00.000Z";

type MockFs = {
  files: Record<string, string>;
  directories: Set<string>;
  modified: Record<string, string>;
};

function createIo(mock: MockFs): DataHealthIo {
  return {
    readdir: (path) => {
      const prefix = path.endsWith("/") ? path.slice(0, -1) : path;
      const entries = new Set<string>();
      for (const filePath of Object.keys(mock.files)) {
        if (filePath.startsWith(`${prefix}/`)) {
          const remainder = filePath.slice(prefix.length + 1);
          const segment = remainder.split("/")[0];
          if (segment) {
            entries.add(segment);
          }
        }
      }
      for (const directory of mock.directories) {
        if (directory.startsWith(`${prefix}/`)) {
          const remainder = directory.slice(prefix.length + 1);
          const segment = remainder.split("/")[0];
          if (segment) {
            entries.add(segment);
          }
        }
      }
      return [...entries].sort();
    },
    readFile: (path) => mock.files[path] ?? "",
    fileExists: (path) =>
      mock.files[path] !== undefined || mock.directories.has(path),
    isDirectory: (path) => mock.directories.has(path),
    getLastModified: (path) => mock.modified[path] ?? null,
  };
}

function addFile(mock: MockFs, path: string, content: string, modified: string): void {
  const parts = path.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    mock.directories.add(parts.slice(0, index).join("/"));
  }
  mock.files[path] = content;
  mock.modified[path] = modified;
}

describe("buildDataHealthReport", () => {
  it("reports red stages for an empty project", () => {
    const io = createIo({ files: {}, directories: new Set(["data"]), modified: {} });
    const scanned = scanDataHealthInputs(DEFAULT_DATA_HEALTH_CONFIG, io);
    const report = buildDataHealthReport({
      generatedAt: GENERATED_AT,
      config: DEFAULT_DATA_HEALTH_CONFIG,
      scanned,
    });

    expect(report.pipelineCoverage.researchOutputs).toBe(0);
    expect(report.stageStatuses.some((stage) => stage.status === "red")).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("marks a healthy full pipeline green across core stages", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]), modified: {} };
    addFile(
      mock,
      "discovery-result.json",
      JSON.stringify({ markets: [{ marketTicker: "MKT-A" }, { marketTicker: "MKT-B" }] }),
      "2026-07-02T20:00:00.000Z",
    );
    addFile(mock, "data/import-configs/KXBTC15M/MKT-A/config.json", "{}", "2026-07-02T20:01:00.000Z");
    addFile(mock, "data/import-configs/KXBTC15M/MKT-B/config.json", "{}", "2026-07-02T20:01:00.000Z");
    addFile(
      mock,
      "data/imports/batch-import-summary.json",
      JSON.stringify({ successfulImports: 2, failedImports: 0 }),
      "2026-07-02T20:02:00.000Z",
    );
    addFile(mock, "data/fixtures/KXBTC15M/MKT-A/fixture.json", "{}", "2026-07-02T20:03:00.000Z");
    addFile(mock, "data/fixtures/KXBTC15M/MKT-B/fixture.json", "{}", "2026-07-02T20:03:00.000Z");
    addFile(
      mock,
      "data/research-datasets/KXBTC15M/dataset-registry.json",
      JSON.stringify({
        markets: [
          { marketTicker: "MKT-A", settlementPresent: true },
          { marketTicker: "MKT-B", settlementPresent: true },
        ],
      }),
      "2026-07-02T20:04:00.000Z",
    );
    addFile(
      mock,
      "data/research-results/noop/KXBTC15M/MKT-A/research-output.json",
      "{}",
      "2026-07-02T20:05:00.000Z",
    );
    addFile(
      mock,
      "data/research-results/noop/KXBTC15M/MKT-B/research-output.json",
      "{}",
      "2026-07-02T20:05:00.000Z",
    );
    addFile(
      mock,
      "data/research-results/noop/KXBTC15M/aggregate-summary.json",
      "{}",
      "2026-07-02T20:06:00.000Z",
    );
    addFile(
      mock,
      "data/research-results/noop/KXBTC15M/MKT-A/calibration-report.json",
      "{}",
      "2026-07-02T20:07:00.000Z",
    );
    addFile(
      mock,
      "data/research-results/noop/KXBTC15M/MKT-B/calibration-report.json",
      "{}",
      "2026-07-02T20:07:00.000Z",
    );
    addFile(
      mock,
      "data/research-results/mispricing-atlas.json",
      JSON.stringify({ sampleCounts: { marketCount: 2 } }),
      "2026-07-02T20:08:00.000Z",
    );
    addFile(
      mock,
      "data/research-results/lead-lag-analysis.json",
      JSON.stringify({ sampleCounts: { marketCount: 2 } }),
      "2026-07-02T20:08:00.000Z",
    );
    addFile(
      mock,
      "data/research-results/statistical-significance.json",
      JSON.stringify({ strategies: [{ strategyId: "noop" }] }),
      "2026-07-02T20:08:00.000Z",
    );
    addFile(mock, "data/leaderboards/strategy-leaderboard.json", "{}", "2026-07-02T20:09:00.000Z");
    addFile(mock, "data/reports/research-report.html", "<html></html>", "2026-07-02T20:10:00.000Z");

    const report = buildDataHealthReport({
      generatedAt: GENERATED_AT,
      config: DEFAULT_DATA_HEALTH_CONFIG,
      scanned: scanDataHealthInputs(DEFAULT_DATA_HEALTH_CONFIG, createIo(mock)),
    });

    expect(report.pipelineCoverage.researchOutputs).toBe(2);
    expect(report.settlementHealth.settlementMissing).toBe(0);
    expect(report.stageStatuses.find((stage) => stage.stageId === "discovery")?.status).toBe(
      "green",
    );
    expect(report.stageStatuses.find((stage) => stage.stageId === "imports")?.status).toBe("green");
  });

  it("flags missing settlements", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]), modified: {} };
    addFile(
      mock,
      "data/research-datasets/KXBTC15M/dataset-registry.json",
      JSON.stringify({
        markets: [
          { marketTicker: "MKT-A", settlementPresent: true },
          { marketTicker: "MKT-B", settlementPresent: false },
        ],
      }),
      "2026-07-02T20:04:00.000Z",
    );

    const report = buildDataHealthReport({
      generatedAt: GENERATED_AT,
      config: DEFAULT_DATA_HEALTH_CONFIG,
      scanned: scanDataHealthInputs(DEFAULT_DATA_HEALTH_CONFIG, createIo(mock)),
    });

    expect(report.settlementHealth.settlementMissing).toBe(1);
    expect(report.settlementHealth.missingSettlementExamples).toEqual(["MKT-B"]);
    expect(report.stageStatuses.find((stage) => stage.stageId === "settlement")?.status).not.toBe(
      "green",
    );
  });

  it("warns when hypotheses are older than the mispricing atlas", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]), modified: {} };
    addFile(
      mock,
      "data/research-results/mispricing-atlas.json",
      JSON.stringify({ sampleCounts: { marketCount: 1 } }),
      "2026-07-02T22:00:00.000Z",
    );
    addFile(
      mock,
      "data/research-results/hypothesis-candidates.json",
      JSON.stringify({ candidates: [] }),
      "2026-07-02T20:00:00.000Z",
    );

    const report = buildDataHealthReport({
      generatedAt: GENERATED_AT,
      config: DEFAULT_DATA_HEALTH_CONFIG,
      scanned: scanDataHealthInputs(DEFAULT_DATA_HEALTH_CONFIG, createIo(mock)),
    });

    expect(report.artifactFreshness.staleDependencyWarnings[0]?.code).toBe(
      "hypotheses-older-than-mispricing-atlas",
    );
  });

  it("marks analysis stage red when mispricing atlas is missing", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]), modified: {} };
    addFile(
      mock,
      "data/research-results/noop/KXBTC15M/MKT-A/research-output.json",
      "{}",
      "2026-07-02T20:05:00.000Z",
    );

    const report = buildDataHealthReport({
      generatedAt: GENERATED_AT,
      config: DEFAULT_DATA_HEALTH_CONFIG,
      scanned: scanDataHealthInputs(DEFAULT_DATA_HEALTH_CONFIG, createIo(mock)),
    });

    expect(report.researchCoverage.mispricingAtlasPresent).toBe(false);
    expect(report.stageStatuses.find((stage) => stage.stageId === "analysis")?.status).toBe("red");
  });

  it("marks partial imports yellow when failures exist", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]), modified: {} };
    addFile(mock, "data/import-configs/KXBTC15M/MKT-A/config.json", "{}", "2026-07-02T20:01:00.000Z");
    addFile(
      mock,
      "data/imports/batch-import-summary.json",
      JSON.stringify({ successfulImports: 1, failedImports: 1 }),
      "2026-07-02T20:02:00.000Z",
    );

    const report = buildDataHealthReport({
      generatedAt: GENERATED_AT,
      config: DEFAULT_DATA_HEALTH_CONFIG,
      scanned: scanDataHealthInputs(DEFAULT_DATA_HEALTH_CONFIG, createIo(mock)),
    });

    expect(report.stageStatuses.find((stage) => stage.stageId === "imports")?.status).toBe(
      "yellow",
    );
  });

  it("serializes deterministically", () => {
    const io = createIo({ files: {}, directories: new Set(["data"]), modified: {} });
    const report = buildDataHealthReport({
      generatedAt: GENERATED_AT,
      config: DEFAULT_DATA_HEALTH_CONFIG,
      scanned: scanDataHealthInputs(DEFAULT_DATA_HEALTH_CONFIG, io),
    });

    expect(serializeDataHealthReport(report)).toBe(serializeDataHealthReport(report));
    expect(report.stageStatuses.map((stage) => stage.stageId)).toEqual([
      "aggregate",
      "analysis",
      "calibration",
      "discovery",
      "fixtures",
      "imports",
      "leaderboard",
      "registry",
      "report",
      "research",
      "settlement",
    ]);
  });
});
