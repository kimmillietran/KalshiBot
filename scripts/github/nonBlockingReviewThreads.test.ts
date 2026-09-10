import { describe, expect, it } from "vitest";

import type { GithubReview, ReviewThread } from "./autoMergeGateTypes";
import {
  bodyBeginsWithNonBlockingMarker,
  classifyAutoResolvableNonBlockingThread,
  matchNonBlockingMarker,
  NON_BLOCKING_LEGACY_PREFIX,
  NON_BLOCKING_MARKER,
  normalizeRootCommentBodyForMarker,
  selectAutoResolvableNonBlockingThreadIds,
} from "./nonBlockingReviewThreads";

const HEAD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const STALE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** Exact structural shape observed in production on PR #75. */
const REAL_CURSOR_NON_BLOCKING_BODY =
  "<!-- CURSOR_AUTOMATION_ID: 88a68416-7cc4-11f1-ba66-0e7d0216e441 | RUN_ID: bc-2192b8db-b4bf-4070-a8a6-b76191e775e5 -->\n"
  + "Non-blocking: `tryMeasureDirectoryBytes` always returns `null`.";

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

function threadWithBody(
  body: string,
  overrides: Partial<ReviewThread> = {},
  authorLogin = "cursor[bot]",
): ReviewThread {
  return {
    id: "PRRT_nb_1",
    isResolved: false,
    comments: [
      {
        authorLogin,
        body,
        createdAt: "2026-09-10T00:00:00.000Z",
        pullRequestReviewDatabaseId: 42,
        pullRequestReviewCommitOid: HEAD,
        pullRequestReviewState: "COMMENTED",
      },
    ],
    ...overrides,
  };
}

describe("normalizeRootCommentBodyForMarker", () => {
  it("strips leading whitespace and Cursor HTML metadata", () => {
    expect(
      normalizeRootCommentBodyForMarker(
        `  <!-- CURSOR_AUTOMATION_ID: x | RUN_ID: y -->\n${NON_BLOCKING_MARKER}\nnote`,
      ),
    ).toBe(`${NON_BLOCKING_MARKER}\nnote`);
  });

  it("fails closed on malformed HTML-comment prefix", () => {
    expect(normalizeRootCommentBodyForMarker("<!-- never closed\nNon-blocking: x")).toBeNull();
  });
});

describe("bodyBeginsWithNonBlockingMarker / matchNonBlockingMarker", () => {
  it("1. [NON-BLOCKING] at byte 0 qualifies", () => {
    expect(bodyBeginsWithNonBlockingMarker("[NON-BLOCKING]\nnote")).toBe(true);
    expect(matchNonBlockingMarker("[NON-BLOCKING]\nnote")).toEqual({
      matched: true,
      marker: "canonical",
    });
  });

  it("2. leading whitespace + [NON-BLOCKING] qualifies", () => {
    expect(bodyBeginsWithNonBlockingMarker(" \n[NON-BLOCKING]\nnote")).toBe(true);
  });

  it("3. leading Cursor HTML metadata + [NON-BLOCKING] qualifies", () => {
    expect(
      bodyBeginsWithNonBlockingMarker(
        "<!-- CURSOR_AUTOMATION_ID: a | RUN_ID: b -->\n[NON-BLOCKING]\nOptional cleanup.",
      ),
    ).toBe(true);
  });

  it("4. leading Cursor HTML metadata + Non-blocking: qualifies", () => {
    expect(bodyBeginsWithNonBlockingMarker(REAL_CURSOR_NON_BLOCKING_BODY)).toBe(true);
    expect(matchNonBlockingMarker(REAL_CURSOR_NON_BLOCKING_BODY)).toEqual({
      matched: true,
      marker: "legacy",
    });
  });

  it("5. multiple leading HTML comments + canonical marker qualifies", () => {
    expect(
      bodyBeginsWithNonBlockingMarker(
        "<!-- a -->\n<!-- b -->\n[NON-BLOCKING]\nnote",
      ),
    ).toBe(true);
  });

  it("11-13. fuzzy / unmarked prefixes do not qualify", () => {
    expect(bodyBeginsWithNonBlockingMarker("nit: optional")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("optional: later")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("optional [NON-BLOCKING]")).toBe(false);
    expect(
      bodyBeginsWithNonBlockingMarker(
        "<!-- CURSOR_AUTOMATION_ID: a | RUN_ID: b -->\nCould simplify this helper later.",
      ),
    ).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("probably non-blocking")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("FYI: note")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("suggestion: note")).toBe(false);
  });

  it("14. malformed HTML-comment prefix fails closed", () => {
    expect(bodyBeginsWithNonBlockingMarker("<!-- broken\n[NON-BLOCKING]\nnote")).toBe(false);
  });
});

describe("classifyAutoResolvableNonBlockingThread", () => {
  const reviews = [cursorReview()];

  it("canonical exact-head Cursor [NON-BLOCKING] thread is eligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: threadWithBody(`${NON_BLOCKING_MARKER}\nCould simplify this helper later.`),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision).toEqual({
      kind: "eligible",
      threadId: "PRRT_nb_1",
      marker: "canonical",
      reason: expect.stringContaining("NON-BLOCKING"),
    });
  });

  it("production Cursor Non-blocking: fixture is eligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: threadWithBody(REAL_CURSOR_NON_BLOCKING_BODY),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision).toEqual({
      kind: "eligible",
      threadId: "PRRT_nb_1",
      marker: "legacy",
      reason: expect.stringContaining(NON_BLOCKING_LEGACY_PREFIX),
    });
  });

  it("10. unmarked Cursor observation remains blocking", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: threadWithBody("Potential stale identity bug here."),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision.kind).toBe("ineligible");
    expect(decision.reason).toBe("marker not recognized");
  });

  it("8. stale-head Cursor review does not qualify", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: threadWithBody(REAL_CURSOR_NON_BLOCKING_BODY, {
        comments: [
          {
            authorLogin: "cursor[bot]",
            body: REAL_CURSOR_NON_BLOCKING_BODY,
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
    expect(decision.reason).toBe("stale review head");
  });

  it("6. Non-blocking: from human does not qualify", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: threadWithBody(REAL_CURSOR_NON_BLOCKING_BODY, {}, "alice"),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision.kind).toBe("ineligible");
    expect(decision.reason).toMatch(/not trusted cursor/i);
  });

  it("7. [NON-BLOCKING] from human does not qualify", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: threadWithBody(`${NON_BLOCKING_MARKER}\nnote`, {}, "alice"),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision.kind).toBe("ineligible");
  });

  it("9. thread with reply does not qualify", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: {
        id: "PRRT_nb_1",
        isResolved: false,
        comments: [
          {
            authorLogin: "cursor[bot]",
            body: REAL_CURSOR_NON_BLOCKING_BODY,
            createdAt: "2026-09-10T00:00:00.000Z",
            pullRequestReviewDatabaseId: 42,
            pullRequestReviewCommitOid: HEAD,
            pullRequestReviewState: "COMMENTED",
          },
          {
            authorLogin: "alice",
            body: "I think this is actually correctness-critical.",
            createdAt: "2026-09-10T00:05:00.000Z",
            pullRequestReviewDatabaseId: null,
            pullRequestReviewCommitOid: null,
            pullRequestReviewState: null,
          },
        ],
      },
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision.kind).toBe("ineligible");
    expect(decision.reason).toMatch(/reply/i);
  });

  it("malformed metadata is not eligible", () => {
    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: { id: null, isResolved: false, comments: threadWithBody(NON_BLOCKING_MARKER).comments },
        currentHeadSha: HEAD,
        exactHeadCursorReviews: reviews,
      }).kind,
    ).toBe("ineligible");

    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: threadWithBody("<!-- unclosed\nNon-blocking: x"),
        currentHeadSha: HEAD,
        exactHeadCursorReviews: reviews,
      }).reason,
    ).toBe("malformed HTML-comment prefix");
  });

  it("selectAutoResolvableNonBlockingThreadIds returns only eligible ids", () => {
    const unmarked = threadWithBody("Potential stale identity bug here.", {
      id: "PRRT_unmarked",
    });
    const selected = selectAutoResolvableNonBlockingThreadIds({
      threads: [threadWithBody(REAL_CURSOR_NON_BLOCKING_BODY), unmarked],
      currentHeadSha: HEAD,
      reviews,
    });
    expect(selected.eligibleThreadIds).toEqual(["PRRT_nb_1"]);
  });
});
