import { describe, expect, it } from "vitest";

import { validateSerializedBatchFixtureJson } from "./validateSerializedBatchFixtureJson";

describe("validateSerializedBatchFixtureJson", () => {
  it("accepts valid JSON strings", () => {
    const result = validateSerializedBatchFixtureJson('{"runId":"fixture-a"}');

    expect(result).toEqual({ ok: true, json: '{"runId":"fixture-a"}' });
  });

  it("rejects undefined output", () => {
    expect(validateSerializedBatchFixtureJson(undefined)).toEqual({
      ok: false,
      errorMessage: "Fixture bridge returned empty or non-string output",
    });
  });

  it("rejects null output", () => {
    expect(validateSerializedBatchFixtureJson(null)).toEqual({
      ok: false,
      errorMessage: "Fixture bridge returned empty or non-string output",
    });
  });

  it("rejects the literal undefined fixture payload", () => {
    expect(validateSerializedBatchFixtureJson("undefined")).toEqual({
      ok: false,
      errorMessage: "Fixture bridge returned undefined output",
    });
  });

  it("rejects invalid JSON payloads", () => {
    expect(validateSerializedBatchFixtureJson('{"runId":undefined}')).toEqual({
      ok: false,
      errorMessage: "Fixture bridge output is not valid JSON",
    });
  });
});
