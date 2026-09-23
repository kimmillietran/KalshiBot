import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const AUDIT_DIR = resolve(
  process.cwd(),
  "data/research-results/external-kalshi-data-audit",
);

function readJson(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(AUDIT_DIR, name), "utf8")) as Record<
    string,
    unknown
  >;
}

describe("external Kalshi data audit artifacts", () => {
  it("records checkout HEAD and free-sample-only boundaries", () => {
    const provenance = readJson("provenance.json");
    const checkout = provenance.canonicalCheckout as Record<string, unknown>;
    expect(checkout.headSha).toMatch(/^[0-9a-f]{40}$/);
    const boundaries = provenance.scientificBoundaries as Record<string, unknown>;
    expect(boundaries.m16Unchanged).toBe(true);
    expect(boundaries.m16OutcomesUnopened).toBe(true);
    expect(boundaries.noPurchases).toBe(true);
    expect(boundaries.noLiveOrders).toBe(true);
  });

  it("marks CryptoStruct sample verified and PMXT retried via object store", () => {
    const source = readJson("source-audit.json");
    const sources = source.sources as Record<string, Record<string, unknown>>;
    expect(sources.cryptostruct.sampleTickers).toMatchObject({
      status: "VERIFIED FROM FILE",
    });
    expect(String(sources.pmxt.accessResult)).toMatch(/PARTIAL/);
    expect(sources.pmxt.sampleDownloaded).toBe(true);
    const freshness = sources.pmxt.archiveFreshness as Record<string, unknown>;
    const newest = freshness.newestHourFileObserved as Record<string, unknown>;
    expect(String(newest.value)).toContain("2026-06-11T03");
    expect(sources.depthfeed.registrationRequiredForHistory).toMatchObject({
      value: true,
    });

    const pmxt = readJson("pmxt-raw-audit.json");
    expect(pmxt.hourlyStructureClassification).toMatchObject({ code: "B" });
    expect(pmxt.causalBBO).toMatchObject({ possibleForKXBTC15M: false });
  });

  it("reports no exact KalshiBot overlap for free samples", () => {
    const overlap = readJson("overlap-audit.json");
    const inventory = overlap.kalshiBotCaptureInventoryChecked as Record<
      string,
      unknown
    >;
    expect(inventory.exactOverlapWithCryptostructSample).toBe(false);
    expect(inventory.exactOverlapWithPmxtArchive).toBe(false);
    expect(overlap.comparisonsPerformed).toEqual([]);
    expect(overlap.pmxtComparisonsPerformed).toEqual([]);
  });

  it("records CryptoStruct overlap fidelity PASS and defers further purchase", () => {
    const purchase = readJson("purchase-assessment.json");
    expect(purchase.provider).toBe("cryptostruct");
    expect(purchase.fidelityOverall).toBe("PASS");
    expect(purchase.buyAnythingNow).toBe(false);
    expect(["A", "B"]).toContain(purchase.verdict);

    const fidelity = readJson("cryptostruct-fidelity-verdict.json");
    expect(fidelity.overall).toBe("PASS");
    expect(fidelity.purchaseRecommendation).toBe("A");
    expect(fidelity.hashMatchAll).toBe(true);
    const governance = fidelity.governance as Record<string, Record<string, string>>;
    expect(governance.purchasedOverlapDaysStatus["2026-09-18"]).toBe(
      "QUALITY_AUDIT_ONLY",
    );

    const provenance = readJson("cryptostruct-overlap-provenance.json");
    const hashes = provenance.zipHashes as Record<string, { match: boolean }>;
    for (const day of [
      "2026-09-08",
      "2026-09-09",
      "2026-09-14",
      "2026-09-18",
      "2026-09-20",
    ]) {
      expect(hashes[day].match).toBe(true);
    }
  });
});
