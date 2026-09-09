import { readFileSync, appendFileSync } from "node:fs";

import {
  formatGateReport,
  resolveCandidatePullRequests,
  runAutoMergeForPullRequest,
  type WorkflowEventName,
  type WorkflowEventPayload,
} from "./autoMergeGate";
import { createGithubApi } from "./githubApi";

function readPositiveIntegerFlag(argv: readonly string[], flag: string): number | null {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const raw = argv[index + 1];
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} requires a positive integer`);
  }
  return value;
}

function writeGithubOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }
  appendFileSync(outputPath, `${name}=${value}\n`, "utf8");
}

function writeStepSummary(text: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  appendFileSync(summaryPath, `${text}\n\n`, "utf8");
}

function parseRepository(value: string | undefined): { owner: string; repo: string } {
  const match = value?.match(/^([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error("GITHUB_REPOSITORY must be owner/repo");
  }
  return { owner: match[1]!, repo: match[2]! };
}

function loadEventPayload(eventPath: string | undefined): WorkflowEventPayload {
  if (!eventPath) {
    return {};
  }
  const raw = readFileSync(eventPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (parsed == null || typeof parsed !== "object") {
    throw new Error("GITHUB_EVENT_PATH did not contain a JSON object");
  }
  return parsed as WorkflowEventPayload;
}

export async function runAutoMergeGateCli(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  log: (text: string) => void = console.log,
): Promise<number> {
  const resolveOnly = argv.includes("--resolve-only");
  const explicitPr = readPositiveIntegerFlag(argv, "--pr");
  const eventName = (env.GITHUB_EVENT_NAME ?? "") as WorkflowEventName;
  const payload = loadEventPayload(env.GITHUB_EVENT_PATH);

  if (resolveOnly) {
    const resolved = resolveCandidatePullRequests(eventName, payload);
    if (resolved.kind === "system_failure") {
      log(resolved.reason);
      writeStepSummary(`Decision:\n  SYSTEM FAILURE\nReason:\n  ${resolved.reason}`);
      writeGithubOutput("prs", "[]");
      return 1;
    }
    if (resolved.kind === "noop") {
      log(resolved.reason);
      writeStepSummary(`Decision:\n  NO-OP\nReason:\n  ${resolved.reason}`);
      writeGithubOutput("prs", "[]");
      return 0;
    }
    writeGithubOutput("prs", JSON.stringify(resolved.prNumbers));
    log(`AUTO-MERGE candidates: ${resolved.prNumbers.join(", ")}`);
    return 0;
  }

  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token) {
    log("SYSTEM FAILURE: missing GITHUB_TOKEN");
    return 1;
  }

  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseRepository(env.GITHUB_REPOSITORY));
  } catch (error) {
    log(`SYSTEM FAILURE: ${String(error)}`);
    return 1;
  }

  let prNumbers: readonly number[];
  if (explicitPr != null) {
    prNumbers = [explicitPr];
  } else {
    const resolved = resolveCandidatePullRequests(eventName, payload);
    if (resolved.kind === "system_failure") {
      log(resolved.reason);
      writeStepSummary(`Decision:\n  SYSTEM FAILURE\nReason:\n  ${resolved.reason}`);
      return 1;
    }
    if (resolved.kind === "noop") {
      log(resolved.reason);
      writeStepSummary(`Decision:\n  NO-OP\nReason:\n  ${resolved.reason}`);
      return 0;
    }
    prNumbers = resolved.prNumbers;
  }

  const api = createGithubApi({ token, owner, repo });
  const reviewEventBaseSha =
    eventName === "pull_request_review"
    && typeof (payload as { pull_request?: { base?: { sha?: unknown } } }).pull_request?.base?.sha === "string"
      ? (payload as { pull_request: { base: { sha: string } } }).pull_request.base.sha
      : null;

  let exitCode = 0;
  for (const prNumber of prNumbers) {
    const result = await runAutoMergeForPullRequest(
      {
        fetchPullRequest: (number) => api.fetchPullRequest(number),
        fetchReviews: (number) => api.fetchReviews(number),
        fetchReviewThreads: (number) => api.fetchReviewThreads(number),
        fetchCheckRuns: (headSha) => api.fetchCheckRuns(headSha),
        fetchQualityGatesRuns: (headSha) => api.fetchQualityGatesRuns(headSha),
        fetchTrustedQualityGatesWorkflow: () => api.fetchTrustedQualityGatesWorkflow(),
        compareHeadToMain: (headSha) => api.compareHeadToMain(headSha),
        fetchDefaultBranchHasAutoMergeWorkflow: () => api.fetchDefaultBranchHasAutoMergeWorkflow(),
        fetchPullRequestFiles: (number) => api.fetchPullRequestFiles(number),
        mergePullRequest: (number, sha) => api.mergePullRequest(number, sha),
        writeLog: log,
        reviewEventBaseSha,
      },
      prNumber,
    );
    writeStepSummary(formatGateReport(result.report));
    if (result.kind === "system_failure") {
      exitCode = 1;
    }
  }
  return exitCode;
}

async function main(): Promise<void> {
  try {
    const code = await runAutoMergeGateCli(process.argv.slice(2), process.env);
    process.exitCode = code;
  } catch (error) {
    console.error(`SYSTEM FAILURE: ${String(error)}`);
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] != null && /runAutoMergeGate(\.ts)?$/.test(process.argv[1]);
if (invokedDirectly) {
  void main();
}
