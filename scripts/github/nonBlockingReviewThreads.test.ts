import { describe, expect, it } from "vitest";

import type { GithubReview, ReviewThread } from "./autoMergeGateTypes";
import {
  bodyBeginsWithNonBlockingMarker,
  classifyAutoResolvableNonBlockingThread,
  NON_BLOCKING_MARKER,
  selectAutoResolvableNonBlockingThreadIds,
} from "./nonBlockingReviewThreads";

const HEAD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const STALE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function cursorReview(overrides: Partial<GithubReview> = {}): GithubReview {
  return {
    id: 42,
    userLogin: "cursor[bot]",
    commitId: HEAD,
    submittedAt: "2026-09-10T00:00:00.000Z",
    state: "COMMENTED",
    body: "## Verdict\n\nAPPROVED FOR MERGE\n",
    ...overrides,
  };
}

function nonBlockingThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "PRRT_nb_1",
    isResolved: false,
    comments: [
      {
        authorLogin: "cursor[bot]",
        body: `${NON_BLOCKING_MARKER}\nCould simplify this helper later.`,
        createdAt: "2026-09-10T00:00:00.000Z",
        pullRequestReviewDatabaseId: 42,
        pullRequestReviewCommitOid: HEAD,
        pullRequestReviewState: "COMMENTED",
      },
    ],
    ...overrides,
  };
}

describe("bodyBeginsWithNonBlockingMarker", () => {
  it("requires the exact leading marker", () => {
    expect(bodyBeginsWithNonBlockingMarker("[NON-BLOCKING]\nnote")).toBe(true);
    expect(bodyBeginsWithNonBlockingMarker(" [NON-BLOCKING]\nnote")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("nit: optional")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("optional [NON-BLOCKING]")).toBe(false);
  });
});

describe("classifyAutoResolvableNonBlockingThread", () => {
  const reviews = [cursorReview()];

  it("1. exact-head Cursor [NON-BLOCKING] thread is eligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: nonBlockingThread(),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision).toEqual({
      kind: "eligible",
      threadId: "PRRT_nb_1",
      reason: expect.stringContaining("NON-BLOCKING"),
    });
  });

  it("2. unmarked Cursor thread is not eligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: nonBlockingThread({
        comments: [
          {
            authorLogin: "cursor[bot]",
            body: "Potential stale identity bug here.",
            createdAt: "2026-09-10T00:00:00.000Z",
            pullRequestReviewDatabaseId: 42,
            pullRequestReviewCommitOid: HEAD,
            pullRequestReviewState: "COMMENTED",
          },
        ],
      }),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision.kind).toBe("ineligible");
  });

  it("3. stale-head Cursor thread is not eligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: nonBlockingThread({
        comments: [
          {
            authorLogin: "cursor[bot]",
            body: `${NON_BLOCKING_MARKER}\nCould simplify this helper later.`,
            createdAt: "2026-09-10T00:00:00.000Z",
            pullRequestReviewDatabaseId: 42,
            pullRequestReviewCommitOid: STALE,
            pullRequestReviewState: "COMMENTED",
          },
        ],
      }),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision.kind).toBe("ineligible");
    expect(decision.reason).toMatch(/exact current PR HEAD/i);
  });

  it("4. human [NON-BLOCKING] thread is not eligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: nonBlockingThread({
        comments: [
          {
            authorLogin: "alice",
            body: `${NON_BLOCKING_MARKER}\nCould simplify this helper later.`,
            createdAt: "2026-09-10T00:00:00.000Z",
            pullRequestReviewDatabaseId: 99,
            pullRequestReviewCommitOid: HEAD,
            pullRequestReviewState: "COMMENTED",
          },
        ],
      }),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision.kind).toBe("ineligible");
    expect(decision.reason).toMatch(/not trusted cursor/i);
  });

  it("5. malformed metadata is not eligible", () => {
    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: { id: null, isResolved: false, comments: nonBlockingThread().comments },
        currentHeadSha: HEAD,
        exactHeadCursorReviews: reviews,
      }).kind,
    ).toBe("ineligible");

    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: { id: "PRRT_x", isResolved: false, comments: [] },
        currentHeadSha: HEAD,
        exactHeadCursorReviews: reviews,
      }).kind,
    ).toBe("ineligible");

    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: nonBlockingThread({
          comments: [
            {
              authorLogin: "cursor[bot]",
              body: `${NON_BLOCKING_MARKER}\nnote`,
              createdAt: "2026-09-10T00:00:00.000Z",
              pullRequestReviewDatabaseId: null,
              pullRequestReviewCommitOid: null,
              pullRequestReviewState: null,
            },
          ],
        }),
        currentHeadSha: HEAD,
        exactHeadCursorReviews: reviews,
      }).kind,
    ).toBe("ineligible");
  });

  it("6. thread with human reply is not eligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: nonBlockingThread({
        comments: [
          nonBlockingThread().comments[0]!,
          {
            authorLogin: "alice",
            body: "I think this is actually correctness-critical.",
            createdAt: "2026-09-10T00:05:00.000Z",
            pullRequestReviewDatabaseId: null,
            pullRequestReviewCommitOid: null,
            pullRequestReviewState: null,
          },
        ],
      }),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision.kind).toBe("ineligible");
    expect(decision.reason).toMatch(/reply/i);
  });

  it("7. thread with CHANGES REQUESTED reply is not eligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: nonBlockingThread({
        comments: [
          nonBlockingThread().comments[0]!,
          {
            authorLogin: "cursor[bot]",
            body: "CHANGES REQUESTED on this path",
            createdAt: "2026-09-10T00:05:00.000Z",
            pullRequestReviewDatabaseId: 42,
            pullRequestReviewCommitOid: HEAD,
            pullRequestReviewState: "CHANGES_REQUESTED",
          },
        ],
      }),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision.kind).toBe("ineligible");
  });

  it("selectAutoResolvableNonBlockingThreadIds returns only eligible ids", () => {
    const unmarked: ReviewThread = {
      id: "PRRT_unmarked",
      isResolved: false,
      comments: [
        {
          authorLogin: "cursor[bot]",
          body: "Potential stale identity bug here.",
          createdAt: "2026-09-10T00:00:00.000Z",
          pullRequestReviewDatabaseId: 42,
          pullRequestReviewCommitOid: HEAD,
          pullRequestReviewState: "COMMENTED",
        },
      ],
    };
    const selected = selectAutoResolvableNonBlockingThreadIds({
      threads: [nonBlockingThread(), unmarked],
      currentHeadSha: HEAD,
      reviews,
    });
    expect(selected.eligibleThreadIds).toEqual(["PRRT_nb_1"]);
  });
});
