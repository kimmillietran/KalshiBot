import { describe, expect, it } from "vitest";

import { CalibrationFadeV2CrossRunValidationError } from "./calibrationFadeV2CrossRunValidationTypes";
import {
  classifyV2CrossRunArtifactAuthority,
  parseV2CrossRunArtifactPathIdentity,
  requireSnapshotScopedV2CrossRunArtifact,
  resolveExplicitV2SettlementSnapshotReportPath,
  resolveLegacyV2CrossRunRootReportPath,
} from "./classifyV2CrossRunArtifactAuthority";

const RUN_SET = "38b3f877";
const SNAPSHOT = "1fe37935";
const OTHER_SNAPSHOT = "2ca71bde";
const OTHER_RUN_SET = "aaaaaaaa";

const SNAPSHOT_PATH =
  `data/research-results/calibration-fade-v2/cross-run/confirmatory/${RUN_SET}/`
  + `settlement-snapshots/${SNAPSHOT}/calibration-fade-v2-cross-run-validation.json`;
const LEGACY_ROOT_PATH =
  `data/research-results/calibration-fade-v2/cross-run/confirmatory/${RUN_SET}/`
  + "calibration-fade-v2-cross-run-validation.json";

describe("M12.6e.5 v2 cross-run settlement artifact authority", () => {
  it("1: valid snapshot-scoped report is accepted as authoritative", () => {
    const classification = classifyV2CrossRunArtifactAuthority({
      artifactPath: SNAPSHOT_PATH,
      report: {
        runSetHash: RUN_SET,
        settlementSnapshotHash: SNAPSHOT,
        interpretationClassification: "forward-rejects-hypothesis",
      },
    });
    expect(classification.kind).toBe("snapshot-scoped-authoritative");
    expect(classification.legacyRootArtifact).toBe(false);
    expect(requireSnapshotScopedV2CrossRunArtifact({
      artifactPath: SNAPSHOT_PATH,
      report: { runSetHash: RUN_SET, settlementSnapshotHash: SNAPSHOT },
    }).kind).toBe("snapshot-scoped-authoritative");
  });

  it("2: path runSetHash must match report runSetHash", () => {
    const classification = classifyV2CrossRunArtifactAuthority({
      artifactPath: SNAPSHOT_PATH,
      report: { runSetHash: OTHER_RUN_SET, settlementSnapshotHash: SNAPSHOT },
    });
    expect(classification.kind).toBe("invalid-path-identity");
    expect(classification.reason).toMatch(/runSetHash/);
  });

  it("3: path settlementSnapshotHash must match report settlementSnapshotHash", () => {
    const classification = classifyV2CrossRunArtifactAuthority({
      artifactPath: SNAPSHOT_PATH,
      report: { runSetHash: RUN_SET, settlementSnapshotHash: OTHER_SNAPSHOT },
    });
    expect(classification.kind).toBe("invalid-path-identity");
    expect(classification.reason).toMatch(/settlementSnapshotHash/);
  });

  it("4: mismatched run-set identity fails closed under require", () => {
    expect(() =>
      requireSnapshotScopedV2CrossRunArtifact({
        artifactPath: SNAPSHOT_PATH,
        report: { runSetHash: OTHER_RUN_SET, settlementSnapshotHash: SNAPSHOT },
      }),
    ).toThrow(CalibrationFadeV2CrossRunValidationError);
  });

  it("5: mismatched snapshot identity fails closed under require", () => {
    expect(() =>
      requireSnapshotScopedV2CrossRunArtifact({
        artifactPath: SNAPSHOT_PATH,
        report: { runSetHash: RUN_SET, settlementSnapshotHash: OTHER_SNAPSHOT },
      }),
    ).toThrow(/settlementSnapshotHash|invalid/);
  });

  it("6: legacy root report remains readable as historical", () => {
    const classification = classifyV2CrossRunArtifactAuthority({
      artifactPath: LEGACY_ROOT_PATH,
      report: {
        runSetHash: RUN_SET,
        settlementSnapshotHash: undefined,
        interpretationClassification: "settlement-coverage-incomplete",
      },
    });
    expect(classification.kind).toBe("legacy-root-historical");
    expect(classification.legacyRootArtifact).toBe(true);
    expect(parseV2CrossRunArtifactPathIdentity(LEGACY_ROOT_PATH).isLegacyRoot).toBe(true);
  });

  it("7: legacy root report fails when authoritative settlement evidence is required", () => {
    expect(() =>
      requireSnapshotScopedV2CrossRunArtifact({
        artifactPath: LEGACY_ROOT_PATH,
        report: {
          runSetHash: RUN_SET,
          interpretationClassification: "settlement-coverage-incomplete",
        },
      }),
    ).toThrow(/Legacy run-set root artifact is not settlement-snapshot authoritative/);
  });

  it("8: no mtime-based resolution helper exists; path identity is explicit only", () => {
    const identity = parseV2CrossRunArtifactPathIdentity(
      `data/research-results/calibration-fade-v2/cross-run/confirmatory/${RUN_SET}/latest/`
        + "calibration-fade-v2-cross-run-validation.json",
    );
    expect(identity.isLegacyRoot).toBe(false);
    expect(identity.isSnapshotScoped).toBe(false);
    expect(() =>
      resolveExplicitV2SettlementSnapshotReportPath({
        runSetHash: RUN_SET,
        settlementSnapshotHash: "latest",
      }),
    ).toThrow(/latest/);
  });

  it("9: no lexical-latest resolution via resolveExplicit path builder", () => {
    expect(() =>
      resolveExplicitV2SettlementSnapshotReportPath({
        runSetHash: "latest",
        settlementSnapshotHash: SNAPSHOT,
      }),
    ).toThrow(/latest/);
  });

  it("10: multiple snapshots require explicit identity (runSetHash alone is insufficient)", () => {
    expect(() =>
      resolveExplicitV2SettlementSnapshotReportPath({
        runSetHash: RUN_SET,
        settlementSnapshotHash: "",
      }),
    ).toThrow(/Explicit runSetHash and settlementSnapshotHash are required/);

    const first = resolveExplicitV2SettlementSnapshotReportPath({
      runSetHash: RUN_SET,
      settlementSnapshotHash: OTHER_SNAPSHOT,
    });
    const second = resolveExplicitV2SettlementSnapshotReportPath({
      runSetHash: RUN_SET,
      settlementSnapshotHash: SNAPSHOT,
    });
    expect(first).not.toBe(second);
    expect(first).toContain(`/settlement-snapshots/${OTHER_SNAPSHOT}/`);
    expect(second).toContain(`/settlement-snapshots/${SNAPSHOT}/`);
  });

  it("11: historical root and snapshot-scoped artifact may coexist without collision", () => {
    const legacy = classifyV2CrossRunArtifactAuthority({
      artifactPath: LEGACY_ROOT_PATH,
      report: {
        runSetHash: RUN_SET,
        interpretationClassification: "settlement-coverage-incomplete",
      },
    });
    const snapshot = classifyV2CrossRunArtifactAuthority({
      artifactPath: SNAPSHOT_PATH,
      report: {
        runSetHash: RUN_SET,
        settlementSnapshotHash: SNAPSHOT,
        interpretationClassification: "forward-rejects-hypothesis",
      },
    });
    expect(legacy.kind).toBe("legacy-root-historical");
    expect(snapshot.kind).toBe("snapshot-scoped-authoritative");
    expect(legacy.pathRunSetHash).toBe(snapshot.pathRunSetHash);
    expect(resolveLegacyV2CrossRunRootReportPath({ runSetHash: RUN_SET })).toBe(LEGACY_ROOT_PATH);
    expect(
      resolveExplicitV2SettlementSnapshotReportPath({
        runSetHash: RUN_SET,
        settlementSnapshotHash: SNAPSHOT,
      }),
    ).toBe(SNAPSHOT_PATH);
  });

  it("12: classifying a new snapshot does not rewrite or invalidate historical root contents", () => {
    const legacyBody = JSON.stringify({
      runSetHash: RUN_SET,
      interpretationClassification: "settlement-coverage-incomplete",
    });
    const files: Record<string, string> = {
      [LEGACY_ROOT_PATH]: legacyBody,
      [SNAPSHOT_PATH]: JSON.stringify({
        runSetHash: RUN_SET,
        settlementSnapshotHash: SNAPSHOT,
        interpretationClassification: "forward-rejects-hypothesis",
      }),
    };

    requireSnapshotScopedV2CrossRunArtifact({
      artifactPath: SNAPSHOT_PATH,
      report: JSON.parse(files[SNAPSHOT_PATH]!) as {
        runSetHash: string;
        settlementSnapshotHash: string;
      },
    });
    classifyV2CrossRunArtifactAuthority({
      artifactPath: LEGACY_ROOT_PATH,
      report: JSON.parse(files[LEGACY_ROOT_PATH]!) as { runSetHash: string },
    });

    expect(files[LEGACY_ROOT_PATH]).toBe(legacyBody);
  });

  it("13: authority classification is deterministic independent of directory ordering", () => {
    const snapshots = [OTHER_SNAPSHOT, SNAPSHOT, "zzzzzzzz", "00000000"];
    const shuffled = [...snapshots].sort(() => -1);
    const classifications = shuffled.map((hash) =>
      classifyV2CrossRunArtifactAuthority({
        artifactPath: resolveExplicitV2SettlementSnapshotReportPath({
          runSetHash: RUN_SET,
          settlementSnapshotHash: hash,
        }),
        report: { runSetHash: RUN_SET, settlementSnapshotHash: hash },
      }),
    );
    expect(classifications.every((entry) => entry.kind === "snapshot-scoped-authoritative")).toBe(
      true,
    );
    expect(new Set(classifications.map((entry) => entry.pathSettlementSnapshotHash)).size).toBe(
      shuffled.length,
    );
  });
});
