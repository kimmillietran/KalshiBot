import { describe, expect, it } from "vitest";

import { buildFullResearchSteps } from "./buildFullResearchSteps";
import { parseFullResearchOrchestratorConfigFromArgv } from "./parseFullResearchOrchestratorArgv";
import {
  runFullResearchOrchestrator,
  serializeFullResearchSummary,
} from "./runFullResearchOrchestrator";
import type { ResearchPipelineRunner } from "@/lib/data/research/pipeline";

const GENERATED_AT = "2026-07-03T22:00:00.000Z";

describe("buildFullResearchSteps", () => {
  it("returns steps in the official end-to-end research order", () => {
    expect(buildFullResearchSteps().map((step) => step.id)).toEqual([
      "data-health",
      "mispricing-atlas",
      "hypotheses",
      "hypothesis-validation",
      "strategy-synthesis",
      "research-harness",
      "harness-results",
      "candidate-registry",
      "candidate-promotions",
      "artifact-index",
      "hypothesis-lifecycle",
      "research-dashboard",
    ]);
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

  it("chains harness downstream steps through candidate promotions", () => {
    const steps = buildFullResearchSteps();
    const byId = new Map(steps.map((step) => [step.id, step]));

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
  it("invokes harness with synthesis input args in pipeline order", async () => {
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

    const harnessCall = calls.find((call) => call.npmScript === "research:harness");
    expect(harnessCall?.args).toEqual([
      "--input",
      "data/research-results/strategy-synthesis-candidates.json",
    ]);
    expect(calls.map((call) => call.npmScript)).toEqual([
      "research:data-health",
      "research:mispricing-atlas",
      "research:hypotheses",
      "research:hypothesis-validation",
      "research:strategy-synthesis",
      "research:harness",
      "research:harness-results",
      "research:candidate-registry",
      "research:candidate-promotions",
      "research:artifact-index",
      "research:hypothesis-lifecycle",
      "research:dashboard",
    ]);
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
    expect(calls).toEqual([
      "research:data-health",
      "research:mispricing-atlas",
      "research:artifact-index",
      "research:dashboard",
    ]);
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

  it("fails steps cleanly when npm scripts are not registered", async () => {
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

    expect(summary.steps.find((step) => step.stepId === "strategy-synthesis")?.status).toBe(
      "failed",
    );
    expect(
      summary.steps.find((step) => step.stepId === "strategy-synthesis")?.errorMessage,
    ).toContain("research:strategy-synthesis");
    expect(summary.steps.find((step) => step.stepId === "artifact-index")?.status).toBe(
      "succeeded",
    );
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
