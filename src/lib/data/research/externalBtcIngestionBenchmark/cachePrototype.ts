/**
 * Versioned sparse-quote cache prototype (benchmark only).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import type { BboPoint } from "@/lib/data/research/externalBtcDelayedRepricingPilot/bookReplay";

import type { CachePrototypeResult } from "./types";

export const CACHE_SCHEMA_VERSION = "sparse-bbo-v1" as const;
export const CACHE_EMISSION_POLICY = "emit-on-bbo-change-v1" as const;

export type SparseQuoteCacheEnvelope = {
  schemaVersion: typeof CACHE_SCHEMA_VERSION;
  emissionPolicy: typeof CACHE_EMISSION_POLICY;
  replayImplementation: string;
  inputSha256: string;
  outputHashSha256: string;
  quotes: BboPoint[];
};

export function cacheKey(input: {
  inputSha256: string;
  replayImplementation: string;
}): string {
  return createHash("sha256")
    .update(
      `${CACHE_SCHEMA_VERSION}|${CACHE_EMISSION_POLICY}|${input.replayImplementation}|${input.inputSha256}`,
    )
    .digest("hex");
}

export function writeSparseQuoteCache(input: {
  cacheDir: string;
  envelope: SparseQuoteCacheEnvelope;
}): { path: string; bytes: number } {
  mkdirSync(input.cacheDir, { recursive: true });
  const key = cacheKey({
    inputSha256: input.envelope.inputSha256,
    replayImplementation: input.envelope.replayImplementation,
  });
  const path = join(input.cacheDir, `${key}.json`);
  const body = `${JSON.stringify(input.envelope)}\n`;
  writeFileSync(path, body, "utf8");
  return { path, bytes: Buffer.byteLength(body, "utf8") };
}

export function readSparseQuoteCache(input: {
  cacheDir: string;
  inputSha256: string;
  replayImplementation: string;
}): SparseQuoteCacheEnvelope | null {
  const key = cacheKey({
    inputSha256: input.inputSha256,
    replayImplementation: input.replayImplementation,
  });
  const path = join(input.cacheDir, `${key}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as SparseQuoteCacheEnvelope;
}

export function measureCachePrototype(input: {
  cacheDir: string;
  inputSha256: string;
  replayImplementation: string;
  firstIngestionWallMs: number;
  quotes: BboPoint[];
  outputHashSha256: string;
}): CachePrototypeResult {
  mkdirSync(input.cacheDir, { recursive: true });
  const written = writeSparseQuoteCache({
    cacheDir: input.cacheDir,
    envelope: {
      schemaVersion: CACHE_SCHEMA_VERSION,
      emissionPolicy: CACHE_EMISSION_POLICY,
      replayImplementation: input.replayImplementation,
      inputSha256: input.inputSha256,
      outputHashSha256: input.outputHashSha256,
      quotes: input.quotes,
    },
  });

  const t0 = performance.now();
  const read = readSparseQuoteCache({
    cacheDir: input.cacheDir,
    inputSha256: input.inputSha256,
    replayImplementation: input.replayImplementation,
  });
  const cacheReadWallMs = performance.now() - t0;
  if (!read || read.outputHashSha256 !== input.outputHashSha256) {
    return {
      attempted: true,
      firstIngestionWallMs: input.firstIngestionWallMs,
      cacheBytes: written.bytes,
      cacheReadWallMs,
      subsequentSavingsRatio: null,
      note: "cache-readback-hash-mismatch-or-missing",
    };
  }
  const savings =
    input.firstIngestionWallMs > 0
      ? 1 - cacheReadWallMs / input.firstIngestionWallMs
      : null;
  return {
    attempted: true,
    firstIngestionWallMs: input.firstIngestionWallMs,
    cacheBytes: statSync(written.path).size,
    cacheReadWallMs,
    subsequentSavingsRatio: savings,
    note:
      "Cache speeds subsequent local reruns only; does not accelerate an already-running Mac pilot.",
  };
}
