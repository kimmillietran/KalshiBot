import { describe, expect, it } from "vitest";

import { buildFullResearchSteps } from "./buildFullResearchSteps";
import { parseFullResearchOrchestratorConfigFromArgv } from "./parseFullResearchOrchestratorArgv";
import {
  createDefaultFullResearchOrchestratorConfig,
  runFullResearchOrchestrator,
  serializeFullResearchSummary,
} from "./runFullResearchOrchestrator";
import type { ResearchPipelineRunner } from "@/lib/data/research/pipeline";

const GENERATED_AT = "2026-07-03T22:00:00.000Z";
const DEFAULT_CONFIG = createDefaultFullResearchOrchestratorConfig();

const READ_ONLY_STEP_ORDER = [
  "data-health",
  "coverage-plan",
  "generate-expansion-import-config",
  "mispricing-atlas",
  "hypotheses",
  "hypothesis-validation",
  "strategy-synthesis",
  "cross-validation",
  "coverage-validation",
  "research-harness",
  "harness-results",
  "candidate-registry",
  "candidate-promotions",
  "artifact-index",
  "hypothesis-lifecycle",
  "research-dashboard",
] as const;

const IMPORT_EXECUTION_STEP_ORDER = [
  "data-health",
  "coverage-plan",
  "generate-expansion-import-config",
  "execute-expansion-import",
  "rebuild-after-expansion",
  ...READ_ONLY_STEP_ORDER.slice(3),
] as const;

const IMPORT_EXECUTION_SCRIPTS = [
  "import:batch",
  "import:historical",
  "research:pipeline",
] as const;

describe("buildFullResearchSteps", () => {
  it("returns read-only steps by default", () => {
    expect(buildFullResearchSteps(DEFAULT_CONFIG).map((step) => step.id)).toEqual([
      ...READ_ONLY_STEP_ORDER,
    ]);
  });

  it("inserts import execution and rebuild steps when enabled", () => {
    expect(
      buildFullResearchSteps(
        createDefaultFullResearchOrchestratorConfig({ executeExpansionImport: true }),
      ).map((step) => step.id),
    ).toEqual([...IMPORT_EXECUTION_STEP_ORDER]);
  });

  it("requires rebuild before atlas when import execution is enabled", () => {
    const byId = new Map(
      buildFullResearchSteps(
        createDefaultFullResearchOrchestratorConfig({ executeExpansionImport: true }),
      ).map((step) => [step.id, step]),
    );

    expect(byId.get("mispricing-atlas")?.upstreamStepIds).toEqual(["rebuild-after-expansion"]);
    expect(byId.get("execute-expansion-import")?.executionRisk).toBe("import-execution");
    expect(byId.get("rebuild-after-expansion")?.executionRisk).toBe("networked-rebuild");
  });

  it("passes synthesis candidates to the harness via --input", () => {
    const harness = buildFullResearchSteps(DEFAULT_CONFIG).find(
      (step) => step.id === "research-harness",
    );

    expect(harness?.args).toEqual([
      "--input",
      "data/research-results/strategy-synthesis-candidates.json",
    ]);
  });
});

describe("parseFullResearchOrchestratorConfigFromArgv", () => {
  it("defaults to read-only orchestrator mode", () => {
    expect(parseFullResearchOrchestratorConfigFromArgv(["--continue-on-error"])).toEqual({
      continueOnError: true,
      summaryOutputPath: "data/research-results/full-research-summary.json",
      executeExpansionImport: false,
      expansionImportMaxMarkets: null,
      expansionImportJobId: null,
      expansionImportResume: false,
    });
  });

  it("parses import execution mode and safety args", () => {
    expect(
      parseFullResearchOrchestratorConfigFromArgv([
        "--execute-expansion-import",
        "--max-markets",
        "5",
        "--job-id",
        "expansion-KXBTC15M-20260101-20260331",
        "--resume",
      ]),
    ).toEqual({
      continueOnError: false,
      summaryOutputPath: "data/research-results/full-research-summary.json",
      executeExpansionImport: true,
      expansionImportMaxMarkets: 5,
      expansionImportJobId: "expansion-KXBTC15M-20260101-20260331",
      expansionImportResume: true,
    });
  });
});

describe("runFullResearchOrchestrator", () => {
  it("invokes read-only steps without import execution CLIs", async () => {
    const calls: Array<{ npmScript: string; args: readonly string[] }> = [];
    const runner: ResearchPipelineRunner = async (npmScript, args) => {
      calls.push({ npmScript, args });
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const { summary } = await runFullResearchOrchestrator({
      config: DEFAULT_CONFIG,
      generatedAt: GENERATED_AT,
      runner,
      isNpmScriptRegistered: () => true,
    });

    expect(calls.map((call) => call.npmScript)).not.toContain("research:execute-expansion-import");
    expect(calls.map((call) => call.npmScript)).not.toContain("research:rebuild-after-expansion");
    expect(calls.some((call) => IMPORT_EXECUTION_SCRIPTS.includes(call.npmScript as typeof IMPORT_EXECUTION_SCRIPTS[number]))).toBe(false);
    expect(summary.config.runMode).toBe("read-only");
    expect(summary.steps.some((step) => step.executionRisk)).toBe(false);
  });

  it("runs import execution and rebuild steps with forwarded safety args", async () => {
    const calls: Array<{ npmScript: string; args: readonly string[] }> = [];
    const runner: ResearchPipelineRunner = async (npmScript, args) => {
      calls.push({ npmScript, args });
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const config = createDefaultFullResearchOrchestratorConfig({
      executeExpansionImport: true,
      expansionImportMaxMarkets: 3,
      expansionImportJobId: "job-a",
      expansionImportResume: true,
    });

    const { summary } = await runFullResearchOrchestrator({
      config,
      generatedAt: GENERATED_AT,
      runner,
      isNpmScriptRegistered: () => true,
    });

    expect(calls.map((call) => call.npmScript)).toEqual([
      "research:data-health",
      "research:coverage-plan",
      "research:generate-expansion-import-config",
      "research:execute-expansion-import",
      "research:rebuild-after-expansion",
      "research:mispricing-atlas",
      "research:hypotheses",
      "research:hypothesis-validation",
      "research:strategy-synthesis",
      "research:cross-validation",
      "research:coverage-validation",
      "research:harness",
      "research:harness-results",
      "research:candidate-registry",
      "research:candidate-promotions",
      "research:artifact-index",
      "research:hypothesis-lifecycle",
      "research:dashboard",
    ]);

    expect(calls.find((call) => call.npmScript === "research:execute-expansion-import")?.args).toEqual([
      "--execute",
      "--max-markets",
      "3",
      "--job-id",
      "job-a",
      "--resume",
    ]);
    expect(summary.config.runMode).toBe("import-executing");
    expect(summary.steps.find((step) => step.stepId === "execute-expansion-import")?.executionRisk).toBe(
      "import-execution",
    );
    expect(serializeFullResearchSummary(summary)).toContain("import-executing");
  });

  it("fails import execution clearly when npm scripts are not registered", async () => {
    const { summary } = await runFullResearchOrchestrator({
      config: createDefaultFullResearchOrchestratorConfig({
        executeExpansionImport: true,
        continueOnError: true,
      }),
      generatedAt: GENERATED_AT,
      runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      isNpmScriptRegistered: (npmScript) =>
        ![
          "research:execute-expansion-import",
          "research:rebuild-after-expansion",
        ].includes(npmScript),
    });

    const importStep = summary.steps.find((step) => step.stepId === "execute-expansion-import");
    const rebuildStep = summary.steps.find((step) => step.stepId === "rebuild-after-expansion");

    expect(importStep?.status).toBe("failed");
    expect(importStep?.errorMessage).toContain("research:execute-expansion-import");
    expect(rebuildStep?.status).toBe("skipped");
  });

  it("records coverage validation as optional skip when script is missing", async () => {
    const { summary } = await runFullResearchOrchestrator({
      config: DEFAULT_CONFIG,
      generatedAt: GENERATED_AT,
      runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      isNpmScriptRegistered: (npmScript) => npmScript !== "research:coverage-validation",
    });

    const coverageValidation = summary.steps.find((step) => step.stepId === "coverage-validation");
    expect(coverageValidation?.status).toBe("skipped");
    expect(coverageValidation?.errorMessage).toContain("Optional coverage step skipped");
  });

  it("fails fast on core chain failures and still runs independent reporting steps", async () => {
    const runner: ResearchPipelineRunner = async (npmScript) => {
      if (npmScript === "research:mispricing-atlas") {
        return { exitCode: 1, stdout: "", stderr: "atlas failed" };
      }

      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const { summary, exitCode } = await runFullResearchOrchestrator({
      config: DEFAULT_CONFIG,
      generatedAt: GENERATED_AT,
      runner,
      isNpmScriptRegistered: () => true,
    });

    expect(exitCode).toBe(1);
    expect(summary.status).toBe("partial");
    expect(summary.steps.find((step) => step.stepId === "artifact-index")?.status).toBe(
      "succeeded",
    );
  });
});
