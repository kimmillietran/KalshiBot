import { TRUSTED_CURSOR_LOGIN, type GithubReview, type ReviewThread } from "./autoMergeGateTypes";

/** Exact trusted marker. Fuzzy language (nit/optional/minor) never authorizes resolution. */
export const NON_BLOCKING_MARKER = "[NON-BLOCKING]";

export type AutoResolvableThreadDecision =
  | { kind: "eligible"; threadId: string; reason: string }
  | { kind: "ineligible"; reason: string };

function normalizeBody(body: string | null | undefined): string | null {
  if (typeof body !== "string") {
    return null;
  }
  return body.replace(/^\uFEFF/, "");
}

/**
 * Root comment body must begin with the exact marker `[NON-BLOCKING]`.
 * Leading whitespace (other than BOM strip) is not allowed.
 */
export function bodyBeginsWithNonBlockingMarker(body: string | null | undefined): boolean {
  const normalized = normalizeBody(body);
  if (normalized == null) {
    return false;
  }
  return normalized.startsWith(NON_BLOCKING_MARKER);
}

function isBlockingReplyBody(body: string | null | undefined): boolean {
  const normalized = normalizeBody(body);
  if (normalized == null || normalized.trim() === "") {
    return false;
  }
  // Fail closed on formal CHANGES REQUESTED semantics in any reply.
  if (/\bCHANGES\s+REQUESTED\b/i.test(normalized)) {
    return true;
  }
  if (/##\s*Verdict[\s\S]*CHANGES\s+REQUESTED/i.test(normalized)) {
    return true;
  }
  return false;
}

/**
 * Decide whether an unresolved review thread may be auto-resolved.
 *
 * Requires ALL of:
 * - unresolved
 * - GraphQL thread id present
 * - root author == cursor[bot]
 * - root body begins with exact `[NON-BLOCKING]`
 * - associated Cursor review bound to exact current PR HEAD
 * - no replies (any additional comment fails closed)
 * - no blocking/CHANGES REQUESTED reply semantics (defense in depth)
 */
export function classifyAutoResolvableNonBlockingThread(input: {
  thread: ReviewThread;
  currentHeadSha: string;
  exactHeadCursorReviews: readonly GithubReview[];
}): AutoResolvableThreadDecision {
  const { thread, currentHeadSha, exactHeadCursorReviews } = input;

  if (thread.isResolved) {
    return { kind: "ineligible", reason: "thread already resolved" };
  }
  if (typeof thread.id !== "string" || thread.id.trim() === "") {
    return { kind: "ineligible", reason: "malformed thread: missing GraphQL id" };
  }
  if (!Array.isArray(thread.comments) || thread.comments.length === 0) {
    return { kind: "ineligible", reason: "malformed thread: missing comments" };
  }

  const root = thread.comments[0];
  if (root == null) {
    return { kind: "ineligible", reason: "malformed thread: missing root comment" };
  }
  if (root.authorLogin !== TRUSTED_CURSOR_LOGIN) {
    return { kind: "ineligible", reason: "root author is not trusted cursor[bot]" };
  }
  if (!bodyBeginsWithNonBlockingMarker(root.body)) {
    return { kind: "ineligible", reason: "root body does not begin with exact [NON-BLOCKING] marker" };
  }

  // Any reply fails closed (human dispute, follow-ups, or incomplete metadata).
  if (thread.comments.length > 1) {
    for (let index = 1; index < thread.comments.length; index += 1) {
      const reply = thread.comments[index]!;
      if (reply.authorLogin !== TRUSTED_CURSOR_LOGIN) {
        return { kind: "ineligible", reason: "thread has a non-cursor reply" };
      }
      if (isBlockingReplyBody(reply.body)) {
        return { kind: "ineligible", reason: "thread has a blocking/CHANGES REQUESTED reply" };
      }
      // Even trusted cursor replies fail closed — classification must stay unambiguous.
      return { kind: "ineligible", reason: "thread has replies; only single-comment NON-BLOCKING roots are eligible" };
    }
  }

  const reviewCommitOid = root.pullRequestReviewCommitOid;
  const reviewDatabaseId = root.pullRequestReviewDatabaseId;
  if (
    (reviewCommitOid == null || reviewCommitOid.trim() === "")
    && (reviewDatabaseId == null || !Number.isInteger(reviewDatabaseId))
  ) {
    return {
      kind: "ineligible",
      reason: "malformed thread: missing associated pull request review identity",
    };
  }

  if (reviewCommitOid != null && reviewCommitOid !== currentHeadSha) {
    return { kind: "ineligible", reason: "associated Cursor review is not on the exact current PR HEAD" };
  }

  const matchingExactHeadReview = exactHeadCursorReviews.find((review) => {
    if (review.userLogin !== TRUSTED_CURSOR_LOGIN) {
      return false;
    }
    if (review.commitId !== currentHeadSha) {
      return false;
    }
    if (reviewDatabaseId != null && review.id === reviewDatabaseId) {
      return true;
    }
    // When database id is unavailable, require commit oid already matched current head above.
    return reviewDatabaseId == null && reviewCommitOid === currentHeadSha;
  });

  if (!matchingExactHeadReview) {
    return {
      kind: "ineligible",
      reason: "associated Cursor review is not an active exact-head trusted Cursor LRM review",
    };
  }

  return {
    kind: "eligible",
    threadId: thread.id,
    reason: "trusted exact-head cursor[bot] [NON-BLOCKING] single-comment thread",
  };
}

export function selectAutoResolvableNonBlockingThreadIds(input: {
  threads: readonly ReviewThread[];
  currentHeadSha: string;
  reviews: readonly GithubReview[];
}): { eligibleThreadIds: string[]; decisions: AutoResolvableThreadDecision[] } {
  const exactHeadCursorReviews = input.reviews.filter(
    (review) =>
      review.userLogin === TRUSTED_CURSOR_LOGIN
      && review.commitId === input.currentHeadSha
      && review.state !== "DISMISSED"
      && review.state !== "PENDING",
  );

  const decisions: AutoResolvableThreadDecision[] = [];
  const eligibleThreadIds: string[] = [];
  for (const thread of input.threads) {
    const decision = classifyAutoResolvableNonBlockingThread({
      thread,
      currentHeadSha: input.currentHeadSha,
      exactHeadCursorReviews,
    });
    decisions.push(decision);
    if (decision.kind === "eligible") {
      eligibleThreadIds.push(decision.threadId);
    }
  }
  return { eligibleThreadIds, decisions };
}
