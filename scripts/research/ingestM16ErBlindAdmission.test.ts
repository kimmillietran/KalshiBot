import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  evaluateM16ErOutcomeOpenAuthorization,
  M16_ER_ADAPTER_IDENTITY,
  M16_ER_OUTCOME_OPEN_BLOCKERS,
} from "@/lib/data/research/m16ExternalReplication";

const PY = resolve(
  process.cwd(),
  "scripts/research/ingestM16ErBlindAdmission.py",
);

function pyEval(code: string): string {
  const r = spawnSync(
    "python3",
    [
      "-c",
      `import sys; sys.path.insert(0,'scripts/research'); from ingestM16ErBlindAdmission import *; ${code}`,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "python failed");
  }
  return (r.stdout || "").trim();
}

describe("ingestM16ErBlindAdmission frozen bindings", () => {
  it("binds RAW-BBO-CHANGE adapter identity and fixed 34-date cohort", () => {
    const out = pyEval(
      "import json; print(json.dumps({"
      + "'adapter': ADAPTER_IDENTITY, 'adapterId': ADAPTER_ID, "
      + "'n': len(FIXED_DATES), 'dates': FIXED_DATES, "
      + "'audit': sorted(QUALITY_AUDIT_ONLY)}))",
    );
    const j = JSON.parse(out) as {
      adapter: string;
      adapterId: string;
      n: number;
      dates: string[];
      audit: string[];
    };
    expect(j.adapter).toBe(M16_ER_ADAPTER_IDENTITY);
    expect(j.adapterId).toBe("RAW-BBO-CHANGE");
    expect(j.n).toBe(34);
    expect(j.dates).not.toEqual(expect.arrayContaining(j.audit));
    expect(j.audit).toEqual([
      "2026-09-08",
      "2026-09-09",
      "2026-09-14",
      "2026-09-18",
      "2026-09-20",
    ]);
  });

  it("interprets KXBTC15M ticker HHMM as America/New_York close (not UTC)", () => {
    // 2026-08-14 16:00 ET = 20:00 UTC during EDT
    const close = Number(
      pyEval("print(close_ms_from_ticker('KXBTC15M-26AUG141600-00'))"),
    );
    expect(close).toBe(Date.parse("2026-08-14T20:00:00.000Z"));
    const overlap1900 = pyEval(
      "print(overlaps_governed_day(None, close_ms_from_ticker('KXBTC15M-26AUG141900-00'), '2026-08-14'))",
    );
    const overlap1600 = pyEval(
      "print(overlaps_governed_day(None, close_ms_from_ticker('KXBTC15M-26AUG141600-00'), '2026-08-14'))",
    );
    expect(overlap1900).toBe("False");
    expect(overlap1600).toBe("True");
  });

  it("keeps hardened outcome gate fail-closed without identities", () => {
    const empty = evaluateM16ErOutcomeOpenAuthorization();
    expect(empty.authorized).toBe(false);
    expect(empty.sealed).toBe(true);
    expect(empty.blockers).toContain(
      M16_ER_OUTCOME_OPEN_BLOCKERS.PROTOCOL_MISSING,
    );
  });

  it("does not load economic evaluator from the ingest script path", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(PY, "utf8");
    for (const needle of [
      "evaluateM16ErSynthetic",
      "realizedReturn",
      "targetHit",
      "stopHit",
      "pValue",
      "cr2",
    ]) {
      expect(text.includes(needle)).toBe(false);
    }
  });
});
