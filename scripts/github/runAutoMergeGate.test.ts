import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runAutoMergeGateCli } from "./runAutoMergeGate";

function eventEnv(payload: unknown, eventName: string): NodeJS.ProcessEnv {
  const directory = mkdtempSync(path.join(tmpdir(), "auto-merge-event-"));
  const eventPath = path.join(directory, "event.json");
  writeFileSync(eventPath, JSON.stringify(payload), "utf8");
  return {
    GITHUB_EVENT_NAME: eventName,
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_REPOSITORY: "kimmillietran/KalshiBot",
  };
}

describe("runAutoMergeGateCli resolve-only", () => {
  it("17. workflow_run with no associated PR is a zero-exit no-op", async () => {
    const logs: string[] = [];
    const code = await runAutoMergeGateCli(
      ["--resolve-only"],
      eventEnv({ workflow_run: { pull_requests: [] } }, "workflow_run"),
      (text) => logs.push(text),
    );
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain(
      "AUTO-MERGE NO-OP: workflow run has no associated pull request",
    );
  });

  it("invalid workflow_dispatch pr_number is a system failure", async () => {
    const code = await runAutoMergeGateCli(
      ["--resolve-only"],
      eventEnv({ inputs: { pr_number: "nope" } }, "workflow_dispatch"),
    );
    expect(code).toBe(1);
  });
});
