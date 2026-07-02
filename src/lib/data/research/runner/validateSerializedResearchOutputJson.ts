import { parseResearchOutputJson } from "@/lib/data/research/aggregation/parseResearchOutputJson";

export type SerializedResearchOutputValidationResult =
  | { ok: true; json: string }
  | { ok: false; errorMessage: string };

/** Validates research runner output before writing research-output.json. */
export function validateSerializedResearchOutputJson(
  serialized: string | null | undefined,
  marketTicker?: string,
): SerializedResearchOutputValidationResult {
  if (serialized == null || typeof serialized !== "string") {
    return {
      ok: false,
      errorMessage: "Research runner returned empty or non-string output",
    };
  }

  const trimmed = serialized.trim();
  if (!trimmed) {
    return {
      ok: false,
      errorMessage: "Research runner returned empty output",
    };
  }

  if (trimmed === "undefined") {
    return {
      ok: false,
      errorMessage: "Research runner returned undefined output",
    };
  }

  try {
    parseResearchOutputJson(trimmed, marketTicker);
  } catch (error) {
    return {
      ok: false,
      errorMessage:
        error instanceof Error ? error.message : "Research runner output is not valid JSON",
    };
  }

  return { ok: true, json: serialized };
}
