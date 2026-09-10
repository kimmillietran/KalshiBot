export const TRUSTED_CURSOR_LOGIN = "cursor[bot]";
export const REQUIRED_BASE_BRANCH = "main";
export const REQUIRED_CHECK_NAMES = [
  "Lint, build, and test",
  "Operator matrix (macOS)",
  "Operator matrix (Ubuntu)",
] as const;
export const QUALITY_GATES_WORKFLOW_NAME = "Quality Gates";
export const ADVISORY_CHECK_NAME_SUBSTRING = "advisory";
export const AUTO_MERGE_WORKFLOW_PATH = ".github/workflows/auto-merge-after-cursor-lrm.yml";
export const QUALITY_GATES_WORKFLOW_PATH = ".github/workflows/quality-gates.yml";
export const GITHUB_WORKFLOWS_PREFIX = ".github/workflows/";
export const TRUSTED_RUNTIME_EXACT_PATHS = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  ".npmrc",
] as const;
export const AUTO_MERGE_TRUSTED_PATHS = [
  AUTO_MERGE_WORKFLOW_PATH,
  QUALITY_GATES_WORKFLOW_PATH,
  "scripts/github/autoMergeGate.ts",
  "scripts/github/autoMergeGateTypes.ts",
  "scripts/github/parseCursorLrmVerdict.ts",
  "scripts/github/nonBlockingReviewThreads.ts",
  "scripts/github/githubApi.ts",
  "scripts/github/runAutoMergeGate.ts",
] as const;

export type CursorLrmVerdict = "APPROVED_FOR_MERGE" | "CHANGES_REQUESTED";

export type GateKind = "eligible" | "blocked" | "noop" | "system_failure";

export type PullRequestState = "open" | "closed";

export type Mergeability = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";

export type CheckConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "timed_out"
  | "action_required"
  | "stale"
  | "neutral"
  | "skipped"
  | "pending"
  | "queued"
  | "in_progress"
  | null;

export type GithubReviewState =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED"
  | "PENDING";

export type PullRequestSnapshot = {
  number: number;
  state: PullRequestState;
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  mergeability: Mergeability;
  baseRef: string;
  baseSha: string;
  headSha: string;
  mergeCommitSha: string | null;
  body: string | null;
  authorLogin: string | null;
};

export type GithubReview = {
  id: number;
  userLogin: string | null;
  commitId: string | null;
  submittedAt: string | null;
  state: GithubReviewState;
  body: string | null;
};

export type PullRequestFileSnapshot = {
  filename: string;
  previousFilename: string | null;
  status: string;
};

export type ReviewThreadComment = {
  authorLogin: string | null;
  body: string | null;
  createdAt: string | null;
  pullRequestReviewDatabaseId: number | null;
  pullRequestReviewCommitOid: string | null;
  pullRequestReviewState: string | null;
};

export type ReviewThread = {
  /** GraphQL node id; required to resolve the thread via the GitHub API. */
  id: string | null;
  isResolved: boolean;
  comments: readonly ReviewThreadComment[];
};

export type CheckRunSnapshot = {
  name: string;
  headSha: string;
  status: "queued" | "in_progress" | "completed" | "pending" | string;
  conclusion: CheckConclusion;
};

export type WorkflowJobSnapshot = {
  name: string;
  status: string;
  conclusion: CheckConclusion;
};

export type QualityGatesWorkflowIdentity = {
  id: number;
  path: string;
  name: string;
  state: string | null;
};

export type QualityGatesRunSnapshot = {
  id: number;
  workflowId: number;
  workflowPath: string;
  name: string;
  headSha: string;
  status: string;
  conclusion: CheckConclusion;
  createdAt: string | null;
  jobs: readonly WorkflowJobSnapshot[];
};

export type CompareSnapshot = {
  behindBy: number;
};

export type MergeResult = {
  merged: boolean;
  sha: string | null;
  message: string | null;
};

export type GateReport = {
  prNumber: number | null;
  headSha: string | null;
  baseSha: string | null;
  mainSha: string | null;
  cursorReviewId: number | null;
  cursorSubmittedAt: string | null;
  cursorVerdict: CursorLrmVerdict | "missing" | "malformed" | "ambiguous" | "stale" | null;
  ci: Record<string, string>;
  unresolvedThreads: number | null;
  mergeability: Mergeability | null;
  baseDrift: string;
  decision: "ELIGIBLE FOR AUTO-MERGE" | "BLOCKED" | "NO-OP" | "SYSTEM FAILURE";
  reason: string;
};

export type EvaluateInput = {
  pullRequest: PullRequestSnapshot;
  reviews: readonly GithubReview[];
  issueComments: readonly { userLogin: string | null; body: string | null }[];
  threads: readonly ReviewThread[];
  checkRuns: readonly CheckRunSnapshot[];
  qualityGatesRuns: readonly QualityGatesRunSnapshot[];
  trustedQualityGatesWorkflow: QualityGatesWorkflowIdentity | null;
  compareToMain: CompareSnapshot;
  currentMainSha: string;
  reviewEventBaseSha?: string | null;
  bootstrapWorkflowPresentOnDefaultBranch: boolean;
  prTouchesAutoMergeWorkflow: boolean;
};

export type EvaluateResult = {
  kind: GateKind;
  reason: string;
  report: GateReport;
  authorizedHeadSha: string | null;
};

export type ResolvePrResult =
  | { kind: "prs"; prNumbers: readonly number[] }
  | { kind: "noop"; reason: string }
  | { kind: "system_failure"; reason: string };
