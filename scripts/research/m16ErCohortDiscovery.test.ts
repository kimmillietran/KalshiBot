import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildM16ErFixedCohortPlan } from "@/lib/data/research/m16ExternalReplication";
import { CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES } from "@/lib/data/research/cryptostructDatasetGovernance";
import {
  copyDayZipImmutable,
  discoverFrozenCohortZips,
  discoveryImportsEconomicEvaluator,
  mapVendorDayZipFilename,
  verifyShaCopyMatch,
} from "./m16ErCohortDiscovery";

describe("m16ErCohortDiscovery", () => {
  it("maps vendor filenames to UTC dates and ignores unrelated files", () => {
    expect(mapVendorDayZipFilename("kalshi-btc-15m_2026-08-14.zip")).toBe(
      "2026-08-14",
    );
    expect(mapVendorDayZipFilename("/tmp/kalshi-btc-15m_2026-09-21.zip")).toBe(
      "2026-09-21",
    );
    expect(mapVendorDayZipFilename("readme.txt")).toBeNull();
    expect(mapVendorDayZipFilename("kalshi-btc-15m_notes.zip")).toBeNull();
  });

  it("requires exactly one ZIP per frozen date and rejects duplicates/missing", () => {
    const fixed = buildM16ErFixedCohortPlan().fixedUtcDates;
    expect(fixed).toHaveLength(34);

    const okPaths = fixed.map((d) => `/dl/kalshi-btc-15m_${d}.zip`);
    const ok = discoverFrozenCohortZips(okPaths);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.days).toHaveLength(34);
      expect(ok.days.map((d) => d.utcDate)).toEqual([...fixed]);
    }

    const missing = discoverFrozenCohortZips(okPaths.slice(0, 30));
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.missing.length).toBe(4);
    }

    const dup = discoverFrozenCohortZips([
      ...okPaths,
      `/other/kalshi-btc-15m_${fixed[0]}.zip`,
    ]);
    expect(dup.ok).toBe(false);
    if (!dup.ok) {
      expect(dup.duplicates[0]?.utcDate).toBe(fixed[0]);
    }
  });

  it("never selects QUALITY_AUDIT_ONLY dates into the frozen cohort", () => {
    const fixed = buildM16ErFixedCohortPlan().fixedUtcDates;
    const auditPaths = CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES.map(
      (d) => `/dl/kalshi-btc-15m_${d}.zip`,
    );
    const onlyAudit = discoverFrozenCohortZips(auditPaths);
    expect(onlyAudit.ok).toBe(false);
    if (!onlyAudit.ok) {
      expect(onlyAudit.missing).toEqual([...fixed]);
    }

    const mixed = discoverFrozenCohortZips([
      ...fixed.map((d) => `/dl/kalshi-btc-15m_${d}.zip`),
      ...auditPaths,
    ]);
    expect(mixed.ok).toBe(true);
    if (mixed.ok) {
      for (const d of CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES) {
        expect(mixed.days.map((x) => x.utcDate)).not.toContain(d);
      }
    }
  });

  it("verifies SHA-256 source/copy match on byte-for-byte copy", async () => {
    const dir = mkdtempSync(join(tmpdir(), "m16-er-sha-"));
    try {
      const src = join(dir, "kalshi-btc-15m_2026-08-14.zip");
      const raw = join(dir, "raw");
      writeFileSync(src, Buffer.from("m16-er-test-zip-bytes"));
      const result = await copyDayZipImmutable({
        sourcePath: src,
        governedRawDir: raw,
        filename: "kalshi-btc-15m_2026-08-14.zip",
      });
      expect(result.shaMatch).toBe(true);
      expect(verifyShaCopyMatch(result.sourceSha256, result.governedSha256)).toBe(
        true,
      );
      expect(readFileSync(result.governedPath).equals(readFileSync(src))).toBe(
        true,
      );
      expect(verifyShaCopyMatch(result.sourceSha256, "deadbeef")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not import or reach the economic evaluator", () => {
    expect(discoveryImportsEconomicEvaluator()).toBe(false);
  });
});
