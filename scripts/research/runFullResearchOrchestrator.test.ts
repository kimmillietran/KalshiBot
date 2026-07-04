import { describe, expect, it } from "vitest";

import { runFullResearchOrchestratorCommand } from "./runFullResearchOrchestrator";

const GENERATED_AT = "2026-07-03T22:00:00.000Z";
const OUTPUT_PATH = "data/research-results/full-research-summary.json";

describe("runFullResearchOrchestratorCommand", () => {
  it("writes full-research-summary.json with coverage phase steps", async () => {
    const writes = new Map<string, string>();
    let stdout = "";
    const calls: Array<{ npmScript: string; args: readonly string[] }> = [];

    const exitCode = await runFullResearchOrchestratorCommand([], {
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: () => {},
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
      fileExists: () => false,
      registeredNpmScripts: new Set([
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
      ]),
      runner: async (npmScript, args) => {
        calls.push({ npmScript, args });
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    expect(calls[0]?.npmScript).toBe("research:data-health");
    expect(calls[1]?.npmScript).toBe("research:coverage-plan");
    expect(calls.at(-1)?.npmScript).toBe("research:dashboard");
    expect(calls).toHaveLength(16);
    expect(calls.some((call) => call.npmScript === "import:batch")).toBe(false);

    const serialized = writes.get(OUTPUT_PATH);
    expect(serialized).toBeDefined();

    const parsed = JSON.parse(serialized!);
    expect(parsed.generatedAt).toBe(GENERATED_AT);
    expect(parsed.status).toBe("succeeded");
    expect(parsed.steps).toHaveLength(16);
    expect(parsed.steps.map((step: { stepId: string }) => step.stepId)).toContain(
      "coverage-plan",
    );
    expect(JSON.parse(stdout.trim().split("\n").at(-1)!).outputPath).toBe(OUTPUT_PATH);
  });

  it("returns exit code 1 when a core step fails under fail-fast mode", async () => {
    const exitCode = await runFullResearchOrchestratorCommand([], {
      writeStdout: () => {},
      writeStderr: () => {},
      writeFile: () => {},
      mkdirSync: () => {},
      fileExists: () => false,
      registeredNpmScripts: new Set([
        "research:data-health",
        "research:coverage-plan",
        "research:generate-expansion-import-config",
        "research:mispricing-atlas",
        "research:artifact-index",
        "research:dashboard",
      ]),
      runner: async (npmScript) => ({
        exitCode: npmScript === "research:mispricing-atlas" ? 1 : 0,
        stdout: "",
        stderr: "atlas failure",
      }),
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(1);
  });
});
