import { describe, expect, it } from "vitest";

import { mapMergeability, mapPullRequest, mapReview } from "./githubApi";

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
});
