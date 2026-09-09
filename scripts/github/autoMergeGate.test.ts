import { describe, expect, it } from "vitest";

import {
  evaluateAutoMergeGate,
  prTouchesTrustedAutoMergePaths,
  resolveCandidatePullRequests,
  runAutoMergeForPullRequest,
} from "./autoMergeGate";
import {
  AUTO_MERGE_WORKFLOW_PATH,
  QUALITY_GATES_WORKFLOW_PATH,
  type CheckRunSnapshot,
  type EvaluateInput,
  type GithubReview,
  type PullRequestFileSnapshot,
  type PullRequestSnapshot,
  type QualityGatesRunSnapshot,
  type QualityGatesWorkflowIdentity,
} from "./autoMergeGateTypes";
import { parseGovernedCursorLrmVerdict } from "./parseCursorLrmVerdict";

const HEAD_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HEAD_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const MAIN_SHA = "cccccccccccccccccccccccccccccccccccccccc";
const TRUSTED_QG_WORKFLOW: QualityGatesWorkflowIdentity = {
  id: 100,
  path: QUALITY_GATES_WORKFLOW_PATH,
  name: "Quality Gates",
  state: "active",
};
const SPOOFED_QG_WORKFLOW: QualityGatesWorkflowIdentity = {
  id: 999,
  path: ".github/workflows/fake-quality.yml",
  name: "Quality Gates",
  state: "active",
};

const APPROVED_BODY = `# LRM Review

## Verdict

APPROVED FOR MERGE

Additional notes are ignored.
`;

const CHANGES_BODY = `# LRM Review

## Verdict

CHANGES REQUESTED
`;

function pr(overrides: Partial<PullRequestSnapshot> = {}): PullRequestSnapshot {
  return {
    number: 55,
    state: "open",
    draft: false,
    merged: false,
    mergeable: true,
    mergeability: "MERGEABLE",
    baseRef: "main",
    baseSha: MAIN_SHA,
    headSha: HEAD_B,
    mergeCommitSha: null,
    body: "ordinary PR description",
    authorLogin: "builder",
    ...overrides,
  };
}

function prFile(
  filename: string,
  overrides: Partial<PullRequestFileSnapshot> = {},
): PullRequestFileSnapshot {
  return {
    filename,
    previousFilename: null,
    status: "modified",
    ...overrides,
  };
}

function cursorReview(overrides: Partial<GithubReview> = {}): GithubReview {
  return {
    id: 1,
    userLogin: "cursor[bot]",
    commitId: HEAD_B,
    submittedAt: "2026-09-08T20:00:00.000Z",
    state: "COMMENTED",
    body: APPROVED_BODY,
    ...overrides,
  };
}

function requiredChecks(headSha: string, conclusion: CheckRunSnapshot["conclusion"] = "success"): CheckRunSnapshot[] {
  return [
    { name: "Lint, build, and test", headSha, status: "completed", conclusion },
    { name: "Operator matrix (macOS)", headSha, status: "completed", conclusion },
    { name: "Operator matrix (Ubuntu)", headSha, status: "completed", conclusion },
  ];
}

function qualityGates(
  headSha: string,
  overrides: Partial<QualityGatesRunSnapshot> = {},
): QualityGatesRunSnapshot[] {
  return [
    {
      id: 9,
      workflowId: TRUSTED_QG_WORKFLOW.id,
      workflowPath: TRUSTED_QG_WORKFLOW.path,
      name: "Quality Gates",
      headSha,
      status: "completed",
      conclusion: "success",
      createdAt: "2026-09-08T20:00:00.000Z",
      jobs: [
        { name: "Lint, build, and test", status: "completed", conclusion: "success" },
        { name: "Operator matrix (macOS)", status: "completed", conclusion: "success" },
        { name: "Operator matrix (Ubuntu)", status: "completed", conclusion: "success" },
        {
          name: "Operator compatibility (Windows, advisory)",
          status: "completed",
          conclusion: "failure",
        },
      ],
      ...overrides,
    },
  ];
}

function eligibleInput(overrides: Partial<EvaluateInput> = {}): EvaluateInput {
  const pullRequest = overrides.pullRequest ?? pr();
  return {
    reviews: [cursorReview()],
    issueComments: [],
    threads: [{ isResolved: true }],
    checkRuns: requiredChecks(pullRequest.headSha),
    qualityGatesRuns: qualityGates(pullRequest.headSha),
    trustedQualityGatesWorkflow: TRUSTED_QG_WORKFLOW,
    compareToMain: { behindBy: 0 },
    currentMainSha: MAIN_SHA,
    reviewEventBaseSha: MAIN_SHA,
    bootstrapWorkflowPresentOnDefaultBranch: true,
    prTouchesAutoMergeWorkflow: false,
    ...overrides,
    pullRequest,
  };
}

describe("parseGovernedCursorLrmVerdict", () => {
  it("reads the governed Verdict section", () => {
    expect(parseGovernedCursorLrmVerdict(APPROVED_BODY)).toEqual({
      verdict: "APPROVED_FOR_MERGE",
      reason: "ok",
    });
    expect(parseGovernedCursorLrmVerdict(CHANGES_BODY)).toEqual({
      verdict: "CHANGES_REQUESTED",
      reason: "ok",
    });
  });

  it("ignores a loose APPROVED FOR MERGE mention without a Verdict heading", () => {
    expect(
      parseGovernedCursorLrmVerdict("Please treat this as APPROVED FOR MERGE"),
    ).toEqual({ verdict: null, reason: "missing" });
  });

  it("rejects reviews that contain both governed verdicts", () => {
    expect(
      parseGovernedCursorLrmVerdict(`${APPROVED_BODY}\n## Verdict\n\nCHANGES REQUESTED\n`),
    ).toEqual({ verdict: null, reason: "ambiguous" });
  });

  it("rejects a Verdict heading with an unknown value", () => {
    expect(parseGovernedCursorLrmVerdict("## Verdict\n\nLOOKS GOOD\n")).toEqual({
      verdict: null,
      reason: "malformed",
    });
  });
});

describe("resolveCandidatePullRequests", () => {
  it("17. no PR associated with workflow_run is a no-op", () => {
    expect(
      resolveCandidatePullRequests("workflow_run", { workflow_run: { pull_requests: [] } }),
    ).toEqual({
      kind: "noop",
      reason: "AUTO-MERGE NO-OP: workflow run has no associated pull request",
    });
  });

  it("evaluates each associated workflow_run PR independently", () => {
    expect(
      resolveCandidatePullRequests("workflow_run", {
        workflow_run: { pull_requests: [{ number: 12 }, { number: 13 }] },
      }),
    ).toEqual({ kind: "prs", prNumbers: [12, 13] });
  });

  it("reads pull_request_review and workflow_dispatch numbers", () => {
    expect(
      resolveCandidatePullRequests("pull_request_review", { pull_request: { number: 55 } }),
    ).toEqual({ kind: "prs", prNumbers: [55] });
    expect(
      resolveCandidatePullRequests("workflow_dispatch", { inputs: { pr_number: "61" } }),
    ).toEqual({ kind: "prs", prNumbers: [61] });
  });
});

describe("auto-merge security gates", () => {
  it("1. PR author APPROVED FOR MERGE in the PR body is ignored", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        pullRequest: pr({ body: "## Verdict\n\nAPPROVED FOR MERGE\n" }),
        reviews: [],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toMatch(/missing exact-head Cursor LRM/);
  });

  it("2. cursor[bot] issue comments are ignored", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [],
        issueComments: [{ userLogin: "cursor[bot]", body: APPROVED_BODY }],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toMatch(/missing exact-head Cursor LRM/);
  });

  it("3. arbitrary user review with exact approval text is ignored", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [
          cursorReview({ id: 2, userLogin: "alice", body: APPROVED_BODY, commitId: HEAD_B }),
        ],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toMatch(/missing exact-head Cursor LRM/);
  });

  it("4. Cursor approval on an old SHA is stale", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [cursorReview({ commitId: HEAD_A, submittedAt: "2026-09-08T19:00:00.000Z" })],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("stale Cursor review");
  });

  it("5. latest Cursor review on current SHA says CHANGES REQUESTED", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [
          cursorReview({ id: 1, submittedAt: "2026-09-08T19:00:00.000Z", body: APPROVED_BODY }),
          cursorReview({ id: 2, submittedAt: "2026-09-08T20:00:00.000Z", body: CHANGES_BODY }),
        ],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("CHANGES REQUESTED");
  });

  it("6. latest Cursor review on current SHA says approved", () => {
    const result = evaluateAutoMergeGate(eligibleInput());
    expect(result.kind).toBe("eligible");
    expect(result.authorizedHeadSha).toBe(HEAD_B);
  });

  it("7. malformed Cursor verdict is blocked", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [cursorReview({ body: "## Verdict\n\nSHIP IT\n" })],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("Cursor verdict malformed");
  });

  it("8. summary mentions APPROVED FOR MERGE but Verdict is CHANGES REQUESTED", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [
          cursorReview({
            body: "Summary: APPROVED FOR MERGE\n\n## Verdict\n\nCHANGES REQUESTED\n",
          }),
        ],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("CHANGES REQUESTED");
  });

  it("9. exact-head CI absent is blocked", () => {
    const result = evaluateAutoMergeGate(eligibleInput({ checkRuns: [] }));
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("exact-head CI absent");
  });

  it("10. old-head CI success only is blocked", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        checkRuns: requiredChecks(HEAD_A),
        qualityGatesRuns: qualityGates(HEAD_A),
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("exact-head CI absent");
  });

  it("11. unresolved thread is blocked", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({ threads: [{ isResolved: false }, { isResolved: true }] }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("AUTO-MERGE BLOCKED: unresolved review threads = 1");
  });

  it("12. draft is blocked", () => {
    expect(evaluateAutoMergeGate(eligibleInput({ pullRequest: pr({ draft: true }) })).kind).toBe(
      "blocked",
    );
  });

  it("13. wrong base is blocked", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({ pullRequest: pr({ baseRef: "develop" }) }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("wrong base");
  });

  it("14. mergeability unknown is blocked", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({ pullRequest: pr({ mergeable: null, mergeability: "UNKNOWN" }) }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("AUTO-MERGE BLOCKED: mergeability not yet resolved");
  });

  it("15. conflict is blocked", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({ pullRequest: pr({ mergeable: false, mergeability: "CONFLICTING" }) }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("conflict");
  });

  it("19. PR already merged is a no-op", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({ pullRequest: pr({ state: "closed", merged: true }) }),
    );
    expect(result.kind).toBe("noop");
  });

  it("CI pending is blocked without becoming a system failure", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        checkRuns: [
          { name: "Lint, build, and test", headSha: HEAD_B, status: "in_progress", conclusion: null },
          { name: "Operator matrix (macOS)", headSha: HEAD_B, status: "completed", conclusion: "success" },
          { name: "Operator matrix (Ubuntu)", headSha: HEAD_B, status: "completed", conclusion: "success" },
        ],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("CI pending");
  });
});

describe("auto-merge behavioral orderings", () => {
  it("A. CI success then Cursor approval is eligible", () => {
    expect(evaluateAutoMergeGate(eligibleInput()).kind).toBe("eligible");
  });

  it("B. Cursor approval then CI success is eligible", () => {
    expect(evaluateAutoMergeGate(eligibleInput()).kind).toBe("eligible");
  });

  it("C. approval on A plus CI on B is blocked until Cursor reviews B", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [cursorReview({ commitId: HEAD_A })],
        checkRuns: requiredChecks(HEAD_B),
        qualityGatesRuns: qualityGates(HEAD_B),
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("stale Cursor review");
  });

  it("D. CHANGES REQUESTED on A after push B is blocked until Cursor reviews B", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [cursorReview({ commitId: HEAD_A, body: CHANGES_BODY })],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("missing exact-head Cursor LRM");
  });

  it("E. Cursor approves B but an unresolved thread remains", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({ threads: [{ isResolved: false }] }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toContain("unresolved review threads = 1");
  });

  it("F. later resolved threads make the same snapshot eligible", () => {
    expect(
      evaluateAutoMergeGate(eligibleInput({ threads: [{ isResolved: true }] })).kind,
    ).toBe("eligible");
  });

  it("18. review-then-CI and CI-then-review converge", () => {
    const afterReview = evaluateAutoMergeGate(
      eligibleInput({
        checkRuns: [
          { name: "Lint, build, and test", headSha: HEAD_B, status: "queued", conclusion: null },
          { name: "Operator matrix (macOS)", headSha: HEAD_B, status: "completed", conclusion: "success" },
          { name: "Operator matrix (Ubuntu)", headSha: HEAD_B, status: "completed", conclusion: "success" },
        ],
      }),
    );
    const afterCi = evaluateAutoMergeGate(eligibleInput());
    expect(afterReview.kind).toBe("blocked");
    expect(afterCi.kind).toBe("eligible");
  });
});

describe("SHA-guarded merge and API failures", () => {
  it("16. current head changing after decision blocks the merge", async () => {
    let fetches = 0;
    const result = await runAutoMergeForPullRequest(
      {
        fetchPullRequest: async () => {
          fetches += 1;
          return fetches === 1 ? pr() : pr({ headSha: HEAD_A });
        },
        fetchReviews: async () => [cursorReview()],
        fetchReviewThreads: async () => [{ isResolved: true }],
        fetchCheckRuns: async () => requiredChecks(HEAD_B),
        fetchQualityGatesRuns: async () => qualityGates(HEAD_B),
        fetchTrustedQualityGatesWorkflow: async () => TRUSTED_QG_WORKFLOW,
        compareHeadToMain: async () => ({ behindBy: 0, mainSha: MAIN_SHA }),
        fetchDefaultBranchHasAutoMergeWorkflow: async () => true,
        fetchPullRequestFiles: async () => [prFile("README.md")],
        mergePullRequest: async () => {
          throw new Error("merge should not run");
        },
        writeLog: () => {},
        reviewEventBaseSha: MAIN_SHA,
      },
      55,
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("AUTO-MERGE BLOCKED: head changed during merge gate");
  });

  it("20. API failure is a system failure, not eligibility", async () => {
    const result = await runAutoMergeForPullRequest(
      {
        fetchPullRequest: async () => {
          throw new Error("401 Unauthorized");
        },
        fetchReviews: async () => [],
        fetchReviewThreads: async () => [],
        fetchCheckRuns: async () => [],
        fetchQualityGatesRuns: async () => [],
        fetchTrustedQualityGatesWorkflow: async () => TRUSTED_QG_WORKFLOW,
        compareHeadToMain: async () => ({ behindBy: 0, mainSha: MAIN_SHA }),
        fetchDefaultBranchHasAutoMergeWorkflow: async () => true,
        fetchPullRequestFiles: async () => [],
        mergePullRequest: async () => ({ merged: false, sha: null, message: null }),
        writeLog: () => {},
      },
      55,
    );
    expect(result.kind).toBe("system_failure");
    expect(result.report.decision).toBe("SYSTEM FAILURE");
  });

  it("merge API SHA mismatch is a blocked head change, not a retry", async () => {
    const result = await runAutoMergeForPullRequest(
      {
        fetchPullRequest: async () => pr(),
        fetchReviews: async () => [cursorReview()],
        fetchReviewThreads: async () => [{ isResolved: true }],
        fetchCheckRuns: async () => requiredChecks(HEAD_B),
        fetchQualityGatesRuns: async () => qualityGates(HEAD_B),
        fetchTrustedQualityGatesWorkflow: async () => TRUSTED_QG_WORKFLOW,
        compareHeadToMain: async () => ({ behindBy: 0, mainSha: MAIN_SHA }),
        fetchDefaultBranchHasAutoMergeWorkflow: async () => true,
        fetchPullRequestFiles: async () => [prFile("README.md")],
        mergePullRequest: async () => {
          throw new Error("Head SHA did not match / expected sha mismatch");
        },
        writeLog: () => {},
        reviewEventBaseSha: MAIN_SHA,
      },
      55,
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("AUTO-MERGE BLOCKED: head changed during merge gate");
  });

  it("successful merge is SHA-guarded and verified", async () => {
    const mergedShas: string[] = [];
    const result = await runAutoMergeForPullRequest(
      {
        fetchPullRequest: async () =>
          mergedShas.length === 0
            ? pr()
            : pr({ merged: true, state: "closed", mergeCommitSha: "dddddddddddddddddddddddddddddddddddddddd" }),
        fetchReviews: async () => [cursorReview()],
        fetchReviewThreads: async () => [{ isResolved: true }],
        fetchCheckRuns: async () => requiredChecks(HEAD_B),
        fetchQualityGatesRuns: async () => qualityGates(HEAD_B),
        fetchTrustedQualityGatesWorkflow: async () => TRUSTED_QG_WORKFLOW,
        compareHeadToMain: async () => ({ behindBy: 0, mainSha: MAIN_SHA }),
        fetchDefaultBranchHasAutoMergeWorkflow: async () => true,
        fetchPullRequestFiles: async () => [prFile("README.md")],
        mergePullRequest: async (_prNumber, sha) => {
          mergedShas.push(sha);
          return { merged: true, sha: "dddddddddddddddddddddddddddddddddddddddd", message: "merged" };
        },
        writeLog: () => {},
        reviewEventBaseSha: MAIN_SHA,
      },
      55,
    );
    expect(result.kind).toBe("eligible");
    expect(mergedShas).toEqual([HEAD_B]);
    expect(result.mergeCommitSha).toBe("dddddddddddddddddddddddddddddddddddddddd");
  });

  it("blocks when main has advanced since the reviewed relationship", () => {
    const result = evaluateAutoMergeGate(eligibleInput({ compareToMain: { behindBy: 2 } }));
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("base drift");
  });

  it("bootstrap: missing default-branch workflow is a no-op", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({ bootstrapWorkflowPresentOnDefaultBranch: false }),
    );
    expect(result.kind).toBe("noop");
    expect(result.reason).toMatch(/bootstrap/);
  });

  it("bootstrap: PRs that change the auto-merge workflow stay blocked", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({ prTouchesAutoMergeWorkflow: true }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toMatch(/manual merge/);
  });

  it("treats quality-gates.yml as trusted CI authority that requires manual merge", () => {
    expect(prTouchesTrustedAutoMergePaths([prFile(QUALITY_GATES_WORKFLOW_PATH)])).toBe(true);
    const result = evaluateAutoMergeGate(
      eligibleInput({
        prTouchesAutoMergeWorkflow: prTouchesTrustedAutoMergePaths([
          prFile(QUALITY_GATES_WORKFLOW_PATH),
        ]),
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe(
      "PR changes trusted auto-merge / CI / package-runtime authority and requires manual merge",
    );
  });

  it("deliberate policy tightening: any .github/workflows path requires manual merge", () => {
    // Supersedes the earlier assumption that an unrelated workflow file
    // could auto-merge. A newly added workflow is repository automation
    // authority and must not bootstrap itself through the merge bot.
    expect(
      prTouchesTrustedAutoMergePaths([prFile(".github/workflows/unrelated-report.yml")]),
    ).toBe(true);
    const result = evaluateAutoMergeGate(
      eligibleInput({
        prTouchesAutoMergeWorkflow: prTouchesTrustedAutoMergePaths([
          prFile(".github/workflows/unrelated-report.yml"),
        ]),
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toMatch(/manual merge/);
  });

  it("blocks when ordinary code is mixed with quality-gates.yml", () => {
    const files = [prFile("src/lib/foo.ts"), prFile(QUALITY_GATES_WORKFLOW_PATH)];
    expect(prTouchesTrustedAutoMergePaths(files)).toBe(true);
    const result = evaluateAutoMergeGate(
      eligibleInput({
        prTouchesAutoMergeWorkflow: prTouchesTrustedAutoMergePaths(files),
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toMatch(/trusted auto-merge \/ CI \/ package-runtime authority/);
  });

  it("does not merge when Quality Gates workflow is in the changed files", async () => {
    let mergeCalls = 0;
    const result = await runAutoMergeForPullRequest(
      {
        fetchPullRequest: async () => pr({ headSha: HEAD_A }),
        fetchReviews: async () => [cursorReview({ commitId: HEAD_A })],
        fetchReviewThreads: async () => [{ isResolved: true }],
        fetchCheckRuns: async () => requiredChecks(HEAD_A),
        fetchQualityGatesRuns: async () => qualityGates(HEAD_A),
        fetchTrustedQualityGatesWorkflow: async () => TRUSTED_QG_WORKFLOW,
        compareHeadToMain: async () => ({ behindBy: 0, mainSha: MAIN_SHA }),
        fetchDefaultBranchHasAutoMergeWorkflow: async () => true,
        fetchPullRequestFiles: async () => [prFile(QUALITY_GATES_WORKFLOW_PATH)],
        mergePullRequest: async () => {
          mergeCalls += 1;
          throw new Error("merge should not run");
        },
        writeLog: () => {},
        reviewEventBaseSha: MAIN_SHA,
      },
      55,
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe(
      "PR changes trusted auto-merge / CI / package-runtime authority and requires manual merge",
    );
    expect(mergeCalls).toBe(0);
  });
});

describe("trusted-path rename and delete authority", () => {
  it("A. trusted auto-merge workflow renamed away is blocked", () => {
    const files = [
      prFile("docs/moved-auto-merge.yml", {
        previousFilename: AUTO_MERGE_WORKFLOW_PATH,
        status: "renamed",
      }),
    ];
    expect(prTouchesTrustedAutoMergePaths(files)).toBe(true);
  });

  it("B. quality-gates workflow renamed away is blocked", () => {
    const files = [
      prFile("docs/moved-quality-gates.yml", {
        previousFilename: QUALITY_GATES_WORKFLOW_PATH,
        status: "renamed",
      }),
    ];
    expect(prTouchesTrustedAutoMergePaths(files)).toBe(true);
    expect(
      evaluateAutoMergeGate(
        eligibleInput({ prTouchesAutoMergeWorkflow: prTouchesTrustedAutoMergePaths(files) }),
      ).kind,
    ).toBe("blocked");
  });

  it("C. trusted helper renamed away is blocked", () => {
    expect(
      prTouchesTrustedAutoMergePaths([
        prFile("scripts/github/movedGate.ts", {
          previousFilename: "scripts/github/autoMergeGate.ts",
          status: "renamed",
        }),
      ]),
    ).toBe(true);
  });

  it("D. untrusted file renamed onto a trusted path is blocked", () => {
    expect(
      prTouchesTrustedAutoMergePaths([
        prFile(QUALITY_GATES_WORKFLOW_PATH, {
          previousFilename: "docs/old-ci.yml",
          status: "renamed",
        }),
      ]),
    ).toBe(true);
  });

  it("E. unrelated rename is not blocked solely by the trusted-path rule", () => {
    expect(
      prTouchesTrustedAutoMergePaths([
        prFile("src/lib/bar.ts", {
          previousFilename: "src/lib/foo.ts",
          status: "renamed",
        }),
      ]),
    ).toBe(false);
  });

  it("F. deleted trusted file is blocked", () => {
    expect(
      prTouchesTrustedAutoMergePaths([
        prFile("scripts/github/githubApi.ts", { status: "removed" }),
      ]),
    ).toBe(true);
  });

  it("G. modified trusted file is blocked", () => {
    expect(
      prTouchesTrustedAutoMergePaths([prFile(AUTO_MERGE_WORKFLOW_PATH, { status: "modified" })]),
    ).toBe(true);
  });
});

describe("active exact-head Cursor review-state authority", () => {
  it("K. DISMISSED exact-head Cursor APPROVED body cannot authorize", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [cursorReview({ state: "DISMISSED", body: APPROVED_BODY })],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("missing exact-head Cursor LRM");
  });

  it("L. PENDING exact-head Cursor APPROVED body cannot authorize", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [cursorReview({ state: "PENDING", body: APPROVED_BODY })],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("missing exact-head Cursor LRM");
  });

  it("M. COMMENTED exact-head Cursor APPROVED remains eligible", () => {
    expect(evaluateAutoMergeGate(eligibleInput()).kind).toBe("eligible");
  });

  it("N. active exact-head APPROVED then active CHANGES REQUESTED is blocked", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [
          cursorReview({ id: 1, submittedAt: "2026-09-08T19:00:00.000Z", body: APPROVED_BODY }),
          cursorReview({ id: 2, submittedAt: "2026-09-08T20:00:00.000Z", body: CHANGES_BODY }),
        ],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("CHANGES REQUESTED");
  });

  it("O. later DISMISSED approval does not replace an earlier active approval", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [
          cursorReview({ id: 1, submittedAt: "2026-09-08T19:00:00.000Z", body: APPROVED_BODY }),
          cursorReview({
            id: 2,
            submittedAt: "2026-09-08T21:00:00.000Z",
            state: "DISMISSED",
            body: APPROVED_BODY,
          }),
        ],
      }),
    );
    expect(result.kind).toBe("eligible");
  });

  it("P. old-head DISMISSED approval is not stale-authority evidence", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [
          cursorReview({
            commitId: HEAD_A,
            state: "DISMISSED",
            body: APPROVED_BODY,
          }),
        ],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("missing exact-head Cursor LRM");
  });

  it("Q. dismissed CHANGES_REQUESTED does not create an active requested-changes block", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        reviews: [
          cursorReview({ id: 1, body: APPROVED_BODY, state: "COMMENTED" }),
          cursorReview({
            id: 2,
            submittedAt: "2026-09-08T21:00:00.000Z",
            state: "DISMISSED",
            body: CHANGES_BODY,
          }),
        ],
      }),
    );
    expect(result.kind).toBe("eligible");
  });
});

describe("trusted Quality Gates workflow identity", () => {
  it("blocks a spoofed display-name Quality Gates run without the trusted workflow id", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        qualityGatesRuns: qualityGates(HEAD_B, {
          id: 50,
          workflowId: SPOOFED_QG_WORKFLOW.id,
          workflowPath: SPOOFED_QG_WORKFLOW.path,
          name: "Quality Gates",
        }),
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("trusted exact-head Quality Gates run absent");
  });

  it("accepts a successful exact-head run from the trusted workflow id", () => {
    expect(evaluateAutoMergeGate(eligibleInput()).kind).toBe("eligible");
  });

  it("fails closed when trusted workflow identity cannot be established", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({ trustedQualityGatesWorkflow: null }),
    );
    expect(result.kind).toBe("system_failure");
    expect(result.reason).toMatch(/trusted Quality Gates workflow identity/);
  });

  it("does not fall back to an older successful trusted run when a newer one failed", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        qualityGatesRuns: [
          ...qualityGates(HEAD_B, {
            id: 8,
            createdAt: "2026-09-08T19:00:00.000Z",
            conclusion: "success",
          }),
          ...qualityGates(HEAD_B, {
            id: 11,
            createdAt: "2026-09-08T21:00:00.000Z",
            conclusion: "failure",
          }),
        ],
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("Quality Gates failed");
  });

  it("1. fake Quality Gates name success with no trusted run is blocked", async () => {
    let mergeCalls = 0;
    const result = await runAutoMergeForPullRequest(
      {
        fetchPullRequest: async () => pr(),
        fetchReviews: async () => [cursorReview()],
        fetchReviewThreads: async () => [{ isResolved: true }],
        fetchCheckRuns: async () => requiredChecks(HEAD_B),
        fetchQualityGatesRuns: async () =>
          qualityGates(HEAD_B, {
            workflowId: SPOOFED_QG_WORKFLOW.id,
            workflowPath: SPOOFED_QG_WORKFLOW.path,
          }),
        fetchTrustedQualityGatesWorkflow: async () => TRUSTED_QG_WORKFLOW,
        compareHeadToMain: async () => ({ behindBy: 0, mainSha: MAIN_SHA }),
        fetchDefaultBranchHasAutoMergeWorkflow: async () => true,
        fetchPullRequestFiles: async () => [prFile("src/lib/foo.ts")],
        mergePullRequest: async () => {
          mergeCalls += 1;
          throw new Error("merge should not run");
        },
        writeLog: () => {},
        reviewEventBaseSha: MAIN_SHA,
      },
      55,
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toBe("trusted exact-head Quality Gates run absent");
    expect(mergeCalls).toBe(0);
  });

  it("2. trusted workflow id success on an ordinary source PR is eligible", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        prTouchesAutoMergeWorkflow: prTouchesTrustedAutoMergePaths([prFile("src/lib/foo.ts")]),
      }),
    );
    expect(result.kind).toBe("eligible");
  });
});

describe("workflow-prefix and package-runtime authority", () => {
  it("A. modify quality-gates.yml requires manual merge", () => {
    expect(prTouchesTrustedAutoMergePaths([prFile(QUALITY_GATES_WORKFLOW_PATH)])).toBe(true);
  });

  it("B. modify auto-merge workflow requires manual merge", () => {
    expect(prTouchesTrustedAutoMergePaths([prFile(AUTO_MERGE_WORKFLOW_PATH)])).toBe(true);
  });

  it("C. add fake-quality.yml requires manual merge", () => {
    expect(
      prTouchesTrustedAutoMergePaths([
        prFile(".github/workflows/fake-quality.yml", { status: "added" }),
      ]),
    ).toBe(true);
  });

  it("D. add unrelated-report.yml requires manual merge", () => {
    expect(
      prTouchesTrustedAutoMergePaths([
        prFile(".github/workflows/unrelated-report.yml", { status: "added" }),
      ]),
    ).toBe(true);
  });

  it("E. rename a workflow away still requires manual merge", () => {
    expect(
      prTouchesTrustedAutoMergePaths([
        prFile("docs/foo.yml", {
          previousFilename: ".github/workflows/foo.yml",
          status: "renamed",
        }),
      ]),
    ).toBe(true);
  });

  it("F. rename a file into .github/workflows requires manual merge", () => {
    expect(
      prTouchesTrustedAutoMergePaths([
        prFile(".github/workflows/foo.yml", {
          previousFilename: "docs/foo.yml",
          status: "renamed",
        }),
      ]),
    ).toBe(true);
  });

  it("G. ordinary source file is not blocked solely by trusted-path authority", () => {
    expect(prTouchesTrustedAutoMergePaths([prFile("src/lib/foo.ts")])).toBe(false);
  });

  it("H. package.json modified requires manual merge", () => {
    expect(prTouchesTrustedAutoMergePaths([prFile("package.json")])).toBe(true);
  });

  it("I. package-lock.json modified requires manual merge", () => {
    expect(prTouchesTrustedAutoMergePaths([prFile("package-lock.json")])).toBe(true);
  });

  it("J. package.json renamed away requires manual merge", () => {
    expect(
      prTouchesTrustedAutoMergePaths([
        prFile("docs/old-package.json", {
          previousFilename: "package.json",
          status: "renamed",
        }),
      ]),
    ).toBe(true);
  });

  it("K. arbitrary file renamed to package.json requires manual merge", () => {
    expect(
      prTouchesTrustedAutoMergePaths([
        prFile("package.json", {
          previousFilename: "docs/pkg.json",
          status: "renamed",
        }),
      ]),
    ).toBe(true);
  });

  it("L. package-lock.json deleted requires manual merge", () => {
    expect(
      prTouchesTrustedAutoMergePaths([prFile("package-lock.json", { status: "removed" })]),
    ).toBe(true);
  });

  it("M. npm-shrinkwrap.json added requires manual merge", () => {
    expect(
      prTouchesTrustedAutoMergePaths([prFile("npm-shrinkwrap.json", { status: "added" })]),
    ).toBe(true);
  });

  it("N. .npmrc added requires manual merge", () => {
    expect(prTouchesTrustedAutoMergePaths([prFile(".npmrc", { status: "added" })])).toBe(true);
  });

  it("O. README.md modified is not blocked solely by runtime-authority", () => {
    expect(prTouchesTrustedAutoMergePaths([prFile("README.md")])).toBe(false);
  });

  it("P. src/lib/foo.ts modified is not blocked solely by runtime-authority", () => {
    expect(prTouchesTrustedAutoMergePaths([prFile("src/lib/foo.ts")])).toBe(false);
  });

  it("3. package.json change stays blocked even when Cursor and trusted CI pass", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        prTouchesAutoMergeWorkflow: prTouchesTrustedAutoMergePaths([prFile("package.json")]),
      }),
    );
    expect(result.kind).toBe("blocked");
    expect(result.reason).toMatch(/manual merge/);
  });

  it("4. adding an arbitrary workflow stays blocked even when other gates pass", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        prTouchesAutoMergeWorkflow: prTouchesTrustedAutoMergePaths([
          prFile(".github/workflows/foo.yml", { status: "added" }),
        ]),
      }),
    );
    expect(result.kind).toBe("blocked");
  });

  it("5. trusted workflow renamed away stays blocked", () => {
    const result = evaluateAutoMergeGate(
      eligibleInput({
        prTouchesAutoMergeWorkflow: prTouchesTrustedAutoMergePaths([
          prFile("docs/moved-quality-gates.yml", {
            previousFilename: QUALITY_GATES_WORKFLOW_PATH,
            status: "renamed",
          }),
        ]),
      }),
    );
    expect(result.kind).toBe("blocked");
  });

  it("6. latest active exact-head CHANGES REQUESTED stays blocked", () => {
    expect(
      evaluateAutoMergeGate(
        eligibleInput({
          reviews: [cursorReview({ body: CHANGES_BODY })],
        }),
      ).reason,
    ).toBe("CHANGES REQUESTED");
  });

  it("7. dismissed exact-head APPROVED cannot authorize", () => {
    expect(
      evaluateAutoMergeGate(
        eligibleInput({
          reviews: [cursorReview({ state: "DISMISSED", body: APPROVED_BODY })],
        }),
      ).reason,
    ).toBe("missing exact-head Cursor LRM");
  });

  it("8. stale exact-head mismatch stays blocked", () => {
    expect(
      evaluateAutoMergeGate(
        eligibleInput({
          reviews: [cursorReview({ commitId: HEAD_A })],
        }),
      ).reason,
    ).toBe("stale Cursor review");
  });
});
