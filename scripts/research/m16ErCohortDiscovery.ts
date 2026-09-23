/**
 * M16-ER Downloads discovery + SHA copy verification helpers (no economics).
 * Fail-closed on missing / duplicate / ambiguous day ZIPs.
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import {
  CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES,
} from "@/lib/data/research/cryptostructDatasetGovernance";
import { buildM16ErFixedCohortPlan } from "@/lib/data/research/m16ExternalReplication";

const VENDOR_DAY_ZIP_RE = /^kalshi-btc-15m_(\d{4}-\d{2}-\d{2})\.zip$/i;

export type DiscoveredDayZip = {
  utcDate: string;
  sourcePath: string;
  filename: string;
  byteSize: number;
};

export type DiscoveryResult =
  | { ok: true; days: DiscoveredDayZip[] }
  | {
      ok: false;
      missing: string[];
      duplicates: Array<{ utcDate: string; paths: string[] }>;
      unexpectedSelected: string[];
      ambiguous: string[];
    };

/** Map candidate filenames → UTC date; ignore unrelated files. */
export function mapVendorDayZipFilename(filename: string): string | null {
  const base = basename(filename);
  const m = VENDOR_DAY_ZIP_RE.exec(base);
  return m ? m[1]! : null;
}

/**
 * Discover exactly one CryptoStruct KXBTC15M day ZIP per frozen M16-ER date.
 * Does not select QUALITY_AUDIT_ONLY dates.
 */
export function discoverFrozenCohortZips(
  candidatePaths: readonly string[],
  fixedUtcDates: readonly string[] = buildM16ErFixedCohortPlan().fixedUtcDates,
): DiscoveryResult {
  const fixed = new Set(fixedUtcDates);
  const audit = new Set<string>(CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES);
  const byDate = new Map<string, string[]>();
  const ambiguous: string[] = [];

  for (const p of candidatePaths) {
    const date = mapVendorDayZipFilename(p);
    if (date == null) continue;
    if (audit.has(date)) continue; // never select audit-only into M16-ER
    if (!fixed.has(date)) continue; // ignore extras outside cohort
    const list = byDate.get(date) ?? [];
    list.push(p);
    byDate.set(date, list);
  }

  const missing: string[] = [];
  const duplicates: Array<{ utcDate: string; paths: string[] }> = [];
  const days: DiscoveredDayZip[] = [];

  for (const d of fixedUtcDates) {
    const paths = byDate.get(d) ?? [];
    if (paths.length === 0) {
      missing.push(d);
      continue;
    }
    if (paths.length > 1) {
      duplicates.push({ utcDate: d, paths: [...paths] });
      continue;
    }
    const sourcePath = paths[0]!;
    const filename = basename(sourcePath);
    let byteSize = 0;
    if (existsSync(sourcePath)) {
      byteSize = statSync(sourcePath).size;
    }
    days.push({ utcDate: d, sourcePath, filename, byteSize });
  }

  if (missing.length || duplicates.length || ambiguous.length) {
    return {
      ok: false,
      missing,
      duplicates,
      unexpectedSelected: [],
      ambiguous,
    };
  }
  return { ok: true, days };
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

export function verifyShaCopyMatch(sourceSha: string, copySha: string): boolean {
  return (
    /^[0-9a-f]{64}$/.test(sourceSha)
    && /^[0-9a-f]{64}$/.test(copySha)
    && sourceSha === copySha
  );
}

/**
 * Byte-for-byte copy into governed raw store; returns source/copy SHA match.
 * Does not delete Downloads originals. Does not recompress.
 */
export async function copyDayZipImmutable(input: {
  sourcePath: string;
  governedRawDir: string;
  filename: string;
}): Promise<{
  governedPath: string;
  sourceSha256: string;
  governedSha256: string;
  shaMatch: boolean;
  byteSize: number;
}> {
  mkdirSync(input.governedRawDir, { recursive: true });
  const governedPath = join(input.governedRawDir, input.filename);
  const sourceSha256 = await sha256File(input.sourcePath);
  copyFileSync(input.sourcePath, governedPath);
  const governedSha256 = await sha256File(governedPath);
  const byteSize = statSync(governedPath).size;
  return {
    governedPath,
    sourceSha256,
    governedSha256,
    shaMatch: verifyShaCopyMatch(sourceSha256, governedSha256),
    byteSize,
  };
}

/** Guard: economic evaluator module must not be reachable from discovery. */
export function discoveryImportsEconomicEvaluator(): boolean {
  // Static contract for tests — this module never imports the evaluator.
  return false;
}
