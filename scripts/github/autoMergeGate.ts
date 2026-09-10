import { parseGovernedCursorLrmVerdict } from "./parseCursorLrmVerdict";
import {
  formatIneligibleThreadLogLine,
  selectAutoResolvableNonBlockingThreadIds,
} from "./nonBlockingReviewThreads";
import {
  AUTO_MERGE_TRUSTED_PATHS,
  GITHUB_WORKFLOWS_PREFIX,
  QUALITY_GATES_WORKFLOW_NAME,
  QUALITY_GATES_WORKFLOW_PATH,
  REQUIRED_BASE_BRANCH,
  REQUIRED_CHECK_NAMES,
  TRUSTED_CURSOR_LOGIN,
  TRUSTED_RUNTIME_EXACT_PATHS,
  type CheckConclusion,
  type EvaluateInput,
  type EvaluateResult,
  type GateReport,
  type GithubReview,
  type GithubReviewState,
  type MergeResult,
  type PullRequestFileSnapshot,
  type PullRequestSnapshot,
  type QualityGatesRunSnapshot,
  type QualityGatesWorkflowIdentity,
  type WorkflowJobSnapshot,
  type ResolvePrResult,
} from "./autoMergeGateTypes";

/**
 * Exact-head Cursor LRM auto-merge gate.
 *
 * Repository review policy currently requires zero formal GitHub approving
 * reviews. Cursor therefore submits the governed LRM as a COMMENTED review.
 * Authorization is the structured Verdict on an exact current-head
 * cursor[bot] review, not review.state == APPROVED.
 *
 * Formal CHANGES_REQUESTED review state on the current head still blocks.
 * DISMISSED and PENDING reviews never authorize merge; the latest ACTIVE
 * exact-head Cursor LRM wins. Before evaluation, this helper may resolve
 * only unresolved review threads whose normalized root body begins with
 * `[NON-BLOCKING]` or legacy `Non-blocking:` from exact-head trusted
 * cursor[bot] with no replies; it never dismisses reviews, never
 * auto-resolves unmarked/human/stale threads, and never bypasses branch
 * protection. Merge uses merge_method=merge and sha=CURRENT_HEAD.
 *
 * Bootstrap: the first PR that adds this workflow must be merged manually.
 * Subsequent PRs that change the trusted auto-merge helper or the Quality
 * Gates workflow also require a manual merge so a PR cannot rewrite CI
 * authority and then exercise its own merge.
 */
export type WorkflowEventName =
  | "pull_request_review"
  | "workflow_run"
  | "workflow_dispatch";

export type WorkflowEventPayload = {
  pull_request?: { number?: number };
  review?: { commit_id?: string };
  workflow_run?: {
    id?: number;
    pull_requests?: Array<{ number?: number }>;
    head_sha?: string;
  };
  inputs?: { pr_number?: string | number };
};

function emptyReport(partial: Partial<GateReport> & Pick<GateReport, "decision" | "reason">): GateReport {
  return {
    prNumber: null,
    headSha: null,
    baseSha: null,
    mainSha: null,
    cursorReviewId: null,
    cursorSubmittedAt: null,
    cursorVerdict: null,
    ci: {},
    unresolvedThreads: null,
    mergeability: null,
    baseDrift: "unknown",
    ...partial,
  };
}

function blocked(
  reason: string,
  report: Omit<GateReport, "decision" | "reason"> & Partial<Pick<GateReport, "reason">>,
): EvaluateResult {
  return {
    kind: "blocked",
    reason,
    authorizedHeadSha: null,
    report: {
      ...report,
      decision: "BLOCKED",
      reason,
    },
  };
}

export function formatGateReport(report: GateReport): string {
  const ciLines = Object.entries(report.ci)
    .map(([name, value]) => `  ${name}: ${value}`)
    .join("\n");
  return [
    `PR #${report.prNumber ?? "unknown"}`,
    `HEAD: ${report.headSha ?? "unknown"}`,
    `BASE: ${report.baseSha ?? "unknown"}`,
    "",
    "Cursor exact-head LRM:",
    `  review id: ${report.cursorReviewId ?? "none"}`,
    `  submittedAt: ${report.cursorSubmittedAt ?? "none"}`,
    `  verdict: ${report.cursorVerdict ?? "none"}`,
    "",
    "CI:",
    ciLines || "  (none)",
    "",
    "Unresolved threads:",
    `  ${report.unresolvedThreads ?? "unknown"}`,
    "",
    "Mergeability:",
    `  ${report.mergeability ?? "unknown"}`,
    "",
    "Base drift:",
    `  ${report.baseDrift}`,
    "",
    "Decision:",
    `  ${report.decision}`,
    `Reason:`,
    `  ${report.reason}`,
  ].join("\n");
}

export function resolveCandidatePullRequests(
  eventName: WorkflowEventName,
  payload: WorkflowEventPayload,
): ResolvePrResult {
  if (eventName === "pull_request_review") {
    const number = payload.pull_request?.number;
    if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) {
      return { kind: "system_failure", reason: "pull_request_review event is missing a valid PR number" };
    }
    return { kind: "prs", prNumbers: [number] };
  }

  if (eventName === "workflow_dispatch") {
    const raw = payload.inputs?.pr_number;
    const number = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(number) || number <= 0) {
      return { kind: "system_failure", reason: "workflow_dispatch requires a positive integer pr_number" };
    }
    return { kind: "prs", prNumbers: [number] };
  }

  if (eventName === "workflow_run") {
    const associated = payload.workflow_run?.pull_requests ?? [];
    const numbers = associated
      .map((entry) => entry.number)
      .filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0);
    const unique = [...new Set(numbers)];
    if (unique.length === 0) {
      return { kind: "noop", reason: "AUTO-MERGE NO-OP: workflow run has no associated pull request" };
    }
    return { kind: "prs", prNumbers: unique };
  }

  return { kind: "system_failure", reason: `unsupported event: ${eventName}` };
}

function conclusionLabel(conclusion: CheckConclusion, status?: string): string {
  if (status && status !== "completed" && conclusion == null) {
    return status;
  }
  return conclusion ?? status ?? "absent";
}

function isSuccessfulConclusion(conclusion: CheckConclusion, status?: string): boolean {
  return status === "completed" && conclusion === "success";
}

export function isValidTrustedQualityGatesIdentity(
  identity: QualityGatesWorkflowIdentity | null | undefined,
): identity is QualityGatesWorkflowIdentity {
  return (
    identity != null
    && Number.isInteger(identity.id)
    && identity.id > 0
    && identity.path === QUALITY_GATES_WORKFLOW_PATH
  );
}

export type TrustedRequiredJobValidation =
  | { kind: "ok"; ci: Record<string, string> }
  | { kind: "blocked"; reason: string; ci: Record<string, string> };

/**
 * Authoritative CI job gate: every REQUIRED_CHECK_NAME must appear exactly
 * once inside the selected trusted Quality Gates run and be completed/success.
 * Generic commit check-run names are not a substitute.
 *
 * Quality Gates currently has one job per required name. Duplicate required
 * names in the same run are fail-closed rather than picking a green copy.
 */
export function validateTrustedQualityGatesRequiredJobs(
  jobs: readonly WorkflowJobSnapshot[],
): TrustedRequiredJobValidation {
  const ci: Record<string, string> = {};
  for (const required of REQUIRED_CHECK_NAMES) {
    const matches = jobs.filter((job) => job.name === required);
    if (matches.length === 0) {
      ci[required] = "absent";
      return {
        kind: "blocked",
        reason: `trusted Quality Gates required job absent: ${required}`,
        ci,
      };
    }
    if (matches.length > 1) {
      ci[required] = "duplicate";
      return {
        kind: "blocked",
        reason: `duplicate trusted Quality Gates required job: ${required}`,
        ci,
      };
    }
    const job = matches[0]!;
    ci[required] = conclusionLabel(job.conclusion, job.status);
    if (isSuccessfulConclusion(job.conclusion, job.status)) {
      continue;
    }
    if (
      job.status === "queued"
      || job.status === "in_progress"
      || job.status === "pending"
      || job.conclusion === "pending"
      || job.conclusion === "queued"
      || job.conclusion === "in_progress"
    ) {
      return { kind: "blocked", reason: "CI pending", ci };
    }
    return {
      kind: "blocked",
      reason: `trusted Quality Gates required job not successful: ${required}`,
      ci,
    };
  }
  return { kind: "ok", ci };
}

function compareTrustedQualityGatesRuns(
  left: QualityGatesRunSnapshot,
  right: QualityGatesRunSnapshot,
): number {
  const leftCreated = left.createdAt ?? "";
  const rightCreated = right.createdAt ?? "";
  if (leftCreated !== "" && rightCreated !== "" && leftCreated !== rightCreated) {
    return leftCreated.localeCompare(rightCreated);
  }
  return left.id - right.id;
}

function isBlockingIncomplete(status: string, conclusion: CheckConclusion): boolean {
  if (status === "queued" || status === "in_progress" || status === "pending") {
    return true;
  }
  return (
    conclusion === "pending"
    || conclusion === "queued"
    || conclusion === "in_progress"
    || conclusion === "cancelled"
    || conclusion === "timed_out"
    || conclusion === "action_required"
    || conclusion === "stale"
    || conclusion === "failure"
  );
}

export function isActiveCursorLrmReviewState(state: GithubReviewState): boolean {
  return state !== "DISMISSED" && state !== "PENDING";
}

export function selectLatestExactHeadCursorReview(
  reviews: readonly GithubReview[],
  currentHeadSha: string,
): { review: GithubReview; verdict: ReturnType<typeof parseGovernedCursorLrmVerdict> } | null {
  const exactHead = reviews
    .filter((review) => review.userLogin === TRUSTED_CURSOR_LOGIN)
    .filter((review) => review.commitId === currentHeadSha)
    .filter((review) => isActiveCursorLrmReviewState(review.state))
    .slice()
    .sort((left, right) => (left.submittedAt ?? "").localeCompare(right.submittedAt ?? ""));

  if (exactHead.length === 0) {
    return null;
  }
  const review = exactHead[exactHead.length - 1]!;
  return { review, verdict: parseGovernedCursorLrmVerdict(review.body) };
}

function isUnderGithubWorkflowsPrefix(path: string): boolean {
  return path === GITHUB_WORKFLOWS_PREFIX.slice(0, -1) || path.startsWith(GITHUB_WORKFLOWS_PREFIX);
}

function isTrustedAutoMergePath(path: string | null): boolean {
  if (path == null) {
    return false;
  }
  if (isUnderGithubWorkflowsPrefix(path)) {
    return true;
  }
  if ((TRUSTED_RUNTIME_EXACT_PATHS as readonly string[]).includes(path)) {
    return true;
  }
  return (AUTO_MERGE_TRUSTED_PATHS as readonly string[]).includes(path);
}

export function prTouchesTrustedAutoMergePaths(
  files: readonly PullRequestFileSnapshot[],
): boolean {
  return files.some(
    (file) => isTrustedAutoMergePath(file.filename) || isTrustedAutoMergePath(file.previousFilename),
  );
}

export function evaluateAutoMergeGate(input: EvaluateInput): EvaluateResult {
  // Issue comments, PR bodies, and commit messages never authorize merge.
  void input.issueComments;

  const pr = input.pullRequest;
  const reportBase = {
    prNumber: pr.number,
    headSha: pr.headSha,
    baseSha: pr.baseSha,
    mainSha: input.currentMainSha,
    cursorReviewId: null as number | null,
    cursorSubmittedAt: null as string | null,
    cursorVerdict: null as GateReport["cursorVerdict"],
    ci: {} as Record<string, string>,
    unresolvedThreads: input.threads.filter((thread) => !thread.isResolved).length,
    mergeability: pr.mergeability,
    baseDrift: "none",
  };

  if (pr.merged || pr.state === "closed") {
    return {
      kind: "noop",
      reason: "AUTO-MERGE NO-OP: pull request is already merged or closed",
      authorizedHeadSha: null,
      report: {
        ...reportBase,
        decision: "NO-OP",
        reason: "PR already merged/closed",
      },
    };
  }

  if (!input.bootstrapWorkflowPresentOnDefaultBranch) {
    return {
      kind: "noop",
      reason:
        "AUTO-MERGE NO-OP: bootstrap rule — first workflow PR must be reviewed and merged manually",
      authorizedHeadSha: null,
      report: {
        ...reportBase,
        decision: "NO-OP",
        reason: "bootstrap: auto-merge workflow is not yet on the default branch",
      },
    };
  }

  if (input.prTouchesAutoMergeWorkflow) {
    return blocked(
      "PR changes trusted auto-merge / CI / package-runtime authority and requires manual merge",
      reportBase,
    );
  }

  if (pr.draft) {
    return blocked("draft", reportBase);
  }
  if (pr.baseRef !== REQUIRED_BASE_BRANCH) {
    return blocked("wrong base", { ...reportBase, baseDrift: `base is ${pr.baseRef}` });
  }
  if (!pr.headSha || !/^[0-9a-f]{40}$/i.test(pr.headSha)) {
    return {
      kind: "system_failure",
      reason: "unable to establish current PR HEAD SHA",
      authorizedHeadSha: null,
      report: emptyReport({
        ...reportBase,
        decision: "SYSTEM FAILURE",
        reason: "unable to establish current PR HEAD SHA",
      }),
    };
  }

  const latestCursor = selectLatestExactHeadCursorReview(input.reviews, pr.headSha);
  const hasStaleCursorApproval = input.reviews.some((review) => {
    if (
      review.userLogin !== TRUSTED_CURSOR_LOGIN
      || review.commitId === pr.headSha
      || !isActiveCursorLrmReviewState(review.state)
    ) {
      return false;
    }
    return parseGovernedCursorLrmVerdict(review.body).verdict === "APPROVED_FOR_MERGE";
  });

  if (!latestCursor) {
    return blocked(
      hasStaleCursorApproval
        ? "stale Cursor review"
        : "missing exact-head Cursor LRM",
      {
        ...reportBase,
        cursorVerdict: hasStaleCursorApproval ? "stale" : "missing",
      },
    );
  }

  reportBase.cursorReviewId = latestCursor.review.id;
  reportBase.cursorSubmittedAt = latestCursor.review.submittedAt;
  if (latestCursor.verdict.reason !== "ok" || latestCursor.verdict.verdict == null) {
    const verdictReason = latestCursor.verdict.reason;
    return blocked(
      `Cursor verdict ${verdictReason}`,
      {
        ...reportBase,
        cursorVerdict: verdictReason === "ok" ? "malformed" : verdictReason,
      },
    );
  }
  reportBase.cursorVerdict = latestCursor.verdict.verdict;
  if (latestCursor.verdict.verdict === "CHANGES_REQUESTED") {
    return blocked("CHANGES REQUESTED", reportBase);
  }

  const activeRequestedChanges = input.reviews.some(
    (review) =>
      review.state === "CHANGES_REQUESTED"
      && review.commitId === pr.headSha,
  );
  if (activeRequestedChanges) {
    return blocked("active GitHub CHANGES_REQUESTED review on current head", reportBase);
  }

  const unresolved = reportBase.unresolvedThreads;
  if (unresolved > 0) {
    return blocked(`AUTO-MERGE BLOCKED: unresolved review threads = ${unresolved}`, reportBase);
  }

  if (pr.mergeability === "CONFLICTING" || pr.mergeable === false) {
    return blocked("conflict", reportBase);
  }
  if (pr.mergeability === "UNKNOWN" || pr.mergeable == null) {
    return blocked("AUTO-MERGE BLOCKED: mergeability not yet resolved", reportBase);
  }
  if (pr.mergeability !== "MERGEABLE" || pr.mergeable !== true) {
    return blocked("mergeability not MERGEABLE", reportBase);
  }

  if (input.compareToMain.behindBy > 0) {
    return blocked("base drift", {
      ...reportBase,
      baseDrift: `PR is behind main by ${input.compareToMain.behindBy} commit(s)`,
    });
  }
  if (input.reviewEventBaseSha && input.reviewEventBaseSha !== input.currentMainSha) {
    return blocked("base drift", {
      ...reportBase,
      baseDrift: "reviewed base SHA no longer matches current main",
    });
  }

  const ci: Record<string, string> = {};
  // Secondary confirmation only. Same-named commit check-runs cannot
  // authorize merge if the trusted Quality Gates run is missing a job.
  const exactHeadChecks = input.checkRuns.filter((run) => run.headSha === pr.headSha);

  for (const required of REQUIRED_CHECK_NAMES) {
    const match = exactHeadChecks.find((run) => run.name === required);
    if (!match) {
      ci[required] = "absent";
      return blocked("exact-head CI absent", { ...reportBase, ci });
    }
    ci[required] = conclusionLabel(match.conclusion, match.status);
    if (!isSuccessfulConclusion(match.conclusion, match.status)) {
      if (isBlockingIncomplete(match.status, match.conclusion)) {
        return blocked(
          match.status === "queued" || match.status === "in_progress" || match.status === "pending"
            ? "CI pending"
            : `CI ${ci[required]}`,
          { ...reportBase, ci },
        );
      }
      return blocked("CI failed", { ...reportBase, ci });
    }
  }

  const trustedWorkflow = input.trustedQualityGatesWorkflow;
  if (!isValidTrustedQualityGatesIdentity(trustedWorkflow)) {
    return {
      kind: "system_failure",
      reason: "unable to establish trusted Quality Gates workflow identity",
      authorizedHeadSha: null,
      report: emptyReport({
        ...reportBase,
        decision: "SYSTEM FAILURE",
        reason: "unable to establish trusted Quality Gates workflow identity",
      }),
    };
  }

  // Latest trusted exact-head run wins: sort by createdAt, then run id.
  // A newer failed/pending trusted run blocks; do not fall back to an older success.
  // Display name is presentational only; identity is path → workflow id → run.workflow_id.
  const qualityGates = input.qualityGatesRuns
    .filter((run) =>
      run.workflowId === trustedWorkflow.id
      && run.workflowPath === trustedWorkflow.path
      && run.headSha === pr.headSha,
    )
    .slice()
    .sort(compareTrustedQualityGatesRuns);
  if (qualityGates.length === 0) {
    ci[QUALITY_GATES_WORKFLOW_NAME] = "absent";
    return blocked("trusted exact-head Quality Gates run absent", { ...reportBase, ci });
  }
  const latestQualityGates = qualityGates[qualityGates.length - 1]!;
  ci[QUALITY_GATES_WORKFLOW_NAME] = conclusionLabel(
    latestQualityGates.conclusion,
    latestQualityGates.status,
  );
  if (
    latestQualityGates.status !== "completed"
    || !isSuccessfulConclusion(latestQualityGates.conclusion, latestQualityGates.status)
  ) {
    return blocked(
      latestQualityGates.status === "completed" ? "Quality Gates failed" : "CI pending",
      { ...reportBase, ci },
    );
  }
  const requiredJobs = validateTrustedQualityGatesRequiredJobs(latestQualityGates.jobs);
  Object.assign(ci, requiredJobs.ci);
  if (requiredJobs.kind === "blocked") {
    return blocked(requiredJobs.reason, { ...reportBase, ci });
  }

  return {
    kind: "eligible",
    reason: "ELIGIBLE FOR AUTO-MERGE",
    authorizedHeadSha: pr.headSha,
    report: {
      ...reportBase,
      ci,
      decision: "ELIGIBLE FOR AUTO-MERGE",
      reason: "all exact-head gates passed",
    },
  };
}

export type AutoMergeRuntime = {
  fetchPullRequest: (prNumber: number) => Promise<PullRequestSnapshot>;
  fetchReviews: (prNumber: number) => Promise<readonly GithubReview[]>;
  fetchReviewThreads: (prNumber: number) => Promise<EvaluateInput["threads"]>;
  resolveReviewThread: (threadId: string) => Promise<{ id: string; isResolved: boolean }>;
  fetchCheckRuns: (headSha: string) => Promise<EvaluateInput["checkRuns"]>;
  fetchQualityGatesRuns: (headSha: string) => Promise<readonly QualityGatesRunSnapshot[]>;
  fetchTrustedQualityGatesWorkflow: () => Promise<QualityGatesWorkflowIdentity>;
  compareHeadToMain: (headSha: string) => Promise<{ behindBy: number; mainSha: string }>;
  fetchDefaultBranchHasAutoMergeWorkflow: () => Promise<boolean>;
  fetchPullRequestFiles: (prNumber: number) => Promise<readonly PullRequestFileSnapshot[]>;
  mergePullRequest: (prNumber: number, sha: string) => Promise<MergeResult>;
  writeLog: (text: string) => void;
  reviewEventBaseSha?: string | null;
};

export async function runAutoMergeForPullRequest(
  runtime: AutoMergeRuntime,
  prNumber: number,
): Promise<EvaluateResult & { mergeCommitSha?: string | null }> {
  let pullRequest: PullRequestSnapshot;
  try {
    pullRequest = await runtime.fetchPullRequest(prNumber);
  } catch (error) {
    return {
      kind: "system_failure",
      reason: `GitHub API authentication or pull-request fetch failed: ${String(error)}`,
      authorizedHeadSha: null,
      report: emptyReport({
        prNumber,
        decision: "SYSTEM FAILURE",
        reason: "GitHub API authentication or pull-request fetch failed",
      }),
    };
  }

  try {
    const [reviews, initialThreads, compare, bootstrapPresent, prFiles, trustedQualityGatesWorkflow] =
      await Promise.all([
        runtime.fetchReviews(prNumber),
        runtime.fetchReviewThreads(prNumber),
        runtime.compareHeadToMain(pullRequest.headSha),
        runtime.fetchDefaultBranchHasAutoMergeWorkflow(),
        runtime.fetchPullRequestFiles(prNumber),
        runtime.fetchTrustedQualityGatesWorkflow(),
      ]);
    const [checkRuns, qualityGatesRuns] = await Promise.all([
      runtime.fetchCheckRuns(pullRequest.headSha),
      runtime.fetchQualityGatesRuns(pullRequest.headSha),
    ]);

    let threads = initialThreads;
    const exactHeadCursor = selectLatestExactHeadCursorReview(reviews, pullRequest.headSha);
    if (exactHeadCursor) {
      const { eligibleThreadIds, decisions } = selectAutoResolvableNonBlockingThreadIds({
        threads,
        currentHeadSha: pullRequest.headSha,
        reviews,
      });
      const ineligibleUnresolved = decisions.flatMap((decision, index) => {
        if (decision.kind !== "ineligible") {
          return [];
        }
        const thread = threads[index];
        if (thread == null || thread.isResolved) {
          return [];
        }
        const threadId =
          typeof thread.id === "string" && thread.id.trim() !== ""
            ? thread.id
            : `index-${index}`;
        return [
          formatIneligibleThreadLogLine({
            ...decision,
            threadId,
          }),
        ];
      });
      if (ineligibleUnresolved.length > 0) {
        runtime.writeLog(
          ["Trusted Cursor review present; unresolved threads not auto-resolved:", ...ineligibleUnresolved].join(
            "\n",
          ),
        );
      }
      if (eligibleThreadIds.length > 0) {
        runtime.writeLog(
          [
            "Auto-resolving trusted non-blocking Cursor review threads:",
            ...eligibleThreadIds.map((id) => `  ${id}`),
            ...decisions
              .filter((decision) => decision.kind === "eligible")
              .map((decision) => `  reason: ${decision.reason}`),
          ].join("\n"),
        );
        try {
          for (const threadId of eligibleThreadIds) {
            const resolved = await runtime.resolveReviewThread(threadId);
            if (!resolved.isResolved) {
              throw new Error(`resolveReviewThread returned unresolved for ${threadId}`);
            }
          }
        } catch (error) {
          return {
            kind: "system_failure",
            reason: `failed to resolve trusted [NON-BLOCKING] review thread(s): ${String(error)}`,
            authorizedHeadSha: null,
            report: emptyReport({
              prNumber,
              headSha: pullRequest.headSha,
              decision: "SYSTEM FAILURE",
              reason: "failed to resolve trusted [NON-BLOCKING] review thread(s)",
            }),
          };
        }
        // Actual GitHub state must be re-read; do not pretend in-memory resolution.
        threads = await runtime.fetchReviewThreads(prNumber);
      }
    }

    const evaluation = evaluateAutoMergeGate({
      pullRequest,
      reviews,
      issueComments: [],
      threads,
      checkRuns,
      qualityGatesRuns,
      trustedQualityGatesWorkflow,
      compareToMain: { behindBy: compare.behindBy },
      currentMainSha: compare.mainSha,
      reviewEventBaseSha: runtime.reviewEventBaseSha ?? null,
      bootstrapWorkflowPresentOnDefaultBranch: bootstrapPresent,
      prTouchesAutoMergeWorkflow: prTouchesTrustedAutoMergePaths(prFiles),
    });
    runtime.writeLog(formatGateReport(evaluation.report));

    if (evaluation.kind !== "eligible" || evaluation.authorizedHeadSha == null) {
      return evaluation;
    }

    const fresh = await runtime.fetchPullRequest(prNumber);
    if (fresh.headSha !== evaluation.authorizedHeadSha) {
      return blocked("AUTO-MERGE BLOCKED: head changed during merge gate", {
        ...evaluation.report,
        headSha: fresh.headSha,
        cursorReviewId: evaluation.report.cursorReviewId,
        cursorSubmittedAt: evaluation.report.cursorSubmittedAt,
        cursorVerdict: evaluation.report.cursorVerdict,
        ci: evaluation.report.ci,
        unresolvedThreads: evaluation.report.unresolvedThreads,
        mergeability: fresh.mergeability,
        baseDrift: evaluation.report.baseDrift,
      });
    }

    let merge: MergeResult;
    try {
      merge = await runtime.mergePullRequest(prNumber, evaluation.authorizedHeadSha);
    } catch (error) {
      const message = String(error);
      if (/head changed|sha|mismatch/i.test(message)) {
        return blocked("AUTO-MERGE BLOCKED: head changed during merge gate", evaluation.report);
      }
      return {
        kind: "system_failure",
        reason: `merge API failed: ${message}`,
        authorizedHeadSha: evaluation.authorizedHeadSha,
        report: {
          ...evaluation.report,
          decision: "SYSTEM FAILURE",
          reason: `merge API failed: ${message}`,
        },
      };
    }

    const after = await runtime.fetchPullRequest(prNumber);
    if (!merge.merged || !after.merged) {
      return {
        kind: "system_failure",
        reason: "post-merge verification failed: pull request is not merged",
        authorizedHeadSha: evaluation.authorizedHeadSha,
        report: {
          ...evaluation.report,
          decision: "SYSTEM FAILURE",
          reason: "post-merge verification failed",
        },
      };
    }

    runtime.writeLog(
      [
        "AUTO-MERGE SUCCESS",
        `PR: #${prNumber}`,
        `Approved HEAD: ${evaluation.authorizedHeadSha}`,
        `Merge commit: ${after.mergeCommitSha ?? merge.sha ?? "unknown"}`,
      ].join("\n"),
    );

    return {
      ...evaluation,
      mergeCommitSha: after.mergeCommitSha ?? merge.sha,
    };
  } catch (error) {
    return {
      kind: "system_failure",
      reason: `unable to establish critical gate state: ${String(error)}`,
      authorizedHeadSha: null,
      report: emptyReport({
        prNumber,
        headSha: pullRequest.headSha,
        decision: "SYSTEM FAILURE",
        reason: "unable to establish critical gate state",
      }),
    };
  }
}
