import { describe, expect, it } from "vitest";

import type { GithubReview, ReviewThread } from "./autoMergeGateTypes";
import {
  bodyBeginsWithNonBlockingMarker,
  classifyAutoResolvableNonBlockingThread,
  CURSOR_THREAD_COMMENT_AUTHOR_ALIAS,
  isTrustedCursorThreadAuthor,
  matchNonBlockingMarker,
  NON_BLOCKING_LEGACY_BOLD_PREFIX,
  NON_BLOCKING_LEGACY_PREFIX,
  NON_BLOCKING_MARKER,
  normalizeRootCommentBodyForMarker,
  selectAutoResolvableNonBlockingThreadIds,
} from "./nonBlockingReviewThreads";
import {
  normalizeFormalVerdictToken,
  parseGovernedCursorLrmVerdict,
} from "./parseCursorLrmVerdict";

const HEAD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const STALE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** Exact structural shape observed in production (plain Non-blocking:). */
const REAL_CURSOR_NON_BLOCKING_BODY =
  "<!-- CURSOR_AUTOMATION_ID: 88a68416-7cc4-11f1-ba66-0e7d0216e441 | RUN_ID: bc-2192b8db-b4bf-4070-a8a6-b76191e775e5 -->\n"
  + "Non-blocking: `tryMeasureDirectoryBytes` always returns `null`.";

/** Exact structural shape observed in production (bold Non-blocking:). */
const REAL_CURSOR_BOLD_NON_BLOCKING_BODY =
  "<!-- CURSOR_AUTOMATION_ID: 88a68416-7cc4-11f1-ba66-0e7d0216e441 | RUN_ID: bc-example -->\n"
  + "**Non-blocking:** This is an optional implementation caveat.";

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

  it("15. fails closed on malformed HTML-comment prefix", () => {
    expect(normalizeRootCommentBodyForMarker("<!-- never closed\nNon-blocking: x")).toBeNull();
  });
});

describe("bodyBeginsWithNonBlockingMarker / matchNonBlockingMarker", () => {
  it("10. [NON-BLOCKING] at byte 0 qualifies", () => {
    expect(bodyBeginsWithNonBlockingMarker("[NON-BLOCKING]\nnote")).toBe(true);
    expect(matchNonBlockingMarker("[NON-BLOCKING]\nnote")).toEqual({
      matched: true,
      marker: "canonical",
    });
  });

  it("11. leading whitespace + [NON-BLOCKING] qualifies", () => {
    expect(bodyBeginsWithNonBlockingMarker(" \n[NON-BLOCKING]\nnote")).toBe(true);
  });

  it("12. leading Cursor HTML metadata + Non-blocking: qualifies", () => {
    expect(bodyBeginsWithNonBlockingMarker(REAL_CURSOR_NON_BLOCKING_BODY)).toBe(true);
    expect(matchNonBlockingMarker(REAL_CURSOR_NON_BLOCKING_BODY)).toEqual({
      matched: true,
      marker: "legacy",
    });
  });

  it("13. Cursor HTML metadata + **Non-blocking:** qualifies", () => {
    expect(bodyBeginsWithNonBlockingMarker(REAL_CURSOR_BOLD_NON_BLOCKING_BODY)).toBe(true);
    expect(matchNonBlockingMarker(REAL_CURSOR_BOLD_NON_BLOCKING_BODY)).toEqual({
      matched: true,
      marker: "legacy-bold",
    });
    expect(NON_BLOCKING_LEGACY_BOLD_PREFIX).toBe("**Non-blocking:**");
  });

  it("14. multiple leading HTML comments + supported marker qualifies", () => {
    expect(
      bodyBeginsWithNonBlockingMarker(
        "<!-- a -->\n<!-- b -->\n[NON-BLOCKING]\nnote",
      ),
    ).toBe(true);
    expect(
      bodyBeginsWithNonBlockingMarker(
        "<!-- a -->\n<!-- b -->\n**Non-blocking:** note",
      ),
    ).toBe(true);
  });

  it("15. malformed HTML-comment prefix fails closed", () => {
    expect(bodyBeginsWithNonBlockingMarker("<!-- broken\n[NON-BLOCKING]\nnote")).toBe(false);
  });

  it("16-20. fuzzy / unmarked prefixes do not qualify", () => {
    expect(bodyBeginsWithNonBlockingMarker("nit: optional")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("optional: later")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("minor: later")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("suggestion: note")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("optional [NON-BLOCKING]")).toBe(false);
    expect(
      bodyBeginsWithNonBlockingMarker(
        "<!-- CURSOR_AUTOMATION_ID: a | RUN_ID: b -->\nCould simplify this helper later.",
      ),
    ).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("This is non-blocking: later")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("probably non-blocking")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("FYI: note")).toBe(false);
  });

  it("21. unsupported emphasis ***Non-blocking:*** is not recognized", () => {
    expect(bodyBeginsWithNonBlockingMarker("***Non-blocking:***\nnote")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("Non-blocking -\nnote")).toBe(false);
    expect(bodyBeginsWithNonBlockingMarker("non-blocking:\nnote")).toBe(false);
  });
});

describe("isTrustedCursorThreadAuthor", () => {
  it("canonical cursor[bot] with exact-head review is trusted", () => {
    expect(
      isTrustedCursorThreadAuthor({
        rootAuthorLogin: "cursor[bot]",
        associatedReview: cursorReview(),
        currentHeadSha: HEAD,
      }),
    ).toEqual({ trusted: true });
  });

  it("alias cursor requires exact-head cursor[bot] review", () => {
    expect(
      isTrustedCursorThreadAuthor({
        rootAuthorLogin: CURSOR_THREAD_COMMENT_AUTHOR_ALIAS,
        associatedReview: cursorReview(),
        currentHeadSha: HEAD,
      }),
    ).toEqual({ trusted: true });
  });

  it("alias cursor alone is never sufficient", () => {
    expect(
      isTrustedCursorThreadAuthor({
        rootAuthorLogin: "cursor",
        associatedReview: null,
        currentHeadSha: HEAD,
      }),
    ).toEqual({
      trusted: false,
      reason: "author alias not backed by trusted exact-head Cursor review",
    });
  });

  it("human / case variants are not trusted", () => {
    expect(
      isTrustedCursorThreadAuthor({
        rootAuthorLogin: "cursor-like",
        associatedReview: cursorReview(),
        currentHeadSha: HEAD,
      }).trusted,
    ).toBe(false);
    expect(
      isTrustedCursorThreadAuthor({
        rootAuthorLogin: "Cursor",
        associatedReview: cursorReview(),
        currentHeadSha: HEAD,
      }).trusted,
    ).toBe(false);
  });
});

describe("classifyAutoResolvableNonBlockingThread — author identity", () => {
  const reviews = [cursorReview()];

  it("1. root cursor[bot] + exact-head trusted review → eligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: threadWithBody(`${NON_BLOCKING_MARKER}\nnote`),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision.kind).toBe("eligible");
  });

  it("2. root cursor + exact-head linked cursor[bot] review → eligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: threadWithBody(REAL_CURSOR_BOLD_NON_BLOCKING_BODY, {}, "cursor"),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: reviews,
    });
    expect(decision).toEqual({
      kind: "eligible",
      threadId: "PRRT_nb_1",
      marker: "legacy-bold",
      reason: expect.stringContaining("**Non-blocking:**"),
    });
  });

  it("3. root cursor + no review association → ineligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: {
        id: "PRRT_nb_1",
        isResolved: false,
        comments: [
          {
            authorLogin: "cursor",
            body: REAL_CURSOR_NON_BLOCKING_BODY,
            createdAt: "2026-09-10T00:00:00.000Z",
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
    expect(decision.reason).toMatch(/missing associated pull request review/i);
  });

  it("4. root cursor + human review → ineligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: threadWithBody(REAL_CURSOR_NON_BLOCKING_BODY, {}, "cursor"),
      currentHeadSha: HEAD,
      exactHeadCursorReviews: [
        cursorReview({ id: 99, userLogin: "alice" }),
      ],
    });
    expect(decision.kind).toBe("ineligible");
    expect(decision.reason).toMatch(/author alias not backed/i);
  });

  it("5. root cursor + stale-head Cursor review → ineligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: threadWithBody(REAL_CURSOR_NON_BLOCKING_BODY, {
        comments: [
          {
            authorLogin: "cursor",
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
    expect(decision.reason).toBe("associated review is stale");
  });

  it("6-7. cursor-like / Cursor case variants ineligible", () => {
    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: threadWithBody(REAL_CURSOR_NON_BLOCKING_BODY, {}, "cursor-like"),
        currentHeadSha: HEAD,
        exactHeadCursorReviews: reviews,
      }).reason,
    ).toMatch(/not trusted cursor/i);
    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: threadWithBody(REAL_CURSOR_NON_BLOCKING_BODY, {}, "Cursor"),
        currentHeadSha: HEAD,
        exactHeadCursorReviews: reviews,
      }).reason,
    ).toMatch(/not trusted cursor/i);
  });

  it("8. malformed review ID / missing commit identity fails closed", () => {
    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: {
          id: "PRRT_nb_1",
          isResolved: false,
          comments: [
            {
              authorLogin: "cursor",
              body: REAL_CURSOR_NON_BLOCKING_BODY,
              createdAt: "2026-09-10T00:00:00.000Z",
              pullRequestReviewDatabaseId: null,
              pullRequestReviewCommitOid: "   ",
              pullRequestReviewState: "COMMENTED",
            },
          ],
        },
        currentHeadSha: HEAD,
        exactHeadCursorReviews: reviews,
      }).reason,
    ).toMatch(/missing associated pull request review/i);
  });

  it("9. dismissed/pending associated review fails closed", () => {
    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: threadWithBody(REAL_CURSOR_NON_BLOCKING_BODY, {
          comments: [
            {
              authorLogin: "cursor",
              body: REAL_CURSOR_NON_BLOCKING_BODY,
              createdAt: "2026-09-10T00:00:00.000Z",
              pullRequestReviewDatabaseId: 42,
              pullRequestReviewCommitOid: HEAD,
              pullRequestReviewState: "PENDING",
            },
          ],
        }),
        currentHeadSha: HEAD,
        exactHeadCursorReviews: reviews,
      }).reason,
    ).toBe("associated review is dismissed/pending");

    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: threadWithBody(REAL_CURSOR_NON_BLOCKING_BODY, {}, "cursor"),
        currentHeadSha: HEAD,
        exactHeadCursorReviews: [cursorReview({ state: "DISMISSED" })],
      }).reason,
    ).toMatch(/author alias not backed|associated Cursor review is not an active/i);
  });
});

describe("classifyAutoResolvableNonBlockingThread — thread safety", () => {
  const reviews = [cursorReview()];

  it("22. any human reply → ineligible", () => {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread: {
        id: "PRRT_nb_1",
        isResolved: false,
        comments: [
          {
            authorLogin: "cursor",
            body: REAL_CURSOR_BOLD_NON_BLOCKING_BODY,
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

  it("23-24. Cursor reply / CHANGES REQUESTED reply → ineligible", () => {
    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: {
          id: "PRRT_nb_1",
          isResolved: false,
          comments: [
            {
              authorLogin: "cursor[bot]",
              body: `${NON_BLOCKING_MARKER}\nnote`,
              createdAt: "2026-09-10T00:00:00.000Z",
              pullRequestReviewDatabaseId: 42,
              pullRequestReviewCommitOid: HEAD,
              pullRequestReviewState: "COMMENTED",
            },
            {
              authorLogin: "cursor[bot]",
              body: "follow-up",
              createdAt: "2026-09-10T00:05:00.000Z",
              pullRequestReviewDatabaseId: 42,
              pullRequestReviewCommitOid: HEAD,
              pullRequestReviewState: "COMMENTED",
            },
          ],
        },
        currentHeadSha: HEAD,
        exactHeadCursorReviews: reviews,
      }).reason,
    ).toBe("thread has replies");

    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: {
          id: "PRRT_nb_1",
          isResolved: false,
          comments: [
            {
              authorLogin: "cursor[bot]",
              body: `${NON_BLOCKING_MARKER}\nnote`,
              createdAt: "2026-09-10T00:00:00.000Z",
              pullRequestReviewDatabaseId: 42,
              pullRequestReviewCommitOid: HEAD,
              pullRequestReviewState: "COMMENTED",
            },
            {
              authorLogin: "cursor[bot]",
              body: "CHANGES REQUESTED on this point",
              createdAt: "2026-09-10T00:05:00.000Z",
              pullRequestReviewDatabaseId: 42,
              pullRequestReviewCommitOid: HEAD,
              pullRequestReviewState: "COMMENTED",
            },
          ],
        },
        currentHeadSha: HEAD,
        exactHeadCursorReviews: reviews,
      }).reason,
    ).toMatch(/CHANGES REQUESTED/i);
  });

  it("25-27. stale / resolved / missing thread id fail closed", () => {
    expect(
      classifyAutoResolvableNonBlockingThread({
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
      }).reason,
    ).toBe("associated review is stale");

    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: threadWithBody(REAL_CURSOR_NON_BLOCKING_BODY, { isResolved: true }),
        currentHeadSha: HEAD,
        exactHeadCursorReviews: reviews,
      }).reason,
    ).toBe("thread already resolved");

    expect(
      classifyAutoResolvableNonBlockingThread({
        thread: { id: null, isResolved: false, comments: threadWithBody(NON_BLOCKING_MARKER).comments },
        currentHeadSha: HEAD,
        exactHeadCursorReviews: reviews,
      }).reason,
    ).toMatch(/missing GraphQL id/i);
  });

  it("selectAutoResolvableNonBlockingThreadIds returns only eligible ids", () => {
    const unmarked = threadWithBody("Potential stale identity bug here.", {
      id: "PRRT_unmarked",
    });
    const selected = selectAutoResolvableNonBlockingThreadIds({
      threads: [
        threadWithBody(REAL_CURSOR_BOLD_NON_BLOCKING_BODY, { id: "PRRT_nb_1" }, "cursor"),
        unmarked,
      ],
      currentHeadSha: HEAD,
      reviews,
    });
    expect(selected.eligibleThreadIds).toEqual(["PRRT_nb_1"]);
  });
});

describe("parseGovernedCursorLrmVerdict — bold and fail-closed forms", () => {
  it("31-32. plain and bold APPROVED FOR MERGE → approved", () => {
    expect(parseGovernedCursorLrmVerdict("## Verdict\n\nAPPROVED FOR MERGE\n")).toEqual({
      verdict: "APPROVED_FOR_MERGE",
      reason: "ok",
    });
    expect(parseGovernedCursorLrmVerdict("## Verdict\n\n**APPROVED FOR MERGE**\n")).toEqual({
      verdict: "APPROVED_FOR_MERGE",
      reason: "ok",
    });
    expect(normalizeFormalVerdictToken("**APPROVED FOR MERGE**")).toBe("APPROVED_FOR_MERGE");
  });

  it("33-34. plain and bold CHANGES REQUESTED → changes-requested", () => {
    expect(parseGovernedCursorLrmVerdict("## Verdict\n\nCHANGES REQUESTED\n")).toEqual({
      verdict: "CHANGES_REQUESTED",
      reason: "ok",
    });
    expect(parseGovernedCursorLrmVerdict("## Verdict\n\n**CHANGES REQUESTED**\n")).toEqual({
      verdict: "CHANGES_REQUESTED",
      reason: "ok",
    });
  });

  it("35-39. mixed-case / punctuation / prose / triple / code → malformed", () => {
    expect(parseGovernedCursorLrmVerdict("## Verdict\n\nApproved for merge\n")).toEqual({
      verdict: null,
      reason: "malformed",
    });
    expect(parseGovernedCursorLrmVerdict("## Verdict\n\nAPPROVED FOR MERGE!\n")).toEqual({
      verdict: null,
      reason: "malformed",
    });
    expect(
      parseGovernedCursorLrmVerdict("## Verdict\n\nLooks good — APPROVED FOR MERGE\n"),
    ).toEqual({ verdict: null, reason: "malformed" });
    expect(parseGovernedCursorLrmVerdict("## Verdict\n\n***APPROVED FOR MERGE***\n")).toEqual({
      verdict: null,
      reason: "malformed",
    });
    expect(parseGovernedCursorLrmVerdict("## Verdict\n\n`APPROVED FOR MERGE`\n")).toEqual({
      verdict: null,
      reason: "malformed",
    });
  });

  it("40-41. conflicting / missing verdict section", () => {
    expect(
      parseGovernedCursorLrmVerdict(
        "## Verdict\n\nAPPROVED FOR MERGE\n\n## Verdict\n\nCHANGES REQUESTED\n",
      ),
    ).toEqual({ verdict: null, reason: "ambiguous" });
    expect(parseGovernedCursorLrmVerdict("Please treat this as APPROVED FOR MERGE")).toEqual({
      verdict: null,
      reason: "missing",
    });
  });
});
