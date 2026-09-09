import type { CursorLrmVerdict } from "./autoMergeGateTypes";

export type ParsedCursorLrmVerdict = {
  verdict: CursorLrmVerdict | null;
  reason: "ok" | "missing" | "malformed" | "ambiguous";
};

const VERDICT_HEADING = /^#{1,3}[ \t]+Verdict[ \t]*$/i;
const APPROVED = /^APPROVED FOR MERGE[ \t]*$/i;
const CHANGES = /^CHANGES REQUESTED[ \t]*$/i;

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

    const value = lines[cursor]!.trim();
    if (APPROVED.test(value)) {
      found.push("APPROVED_FOR_MERGE");
    } else if (CHANGES.test(value)) {
      found.push("CHANGES_REQUESTED");
    } else {
      found.push("malformed");
    }
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
