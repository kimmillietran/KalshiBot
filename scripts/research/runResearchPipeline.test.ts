import { describe, expect, it } from "vitest";

import { runResearchPipelineCommand } from "./runResearchPipeline";

const GENERATED_AT = "2026-07-02T14:00:00.000Z";
const OUTPUT_PATH = "data/research-results/pipeline-summary.json";

describe("runResearchPipelineCommand", () => {
  it("writes pipeline-summary.json and reports stdout metadata", async () => {
    const writes = new Map<string, string>();
    let stdout = "";
    const calls: string[] = [];

    const exitCode = await runResearchPipelineCommand(
      ["--series", "KXBTC15M", "--limit", "500"],
      {
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: () => {},
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
        runner: async (npmScript) => {
          calls.push(npmScript);
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      },
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(calls[0]).toBe("discover:markets");
    expect(calls.at(-2)).toBe("research:mispricing-atlas");
    expect(calls.at(-1)).toBe("research:hypotheses");
    expect(calls).toHaveLength(18);

    const serialized = writes.get(OUTPUT_PATH);
    expect(serialized).toBeDefined();

    const parsed = JSON.parse(serialized!);
    expect(parsed.generatedAt).toBe(GENERATED_AT);
    expect(parsed.config.series).toBe("KXBTC15M");
    expect(parsed.status).toBe("succeeded");
    expect(parsed.steps).toHaveLength(18);
    expect(JSON.parse(stdout.trim().split("\n").at(-1)!).outputPath).toBe(
      OUTPUT_PATH,
    );
  });

  it("returns exit code 1 when a step fails under fail-fast mode", async () => {
    const exitCode = await runResearchPipelineCommand([], {
      writeStdout: () => {},
      writeStderr: () => {},
      writeFile: () => {},
      mkdirSync: () => {},
      runner: async (npmScript) => ({
        exitCode: npmScript === "fixtures:batch" ? 1 : 0,
        stdout: "",
        stderr: "fixture failure",
      }),
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(1);
  });
});
