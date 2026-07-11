import { describe, expect, it } from "vitest";

import { buildDownstreamScopeMetadata } from "./buildDownstreamScopeMetadata";
import { resolveCaptureRunSelection } from "./resolveCaptureRunSelection";
import { validateInputArtifacts } from "./validateInputArtifacts";
import { DownstreamAnalysisScopeError } from "./downstreamAnalysisScopeTypes";

function buildMemoryIo(files: Record<string, string>) {
  return {
    readFile: (path: string) => files[path.replace(/\\/g, "/")] ?? "",
    fileExists: (path: string) => path.replace(/\\/g, "/") in files,
  };
}

describe("resolveCaptureRunSelection", () => {
  it("selects a single run when --capture-run-dir is provided", () => {
    const selection = resolveCaptureRunSelection({
      argv: [
        "--capture-run-dir",
        "data/live-capture/forward-quotes/2026-07-11T11-07-38-871Z",
      ],
      defaultForwardQuotesDir: "data/live-capture/forward-quotes",
    });

    expect(selection.analysisScope).toBe("selected-run");
    expect(selection.selectedRunId).toBe("2026-07-11T11-07-38-871Z");
    expect(selection.captureRunDir).toContain("2026-07-11T11-07-38-871Z");
  });

  it("defaults to aggregate mode without capture run dir", () => {
    const selection = resolveCaptureRunSelection({
      argv: ["--forward-quotes-dir", "data/live-capture/forward-quotes"],
      defaultForwardQuotesDir: "data/live-capture/forward-quotes",
    });

    expect(selection.analysisScope).toBe("aggregate");
    expect(selection.selectedRunId).toBeNull();
  });

  it("rejects empty capture run dir", () => {
    expect(() =>
      resolveCaptureRunSelection({
        argv: ["--capture-run-dir", ""],
        defaultForwardQuotesDir: "data/live-capture/forward-quotes",
      }),
    ).toThrow(DownstreamAnalysisScopeError);
  });

  it("rejects missing capture run dir value", () => {
    expect(() =>
      resolveCaptureRunSelection({
        argv: ["--capture-run-dir"],
        defaultForwardQuotesDir: "data/live-capture/forward-quotes",
      }),
    ).toThrow(/requires a value/);
  });

  it("rejects flag-valued capture run dir", () => {
    expect(() =>
      resolveCaptureRunSelection({
        argv: ["--capture-run-dir", "--output", "out.json"],
        defaultForwardQuotesDir: "data/live-capture/forward-quotes",
      }),
    ).toThrow(/requires a path value/);
  });
});

describe("validateInputArtifacts", () => {
  it("rejects aggregate artifacts in selected-run mode", () => {
    const io = buildMemoryIo({
      "data/research-results/static-parity-scan.json": JSON.stringify({
        generatedAt: "2026-07-11T12:00:00.000Z",
        analysisScope: "aggregate",
        sourceRunIds: ["run-a", "run-b"],
      }),
    });

    const result = validateInputArtifacts({
      io,
      selection: {
        analysisScope: "selected-run",
        forwardQuotesDir: "data/live-capture/forward-quotes",
        captureRunDir: "data/live-capture/forward-quotes/run-a",
        selectedRunId: "run-a",
      },
      artifactPaths: ["data/research-results/static-parity-scan.json"],
      evaluatedAt: "2026-07-11T13:00:00.000Z",
    });

    expect(result.mismatchedArtifacts).toContain("data/research-results/static-parity-scan.json");
    expect(result.usablePaths).toHaveLength(0);
  });

  it("accepts matching selected-run artifacts", () => {
    const io = buildMemoryIo({
      "data/research-results/static-parity-scan.json": JSON.stringify({
        generatedAt: "2026-07-11T12:00:00.000Z",
        analysisScope: "selected-run",
        selectedRunId: "run-a",
        sourceRunIds: ["run-a"],
      }),
    });

    const result = validateInputArtifacts({
      io,
      selection: {
        analysisScope: "selected-run",
        forwardQuotesDir: "data/live-capture/forward-quotes",
        captureRunDir: "data/live-capture/forward-quotes/run-a",
        selectedRunId: "run-a",
      },
      artifactPaths: ["data/research-results/static-parity-scan.json"],
      evaluatedAt: "2026-07-11T13:00:00.000Z",
    });

    expect(result.usablePaths).toHaveLength(1);
    expect(result.mismatchedArtifacts).toHaveLength(0);
  });

  it("rejects implicit multi-run artifacts in selected-run mode", () => {
    const path = "data/research-results/static-parity-scan.json";
    const io = buildMemoryIo({
      [path]: JSON.stringify({
        generatedAt: "2026-07-11T12:00:00.000Z",
        sourceRunIds: ["run-a", "run-b"],
      }),
    });

    const result = validateInputArtifacts({
      io,
      selection: {
        analysisScope: "selected-run",
        forwardQuotesDir: "data/live-capture/forward-quotes",
        captureRunDir: "data/live-capture/forward-quotes/run-a",
        selectedRunId: "run-a",
      },
      artifactPaths: [path],
      evaluatedAt: "2026-07-11T13:00:00.000Z",
    });

    expect(result.mismatchedArtifacts).toContain(path);
    expect(result.usablePaths).toHaveLength(0);
    expect(result.identities[0]?.verified).toBe(false);
  });

  it("rejects selected-run artifacts without run identity", () => {
    const path = "data/research-results/static-parity-scan.json";
    const io = buildMemoryIo({
      [path]: JSON.stringify({
        generatedAt: "2026-07-11T12:00:00.000Z",
        analysisScope: "selected-run",
      }),
    });

    const result = validateInputArtifacts({
      io,
      selection: {
        analysisScope: "selected-run",
        forwardQuotesDir: "data/live-capture/forward-quotes",
        captureRunDir: "data/live-capture/forward-quotes/run-a",
        selectedRunId: "run-a",
      },
      artifactPaths: [path],
      evaluatedAt: "2026-07-11T13:00:00.000Z",
      requireIdentityInSelectedRun: true,
    });

    expect(result.usablePaths).toHaveLength(0);
    expect(result.mismatchedArtifacts).toContain(path);
  });

  it("rejects artifacts with unverifiable freshness timestamps", () => {
    const path = "data/research-results/static-parity-scan.json";
    const io = buildMemoryIo({
      [path]: JSON.stringify({
        analysisScope: "selected-run",
        selectedRunId: "run-a",
        sourceRunIds: ["run-a"],
      }),
    });

    const result = validateInputArtifacts({
      io,
      selection: {
        analysisScope: "selected-run",
        forwardQuotesDir: "data/live-capture/forward-quotes",
        captureRunDir: "data/live-capture/forward-quotes/run-a",
        selectedRunId: "run-a",
      },
      artifactPaths: [path],
      evaluatedAt: "2026-07-11T13:00:00.000Z",
      requireIdentityInSelectedRun: true,
    });

    expect(result.usablePaths).toHaveLength(0);
    expect(result.mismatchedArtifacts).toContain(path);
  });

  it("marks malformed JSON without empty parsed fallback", () => {
    const io = buildMemoryIo({
      "data/research-results/broken.json": "{not-json",
    });

    const result = validateInputArtifacts({
      io,
      selection: {
        analysisScope: "aggregate",
        forwardQuotesDir: "data/live-capture/forward-quotes",
        captureRunDir: null,
        selectedRunId: null,
      },
      artifactPaths: ["data/research-results/broken.json"],
      evaluatedAt: "2026-07-11T13:00:00.000Z",
    });

    expect(result.malformedArtifacts).toContain("data/research-results/broken.json");
  });
});

describe("buildDownstreamScopeMetadata", () => {
  it("sets exactly one sourceRunId in selected-run mode", () => {
    const scope = buildDownstreamScopeMetadata({
      selection: {
        analysisScope: "selected-run",
        forwardQuotesDir: "data/live-capture/forward-quotes",
        captureRunDir: "data/live-capture/forward-quotes/run-a",
        selectedRunId: "run-a",
      },
      generatedAt: "2026-07-11T12:00:00.000Z",
      recordsScanned: 100,
      artifactValidation: {
        identities: [],
        staleArtifacts: [],
        mismatchedArtifacts: [],
        malformedArtifacts: [],
        missingArtifacts: [],
        warnings: [],
        usablePaths: [],
      },
    });

    expect(scope.sourceRunIds).toEqual(["run-a"]);
    expect(scope.analysisScope).toBe("selected-run");
    expect(scope.recordsScanned).toBe(100);
  });
});
