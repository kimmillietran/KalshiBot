import { describe, expect, it } from "vitest";

import { buildExecuteExpansionImportStepArgs } from "./buildExecuteExpansionImportStepArgs";
import { createDefaultFullResearchOrchestratorConfig } from "./runFullResearchOrchestrator";

describe("buildExecuteExpansionImportStepArgs", () => {
  it("always passes --execute and forwards optional safety args", () => {
    expect(
      buildExecuteExpansionImportStepArgs(
        createDefaultFullResearchOrchestratorConfig({
          executeExpansionImport: true,
          expansionImportMaxMarkets: 5,
          expansionImportJobId: "expansion-KXBTC15M-20260101-20260331",
          expansionImportResume: true,
        }),
      ),
    ).toEqual([
      "--execute",
      "--max-markets",
      "5",
      "--job-id",
      "expansion-KXBTC15M-20260101-20260331",
      "--resume",
    ]);
  });

  it("omits optional flags when not configured", () => {
    expect(
      buildExecuteExpansionImportStepArgs(
        createDefaultFullResearchOrchestratorConfig({
          executeExpansionImport: true,
        }),
      ),
    ).toEqual(["--execute"]);
  });
});
