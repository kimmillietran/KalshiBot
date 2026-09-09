import { describe, expect, it } from "vitest";

import { AUTO_MERGE_WORKFLOW_PATH } from "./autoMergeGateTypes";
import {
  GithubApiError,
  createGithubApi,
  mapMergeability,
  mapPullRequest,
  mapPullRequestFile,
  mapReview,
} from "./githubApi";
import { prTouchesTrustedAutoMergePaths } from "./autoMergeGate";

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

  it("maps a COMMENTED Cursor review without requiring GitHub APPROVED", () => {
    const review = mapReview({
      id: 9,
      user: { login: "cursor[bot]" },
      commit_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      submitted_at: "2026-09-08T20:00:00Z",
      state: "COMMENTED",
      body: "## Verdict\n\nAPPROVED FOR MERGE\n",
    });
    expect(review.state).toBe("COMMENTED");
    expect(review.userLogin).toBe("cursor[bot]");
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
});
