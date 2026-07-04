import { describe, expect, it } from "vitest";

import { buildFullResearchSteps } from "./buildFullResearchSteps";
import { parseFullResearchOrchestratorConfigFromArgv } from "./parseFullResearchOrchestratorArgv";
import {
  runFullResearchOrchestrator,
  serializeFullResearchSummary,
} from "./runFullResearchOrchestrator";
import type { ResearchPipelineRunner } from "@/lib/data/research/pipeline";

const GENERATED_AT = "2026-07-03T22:00:00.000Z";

const EXPECTED_STEP_ORDER = [
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

const IMPORT_EXECUTION_SCRIPTS = [
  "import:batch",
  "import:historical",
  "research:pipeline",
] as const;

describe("buildFullResearchSteps", () => {
  it("returns steps in the official end-to-end research order", () => {
    expect(buildFullResearchSteps().map((step) => step.id)).toEqual([...EXPECTED_STEP_ORDER]);
  });

  it("places coverage planning after data health and before atlas", () => {
    const ids = buildFullResearchSteps().map((step) => step.id);
    expect(ids.indexOf("data-health")).toBeLessThan(ids.indexOf("coverage-plan"));
    expect(ids.indexOf("coverage-plan")).toBeLessThan(
      ids.indexOf("generate-expansion-import-config"),
    );
    expect(ids.indexOf("generate-expansion-import-config")).toBeLessThan(
      ids.indexOf("mispricing-atlas"),
    );
  });

  it("places coverage validation after cross-validation as an optional step", () => {
    const steps = buildFullResearchSteps();
    const byId = new Map(steps.map((step) => [step.id, step]));

    expect(byId.get("cross-validation")?.upstreamStepIds).toEqual([
      "strategy-synthesis",
      "hypothesis-validation",
    ]);
    expect(byId.get("coverage-validation")?.upstreamStepIds).toEqual(["cross-validation"]);
    expect(byId.get("coverage-validation")?.optional).toBe(true);
  });

  it("passes synthesis candidates to the harness via --input", () => {
    const harness = buildFullResearchSteps().find((step) => step.id === "research-harness");

    expect(harness?.args).toEqual([
      "--input",
      "data/research-results/strategy-synthesis-candidates.json",
    ]);
    expect(harness?.npmScript).toBe("research:harness");
  });

  it("marks reporting steps as independent", () => {
    const steps = buildFullResearchSteps();
    const independent = steps.filter((step) => step.independent).map((step) => step.id);

    expect(independent).toEqual([
      "data-health",
      "artifact-index",
      "research-dashboard",
    ]);
  });

  it("chains expansion config generation from the coverage plan", () => {
    const steps = buildFullResearchSteps();
    const byId = new Map(steps.map((step) => [step.id, step]));

    expect(byId.get("generate-expansion-import-config")?.upstreamStepIds).toEqual([
      "coverage-plan",
    ]);
    expect(byId.get("harness-results")?.upstreamStepIds).toEqual(["research-harness"]);
    expect(byId.get("candidate-registry")?.upstreamStepIds).toEqual(["harness-results"]);
    expect(byId.get("candidate-promotions")?.upstreamStepIds).toEqual(["candidate-registry"]);
    expect(byId.get("artifact-index")?.upstreamStepIds).toEqual([]);
  });
});

describe("parseFullResearchOrchestratorConfigFromArgv", () => {
  it("parses continue-on-error and output path", () => {
    expect(
      parseFullResearchOrchestratorConfigFromArgv([
        "--continue-on-error",
        "--output",
        "tmp/full-summary.json",
      ]),
    ).toEqual({
      continueOnError: true,
      summaryOutputPath: "tmp/full-summary.json",
    });
  });
});

describe("runFullResearchOrchestrator", () => {
  it("invokes coverage and analysis steps in pipeline order without running imports", async () => {
    const calls: Array<{ npmScript: string; args: readonly string[] }> = [];
    const runner: ResearchPipelineRunner = async (npmScript, args) => {
      calls.push({ npmScript, args });
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await runFullResearchOrchestrator({
      config: {
        continueOnError: false,
        summaryOutputPath: "data/research-results/full-research-summary.json",
      },
      generatedAt: GENERATED_AT,
      runner,
      isNpmScriptRegistered: () => true,
    });

    expect(calls.map((call) => call.npmScript)).toEqual([
      "research:data-health",
      "research:coverage-plan",
      "research:generate-expansion-import-config",
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
    expect(calls.some((call) => IMPORT_EXECUTION_SCRIPTS.includes(call.npmScript as typeof IMPORT_EXECUTION_SCRIPTS[number]))).toBe(false);
  });

  it("records coverage steps in full-research-summary.json output", async () => {
    const { summary } = await runFullResearchOrchestrator({
      config: {
        continueOnError: true,
        summaryOutputPath: "data/research-results/full-research-summary.json",
      },
      generatedAt: GENERATED_AT,
      runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      isNpmScriptRegistered: (npmScript) => npmScript !== "research:coverage-validation",
    });

    const coveragePlan = summary.steps.find((step) => step.stepId === "coverage-plan");
    const expansionConfig = summary.steps.find(
      (step) => step.stepId === "generate-expansion-import-config",
    );
    const coverageValidation = summary.steps.find(
      (step) => step.stepId === "coverage-validation",
    );

    expect(coveragePlan?.status).toBe("succeeded");
    expect(expansionConfig?.status).toBe("succeeded");
    expect(coverageValidation?.status).toBe("skipped");
    expect(coverageValidation?.errorMessage).toContain("Optional coverage step skipped");
    expect(serializeFullResearchSummary(summary)).toContain("coverage-plan");
  });

  it("fails coverage planning clearly when npm scripts are not registered", async () => {
    const { summary } = await runFullResearchOrchestrator({
      config: {
        continueOnError: true,
        summaryOutputPath: "data/research-results/full-research-summary.json",
      },
      generatedAt: GENERATED_AT,
      runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      isNpmScriptRegistered: (npmScript) =>
        [
          "research:data-health",
          "research:mispricing-atlas",
          "research:hypotheses",
          "research:hypothesis-validation",
          "research:artifact-index",
          "research:dashboard",
        ].includes(npmScript),
    });

    const coveragePlan = summary.steps.find((step) => step.stepId === "coverage-plan");
    const expansionConfig = summary.steps.find(
      (step) => step.stepId === "generate-expansion-import-config",
    );

    expect(coveragePlan?.status).toBe("failed");
    expect(coveragePlan?.errorMessage).toContain("research:coverage-plan");
    expect(expansionConfig?.status).toBe("skipped");
  });

  it("fails fast on core chain failures and still runs independent reporting steps", async () => {
    const calls: string[] = [];
    const runner: ResearchPipelineRunner = async (npmScript) => {
      calls.push(npmScript);

      if (npmScript === "research:mispricing-atlas") {
        return { exitCode: 1, stdout: "", stderr: "atlas failed" };
      }

      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const { summary, exitCode } = await runFullResearchOrchestrator({
      config: {
        continueOnError: false,
        summaryOutputPath: "data/research-results/full-research-summary.json",
      },
      generatedAt: GENERATED_AT,
      runner,
      isNpmScriptRegistered: () => true,
    });

    expect(exitCode).toBe(1);
    expect(summary.status).toBe("partial");
    expect(summary.steps.find((step) => step.stepId === "data-health")?.status).toBe(
      "succeeded",
    );
    expect(summary.steps.find((step) => step.stepId === "mispricing-atlas")?.status).toBe(
      "failed",
    );
    expect(summary.steps.find((step) => step.stepId === "hypotheses")?.status).toBe(
      "skipped",
    );
    expect(summary.steps.find((step) => step.stepId === "artifact-index")?.status).toBe(
      "succeeded",
    );
    expect(summary.steps.find((step) => step.stepId === "research-dashboard")?.status).toBe(
      "succeeded",
    );
    expect(calls).not.toContain("import:batch");
  });

  it("skips downstream steps when upstream dependency fails", async () => {
    const runner: ResearchPipelineRunner = async (npmScript) => {
      if (npmScript === "research:hypotheses") {
        return { exitCode: 1, stdout: "", stderr: "hypothesis generation failed" };
      }

      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const { summary } = await runFullResearchOrchestrator({
      config: {
        continueOnError: false,
        summaryOutputPath: "data/research-results/full-research-summary.json",
      },
      generatedAt: GENERATED_AT,
      runner,
      isNpmScriptRegistered: () => true,
    });

    expect(summary.steps.find((step) => step.stepId === "hypothesis-validation")?.status).toBe(
      "skipped",
    );
    expect(
      summary.steps.find((step) => step.stepId === "hypothesis-validation")?.errorMessage,
    ).toContain("Hypothesis candidates");
  });

  it("records outputs generated and warnings", async () => {
    const runner: ResearchPipelineRunner = async () => ({
      exitCode: 0,
      stdout: "⚠️  stale dependency warning",
      stderr: "",
    });

    const { summary } = await runFullResearchOrchestrator({
      config: {
        continueOnError: false,
        summaryOutputPath: "data/research-results/full-research-summary.json",
      },
      generatedAt: GENERATED_AT,
      runner,
      isNpmScriptRegistered: (npmScript) =>
        npmScript === "research:data-health" || npmScript === "research:mispricing-atlas",
      outputIo: {
        fileExists: (path) => path === "data/research-results/data-health.json",
      },
    });

    const dataHealth = summary.steps.find((step) => step.stepId === "data-health");
    expect(dataHealth?.outputsGenerated).toEqual(["data/research-results/data-health.json"]);
    expect(dataHealth?.warnings).toContain("⚠️  stale dependency warning");
  });

  it("serializes summaries deterministically", async () => {
    const runner: ResearchPipelineRunner = async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });

    const input = {
      config: {
        continueOnError: false,
        summaryOutputPath: "data/research-results/full-research-summary.json",
      },
      generatedAt: GENERATED_AT,
      runner,
      isNpmScriptRegistered: () => true,
    };

    const first = await runFullResearchOrchestrator(input);
    const second = await runFullResearchOrchestrator(input);

    const normalize = (summary: typeof first.summary) => ({
      ...summary,
      steps: summary.steps.map((step) => ({ ...step, durationMs: 0 })),
    });

    expect(serializeFullResearchSummary(normalize(first.summary))).toBe(
      serializeFullResearchSummary(normalize(second.summary)),
    );
  });
});
