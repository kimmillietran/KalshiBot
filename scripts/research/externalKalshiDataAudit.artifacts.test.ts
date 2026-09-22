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

  it("marks CryptoStruct sample verified and PMXT unavailable", () => {
    const source = readJson("source-audit.json");
    const sources = source.sources as Record<string, Record<string, unknown>>;
    expect(sources.cryptostruct.sampleTickers).toMatchObject({
      status: "VERIFIED FROM FILE",
    });
    expect(sources.pmxt.accessResult).toBe("UNAVAILABLE");
    expect(sources.depthfeed.registrationRequiredForHistory).toMatchObject({
      value: true,
    });
  });

  it("reports no exact KalshiBot overlap for the free sample day", () => {
    const overlap = readJson("overlap-audit.json");
    const inventory = overlap.kalshiBotCaptureInventoryChecked as Record<
      string,
      unknown
    >;
    expect(inventory.exactOverlapWithCryptostructSample).toBe(false);
    expect(overlap.comparisonsPerformed).toEqual([]);
  });

  it("recommends a small CryptoStruct pilot rather than bulk purchase", () => {
    const purchase = readJson("purchase-assessment.json");
    expect(purchase.verdict).toBe("B");
    expect(purchase.provider).toBe("cryptostruct");
    expect(purchase.buyAnythingNow).toBe(true);
    expect(String(purchase.minimumPurchase)).toMatch(/3–5|3-5/);
  });
});
