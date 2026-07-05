import { describe, expect, it } from "vitest";

import { runFullResearchOrchestratorCommand } from "./runFullResearchOrchestrator";

const GENERATED_AT = "2026-07-03T22:00:00.000Z";
const OUTPUT_PATH = "data/research-results/full-research-summary.json";

const BASE_REGISTERED_SCRIPTS = [
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
  "research:hypothesis-history",
  "research:dashboard",
] as const;

describe("runFullResearchOrchestratorCommand", () => {
  it("writes read-only full-research-summary.json by default", async () => {
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
      registeredNpmScripts: new Set(BASE_REGISTERED_SCRIPTS),
      runner: async (npmScript, args) => {
        calls.push({ npmScript, args });
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    expect(calls).toHaveLength(17);
    expect(calls.some((call) => call.npmScript === "research:execute-expansion-import")).toBe(false);

    const parsed = JSON.parse(writes.get(OUTPUT_PATH)!);
    expect(parsed.config.runMode).toBe("read-only");
    expect(JSON.parse(stdout.trim().split("\n").at(-1)!).runMode).toBe("read-only");
  });

  it("runs import execution mode when explicitly enabled", async () => {
    const calls: Array<{ npmScript: string; args: readonly string[] }> = [];

    await runFullResearchOrchestratorCommand(
      [
        "--execute-expansion-import",
        "--max-markets",
        "2",
        "--job-id",
        "job-a",
      ],
      {
        writeStdout: () => {},
        writeStderr: () => {},
        writeFile: () => {},
        mkdirSync: () => {},
        fileExists: () => false,
        registeredNpmScripts: new Set([
          ...BASE_REGISTERED_SCRIPTS,
          "research:execute-expansion-import",
          "research:rebuild-after-expansion",
        ]),
        runner: async (npmScript, args) => {
          calls.push({ npmScript, args });
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      },
      { generatedAt: GENERATED_AT },
    );

    expect(calls.map((call) => call.npmScript)).toContain("research:execute-expansion-import");
    expect(calls.map((call) => call.npmScript)).toContain("research:rebuild-after-expansion");
    expect(calls.find((call) => call.npmScript === "research:execute-expansion-import")?.args).toEqual([
      "--execute",
      "--max-markets",
      "2",
      "--job-id",
      "job-a",
    ]);
  });
});
