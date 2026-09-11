import { TRUSTED_CURSOR_LOGIN, type GithubReview, type ReviewThread } from "./autoMergeGateTypes";

/** Preferred canonical marker after body normalization. */
export const NON_BLOCKING_MARKER = "[NON-BLOCKING]";

/**
 * Legacy Cursor Automation visible prefix (case-sensitive).
 * Observed after leading `<!-- CURSOR_AUTOMATION_ID: ... -->` metadata.
 */
export const NON_BLOCKING_LEGACY_PREFIX = "Non-blocking:";

/**
 * Legacy bold Markdown form observed in production Cursor Automation comments.
 * Exactly `**Non-blocking:**` — not arbitrary emphasis.
 */
export const NON_BLOCKING_LEGACY_BOLD_PREFIX = "**Non-blocking:**";

/**
 * GitHub review-thread GraphQL surfaces Cursor root comments as `cursor`
 * while the associated pull-request review actor remains `cursor[bot]`.
 * This alias is NEVER sufficient alone — linked exact-head trusted review
 * authorization is required.
 */
export const CURSOR_THREAD_COMMENT_AUTHOR_ALIAS = "cursor";

export type NonBlockingMarkerKind = "canonical" | "legacy" | "legacy-bold";

export type AutoResolvableThreadDecision =
  | { kind: "eligible"; threadId: string; reason: string; marker: NonBlockingMarkerKind }
  | { kind: "ineligible"; reason: string };

/**
 * Normalize ONLY for marker inspection:
 * 1. strip BOM
 * 2. trim leading whitespace
 * 3. strip one or more leading HTML comments only
 * 4. trim leading whitespace again
 *
 * Malformed leading `<!--` without a closing `-->` fails closed (returns null).
 * Does not remove arbitrary Markdown or prose.
 */
export function normalizeRootCommentBodyForMarker(
  body: string | null | undefined,
): string | null {
  if (typeof body !== "string") {
    return null;
  }
  let remaining = body.replace(/^\uFEFF/, "");
  remaining = remaining.replace(/^\s+/, "");

  while (remaining.startsWith("<!--")) {
    const closeIndex = remaining.indexOf("-->");
    if (closeIndex < 0) {
      // Malformed HTML-comment prefix — fail closed.
      return null;
    }
    remaining = remaining.slice(closeIndex + 3).replace(/^\s+/, "");
  }

  return remaining;
}

export type NonBlockingMarkerMatch =
  | { matched: true; marker: NonBlockingMarkerKind }
  | { matched: false };

/**
 * After normalization, accept only:
 * - exact prefix `[NON-BLOCKING]`
 * - exact case-sensitive prefix `Non-blocking:`
 * - exact case-sensitive prefix `**Non-blocking:**`
 *
 * Fuzzy language (nit/optional/minor/suggestion/FYI) never matches.
 * Unsupported emphasis (`***Non-blocking:***`) never matches.
 */
export function matchNonBlockingMarker(body: string | null | undefined): NonBlockingMarkerMatch {
  const normalized = normalizeRootCommentBodyForMarker(body);
  if (normalized == null) {
    return { matched: false };
  }
  if (normalized.startsWith(NON_BLOCKING_MARKER)) {
    return { matched: true, marker: "canonical" };
  }
  if (normalized.startsWith(NON_BLOCKING_LEGACY_BOLD_PREFIX)) {
    return { matched: true, marker: "legacy-bold" };
  }
  if (normalized.startsWith(NON_BLOCKING_LEGACY_PREFIX)) {
    return { matched: true, marker: "legacy" };
  }
  return { matched: false };
}

/**
 * Root comment body begins with an approved explicit non-blocking marker
 * after Cursor HTML-metadata normalization.
 */
export function bodyBeginsWithNonBlockingMarker(body: string | null | undefined): boolean {
  return matchNonBlockingMarker(body).matched;
}

/**
 * Trusted thread-author compatibility.
 *
 * Canonical trusted identity remains `cursor[bot]`.
 * Alias `cursor` is accepted ONLY when `associatedReview` is independently
 * proven to be an exact-current-head trusted `cursor[bot]` review.
 * The string `cursor` alone is never sufficient authorization.
 */
export function isTrustedCursorThreadAuthor(input: {
  rootAuthorLogin: string | null | undefined;
  associatedReview: GithubReview | null;
  currentHeadSha: string;
}): { trusted: true } | { trusted: false; reason: string } {
  const login = input.rootAuthorLogin;
  if (login !== TRUSTED_CURSOR_LOGIN && login !== CURSOR_THREAD_COMMENT_AUTHOR_ALIAS) {
    return {
      trusted: false,
      reason: "root author is not trusted cursor[bot]",
    };
  }

  const review = input.associatedReview;
  if (review == null) {
    return {
      trusted: false,
      reason:
        login === CURSOR_THREAD_COMMENT_AUTHOR_ALIAS
          ? "author alias not backed by trusted exact-head Cursor review"
          : "associated Cursor review is not an active exact-head trusted Cursor LRM review",
    };
  }
  if (review.userLogin !== TRUSTED_CURSOR_LOGIN) {
    return {
      trusted: false,
      reason: "author alias not backed by trusted exact-head Cursor review",
    };
  }
  if (review.commitId !== input.currentHeadSha) {
    return { trusted: false, reason: "associated review is stale" };
  }
  if (review.state === "DISMISSED" || review.state === "PENDING") {
    return { trusted: false, reason: "associated review is dismissed/pending" };
  }

  return { trusted: true };
}

function isBlockingReplyBody(body: string | null | undefined): boolean {
  const normalized = normalizeRootCommentBodyForMarker(body);
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

function markerEligibleReason(marker: NonBlockingMarkerKind): string {
  if (marker === "canonical") {
    return "trusted exact-head cursor[bot] [NON-BLOCKING] single-comment thread";
  }
  if (marker === "legacy-bold") {
    return "trusted exact-head cursor[bot] **Non-blocking:** single-comment thread";
  }
  return "trusted exact-head cursor[bot] Non-blocking: single-comment thread";
}

/**
 * Decide whether an unresolved review thread may be auto-resolved.
 *
 * Requires ALL of:
 * - unresolved
 * - GraphQL thread id present
 * - root author is `cursor[bot]`, OR `cursor` backed by linked exact-head
 *   trusted `cursor[bot]` review (GitHub thread-API representation)
 * - normalized root body begins with an approved non-blocking marker
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

  const markerMatch = matchNonBlockingMarker(root.body);
  if (!markerMatch.matched) {
    if (normalizeRootCommentBodyForMarker(root.body) == null) {
      return { kind: "ineligible", reason: "malformed HTML-comment prefix" };
    }
    return { kind: "ineligible", reason: "marker not recognized" };
  }

  // Any reply fails closed (human dispute, follow-ups, or incomplete metadata).
  if (thread.comments.length > 1) {
    for (let index = 1; index < thread.comments.length; index += 1) {
      const reply = thread.comments[index]!;
      if (
        reply.authorLogin !== TRUSTED_CURSOR_LOGIN
        && reply.authorLogin !== CURSOR_THREAD_COMMENT_AUTHOR_ALIAS
      ) {
        return { kind: "ineligible", reason: "thread has a non-cursor reply" };
      }
      if (isBlockingReplyBody(reply.body)) {
        return { kind: "ineligible", reason: "thread has a blocking/CHANGES REQUESTED reply" };
      }
      // Even trusted cursor replies fail closed — classification must stay unambiguous.
      return { kind: "ineligible", reason: "thread has replies" };
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

  if (
    root.pullRequestReviewState === "DISMISSED"
    || root.pullRequestReviewState === "PENDING"
  ) {
    return { kind: "ineligible", reason: "associated review is dismissed/pending" };
  }

  if (reviewCommitOid != null && reviewCommitOid !== currentHeadSha) {
    return { kind: "ineligible", reason: "associated review is stale" };
  }

  const matchingExactHeadReview = exactHeadCursorReviews.find((review) => {
    if (review.userLogin !== TRUSTED_CURSOR_LOGIN) {
      return false;
    }
    if (review.commitId !== currentHeadSha) {
      return false;
    }
    if (review.state === "DISMISSED" || review.state === "PENDING") {
      return false;
    }
    if (reviewDatabaseId != null && review.id === reviewDatabaseId) {
      return true;
    }
    // When database id is unavailable, require commit oid already matched current head above.
    return reviewDatabaseId == null && reviewCommitOid === currentHeadSha;
  }) ?? null;

  const authorTrust = isTrustedCursorThreadAuthor({
    rootAuthorLogin: root.authorLogin,
    associatedReview: matchingExactHeadReview,
    currentHeadSha,
  });
  if (!authorTrust.trusted) {
    return { kind: "ineligible", reason: authorTrust.reason };
  }

  if (!matchingExactHeadReview) {
    return {
      kind: "ineligible",
      reason: "associated Cursor review is not an active exact-head trusted Cursor LRM review",
    };
  }

  return {
    kind: "eligible",
    threadId: thread.id,
    marker: markerMatch.marker,
    reason: markerEligibleReason(markerMatch.marker),
  };
}

export function formatIneligibleThreadLogLine(decision: AutoResolvableThreadDecision & {
  kind: "ineligible";
  threadId: string;
}): string {
  return `thread ${decision.threadId}: unresolved — ${decision.reason}`;
}

export function formatResolvedThreadLogLine(threadId: string): string {
  return `thread ${threadId}: auto-resolved trusted exact-head Cursor non-blocking thread`;
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
