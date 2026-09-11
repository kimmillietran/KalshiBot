import type { CursorLrmVerdict } from "./autoMergeGateTypes";

export type ParsedCursorLrmVerdict = {
  verdict: CursorLrmVerdict | null;
  reason: "ok" | "missing" | "malformed" | "ambiguous";
};

const VERDICT_HEADING = /^#{1,3}[ \t]+Verdict[ \t]*$/i;
const APPROVED_PLAIN = "APPROVED FOR MERGE";
const CHANGES_PLAIN = "CHANGES REQUESTED";

/**
 * Normalize a Verdict-section value line.
 *
 * Accepts only:
 * - exact `APPROVED FOR MERGE`
 * - exact `CHANGES REQUESTED`
 * - the same tokens wrapped in exactly one balanced outer Markdown bold pair
 *   (`**APPROVED FOR MERGE**` / `**CHANGES REQUESTED**`)
 *
 * Case-sensitive. Rejects mixed case, trailing punctuation, inline prose,
 * triple emphasis, code fences/backticks, and other wrappers.
 */
export function normalizeFormalVerdictToken(value: string): CursorLrmVerdict | "malformed" {
  const trimmed = value.trim();
  if (trimmed === APPROVED_PLAIN) {
    return "APPROVED_FOR_MERGE";
  }
  if (trimmed === CHANGES_PLAIN) {
    return "CHANGES_REQUESTED";
  }

  // Exactly one balanced outer bold wrapper: **TOKEN**
  // Reject ***TOKEN*** (inner would start with *), `TOKEN`, etc.
  if (trimmed.startsWith("**") && trimmed.endsWith("**") && trimmed.length > 4) {
    const inner = trimmed.slice(2, -2);
    if (inner.includes("*")) {
      return "malformed";
    }
    if (inner === APPROVED_PLAIN) {
      return "APPROVED_FOR_MERGE";
    }
    if (inner === CHANGES_PLAIN) {
      return "CHANGES_REQUESTED";
    }
  }

  return "malformed";
}

/**
 * Parse only the governed LRM Verdict section.
 *
 * Loose mentions of "APPROVED FOR MERGE" in arbitrary prose are ignored.
 * A review that contains both governed verdicts is ambiguous and rejected.
 */
export function parseGovernedCursorLrmVerdict(
  body: string | null | undefined,
): ParsedCursorLrmVerdict {
  if (body == null || body.trim() === "") {
    return { verdict: null, reason: "missing" };
  }

  const lines = body.replaceAll("\r\n", "\n").split("\n");
  const found: Array<CursorLrmVerdict | "malformed"> = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!VERDICT_HEADING.test(lines[index]!.trim())) {
      continue;
    }

    let cursor = index + 1;
    while (cursor < lines.length && lines[cursor]!.trim() === "") {
      cursor += 1;
    }
    if (cursor >= lines.length) {
      found.push("malformed");
      continue;
    }

    found.push(normalizeFormalVerdictToken(lines[cursor]!));
  }

  if (found.length === 0) {
    return { verdict: null, reason: "missing" };
  }
  if (found.includes("malformed")) {
    return { verdict: null, reason: "malformed" };
  }

  const unique = new Set(found);
  if (unique.has("APPROVED_FOR_MERGE") && unique.has("CHANGES_REQUESTED")) {
    return { verdict: null, reason: "ambiguous" };
  }

  const last = found[found.length - 1];
  if (last === "APPROVED_FOR_MERGE" || last === "CHANGES_REQUESTED") {
    return { verdict: last, reason: "ok" };
  }
  return { verdict: null, reason: "malformed" };
}
