import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";
import { buildHistoricalResearchFixture } from "@/lib/data/fixtures";
import { buildHistoricalResearchFixtureFromImportResult } from "@/lib/data/importJobs/fixtureBridge";
import type { HistoricalBronzeImportResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

const RUN_ID = "import-result-fixture-bridge";
const DURATION_MS = 4_000;
const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));

function loadImportResultFixture(): HistoricalBronzeImportResult {
  const fixturePath = resolve(FIXTURE_DIR, "fixtures/importResult.fixture.json");
  const raw = readFileSync(fixturePath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw) as {
    jobId: string;
    bronzeRecords: RawHistoricalRecord[];
    metadata: HistoricalBronzeImportResult["metadata"];
    validationResult: HistoricalBronzeImportResult["validationResult"];
  };

  return {
    jobId: parsed.jobId,
    bronzeRecords: parsed.bronzeRecords,
    metadata: parsed.metadata,
    validationResult: parsed.validationResult,
    serialized: JSON.stringify(parsed),
  };
}

describe("import-result fixture bridge", () => {
  it("bridges the live import-result bronze set to a research fixture", () => {
    const importResult = loadImportResultFixture();

    const fixture = buildHistoricalResearchFixtureFromImportResult({
      importResult,
      runId: RUN_ID,
      durationMs: DURATION_MS,
      initialCashCents: 100_000,
      strategyId: "noop",
      engineConfig: DEFAULT_ENGINE_CONFIG,
      fillConfig: DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
    });

    expect(fixture.runId).toBe(RUN_ID);
    expect(fixture.bronzeRecords.length).toBe(importResult.bronzeRecords.length);
    expect(() => buildHistoricalResearchFixture(fixture)).not.toThrow();
  });
});
