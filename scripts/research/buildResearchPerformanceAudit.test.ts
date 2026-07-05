import { describe, expect, it } from "vitest";

import { buildFullResearchSteps } from "@/lib/data/research/fullOrchestrator/buildFullResearchSteps";
import { createDefaultFullResearchOrchestratorConfig } from "@/lib/data/research/fullOrchestrator/runFullResearchOrchestrator";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { runResearchPerformanceAuditCommand } from "./buildResearchPerformanceAudit";

const GENERATED_AT = "2026-07-03T22:00:00.000Z";
const CONFIG = createDefaultFullResearchOrchestratorConfig();

function createIo() {
  const files: Record<string, string> = {};
  const dirs = new Set<string>();

  const steps = buildFullResearchSteps(CONFIG).map((step) => ({
    stepId: step.id,
    label: step.label,
    npmScript: step.npmScript,
    command: `npm run ${step.npmScript}`,
    status: "succeeded" as const,
    exitCode: 0,
    durationMs: 1000,
    outputsGenerated: [...step.expectedOutputs],
    warnings: [],
  }));

  files["data/research-results/full-research-summary.json"] = stableStringify({
    generatedAt: GENERATED_AT,
    outputPath: "data/research-results/full-research-summary.json",
    config: { ...CONFIG, runMode: "read-only" },
    status: "succeeded",
    steps,
  });

  let stdout = "";
  let stderr = "";

  return {
    files,
    dirs,
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
        dirs.add(path.slice(0, path.lastIndexOf("/")));
      },
      mkdirSync: (path: string) => {
        dirs.add(path);
      },
    },
  };
}

describe("runResearchPerformanceAuditCommand", () => {
  it("writes JSON and HTML audit outputs", () => {
    const mock = createIo();
    const exitCode = runResearchPerformanceAuditCommand(
      [],
      mock.io,
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(mock.files["data/research-results/research-performance-audit.json"]).toBeDefined();
    expect(mock.files["data/reports/research-performance-audit.html"]).toContain(
      "Research Pipeline Performance Audit",
    );

    const payload = JSON.parse(mock.stdout().trim()) as {
      totalRuntimeMs: number;
      opportunityCount: number;
    };
    expect(payload.totalRuntimeMs).toBe(17_000);
    expect(payload.opportunityCount).toBeGreaterThan(0);
  });

  it("returns exit code 1 when full-research-summary is missing", () => {
    const mock = createIo();
    delete mock.files["data/research-results/full-research-summary.json"];

    const exitCode = runResearchPerformanceAuditCommand([], mock.io, {
      generatedAt: GENERATED_AT,
    });

    expect(exitCode).toBe(1);
    expect(mock.stderr()).toContain("Required input not found");
  });
});
