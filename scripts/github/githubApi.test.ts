import { describe, expect, it } from "vitest";

import { AUTO_MERGE_WORKFLOW_PATH, QUALITY_GATES_WORKFLOW_PATH } from "./autoMergeGateTypes";
import {
  GithubApiError,
  createGithubApi,
  mapMergeability,
  mapPullRequest,
  mapPullRequestFile,
  mapQualityGatesWorkflowIdentity,
  mapReview,
  mapReviewThread,
  qualityGatesWorkflowRestIdentifier,
} from "./githubApi";
import { prTouchesTrustedAutoMergePaths } from "./autoMergeGate";

describe("qualityGatesWorkflowRestIdentifier", () => {
  it("derives the REST filename from the trusted full workflow path", () => {
    expect(qualityGatesWorkflowRestIdentifier()).toBe("quality-gates.yml");
    expect(qualityGatesWorkflowRestIdentifier(QUALITY_GATES_WORKFLOW_PATH)).toBe(
      "quality-gates.yml",
    );
  });

  it("fails closed on unusable trusted-path shapes", () => {
    expect(() => qualityGatesWorkflowRestIdentifier(".github/workflows/")).toThrow(
      /REST identifier/,
    );
    expect(() => qualityGatesWorkflowRestIdentifier("quality-gates.json")).toThrow(
      /REST identifier/,
    );
  });
});

describe("githubApi mapping", () => {
  it("maps mergeable true to MERGEABLE", () => {
    expect(mapMergeability(true, "clean")).toBe("MERGEABLE");
    expect(mapMergeability(true, "blocked")).toBe("MERGEABLE");
  });

  it("maps dirty or mergeable false to CONFLICTING", () => {
    expect(mapMergeability(false, "dirty")).toBe("CONFLICTING");
    expect(mapMergeability(true, "dirty")).toBe("CONFLICTING");
  });

  it("maps unknown or null mergeable to UNKNOWN", () => {
    expect(mapMergeability(null, "unknown")).toBe("UNKNOWN");
    expect(mapMergeability(null, "clean")).toBe("UNKNOWN");
  });

  it("maps a pull request snapshot from REST", () => {
    const snapshot = mapPullRequest({
      number: 54,
      state: "closed",
      draft: false,
      merged: true,
      mergeable: true,
      mergeable_state: "clean",
      base: { ref: "main", sha: "cccccccccccccccccccccccccccccccccccccccc" },
      head: { sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      merge_commit_sha: "dddddddddddddddddddddddddddddddddddddddd",
      body: "fixture",
      user: { login: "builder" },
    });
    expect(snapshot.number).toBe(54);
    expect(snapshot.mergeability).toBe("MERGEABLE");
    expect(snapshot.merged).toBe(true);
  });

  it("maps review threads with GraphQL id and associated review binding", () => {
    const thread = mapReviewThread({
      id: "PRRT_abc",
      isResolved: false,
      comments: {
        nodes: [
          {
            author: { login: "cursor[bot]" },
            body: "[NON-BLOCKING]\nnote",
            createdAt: "2026-09-10T00:00:00Z",
            pullRequestReview: {
              databaseId: 42,
              state: "COMMENTED",
              commit: { oid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
            },
          },
        ],
      },
    });
    expect(thread).toEqual({
      id: "PRRT_abc",
      isResolved: false,
      comments: [
        {
          authorLogin: "cursor[bot]",
          body: "[NON-BLOCKING]\nnote",
          createdAt: "2026-09-10T00:00:00Z",
          pullRequestReviewDatabaseId: 42,
          pullRequestReviewCommitOid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          pullRequestReviewState: "COMMENTED",
        },
      ],
    });
  });

  it("fails closed on malformed review thread comment nodes", () => {
    expect(() =>
      mapReviewThread({
        id: "PRRT_x",
        isResolved: false,
        comments: { nodes: [null] },
      }),
    ).toThrow(/malformed review thread comment/);
  });

  it("H. API mapping preserves previous_filename", () => {
    expect(
      mapPullRequestFile({
        filename: "docs/moved.yml",
        previous_filename: AUTO_MERGE_WORKFLOW_PATH,
        status: "renamed",
      }),
    ).toEqual({
      filename: "docs/moved.yml",
      previousFilename: AUTO_MERGE_WORKFLOW_PATH,
      status: "renamed",
    });
  });

  it("J. malformed critical rename metadata fails closed", () => {
    expect(() =>
      mapPullRequestFile({
        filename: "docs/moved.yml",
        status: "renamed",
      }),
    ).toThrow(GithubApiError);
    expect(() =>
      mapPullRequestFile({
        filename: "docs/moved.yml",
        previous_filename: "",
        status: "renamed",
      }),
    ).toThrow(/previous_filename/);
  });

  it("R. unknown GitHub review state fails closed", () => {
    expect(() =>
      mapReview({
        id: 1,
        user: { login: "cursor[bot]" },
        commit_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        submitted_at: "2026-09-08T20:00:00Z",
        state: "LOOKS_GOOD",
        body: "## Verdict\n\nAPPROVED FOR MERGE\n",
      }),
    ).toThrow(/unknown state/);
  });

  it("S. missing review state fails closed rather than COMMENTED", () => {
    expect(() =>
      mapReview({
        id: 1,
        user: { login: "cursor[bot]" },
        commit_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        submitted_at: "2026-09-08T20:00:00Z",
        body: "## Verdict\n\nAPPROVED FOR MERGE\n",
      }),
    ).toThrow(/missing state/);
  });

  it("I. pagination preserves previous_filename on later pages", async () => {
    const firstPage = [{ filename: "src/lib/foo.ts", status: "modified" }];
    const secondPage = [
      {
        filename: "scripts/github/movedGate.ts",
        previous_filename: "scripts/github/autoMergeGate.ts",
        status: "renamed",
      },
    ];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("page=2")) {
        return new Response(JSON.stringify(secondPage), { status: 200 });
      }
      return new Response(JSON.stringify(firstPage), {
        status: 200,
        headers: {
          link: '<https://api.github.com/repos/o/r/pulls/1/files?per_page=100&page=2>; rel="next"',
        },
      });
    };
    const api = createGithubApi({
      token: "test-token",
      owner: "o",
      repo: "r",
      fetchImpl,
    });
    const files = await api.fetchPullRequestFiles(1);
    expect(files).toEqual([
      { filename: "src/lib/foo.ts", previousFilename: null, status: "modified" },
      {
        filename: "scripts/github/movedGate.ts",
        previousFilename: "scripts/github/autoMergeGate.ts",
        status: "renamed",
      },
    ]);
    expect(prTouchesTrustedAutoMergePaths(files)).toBe(true);
  });

  it("binds Quality Gates identity to the trusted path and numeric id", () => {
    expect(
      mapQualityGatesWorkflowIdentity({
        id: 100,
        path: QUALITY_GATES_WORKFLOW_PATH,
        name: "Quality Gates",
        state: "active",
      }),
    ).toEqual({
      id: 100,
      path: QUALITY_GATES_WORKFLOW_PATH,
      name: "Quality Gates",
      state: "active",
    });
  });

  it("fails closed when the workflow path is not the trusted Quality Gates file", () => {
    expect(() =>
      mapQualityGatesWorkflowIdentity({
        id: 999,
        path: ".github/workflows/fake-quality.yml",
        name: "Quality Gates",
        state: "active",
      }),
    ).toThrow(/path mismatch/);
  });

  it("fails closed when the trusted workflow id is missing", () => {
    expect(() =>
      mapQualityGatesWorkflowIdentity({
        path: QUALITY_GATES_WORKFLOW_PATH,
        name: "Quality Gates",
      }),
    ).toThrow(/workflow id/);
  });

  it("fetches exact-head runs from the trusted workflow id endpoint", async () => {
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("/actions/workflows/quality-gates.yml")) {
        return new Response(
          JSON.stringify({
            id: 100,
            path: QUALITY_GATES_WORKFLOW_PATH,
            name: "Quality Gates",
            state: "active",
          }),
          { status: 200 },
        );
      }
      if (url.includes("/actions/workflows/100/runs")) {
        return new Response(
          JSON.stringify({
            workflow_runs: [
              {
                id: 9,
                workflow_id: 100,
                name: "Quality Gates",
                head_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                status: "completed",
                conclusion: "success",
                created_at: "2026-09-08T20:00:00Z",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/actions/runs/9/jobs")) {
        return new Response(
          JSON.stringify({
            jobs: [{ name: "Lint, build, and test", status: "completed", conclusion: "success" }],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    };
    const api = createGithubApi({
      token: "test-token",
      owner: "o",
      repo: "r",
      fetchImpl,
    });
    const runs = await api.fetchQualityGatesRuns("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(
      requested.some((url) => url.includes("/actions/workflows/quality-gates.yml")),
    ).toBe(true);
    expect(
      requested.some((url) =>
        url.includes("/actions/workflows/.github/workflows/quality-gates.yml"),
      ),
    ).toBe(false);
    expect(requested.some((url) => url.includes("/actions/workflows/100/runs"))).toBe(true);
    expect(requested.some((url) => url.includes("/actions/runs?"))).toBe(false);
    expect(runs[0]?.workflowId).toBe(100);
    expect(runs[0]?.workflowPath).toBe(QUALITY_GATES_WORKFLOW_PATH);
  });

  it("resolves the production trusted Quality Gates workflow via filename REST lookup", async () => {
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("/actions/workflows/quality-gates.yml")) {
        return new Response(
          JSON.stringify({
            id: 317116257,
            path: ".github/workflows/quality-gates.yml",
            name: "Quality Gates",
            state: "active",
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    };
    const api = createGithubApi({
      token: "test-token",
      owner: "kimmillietran",
      repo: "KalshiBot",
      fetchImpl,
    });
    const identity = await api.fetchTrustedQualityGatesWorkflow();
    expect(identity).toEqual({
      id: 317116257,
      path: QUALITY_GATES_WORKFLOW_PATH,
      name: "Quality Gates",
      state: "active",
    });
    expect(requested).toEqual([
      "https://api.github.com/repos/kimmillietran/KalshiBot/actions/workflows/quality-gates.yml",
    ]);
  });

  it("fails closed when the workflow API returns a mismatched trusted path", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          id: 317116257,
          path: ".github/workflows/not-quality-gates.yml",
          name: "Quality Gates",
          state: "active",
        }),
        { status: 200 },
      );
    const api = createGithubApi({
      token: "test-token",
      owner: "o",
      repo: "r",
      fetchImpl,
    });
    await expect(api.fetchTrustedQualityGatesWorkflow()).rejects.toThrow(/path mismatch/);
  });

  it("fails closed when the trusted Quality Gates workflow REST identity is unavailable", async () => {
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      requested.push(String(input));
      return new Response("not found", { status: 404 });
    };
    const api = createGithubApi({
      token: "test-token",
      owner: "o",
      repo: "r",
      fetchImpl,
    });
    await expect(api.fetchTrustedQualityGatesWorkflow()).rejects.toMatchObject({
      message: expect.stringMatching(/unavailable or deleted/),
      status: 404,
    } satisfies Partial<GithubApiError>);
    expect(
      requested.some((url) => url.includes("/actions/workflows/quality-gates.yml")),
    ).toBe(true);
    expect(
      requested.some((url) =>
        url.includes("/actions/workflows/.github/workflows/quality-gates.yml"),
      ),
    ).toBe(false);
  });
});
