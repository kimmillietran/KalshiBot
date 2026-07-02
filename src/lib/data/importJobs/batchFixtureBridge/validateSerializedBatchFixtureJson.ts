export type SerializedBatchFixtureValidationResult =
  | { ok: true; json: string }
  | { ok: false; errorMessage: string };

/** Validates batch fixture bridge output before writing fixture.json. */
export function validateSerializedBatchFixtureJson(
  serialized: string | null | undefined,
): SerializedBatchFixtureValidationResult {
  if (serialized == null || typeof serialized !== "string") {
    return {
      ok: false,
      errorMessage: "Fixture bridge returned empty or non-string output",
    };
  }

  const trimmed = serialized.trim();
  if (!trimmed) {
    return {
      ok: false,
      errorMessage: "Fixture bridge returned empty output",
    };
  }

  if (trimmed === "undefined") {
    return {
      ok: false,
      errorMessage: "Fixture bridge returned undefined output",
    };
  }

  try {
    JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      errorMessage: "Fixture bridge output is not valid JSON",
    };
  }

  return { ok: true, json: serialized };
}
