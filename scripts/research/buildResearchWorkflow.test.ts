import { describe, expect, it } from "vitest";

import { runResearchWorkflowCommand } from "./buildResearchWorkflow";
import { DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS } from "@/lib/data/research/researchWorkflow";

const GENERATED_AT = "2026-07-06T04:52:00.000Z";
const OUTPUT_PATH = "data/research-results/research-workflow.json";
const HTML_PATH = "data/reports/research-workflow.html";

function createIo(files: Record<string, string> = {}) {
  let stdout = "";
  let stderr = "";

  return {
    files,
    stdout: () => stdout,
    stderr: () => stderr,
    io: {
      readFile: (path: string) => files[path] ?? "",
      fileExists: (path: string) => path in files,
      writeStdout: (text: string) => {
        stdout += text;
      },
      writeStderr: (text: string) => {
        stderr += text;
      },
      writeFile: (path: string, data: string) => {
        files[path] = data;
      },
      mkdirSync: () => undefined,
    },
  };
}

describe("runResearchWorkflowCommand", () => {
  it("writes workflow json and html outputs", () => {
    const fixture = createIo({
      [DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.hypothesisFailureAnalysisPath]:
        JSON.stringify({
          analyses: [
            {
              hypothesisId: "hyp-cli",
              hypothesis: "CLI hypothesis",
              passes: false,
              robustnessScore: 52,
              priorityRank: 1,
              priorityCategory: "near-promising",
              recommendedNextAction: "strategy-synthesis-investigation",
              failureReasons: [],
            },
          ],
        }),
      [DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.strategySynthesisDebugPath]:
        JSON.stringify({
          traces: [
            {
              hypothesisId: "hyp-cli",
              harnessEligible: true,
              harnessEvaluated: false,
              funnelStageReached: "synthesis-candidate",
            },
          ],
        }),
    });

    const exitCode = runResearchWorkflowCommand(
      ["--output", OUTPUT_PATH, "--html-output", HTML_PATH],
      fixture.io,
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(fixture.files[OUTPUT_PATH]).toBeDefined();
    expect(fixture.files[HTML_PATH]).toContain("Research Workflow");
    expect(JSON.parse(fixture.stdout()).nextRecommendedMilestone).toBe(
      "Run research-only harness",
    );
  });
});
