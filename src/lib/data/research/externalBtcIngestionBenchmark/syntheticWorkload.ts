/**
 * Synthetic CryptoStruct-native L2 workloads for ingestion benchmarking.
 * Labeled synthetic — not production Coinbase/Kalshi day bytes.
 */

import { createHash } from "node:crypto";

import { writeZstdTextFixture } from "@/lib/data/research/externalBtcDelayedRepricingPilot";

import type { WorkloadKind } from "./types";

export type SyntheticWorkload = {
  kind: WorkloadKind;
  lines: string[];
  messageCount: number;
  decompressedBytes: number;
  depthDistribution: Record<string, number>;
  notes: string[];
};

function ns(i: number): number {
  return 1_700_000_000_000_000_000 + i * 1_000_000;
}

function level(side: 0 | 1, price: number, qty: number): [number, string, string, number] {
  return [side, price.toFixed(2), String(qty), 1];
}

function snapshotLine(
  eventId: number,
  prevEventId: number | "0",
  bids: Array<[number, number]>,
  asks: Array<[number, number]>,
  i: number,
): string {
  const levels = [
    ...bids.map(([p, q]) => level(0, p, q)),
    ...asks.map(([p, q]) => level(1, p, q)),
  ];
  return JSON.stringify([
    0,
    1,
    String(prevEventId),
    String(eventId),
    ns(i),
    ns(i),
    levels,
  ]);
}

function updateLine(
  eventId: number,
  prevEventId: number,
  levels: Array<[0 | 1, number, number]>,
  i: number,
): string {
  return JSON.stringify([
    1,
    1,
    String(prevEventId),
    String(eventId),
    ns(i),
    ns(i),
    levels.map(([side, p, q]) => level(side, p, q)),
  ]);
}

function buildDepth(depth: number, mid = 0.5): {
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
} {
  const bids: Array<[number, number]> = [];
  const asks: Array<[number, number]> = [];
  for (let d = 0; d < depth; d += 1) {
    bids.push([Number((mid - 0.01 - d * 0.01).toFixed(2)), 10 + (d % 5)]);
    asks.push([Number((mid + 0.01 + d * 0.01).toFixed(2)), 10 + (d % 5)]);
  }
  return { bids, asks };
}

function synthesize(kind: WorkloadKind, targetMessages: number): SyntheticWorkload {
  const lines: string[] = [];
  const notes: string[] = [
    "synthetic-cryptostruct-native-array-format",
    "starts-with-valid-snapshot-then-contiguous-updates",
  ];
  const depthDistribution: Record<string, number> = {};

  let eventId = 1;
  let i = 0;
  const pushSnap = (depth: number, mid = 0.5, resetPrev: number | "0" = "0") => {
    const { bids, asks } = buildDepth(depth, mid);
    depthDistribution[`snapshot-depth-${depth}`] =
      (depthDistribution[`snapshot-depth-${depth}`] ?? 0) + 1;
    lines.push(snapshotLine(eventId, resetPrev === "0" ? "0" : eventId - 1, bids, asks, i));
    eventId += 1;
    i += 1;
  };

  if (kind === "typical-depth") {
    notes.push("depth≈20; mixed away-from-best and occasional BBO touches");
    pushSnap(20);
    while (lines.length < targetMessages) {
      const away = lines.length % 5 !== 0;
      if (away) {
        const price = Number((0.5 - 0.05 - (lines.length % 10) * 0.01).toFixed(2));
        lines.push(updateLine(eventId, eventId - 1, [[0, price, 3 + (lines.length % 4)]], i));
      } else {
        const bid = Number((0.49 + (lines.length % 3) * 0.01).toFixed(2));
        lines.push(updateLine(eventId, eventId - 1, [[0, bid, 12]], i));
      }
      eventId += 1;
      i += 1;
    }
  } else if (kind === "deep-book-high-update") {
    notes.push("depth≈200; high update rate across deep levels");
    pushSnap(200);
    while (lines.length < targetMessages) {
      const d = lines.length % 180;
      const side: 0 | 1 = lines.length % 2 === 0 ? 0 : 1;
      const price = side === 0
        ? Number((0.49 - d * 0.01).toFixed(2))
        : Number((0.51 + d * 0.01).toFixed(2));
      lines.push(updateLine(eventId, eventId - 1, [[side, price, 1 + (d % 7)]], i));
      eventId += 1;
      i += 1;
    }
  } else if (kind === "away-from-best") {
    notes.push("away-from-best updates only below/above top of book; BBO price unchanged often");
    pushSnap(40);
    while (lines.length < targetMessages) {
      const d = 2 + (lines.length % 30);
      lines.push(
        updateLine(
          eventId,
          eventId - 1,
          [[0, Number((0.49 - d * 0.01).toFixed(2)), 5 + (lines.length % 3)]],
          i,
        ),
      );
      eventId += 1;
      i += 1;
    }
  } else if (kind === "best-price-changes") {
    notes.push("best bid/ask price changes and best-level deletions");
    pushSnap(25);
    while (lines.length < targetMessages) {
      const step = lines.length % 4;
      if (step === 0) {
        lines.push(updateLine(eventId, eventId - 1, [[0, 0.49, 0]], i)); // delete best bid
      } else if (step === 1) {
        lines.push(updateLine(eventId, eventId - 1, [[0, 0.48, 15]], i));
      } else if (step === 2) {
        lines.push(updateLine(eventId, eventId - 1, [[1, 0.51, 0]], i)); // delete best ask
      } else {
        lines.push(updateLine(eventId, eventId - 1, [[1, 0.52, 11]], i));
      }
      eventId += 1;
      i += 1;
    }
  } else {
    notes.push("mid-stream snapshot reset + intentional continuity gap then recovery");
    pushSnap(30);
    const half = Math.floor(targetMessages / 2);
    while (lines.length < half) {
      lines.push(updateLine(eventId, eventId - 1, [[0, 0.47, 8]], i));
      eventId += 1;
      i += 1;
    }
    // Intentional gap: prevEventId does not match lastEventId
    lines.push(
      JSON.stringify([
        1,
        1,
        "gap-prev",
        String(eventId),
        ns(i),
        ns(i),
        [level(0, 0.46, 9)],
      ]),
    );
    eventId += 1;
    i += 1;
    // Recovery snapshot clears failClosed
    pushSnap(30, 0.5, eventId - 1);
    while (lines.length < targetMessages) {
      lines.push(updateLine(eventId, eventId - 1, [[1, 0.53, 7]], i));
      eventId += 1;
      i += 1;
    }
  }

  // Inject a few non-book messages to exercise filters (TOB + trade)
  lines.splice(
    Math.min(10, lines.length),
    0,
    JSON.stringify([6, 1, "x", "tob", ns(0), ns(0), [level(0, 0.5, 1), level(1, 0.51, 1)]]),
    JSON.stringify([2, 1, "x", "trd", ns(0), ns(0), []]),
  );

  const body = `${lines.join("\n")}\n`;
  return {
    kind,
    lines,
    messageCount: lines.length,
    decompressedBytes: Buffer.byteLength(body, "utf8"),
    depthDistribution,
    notes,
  };
}

export function buildSyntheticWorkloads(input?: {
  typicalMessages?: number;
  deepMessages?: number;
}): Record<WorkloadKind, SyntheticWorkload> {
  const typical = input?.typicalMessages ?? 80_000;
  const deep = input?.deepMessages ?? 60_000;
  return {
    "typical-depth": synthesize("typical-depth", typical),
    "deep-book-high-update": synthesize("deep-book-high-update", deep),
    "away-from-best": synthesize("away-from-best", typical),
    "best-price-changes": synthesize("best-price-changes", Math.floor(typical * 0.75)),
    "snapshot-reset-gap": synthesize("snapshot-reset-gap", Math.floor(typical * 0.5)),
  };
}

export async function materializeWorkloadZstd(
  workload: SyntheticWorkload,
  outPath: string,
): Promise<{ path: string; compressedBytes: number; inputSha256: string }> {
  await writeZstdTextFixture(outPath, workload.lines);
  const { readFileSync, statSync } = await import("node:fs");
  const bytes = readFileSync(outPath);
  return {
    path: outPath,
    compressedBytes: statSync(outPath).size,
    inputSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function linesSha256(lines: readonly string[]): string {
  return createHash("sha256").update(`${lines.join("\n")}\n`, "utf8").digest("hex");
}
