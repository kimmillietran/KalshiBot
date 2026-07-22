import { describe, expect, it } from "vitest";

import {
  isTerminalCaptureRunState,
  parseCaptureRunStatus,
  publishCaptureRunStatus,
  resolveTerminalCaptureRunState,
  serializeCaptureRunStatus,
  writeCaptureArtifactAtomically,
  type CaptureRunStatusArtifact,
} from "./captureRunStatus";

type IoOp =
  | { type: "write"; path: string; data: string }
  | { type: "rename"; from: string; to: string };

function createAtomicIo() {
  const ops: IoOp[] = [];
  const files: Record<string, string> = {};
  return {
    ops,
    files,
    io: {
      writeFile: (path: string, data: string) => {
        ops.push({ type: "write", path, data });
        files[path] = data;
      },
      renameFile: (from: string, to: string) => {
        ops.push({ type: "rename", from, to });
        files[to] = files[from];
        delete files[from];
      },
    },
  };
}

const STATUS: CaptureRunStatusArtifact = {
  schemaVersion: 1,
  runId: "run-1",
  state: "active",
  startedAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
  endedAt: null,
  captureEndReason: null,
  failureReason: null,
};

describe("writeCaptureArtifactAtomically", () => {
  it("never writes the final path directly: temp file plus rename", () => {
    const { io, ops, files } = createAtomicIo();

    writeCaptureArtifactAtomically(io, "run/capture-health.json", "{\"ok\":true}", 123);

    expect(ops).toEqual([
      { type: "write", path: "run/capture-health.json.123.tmp", data: "{\"ok\":true}" },
      { type: "rename", from: "run/capture-health.json.123.tmp", to: "run/capture-health.json" },
    ]);
    expect(files["run/capture-health.json"]).toBe("{\"ok\":true}");
    expect(files["run/capture-health.json.123.tmp"]).toBeUndefined();
  });

  it("falls back to a direct write when the io has no renameFile", () => {
    const writes: Array<{ path: string; data: string }> = [];
    writeCaptureArtifactAtomically(
      { writeFile: (path, data) => writes.push({ path, data }) },
      "run/capture-health.json",
      "{}",
    );

    expect(writes).toEqual([{ path: "run/capture-health.json", data: "{}" }]);
  });
});

describe("publishCaptureRunStatus / parseCaptureRunStatus", () => {
  it("round-trips the status artifact through atomic publication", () => {
    const { io, files } = createAtomicIo();

    publishCaptureRunStatus(io, "run/capture-run-status.json", STATUS);

    const parsed = parseCaptureRunStatus(files["run/capture-run-status.json"]);
    expect(parsed).toEqual(STATUS);
  });

  it("rejects malformed or unknown-state payloads", () => {
    expect(parseCaptureRunStatus("not json")).toBeNull();
    expect(parseCaptureRunStatus("{}")).toBeNull();
    expect(parseCaptureRunStatus("[]")).toBeNull();
    expect(
      parseCaptureRunStatus(
        serializeCaptureRunStatus({ ...STATUS, state: "half-done" as never }),
      ),
    ).toBeNull();
  });

  it("rejects an unknown schema version and an empty runId", () => {
    expect(
      parseCaptureRunStatus(
        serializeCaptureRunStatus({ ...STATUS, schemaVersion: 2 as never }),
      ),
    ).toBeNull();
    expect(
      parseCaptureRunStatus(serializeCaptureRunStatus({ ...STATUS, runId: "" })),
    ).toBeNull();
  });

  it("rejects invalid timestamps", () => {
    expect(
      parseCaptureRunStatus(
        serializeCaptureRunStatus({ ...STATUS, startedAt: "not-a-date" }),
      ),
    ).toBeNull();
    expect(
      parseCaptureRunStatus(
        serializeCaptureRunStatus({ ...STATUS, updatedAt: "" }),
      ),
    ).toBeNull();
    expect(
      parseCaptureRunStatus(
        serializeCaptureRunStatus({ ...STATUS, endedAt: "yesterday-ish" }),
      ),
    ).toBeNull();
  });

  it("rejects an unknown capture end reason and a non-string failure reason", () => {
    expect(
      parseCaptureRunStatus(
        serializeCaptureRunStatus({
          ...STATUS,
          captureEndReason: "meteor-strike" as never,
        }),
      ),
    ).toBeNull();
    expect(
      parseCaptureRunStatus(
        serializeCaptureRunStatus({ ...STATUS, failureReason: 42 as never }),
      ),
    ).toBeNull();
  });

  it("enforces terminal/endedAt coherence in both directions", () => {
    // Terminal states must carry a valid endedAt.
    for (const state of ["completed", "failed", "user-cancelled"] as const) {
      expect(
        parseCaptureRunStatus(
          serializeCaptureRunStatus({ ...STATUS, state, endedAt: null }),
        ),
      ).toBeNull();
      expect(
        parseCaptureRunStatus(
          serializeCaptureRunStatus({
            ...STATUS,
            state,
            endedAt: "2026-07-21T01:00:00.000Z",
          }),
        ),
      ).not.toBeNull();
    }

    // Non-terminal states must not carry an endedAt.
    for (const state of ["active", "finalizing"] as const) {
      expect(
        parseCaptureRunStatus(
          serializeCaptureRunStatus({
            ...STATUS,
            state,
            endedAt: "2026-07-21T01:00:00.000Z",
          }),
        ),
      ).toBeNull();
      expect(
        parseCaptureRunStatus(
          serializeCaptureRunStatus({ ...STATUS, state, endedAt: null }),
        ),
      ).not.toBeNull();
    }
  });

  it("tolerates exactly one leading UTF-8 BOM from Windows PowerShell Set-Content", () => {
    const active = serializeCaptureRunStatus(STATUS);
    const failed = serializeCaptureRunStatus({
      ...STATUS,
      state: "failed",
      endedAt: "2026-07-21T01:00:00.000Z",
      captureEndReason: "authentication-failure",
      failureReason: "Unexpected server response: 401",
    });

    expect(parseCaptureRunStatus(`\uFEFF${active}`)).toEqual(STATUS);
    expect(parseCaptureRunStatus(`\uFEFF${failed}`)).toMatchObject({
      state: "failed",
      captureEndReason: "authentication-failure",
    });
    // Non-BOM status is unchanged.
    expect(parseCaptureRunStatus(active)).toEqual(STATUS);
    // Malformed BOM-prefixed JSON still fails closed.
    expect(parseCaptureRunStatus("\uFEFF{ not json")).toBeNull();
    // Terminal without endedAt still fails even with a BOM.
    expect(
      parseCaptureRunStatus(
        `\uFEFF${serializeCaptureRunStatus({ ...STATUS, state: "failed", endedAt: null })}`,
      ),
    ).toBeNull();
    // Nonterminal with endedAt still fails even with a BOM.
    expect(
      parseCaptureRunStatus(
        `\uFEFF${serializeCaptureRunStatus({
          ...STATUS,
          state: "active",
          endedAt: "2026-07-21T01:00:00.000Z",
        })}`,
      ),
    ).toBeNull();
    // Serialization never introduces a BOM.
    expect(serializeCaptureRunStatus(STATUS).startsWith("\uFEFF")).toBe(false);
  });
});

describe("resolveTerminalCaptureRunState", () => {
  it("maps user cancellation to user-cancelled", () => {
    expect(
      resolveTerminalCaptureRunState({
        captureEndReason: "user-cancelled",
        hadFatalError: false,
      }),
    ).toBe("user-cancelled");
  });

  it("maps failure end reasons and fatal errors to failed", () => {
    for (const captureEndReason of [
      "terminal-websocket-failure",
      "authentication-failure",
      "writer-failure",
      "unexpected-error",
    ] as const) {
      expect(
        resolveTerminalCaptureRunState({ captureEndReason, hadFatalError: false }),
      ).toBe("failed");
    }
    expect(
      resolveTerminalCaptureRunState({ captureEndReason: null, hadFatalError: true }),
    ).toBe("failed");
  });

  it("maps a completed duration-bounded run to completed", () => {
    expect(
      resolveTerminalCaptureRunState({
        captureEndReason: "duration-complete",
        hadFatalError: false,
      }),
    ).toBe("completed");
    expect(
      resolveTerminalCaptureRunState({ captureEndReason: null, hadFatalError: false }),
    ).toBe("completed");
  });
});

describe("isTerminalCaptureRunState", () => {
  it("classifies terminal and non-terminal states", () => {
    expect(isTerminalCaptureRunState("completed")).toBe(true);
    expect(isTerminalCaptureRunState("failed")).toBe(true);
    expect(isTerminalCaptureRunState("user-cancelled")).toBe(true);
    expect(isTerminalCaptureRunState("active")).toBe(false);
    expect(isTerminalCaptureRunState("finalizing")).toBe(false);
  });
});
