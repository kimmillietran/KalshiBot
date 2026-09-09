import {
  AUTO_MERGE_WORKFLOW_PATH,
  QUALITY_GATES_WORKFLOW_NAME,
  QUALITY_GATES_WORKFLOW_PATH,
  REQUIRED_BASE_BRANCH,
  type CheckRunSnapshot,
  type GithubReview,
  type GithubReviewState,
  type MergeResult,
  type Mergeability,
  type PullRequestFileSnapshot,
  type PullRequestSnapshot,
  type QualityGatesRunSnapshot,
  type QualityGatesWorkflowIdentity,
  type ReviewThread,
} from "./autoMergeGateTypes";

export type GithubApiConfig = {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
};

type GithubFetch = typeof fetch;

export class GithubApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "GithubApiError";
    this.status = status;
  }
}

/**
 * GitHub Actions workflow REST routes accept a numeric workflow id or the workflow
 * *filename* (e.g. `quality-gates.yml`), not the full repository-relative path.
 * Trust validation still requires the returned `path` to equal
 * `QUALITY_GATES_WORKFLOW_PATH` exactly.
 */
export function qualityGatesWorkflowRestIdentifier(
  trustedPath: string = QUALITY_GATES_WORKFLOW_PATH,
): string {
  const normalized = trustedPath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  const filename = segments[segments.length - 1];
  if (
    !filename
    || filename.includes("..")
    || filename.includes("/")
    || !filename.endsWith(".yml")
  ) {
    throw new GithubApiError("unable to derive trusted Quality Gates workflow REST identifier");
  }
  return filename;
}

function nextLink(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

export function mapMergeability(
  mergeable: boolean | null | undefined,
  mergeableState: string | null | undefined,
): Mergeability {
  const state = (mergeableState ?? "").toLowerCase();
  if (state === "dirty" || mergeable === false) {
    return "CONFLICTING";
  }
  if (mergeable == null || state === "unknown") {
    return "UNKNOWN";
  }
  if (mergeable === true) {
    return "MERGEABLE";
  }
  return "UNKNOWN";
}

export function mapPullRequest(raw: {
  number?: unknown;
  state?: unknown;
  draft?: unknown;
  merged?: unknown;
  mergeable?: unknown;
  mergeable_state?: unknown;
  base?: { ref?: unknown; sha?: unknown };
  head?: { sha?: unknown };
  merge_commit_sha?: unknown;
  body?: unknown;
  user?: { login?: unknown };
}): PullRequestSnapshot {
  if (typeof raw.number !== "number" || !Number.isInteger(raw.number)) {
    throw new GithubApiError("malformed pull request: missing number");
  }
  if (raw.state !== "open" && raw.state !== "closed") {
    throw new GithubApiError("malformed pull request: unexpected state");
  }
  if (typeof raw.head?.sha !== "string" || raw.head.sha.trim() === "") {
    throw new GithubApiError("malformed pull request: missing head SHA");
  }
  if (typeof raw.base?.ref !== "string" || typeof raw.base.sha !== "string") {
    throw new GithubApiError("malformed pull request: missing base identity");
  }

  const mergeable = typeof raw.mergeable === "boolean" ? raw.mergeable : null;
  const mergeableState = typeof raw.mergeable_state === "string" ? raw.mergeable_state : null;

  return {
    number: raw.number,
    state: raw.state,
    draft: Boolean(raw.draft),
    merged: Boolean(raw.merged),
    mergeable,
    mergeability: mapMergeability(mergeable, mergeableState),
    baseRef: raw.base.ref,
    baseSha: raw.base.sha,
    headSha: raw.head.sha,
    mergeCommitSha: typeof raw.merge_commit_sha === "string" ? raw.merge_commit_sha : null,
    body: typeof raw.body === "string" ? raw.body : null,
    authorLogin: typeof raw.user?.login === "string" ? raw.user.login : null,
  };
}

export function mapReview(raw: {
  id?: unknown;
  user?: { login?: unknown } | null;
  commit_id?: unknown;
  submitted_at?: unknown;
  state?: unknown;
  body?: unknown;
}): GithubReview {
  if (typeof raw.id !== "number") {
    throw new GithubApiError("malformed review: missing id");
  }
  if (typeof raw.state !== "string" || raw.state.trim() === "") {
    throw new GithubApiError("malformed review: missing state");
  }
  const state = raw.state.toUpperCase();
  const allowed: GithubReviewState[] = [
    "APPROVED",
    "CHANGES_REQUESTED",
    "COMMENTED",
    "DISMISSED",
    "PENDING",
  ];
  if (!allowed.includes(state as GithubReviewState)) {
    throw new GithubApiError(`malformed review: unknown state ${raw.state}`);
  }
  return {
    id: raw.id,
    userLogin: typeof raw.user?.login === "string" ? raw.user.login : null,
    commitId: typeof raw.commit_id === "string" ? raw.commit_id : null,
    submittedAt: typeof raw.submitted_at === "string" ? raw.submitted_at : null,
    state: state as GithubReviewState,
    body: typeof raw.body === "string" ? raw.body : null,
  };
}

export function mapPullRequestFile(raw: {
  filename?: unknown;
  previous_filename?: unknown;
  status?: unknown;
}): PullRequestFileSnapshot {
  if (typeof raw.filename !== "string" || raw.filename.trim() === "") {
    throw new GithubApiError("malformed pull request file: missing filename");
  }
  if (typeof raw.status !== "string" || raw.status.trim() === "") {
    throw new GithubApiError("malformed pull request file: missing status");
  }

  let previousFilename: string | null = null;
  if (raw.previous_filename != null) {
    if (typeof raw.previous_filename !== "string" || raw.previous_filename.trim() === "") {
      throw new GithubApiError("malformed pull request file: invalid previous_filename");
    }
    previousFilename = raw.previous_filename;
  }
  if (raw.status === "renamed" && previousFilename == null) {
    throw new GithubApiError("malformed pull request file: renamed without previous_filename");
  }

  return {
    filename: raw.filename,
    previousFilename,
    status: raw.status,
  };
}

export function mapQualityGatesWorkflowIdentity(raw: {
  id?: unknown;
  path?: unknown;
  name?: unknown;
  state?: unknown;
}): QualityGatesWorkflowIdentity {
  if (typeof raw.id !== "number" || !Number.isInteger(raw.id) || raw.id <= 0) {
    throw new GithubApiError("unable to establish trusted Quality Gates workflow id");
  }
  if (typeof raw.path !== "string" || raw.path !== QUALITY_GATES_WORKFLOW_PATH) {
    throw new GithubApiError("trusted Quality Gates workflow path mismatch");
  }
  return {
    id: raw.id,
    path: raw.path,
    name: typeof raw.name === "string" ? raw.name : QUALITY_GATES_WORKFLOW_NAME,
    state: typeof raw.state === "string" ? raw.state : null,
  };
}

export function createGithubApi(config: GithubApiConfig) {
  const fetchImpl: GithubFetch = config.fetchImpl ?? fetch;
  const repoPath = `/repos/${config.owner}/${config.repo}`;

  async function githubFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${config.token}`);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("X-GitHub-Api-Version", "2022-11-28");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetchImpl(url.startsWith("http") ? url : `https://api.github.com${url}`, {
      ...init,
      headers,
    });
    return response;
  }

  async function readJson<T>(response: Response, context: string): Promise<T> {
    if (response.status === 401 || response.status === 403) {
      throw new GithubApiError(
        `GitHub API authentication failure during ${context} (${response.status})`,
        response.status,
      );
    }
    if (!response.ok) {
      const body = await response.text();
      throw new GithubApiError(
        `GitHub API ${context} failed: ${response.status} ${body.slice(0, 400)}`,
        response.status,
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new GithubApiError(`malformed unexpected API response during ${context}`);
    }
  }

  async function paginateJsonArray<T>(firstUrl: string, context: string): Promise<T[]> {
    const items: T[] = [];
    let url: string | null = firstUrl;
    let pages = 0;
    while (url) {
      pages += 1;
      if (pages > 50) {
        throw new GithubApiError(`GraphQL/REST pagination exceeded safety limit during ${context}`);
      }
      const response = await githubFetch(url);
      const page = await readJson<T[] | { check_runs?: T[]; workflow_runs?: T[]; jobs?: T[] }>(
        response,
        context,
      );
      if (Array.isArray(page)) {
        items.push(...page);
      } else if (Array.isArray(page.check_runs)) {
        items.push(...page.check_runs);
      } else if (Array.isArray(page.workflow_runs)) {
        items.push(...page.workflow_runs);
      } else if (Array.isArray(page.jobs)) {
        items.push(...page.jobs);
      } else {
        throw new GithubApiError(`malformed unexpected API response during ${context}`);
      }
      url = nextLink(response.headers.get("link"));
    }
    return items;
  }

  async function loadTrustedQualityGatesWorkflow(): Promise<QualityGatesWorkflowIdentity> {
    const workflowRestId = qualityGatesWorkflowRestIdentifier();
    const response = await githubFetch(`${repoPath}/actions/workflows/${workflowRestId}`);
    if (response.status === 404) {
      throw new GithubApiError("trusted Quality Gates workflow is unavailable or deleted", 404);
    }
    const raw = await readJson<Parameters<typeof mapQualityGatesWorkflowIdentity>[0]>(
      response,
      "trusted Quality Gates workflow identity",
    );
    return mapQualityGatesWorkflowIdentity(raw);
  }

  return {
    async fetchPullRequest(prNumber: number): Promise<PullRequestSnapshot> {
      const response = await githubFetch(`${repoPath}/pulls/${prNumber}`);
      const raw = await readJson<Parameters<typeof mapPullRequest>[0]>(response, "pull request fetch");
      return mapPullRequest(raw);
    },

    async fetchReviews(prNumber: number): Promise<GithubReview[]> {
      const raw = await paginateJsonArray<Parameters<typeof mapReview>[0]>(
        `${repoPath}/pulls/${prNumber}/reviews?per_page=100`,
        "review pagination",
      );
      return raw.map(mapReview);
    },

    async fetchReviewThreads(prNumber: number): Promise<ReviewThread[]> {
      const threads: ReviewThread[] = [];
      let cursor: string | null = null;
      let pages = 0;
      for (;;) {
        pages += 1;
        if (pages > 50) {
          throw new GithubApiError("GraphQL pagination exceeded safety limit during review threads");
        }
        const response = await githubFetch("/graphql", {
          method: "POST",
          body: JSON.stringify({
            query: `
              query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
                repository(owner: $owner, name: $name) {
                  pullRequest(number: $number) {
                    reviewThreads(first: 100, after: $cursor) {
                      pageInfo { hasNextPage endCursor }
                      nodes { isResolved }
                    }
                  }
                }
              }
            `,
            variables: {
              owner: config.owner,
              name: config.repo,
              number: prNumber,
              cursor,
            },
          }),
        });
        const payload = await readJson<{
          errors?: Array<{ message?: string }>;
          data?: {
            repository?: {
              pullRequest?: {
                reviewThreads?: {
                  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
                  nodes?: Array<{ isResolved?: boolean } | null> | null;
                };
              } | null;
            } | null;
          };
        }>(response, "review thread GraphQL");

        if (payload.errors?.length) {
          throw new GithubApiError(
            `GraphQL reviewThreads failed: ${payload.errors.map((error) => error.message).join("; ")}`,
          );
        }
        const connection = payload.data?.repository?.pullRequest?.reviewThreads;
        if (!connection || !Array.isArray(connection.nodes)) {
          throw new GithubApiError("malformed unexpected API response during review thread pagination");
        }
        for (const node of connection.nodes) {
          if (node == null || typeof node.isResolved !== "boolean") {
            throw new GithubApiError("malformed review thread node: isResolved missing");
          }
          threads.push({ isResolved: node.isResolved });
        }
        if (!connection.pageInfo?.hasNextPage) {
          break;
        }
        if (!connection.pageInfo.endCursor) {
          throw new GithubApiError("GraphQL pagination bug: hasNextPage without endCursor");
        }
        cursor = connection.pageInfo.endCursor;
      }
      return threads;
    },

    async fetchCheckRuns(headSha: string): Promise<CheckRunSnapshot[]> {
      const raw = await paginateJsonArray<{
        name?: unknown;
        head_sha?: unknown;
        status?: unknown;
        conclusion?: unknown;
      }>(`${repoPath}/commits/${headSha}/check-runs?per_page=100`, "check-run pagination");
      return raw.map((run) => {
        if (typeof run.name !== "string" || typeof run.head_sha !== "string") {
          throw new GithubApiError("malformed check run");
        }
        return {
          name: run.name,
          headSha: run.head_sha,
          status: typeof run.status === "string" ? run.status : "unknown",
          conclusion: typeof run.conclusion === "string" ? (run.conclusion as CheckRunSnapshot["conclusion"]) : null,
        };
      });
    },

    async fetchTrustedQualityGatesWorkflow(): Promise<QualityGatesWorkflowIdentity> {
      return loadTrustedQualityGatesWorkflow();
    },

    async fetchQualityGatesRuns(headSha: string): Promise<QualityGatesRunSnapshot[]> {
      const identity = await loadTrustedQualityGatesWorkflow();
      const runs = await paginateJsonArray<{
        id?: unknown;
        workflow_id?: unknown;
        name?: unknown;
        head_sha?: unknown;
        status?: unknown;
        conclusion?: unknown;
        created_at?: unknown;
      }>(
        `${repoPath}/actions/workflows/${identity.id}/runs?head_sha=${encodeURIComponent(headSha)}&per_page=100`,
        "trusted Quality Gates workflow-run pagination",
      );

      const snapshots: QualityGatesRunSnapshot[] = [];
      for (const run of runs) {
        if (typeof run.id !== "number") {
          throw new GithubApiError("malformed Quality Gates workflow run");
        }
        if (run.workflow_id !== identity.id) {
          throw new GithubApiError(
            "trusted Quality Gates workflow run returned a mismatching workflow_id",
          );
        }
        const jobs = await paginateJsonArray<{
          name?: unknown;
          status?: unknown;
          conclusion?: unknown;
        }>(`${repoPath}/actions/runs/${run.id}/jobs?per_page=100`, "workflow-job pagination");
        snapshots.push({
          id: run.id,
          workflowId: identity.id,
          workflowPath: identity.path,
          name: typeof run.name === "string" ? run.name : QUALITY_GATES_WORKFLOW_NAME,
          headSha: typeof run.head_sha === "string" ? run.head_sha : headSha,
          status: typeof run.status === "string" ? run.status : "unknown",
          conclusion: typeof run.conclusion === "string" ? (run.conclusion as QualityGatesRunSnapshot["conclusion"]) : null,
          createdAt: typeof run.created_at === "string" ? run.created_at : null,
          jobs: jobs.map((job) => {
            if (typeof job.name !== "string") {
              throw new GithubApiError("malformed Quality Gates job");
            }
            return {
              name: job.name,
              status: typeof job.status === "string" ? job.status : "unknown",
              conclusion:
                typeof job.conclusion === "string"
                  ? (job.conclusion as QualityGatesRunSnapshot["conclusion"])
                  : null,
            };
          }),
        });
      }
      return snapshots;
    },

    async compareHeadToMain(headSha: string): Promise<{ behindBy: number; mainSha: string }> {
      const mainResponse = await githubFetch(`${repoPath}/git/ref/heads/${REQUIRED_BASE_BRANCH}`);
      const mainRef = await readJson<{ object?: { sha?: unknown } }>(mainResponse, "main ref fetch");
      if (typeof mainRef.object?.sha !== "string") {
        throw new GithubApiError("unable to establish current main SHA");
      }

      const compareResponse = await githubFetch(
        `${repoPath}/compare/${REQUIRED_BASE_BRANCH}...${headSha}`,
      );
      const compare = await readJson<{ behind_by?: unknown }>(compareResponse, "compare to main");
      if (typeof compare.behind_by !== "number" || !Number.isInteger(compare.behind_by)) {
        throw new GithubApiError("unable to establish base-drift compare behind_by");
      }
      return { behindBy: compare.behind_by, mainSha: mainRef.object.sha };
    },

    async fetchDefaultBranchHasAutoMergeWorkflow(): Promise<boolean> {
      const response = await githubFetch(
        `${repoPath}/contents/${AUTO_MERGE_WORKFLOW_PATH}?ref=${REQUIRED_BASE_BRANCH}`,
      );
      if (response.status === 404) {
        return false;
      }
      await readJson<unknown>(response, "default-branch auto-merge workflow lookup");
      return true;
    },

    async fetchPullRequestFiles(prNumber: number): Promise<PullRequestFileSnapshot[]> {
      const files = await paginateJsonArray<{
        filename?: unknown;
        previous_filename?: unknown;
        status?: unknown;
      }>(
        `${repoPath}/pulls/${prNumber}/files?per_page=100`,
        "pull request file pagination",
      );
      return files.map(mapPullRequestFile);
    },

    async mergePullRequest(prNumber: number, sha: string): Promise<MergeResult> {
      const response = await githubFetch(`${repoPath}/pulls/${prNumber}/merge`, {
        method: "PUT",
        body: JSON.stringify({
          merge_method: "merge",
          sha,
        }),
      });
      if (response.status === 409) {
        const body = await response.text();
        throw new GithubApiError(`Head SHA did not match: ${body.slice(0, 200)}`, 409);
      }
      const payload = await readJson<{ merged?: unknown; sha?: unknown; message?: unknown }>(
        response,
        "SHA-guarded merge",
      );
      return {
        merged: payload.merged === true,
        sha: typeof payload.sha === "string" ? payload.sha : null,
        message: typeof payload.message === "string" ? payload.message : null,
      };
    },
  };
}
